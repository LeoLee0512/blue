import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyPublishDir, includeInPublish, missingPackageAssets } from "./make-publish-dir.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("allowlist rejects secrets, backups, dependencies, and platform assets", () => {
  assert.equal(includeInPublish("src/lib/auth/server.ts"), true);
  assert.equal(includeInPublish("src/lib/novel/model-whitelist.ts"), true);
  assert.equal(includeInPublish(".env.example"), true);
  assert.equal(includeInPublish(".env"), false);
  assert.equal(includeInPublish(".env.local"), false);
  assert.equal(includeInPublish("src/lib/auth/preview.ts"), false);
  assert.equal(includeInPublish("node_modules/leftpad/index.js"), false);
  assert.equal(includeInPublish("compliance/owner.md"), false);
  assert.equal(includeInPublish("src/lib/novel/store.server.ts.bak"), false);
  assert.equal(includeInPublish("notes/backup-db.sql"), false);
  assert.equal(includeInPublish("public/__grok/install/styles.css"), false);
  assert.equal(includeInPublish("public/fonts/licenses/OFL-SourceSans3.txt"), true);
  assert.equal(includeInPublish("dist/server.js"), false);
});

test("clean directory keeps license, placeholder env, fonts, and whitelist", () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "langao-publish-"));
  const copied = copyPublishDir(root, dest);
  assert.ok(copied.includes("LICENSE"));
  assert.ok(copied.includes(".env.example"));
  assert.ok(copied.includes("THIRD_PARTY_NOTICES.md"));
  assert.ok(copied.includes("src/lib/novel/model-whitelist.ts"));
  assert.ok(copied.includes("public/fonts/noto-serif-sc-chinese-simplified-400-normal.woff2"));
  assert.equal(copied.some((rel) => rel.includes("node_modules") || rel.startsWith("public/__grok") || rel.endsWith("preview.ts") || rel.includes("compliance")), false);
  const env = fs.readFileSync(path.join(dest, ".env.example"), "utf8");
  assert.match(env, /replace-with-a-long-random-string/);
  assert.doesNotMatch(env, /sk-[A-Za-z0-9]|BEGIN PRIVATE|PREVIEW_CLIENT_SECRET|ghp_|xox[baprs]-/);
  assert.equal(fs.existsSync(path.join(dest, ".env")), false);
  const css = fs.readFileSync(path.join(dest, "src/styles.css"), "utf8");
  assert.equal(css.includes("fonts.googleapis.com"), false);
  assert.match(css, /\/fonts\/source-sans-3-latin-400-normal\.woff2/);
  const license = fs.readFileSync(path.join(dest, "LICENSE"), "utf8");
  assert.match(license, /Copyright \(c\) 2026 Leo Lee/);
  assert.equal(license.includes(String.fromCharCode(0x674e, 0x4f73, 0x660a)), false);
  assert.match(license, /Permission is hereby granted/);
  const ofl = fs.readFileSync(path.join(dest, "public/fonts/licenses/OFL-NotoSerifSC.txt"), "utf8");
  assert.match(ofl, /SIL Open Font License/);
  const install = fs.readFileSync(path.join(dest, "scripts/install-page.html"), "utf8");
  assert.match(install, /不包含平台安装页/);
  assert.doesNotMatch(install, /\/__grok\//);
  assert.equal(fs.existsSync(path.join(dest, "public/__grok/icon-180.png")), false);
  assert.deepEqual(missingPackageAssets(dest), []);
  const appRoot = fs.readFileSync(path.join(dest, "src/routes/__root.tsx"), "utf8");
  assert.doesNotMatch(appRoot, /\/__grok\//);
  assert.match(appRoot, /href: "\/favicon.svg"/);
});
