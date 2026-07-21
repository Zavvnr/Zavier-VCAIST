import ignore from "ignore";
import {
  analyzeProjectSources,
  referencedProjectAssetPaths,
  type ProjectAnalysis,
  type SafePreviewAsset,
  type SafeSourceDocument,
} from "./project-analysis.ts";

export type ProjectSource = "demo" | "local" | "github";

export type ImportedProject = {
  name: string;
  fileCount: number;
  source: ProjectSource;
  sourceLabel: string;
  cacheKey?: string;
  privacy?: ProjectPrivacySummary;
  analysis?: ProjectAnalysis;
};

export type ProjectPrivacySummary = {
  policyStatus: "enforced";
  gitignoreRuleCount: number;
  excludedFileCount: number;
  exposedSecretFileCount: number;
};

export type GitignorePolicy = {
  basePath: string;
  patterns: readonly string[];
};

const sourceExtensions = new Set([
  "css",
  "astro",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "md",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sql",
  "swift",
  "svelte",
  "toml",
  "ts",
  "tsx",
  "vue",
  "yaml",
  "yml",
]);

const ignoredSegments = new Set([
  ".git",
  ".next",
  ".venv",
  ".vinext",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);

const projectAssetMimeTypes: Record<string, string> = {
  "7z": "application/x-7z-compressed",
  avif: "image/avif",
  bmp: "image/bmp",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
  gif: "image/gif",
  gz: "application/gzip",
  ico: "image/x-icon",
  jfif: "image/jpeg",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  m4a: "audio/mp4",
  md: "text/markdown",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rar: "application/vnd.rar",
  rtf: "application/rtf",
  svg: "image/svg+xml",
  tar: "application/x-tar",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  zip: "application/zip",
};

export const projectAssetLimits = {
  count: 48,
  individualBytes: 12_000_000,
  totalBytes: 32_000_000,
} as const;

export function projectAssetMimeType(path: string, declaredMimeType = "") {
  const declared = declaredMimeType.trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(declared) && declared !== "application/octet-stream") {
    return declared;
  }
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return projectAssetMimeTypes[extension] ?? "application/octet-stream";
}

export function projectAssetFileName(path: string) {
  return (path.replaceAll("\\", "/").split("/").at(-1) || "download")
    .replace(/[\u0000-\u001f\u007f]/g, "") || "download";
}

export function isSourcePath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => ignoredSegments.has(part))) return false;

  const fileName = parts.at(-1) ?? "";
  if (!fileName || fileName.startsWith(".")) return false;
  const extension = fileName.includes(".") ? fileName.split(".").at(-1)?.toLowerCase() : "";
  return Boolean(extension && sourceExtensions.has(extension));
}

export function projectNameFromFiles(files: FileList | File[]) {
  const first = Array.from(files)[0];
  if (!first) return "Local project";
  const relativePath = first.webkitRelativePath || first.name;
  const root = relativePath.replaceAll("\\", "/").split("/")[0];
  return cleanProjectName(root || "Local project");
}

export function countSourceFiles(files: FileList | File[]) {
  return Array.from(files).filter((file) =>
    isSourcePath(file.webkitRelativePath || file.name),
  ).length;
}

export function summarizeProjectFiles(files: FileList | File[]) {
  let fileCount = 0;
  let fingerprint = 2166136261;

  for (const file of Array.from(files)) {
    const path = file.webkitRelativePath || file.name;
    if (!isSourcePath(path)) continue;
    fileCount += 1;

    const descriptor = `${path}:${file.size}:${file.lastModified}|`;
    for (let index = 0; index < descriptor.length; index += 1) {
      fingerprint ^= descriptor.charCodeAt(index);
      fingerprint = Math.imul(fingerprint, 16777619);
    }
  }

  return {
    fileCount,
    cacheKey: `local:${(fingerprint >>> 0).toString(36)}:${fileCount}`,
  };
}

