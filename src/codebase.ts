import fs from "node:fs/promises";
import path from "node:path";
import type { CodebaseConfig } from "./types.js";

const defaultIgnoreDirs = new Set([
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "node_modules",
  "vendor",
  "storage",
  "bootstrap/cache",
]);

const defaultExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".php",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".prisma",
  ".sql",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
]);

const blockedFileNames = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".npmrc",
]);

export async function codebaseMap(config: CodebaseConfig) {
  const maxFiles = config.maxFiles ?? 300;
  const files: Array<{ path: string; bytes: number }> = [];
  await walk(config, config.rootDir, files, maxFiles);

  return JSON.stringify(
    {
      root: config.rootDir,
      file_count: files.length,
      files,
    },
    null,
    2
  );
}

export async function codebaseRead(config: CodebaseConfig, args: { paths?: unknown }) {
  const requested = Array.isArray(args.paths) ? args.paths : [];
  const maxReadBytes = config.maxReadBytes ?? 120000;
  let remaining = maxReadBytes;
  const files = [];

  for (const rawPath of requested) {
    if (typeof rawPath !== "string") continue;
    const safePath = resolveSafePath(config, rawPath);
    const relativePath = path.relative(config.rootDir, safePath);

    if (!isAllowedFile(config, safePath)) {
      files.push({ path: rawPath, error: "File is not allowed." });
      continue;
    }

    const stat = await fs.stat(safePath).catch(() => null);
    if (!stat?.isFile()) {
      files.push({ path: rawPath, error: "File not found." });
      continue;
    }

    if (remaining <= 0) {
      files.push({ path: relativePath, error: "Read budget exhausted." });
      continue;
    }

    const content = await fs.readFile(safePath, "utf8");
    const sliced = content.slice(0, remaining);
    remaining -= sliced.length;
    files.push({
      path: relativePath,
      bytes: Buffer.byteLength(sliced),
      truncated: sliced.length < content.length,
      content: sliced,
    });
  }

  return JSON.stringify({ files }, null, 2);
}

async function walk(config: CodebaseConfig, dir: string, files: Array<{ path: string; bytes: number }>, maxFiles: number) {
  if (files.length >= maxFiles) return;

  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isIgnoredDir(config, fullPath)) continue;
      await walk(config, fullPath, files, maxFiles);
      continue;
    }

    if (!entry.isFile() || !isAllowedFile(config, fullPath)) continue;
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) continue;
    files.push({ path: path.relative(config.rootDir, fullPath), bytes: stat.size });
  }
}

function resolveSafePath(config: CodebaseConfig, requestedPath: string) {
  const resolved = path.resolve(config.rootDir, requestedPath);
  const root = path.resolve(config.rootDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes codebase root.");
  }
  return resolved;
}

function isIgnoredDir(config: CodebaseConfig, fullPath: string) {
  const relativePath = path.relative(config.rootDir, fullPath);
  const extra = new Set(config.extraIgnoreDirs ?? []);
  return [...defaultIgnoreDirs, ...extra].some((dir) => relativePath === dir || relativePath.startsWith(`${dir}${path.sep}`));
}

function isAllowedFile(config: CodebaseConfig, fullPath: string) {
  const basename = path.basename(fullPath);
  if (blockedFileNames.has(basename) || basename.startsWith(".env.")) return false;

  const relativePath = path.relative(config.rootDir, fullPath);
  if ([...defaultIgnoreDirs, ...(config.extraIgnoreDirs ?? [])].some((dir) => relativePath.startsWith(`${dir}${path.sep}`))) {
    return false;
  }

  const extensions = new Set(config.includeExtensions ?? [...defaultExtensions]);
  return extensions.has(path.extname(fullPath));
}
