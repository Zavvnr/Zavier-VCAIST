export type ProjectSource = "demo" | "local" | "google-drive" | "github";

export type ImportedProject = {
  name: string;
  fileCount: number;
  source: ProjectSource;
  sourceLabel: string;
};

const sourceExtensions = new Set([
  "css",
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
