/**
 * Copy a clean source tree. Dependencies, secrets, backups, compliance files,
 * and platform install assets under public/__grok are left out.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_FILES = new Set([
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "PUBLISH_ALLOWLIST.txt",
  ".env.example",
  ".gitignore",
  ".nvmrc",
  ".prettierrc",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "eslint.config.mjs",
]);

const ALLOW_PREFIX = ["src/", "migrations/", "server/", "scripts/", "public/"];
const DENY_DIR = new Set([
  "node_modules",
  "dist",
  ".vercel",
  ".output",
  ".grok",
  "compliance",
  "coverage",
  "publish",
  ".git",
]);

export function includeInPublish(rel, isDirectory = false) {
  const norm = rel.split(path.sep).join("/");
  if (!norm || norm.startsWith("../")) return false;
  const parts = norm.split("/");
  if (parts.some((part) => DENY_DIR.has(part))) return false;
  if (norm === "public/__grok" || norm.startsWith("public/__grok/")) return false;
  if (/(^|\/)\.env$/.test(norm) || /(^|\/)\.env\.(?!example(?:$|\/))/.test(norm)) return false;
  if (/(^|\/)preview\.ts$/.test(norm)) return false;
  if (/backup|\.bak($|_)|\.pem$|\.key$/i.test(norm)) return false;
  if (ROOT_FILES.has(norm)) return true;
  const withSlash = norm.endsWith("/") ? norm : `${norm}/`;
  if (isDirectory) {
    return ALLOW_PREFIX.some((prefix) => prefix.startsWith(withSlash) || withSlash.startsWith(prefix));
  }
  return ALLOW_PREFIX.some((prefix) => norm.startsWith(prefix));
}

const INSTALL_UNAVAILABLE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>安装引导不可用</title>
</head>
<body>
  <p>此发布包不包含平台安装页。</p>
  <p><a href="/">返回首页</a></p>
</body>
</html>
`;

const GENERATED_ROUTES = new Set(["/__grok/manifest.webmanifest", "/__grok/manifest.json"]);

/** Hide platform install assets that this package does not ship. */
export function neutralizePlatformInstall(dest) {
  const install = path.join(dest, "scripts/install-page.html");
  if (fs.existsSync(install)) fs.writeFileSync(install, INSTALL_UNAVAILABLE);
  const rewrite = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        rewrite(full);
        continue;
      }
      if (full === install) continue;
      if (!/\.(mjs|ts|tsx|html|css|js)$/.test(name)) continue;
      if (name.includes(".test.")) continue;
      const text = fs.readFileSync(full, "utf8");
      const next = text.replaceAll("/__grok/icon-180.png", "/favicon.svg");
      if (next !== text) fs.writeFileSync(full, next);
    }
  };
  rewrite(dest);
}

export function localAssetRefs(text) {
  const refs = [];
  const pattern = /(?:href|src)\s*[:=]\s*["']([^"']+)["']|url\(\s*["']([^"')]+)["']\s*\)/g;
  for (const match of text.matchAll(pattern)) refs.push(match[1] || match[2]);
  return refs;
}

export function missingPackageAssets(dest) {
  const missing = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(mjs|ts|tsx|html|css|js)$/.test(name)) continue;
      if (name.includes(".test.")) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const ref of localAssetRefs(text)) {
        if (!ref.startsWith("/") || ref === "/") continue;
        const pathOnly = ref.split("?")[0].split("#")[0];
        if (GENERATED_ROUTES.has(pathOnly)) continue;
        const file = path.join(dest, "public", pathOnly.slice(1));
        if (!fs.existsSync(file)) missing.push(`${path.relative(dest, full)} -> ${pathOnly}`);
      }
    }
  };
  walk(dest);
  return missing;
}

export function copyPublishDir(source, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const copied = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(source, full);
      const stat = fs.statSync(full);
      if (!includeInPublish(rel, stat.isDirectory())) continue;
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const target = path.join(dest, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(full, target);
      copied.push(rel.split(path.sep).join("/"));
    }
  };
  walk(source);
  neutralizePlatformInstall(dest);
  return copied.sort();
}

function isMain() {
  const self = fileURLToPath(import.meta.url);
  return process.argv[1] && path.resolve(process.argv[1]) === self;
}

if (isMain()) {
  const dest = process.argv[2];
  if (!dest) {
    console.error("usage: node scripts/make-publish-dir.mjs <dest>");
    process.exit(2);
  }
  const copied = copyPublishDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), path.resolve(dest));
  console.log(`copied ${copied.length} files`);
}
