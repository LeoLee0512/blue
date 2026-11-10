import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("preview shared-secret module is absent and not imported", () => {
  assert.equal(fs.existsSync(path.join(root, "src/lib/auth/preview.ts")), false);
  const server = fs.readFileSync(path.join(root, "src/lib/auth/server.ts"), "utf8");
  assert.doesNotMatch(server, /from\s+["']\.\/preview["']/);
  assert.doesNotMatch(server, /PREVIEW_CLIENT_SECRET|PREVIEW_CLIENT_ID|PREVIEW_ALLOWED_HOSTS|GROK_ISSUER_DEFAULT/);
  assert.doesNotMatch(server, /genericOAuth|gateIdentitySessions/);
  assert.doesNotMatch(server, /headers\.get\(\s*["']x-grok-identity["']\)/);
  assert.match(server, /emailAndPasswordEnabled/);
  assert.match(server, /authConfigured = !authDisabled && emailAndPasswordEnabled/);
});

test("import tree has no env file, compliance dir, or backup names", () => {
  const skip = new Set(["node_modules", ".git", "publish", "dist", ".vercel"]);
  const bad = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const full = path.join(dir, name);
      const rel = path.relative(root, full);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (name === "compliance") bad.push(rel);
        else walk(full);
        continue;
      }
      if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) bad.push(rel);
      if (/backup|\.bak($|_)|\.pem$|\.key$/i.test(name)) bad.push(rel);
      if (name === "preview.ts") bad.push(rel);
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});