export async function summarizeProjectFilesSafely(files: FileList | File[]) {
  const projectFiles = Array.from(files);
  const policies: GitignorePolicy[] = [];

  for (const file of projectFiles) {
    const path = projectRelativePath(file.webkitRelativePath || file.name);
    if (path.split("/").at(-1)?.toLowerCase() !== ".gitignore") continue;

    // Ignore policies are resolved before any source content is considered.
    const policyText = await file.text();
    policies.push(createGitignorePolicy(path, policyText));
  }

  const descriptors = projectFiles.map((file) => ({
    path: projectRelativePath(file.webkitRelativePath || file.name),
    size: file.size,
    lastModified: file.lastModified,
  }));
  const evaluation = evaluateProjectPaths(descriptors.map((file) => file.path), policies);
  const includedPaths = new Set(evaluation.sourcePaths);
  let fingerprint = 2166136261;

  for (const file of descriptors) {
    if (!includedPaths.has(file.path)) continue;
    const descriptor = `${file.path}:${file.size}:${file.lastModified}|`;
    for (let index = 0; index < descriptor.length; index += 1) {
      fingerprint ^= descriptor.charCodeAt(index);
      fingerprint = Math.imul(fingerprint, 16777619);
    }
  }

  const documents: SafeSourceDocument[] = [];
  let contentBudget = 1_500_000;
  const prioritizedFiles = projectFiles
    .map((file) => ({ file, path: projectRelativePath(file.webkitRelativePath || file.name) }))
    .filter(({ file, path }) => includedPaths.has(path) && file.size <= 180_000)
    .sort((left, right) => sourceAnalysisPriority(left.path) - sourceAnalysisPriority(right.path));

  for (const { file, path } of prioritizedFiles) {
    if (documents.length >= 80 || contentBudget <= 0) break;
    const content = (await file.text()).slice(0, Math.min(180_000, contentBudget));
    contentBudget -= content.length;
    documents.push({ path, content });
  }

  const approvedPaths = new Set(evaluation.approvedPaths);
  const referencedAssets = referencedProjectAssetPaths(documents, evaluation.approvedPaths);
  const filesByPath = new Map(projectFiles.map((file) => [
    projectRelativePath(file.webkitRelativePath || file.name).toLowerCase(),
    file,
  ]));
  const assets: SafePreviewAsset[] = [];
  let assetBudget = projectAssetLimits.totalBytes;
  for (const referencedPath of referencedAssets) {
    if (assets.length >= projectAssetLimits.count || assetBudget <= 0) break;
    const file = filesByPath.get(referencedPath.toLowerCase());
    if (!file) continue;
    const path = projectRelativePath(file.webkitRelativePath || file.name);
    if (!approvedPaths.has(path) || file.size > projectAssetLimits.individualBytes || file.size > assetBudget) continue;
    const mimeType = projectAssetMimeType(path, file.type);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assetBudget -= bytes.byteLength;
    assets.push({ path, mimeType, fileName: projectAssetFileName(path), dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}` });
  }

  const name = projectNameFromFiles(projectFiles);

  return {
    fileCount: evaluation.sourcePaths.length,
    cacheKey: `local:${(fingerprint >>> 0).toString(36)}:${evaluation.sourcePaths.length}:${evaluation.privacy.exposedSecretFileCount}`,
    privacy: evaluation.privacy,
    analysis: analyzeProjectSources({ name, sourcePaths: evaluation.sourcePaths, documents, assets }),
  };
}

export function sourceAnalysisPriority(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.endsWith("package.json")) return 0;
  if (/(^|\/)(app|pages|routes)\/.*(page|route|index)\.(tsx?|jsx?|vue|html)$/.test(normalized)) return 1;
  if (/(^|\/)(index|app|main|home)\.(tsx?|jsx?|vue|html)$/.test(normalized)) return 2;
  if (/\.(tsx?|jsx?|vue|html)$/.test(normalized)) return 3;
  if (/\.(css|scss)$/.test(normalized)) return 4;
  return 5;
}

export function createGitignorePolicy(gitignorePath: string, contents: string): GitignorePolicy {
  const normalizedPath = normalizeProjectPath(gitignorePath);
  const lastSlash = normalizedPath.lastIndexOf("/");
  const basePath = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";
  const patterns = contents
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#") && !line.startsWith("!"));

  return { basePath, patterns };
}

export function evaluateProjectPaths(paths: readonly string[], policies: readonly GitignorePolicy[]) {
  const sourcePaths: string[] = [];
  const approvedPaths: string[] = [];
  let excludedFileCount = 0;
  let exposedSecretFileCount = 0;

  for (const rawPath of paths) {
    const path = normalizeProjectPath(rawPath);
    if (!path || path.split("/").at(-1)?.toLowerCase() === ".gitignore") continue;

    const sensitive = isSensitiveProjectPath(path);
    const ignored = policies.some((policy) => isIgnoredByPolicy(path, policy));
    if (sensitive) {
      excludedFileCount += 1;
      if (!ignored) exposedSecretFileCount += 1;
      continue;
    }
    if (ignored) {
      excludedFileCount += 1;
      continue;
    }
    approvedPaths.push(path);
    if (isSourcePath(path)) sourcePaths.push(path);
  }

  return {
    sourcePaths,
    approvedPaths,
    privacy: {
      policyStatus: "enforced" as const,
      gitignoreRuleCount: policies.reduce((total, policy) => total + policy.patterns.length, 0),
      excludedFileCount,
      exposedSecretFileCount,
    },
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function isSensitiveProjectPath(rawPath: string) {
  const path = normalizeProjectPath(rawPath).toLowerCase();
  const segments = path.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? "";

  if (fileName === ".env" || fileName.startsWith(".env.") || fileName.endsWith(".env")) return true;
  if (fileName === ".dev.vars" || fileName.startsWith(".dev.vars.")) return true;
  if ([".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json", "secrets.json"].includes(fileName)) return true;
  if (/^(id_rsa|id_ed25519)(\.pub)?$/.test(fileName)) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(fileName)) return true;
  if (/(^|[._-])(secret|secrets|credential|credentials|service-account|firebase-adminsdk)([._-]|$)/.test(fileName)) return true;
  if (segments.includes(".aws") && fileName === "credentials") return true;
  if (segments.includes(".ssh") && !fileName.endsWith(".pub")) return true;
  return false;
}

function isIgnoredByPolicy(path: string, policy: GitignorePolicy) {
  if (policy.basePath && path !== policy.basePath && !path.startsWith(`${policy.basePath}/`)) return false;
  const relativePath = policy.basePath ? path.slice(policy.basePath.length + 1) : path;
  if (!relativePath || !policy.patterns.length) return false;
  return ignore().add(policy.patterns).ignores(relativePath);
}

function projectRelativePath(rawPath: string) {
  const normalized = normalizeProjectPath(rawPath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.length > 1 ? segments.slice(1).join("/") : normalized;
}

function normalizeProjectPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

export function parseGitHubRepositoryUrl(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;

  return { owner, repo };
}

export function cleanProjectName(value: string) {
  const cleaned = value.replace(/\.git$/i, "").replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Imported project";
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
