"use client";

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import {
  cleanProjectName,
  createGitignorePolicy,
  evaluateProjectPaths,
  parseGitHubRepositoryUrl,
  projectNameFromFiles,
  summarizeProjectFilesSafely,
  type GitignorePolicy,
  type ImportedProject,
  type ProjectSource,
} from "@/lib/import-sources";

type ImportSource = Exclude<ProjectSource, "demo">;

const googleDriveConfig = {
  appId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID ?? "",
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY ?? "",
  clientId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? "",
};

const directoryAttributes = {
  directory: "",
  webkitdirectory: "",
} as unknown as InputHTMLAttributes<HTMLInputElement>;

const sourceOptions: Array<{
  id: ImportSource;
  label: string;
  description: string;
  symbol: string;
  badge: string;
}> = [
  {
    id: "local",
    label: "Local folder",
    description: "Choose a project folder on this device.",
    symbol: "⌁",
    badge: "READY",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    description: "Pick a folder from your Drive account.",
    symbol: "△",
    badge: "CONNECT",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Import a public repository by URL.",
    symbol: "GH",
    badge: "READY",
  },
];

export function ImportProjectDialog({
  onClose,
  onImport,
  eyebrow = "PROJECT SOURCE",
  title = "Where is your project?",
  description = "Choose one source. VCAIST only reads files needed for this scan.",
}: {
  onClose: () => void;
  onImport: (project: ImportedProject) => void;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const [source, setSource] = useState<ImportSource>("local");
  const [githubUrl, setGithubUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  function selectSource(nextSource: ImportSource) {
    setSource(nextSource);
    setError("");
  }

  async function importLocalFolder(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) return;

    setBusy(true);
    setError("");
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    try {
      const { fileCount, cacheKey, privacy } = await summarizeProjectFilesSafely(files);
      if (!fileCount) {
        setError("That folder does not contain supported source files after privacy exclusions were applied.");
        return;
      }

      onImport({
        name: projectNameFromFiles(files),
        fileCount,
        source: "local",
        sourceLabel: "Local folder",
        cacheKey,
        privacy,
      });
    } catch {
      setError("VCAIST could not verify this folder's privacy rules, so no project files were analyzed.");
    } finally {
      setBusy(false);
    }
  }

  async function importGitHubRepository() {
    const repository = parseGitHubRepositoryUrl(githubUrl);
    if (!repository) {
      setError("Enter a repository URL like https://github.com/owner/project.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      };
      const repoResponse = await fetch(
        `https://api.github.com/repos/${repository.owner}/${repository.repo}`,
        { headers },
      );
      if (!repoResponse.ok) throwGitHubError(repoResponse.status);
      const repoData = (await repoResponse.json()) as {
        default_branch: string;
        name: string;
      };

      const treeResponse = await fetch(
        `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(repoData.default_branch)}?recursive=1`,
        { headers },
      );
      if (!treeResponse.ok) throwGitHubError(treeResponse.status);
      const treeData = (await treeResponse.json()) as {
        sha?: string;
        tree: Array<{ path: string; type: string; sha?: string }>;
        truncated?: boolean;
      };
      if (treeData.truncated) {
        throw new Error("This repository is too large to verify every .gitignore policy safely.");
      }
      const blobEntries = treeData.tree.filter((item) => item.type === "blob");
      const policies = await loadGitHubIgnorePolicies(repository.owner, repository.repo, blobEntries, headers);
      const evaluation = evaluateProjectPaths(blobEntries.map((item) => item.path), policies);
      const fileCount = evaluation.sourcePaths.length;
      if (!fileCount) throw new Error("No supported source files were found in that repository.");

      onImport({
        name: cleanProjectName(repoData.name),
        fileCount,
        source: "github",
        sourceLabel: "GitHub",
        cacheKey: `github:${repository.owner}/${repository.repo}:${treeData.sha ?? repoData.default_branch}:${fileCount}`,
        privacy: evaluation.privacy,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "GitHub could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  async function importGoogleDriveFolder() {
    if (!googleDriveConfig.clientId || !googleDriveConfig.apiKey || !googleDriveConfig.appId) {
      setError(
        "Google Drive needs its Client ID, API key, and App ID in the project environment before it can connect.",
      );
      return;
    }

    setBusy(true);
    setError("");
    try {
      const picked = await chooseGoogleDriveFolder();
      if (!picked) return;
      const { fileCount, privacy } = await countGoogleDriveSourceFiles(picked.id, picked.accessToken);
      if (!fileCount) throw new Error("That Drive folder does not contain supported source files.");

      onImport({
        name: cleanProjectName(picked.name),
        fileCount,
        source: "google-drive",
        sourceLabel: "Google Drive",
        cacheKey: `google-drive:${picked.id}:${fileCount}`,
        privacy,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google Drive could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="import-heading">
          <div>
            <span className="section-kicker">{eyebrow}</span>
            <h2 id="import-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Close import dialog">×</button>
        </div>

        <div className="source-options" role="tablist" aria-label="Project source">
          {sourceOptions.map((option) => (
            <button
              className={source === option.id ? "source-option active" : "source-option"}
              key={option.id}
              onClick={() => selectSource(option.id)}
              disabled={busy}
              role="tab"
              aria-selected={source === option.id}
            >
              <span className={`source-logo ${option.id}`} aria-hidden="true">{option.symbol}</span>
              <span className="source-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
              <span className="source-badge">{option.badge}</span>
            </button>
          ))}
        </div>

        <div className="source-detail">
          {source === "local" ? (
            <div className="local-folder-panel">
              <input
                {...directoryAttributes}
                ref={folderInput}
                className="visually-hidden-input"
                type="file"
                multiple
                onChange={(event) => void importLocalFolder(event)}
                tabIndex={-1}
              />
              <span className="folder-large" aria-hidden="true">⌁</span>
              <div>
                <h3>{busy ? "Indexing your folder…" : "Choose a project folder"}</h3>
                <p>{busy
                  ? "Applying .gitignore rules and counting only approved source files."
                  : "Environment files, secret files, and .gitignore exclusions are never opened."}</p>
              </div>
              <button className="button dark" onClick={() => folderInput.current?.click()} disabled={busy}>
                {busy ? "Reading files…" : "Browse folders"}
              </button>
            </div>
          ) : null}

          {source === "github" ? (
            <div className="remote-source-panel">
              <div className="remote-source-copy">
                <span className="remote-logo github" aria-hidden="true">GH</span>
                <div><h3>Import a public repository</h3><p>VCAIST applies .gitignore rules and blocks environment and secret files before analysis.</p></div>
              </div>
              <label className="import-field" htmlFor="github-repository">GitHub repository URL</label>
              <div className="url-input-row">
                <input
                  id="github-repository"
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !busy) void importGitHubRepository();
                  }}
                  placeholder="https://github.com/owner/project"
                  autoComplete="url"
                />
                <button className="button dark" onClick={() => void importGitHubRepository()} disabled={busy}>
                  {busy ? "Importing…" : "Import repository"}
                </button>
              </div>
              <p className="source-footnote">Private repositories require the supported GitHub connector.</p>
            </div>
          ) : null}

          {source === "google-drive" ? (
            <div className="remote-source-panel drive-panel">
              <div className="remote-source-copy">
                <span className="remote-logo drive" aria-hidden="true">△</span>
                <div><h3>Choose a Google Drive folder</h3><p>Google asks for read-only access; VCAIST applies privacy rules before source analysis.</p></div>
              </div>
              <button className="button drive-button full" onClick={() => void importGoogleDriveFolder()} disabled={busy}>
                <span aria-hidden="true">△</span>{busy ? "Connecting…" : "Continue with Google Drive"}
              </button>
              <p className="source-footnote">Access tokens stay in memory and are never saved in the browser.</p>
            </div>
          ) : null}

          {error ? <div className="import-error" role="alert"><span aria-hidden="true">!</span>{error}</div> : null}
        </div>

        <div className="import-footer"><span aria-hidden="true">✓</span>Ignored environment and secret files are never inspected. Nothing is changed without approval.</div>
      </section>
    </div>
  );
}

function throwGitHubError(status: number): never {
  if (status === 404) throw new Error("Repository not found. Check that it is public and the URL is correct.");
  if (status === 403) throw new Error("GitHub's public request limit was reached. Try again in a few minutes.");
  throw new Error(`GitHub returned an unexpected response (${status}).`);
}

async function loadGitHubIgnorePolicies(
  owner: string,
  repository: string,
  entries: Array<{ path: string; sha?: string }>,
  headers: Record<string, string>,
) {
  const ignoreFiles = entries.filter((entry) => entry.path.split("/").at(-1)?.toLowerCase() === ".gitignore");
  if (ignoreFiles.length > 50) throw new Error("This repository has too many ignore policies to verify safely.");

  const policies: GitignorePolicy[] = [];
  for (const ignoreFile of ignoreFiles) {
    if (!ignoreFile.sha) throw new Error("VCAIST could not verify this repository's privacy rules.");
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repository}/git/blobs/${encodeURIComponent(ignoreFile.sha)}`,
      { headers },
    );
    if (!response.ok) throw new Error("VCAIST could not verify this repository's privacy rules.");
    const data = (await response.json()) as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || typeof data.content !== "string") {
      throw new Error("VCAIST could not verify this repository's privacy rules.");
    }
    policies.push(createGitignorePolicy(ignoreFile.path, decodeBase64Text(data.content)));
  }
  return policies;
}

function decodeBase64Text(value: string) {
  const binary = window.atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function loadExternalScript(src: string, id: string) {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Google sign-in could not be loaded.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

type GoogleWindow = Window & {
  gapi: {
    load: (name: string, options: { callback: () => void; onerror: () => void }) => void;
  };
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (options: {
          client_id: string;
          scope: string;
          callback: (response: { access_token?: string; error?: string }) => void;
        }) => { requestAccessToken: (options: { prompt: string }) => void };
      };
    };
    picker: {
      Action: { CANCEL: string; PICKED: string };
      DocsView: new (viewId: string) => {
        setIncludeFolders: (enabled: boolean) => GoogleDocsView;
        setSelectFolderEnabled: (enabled: boolean) => GoogleDocsView;
      };
      PickerBuilder: new () => GooglePickerBuilder;
      ViewId: { FOLDERS: string };
    };
  };
};

type GoogleDocsView = {
  setIncludeFolders: (enabled: boolean) => GoogleDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GoogleDocsView;
};

type GooglePickerBuilder = {
  addView: (view: GoogleDocsView) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
  setAppId: (id: string) => GooglePickerBuilder;
  setCallback: (callback: (data: { action: string; docs?: Array<{ id: string; name: string }> }) => void) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
};

async function chooseGoogleDriveFolder() {
  await Promise.all([
    loadExternalScript("https://accounts.google.com/gsi/client", "google-identity-script"),
    loadExternalScript("https://apis.google.com/js/api.js", "google-api-script"),
  ]);
  const googleWindow = window as unknown as GoogleWindow;
  await new Promise<void>((resolve, reject) => {
    googleWindow.gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("Google Picker could not be loaded.")) });
  });

  return new Promise<{ id: string; name: string; accessToken: string } | null>((resolve, reject) => {
    const tokenClient = googleWindow.google.accounts.oauth2.initTokenClient({
      client_id: googleDriveConfig.clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error("Google Drive permission was not granted."));
          return;
        }

        const accessToken = response.access_token;
        const view = new googleWindow.google.picker.DocsView(googleWindow.google.picker.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true);
        const picker = new googleWindow.google.picker.PickerBuilder()
          .setDeveloperKey(googleDriveConfig.apiKey)
          .setAppId(googleDriveConfig.appId)
          .setOAuthToken(accessToken)
          .setOrigin(window.location.origin)
          .addView(view)
          .setCallback((data) => {
            if (data.action === googleWindow.google.picker.Action.CANCEL) resolve(null);
            if (data.action === googleWindow.google.picker.Action.PICKED && data.docs?.[0]) {
              resolve({ ...data.docs[0], accessToken });
            }
          })
          .build();
        picker.setVisible(true);
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

async function countGoogleDriveSourceFiles(rootFolderId: string, accessToken: string) {
  const folderMimeType = "application/vnd.google-apps.folder";
  const pendingFolders = [{ id: rootFolderId, path: "" }];
  const projectFiles: Array<{ id: string; path: string }> = [];
  let inspectedItems = 0;

  while (pendingFolders.length && inspectedItems < 2000) {
    const folder = pendingFolders.shift();
    if (!folder) break;
    let pageToken = "";

    do {
      const query = `'${folder.id.replaceAll("'", "\\'")}' in parents and trashed = false`;
      const params = new URLSearchParams({
        fields: "nextPageToken,files(id,name,mimeType)",
        includeItemsFromAllDrives: "true",
        pageSize: "1000",
        q: query,
        supportsAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Google Drive could not list that folder.");
      const data = (await response.json()) as {
        files?: Array<{ id: string; name: string; mimeType: string }>;
        nextPageToken?: string;
      };

      for (const item of data.files ?? []) {
        inspectedItems += 1;
        const path = folder.path ? `${folder.path}/${item.name}` : item.name;
        if (item.mimeType === folderMimeType) pendingFolders.push({ id: item.id, path });
        else projectFiles.push({ id: item.id, path });
        if (inspectedItems >= 2000) break;
      }
      pageToken = data.nextPageToken ?? "";
    } while (pageToken && inspectedItems < 2000);
  }

  if (pendingFolders.length || inspectedItems >= 2000) {
    throw new Error("This Drive folder is too large to verify every .gitignore policy safely.");
  }

  const ignoreFiles = projectFiles.filter((file) => file.path.split("/").at(-1)?.toLowerCase() === ".gitignore");
  if (ignoreFiles.length > 50) throw new Error("This folder has too many ignore policies to verify safely.");
  const policies: GitignorePolicy[] = [];
  for (const ignoreFile of ignoreFiles) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ignoreFile.id)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("VCAIST could not verify this folder's privacy rules.");
    policies.push(createGitignorePolicy(ignoreFile.path, await response.text()));
  }

  const evaluation = evaluateProjectPaths(projectFiles.map((file) => file.path), policies);
  return { fileCount: evaluation.sourcePaths.length, privacy: evaluation.privacy };
}
