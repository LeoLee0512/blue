import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop app has no sign-in server or shared preview secret", () => {
  assert.equal(fs.existsSync(path.join(root, "src/lib/auth/preview.ts")), false);
  assert.equal(fs.existsSync(path.join(root, "src/lib/auth/server.ts")), false);
  assert.equal(fs.existsSync(path.join(root, "src/routes/login.tsx")), false);
  const banned = [];
  const skip = new Set(["node_modules", ".git", "publish", "dist", ".vercel", ".output", "release", ".data"]);
  const walkSrc = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walkSrc(full);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(name) || name.includes(".test.")) continue;
      const text = fs.readFileSync(full, "utf8");
      if (/from\s+["']better-auth/.test(text) || /PREVIEW_CLIENT_SECRET|PREVIEW_CLIENT_ID|x-grok-identity/.test(text)) {
        banned.push(path.relative(root, full));
      }
    }
  };
  walkSrc(root);
  assert.deepEqual(banned, []);
});

test("import tree has no env file, compliance dir, or backup names", () => {
  const skip = new Set(["node_modules", ".git", "publish", "dist", ".vercel", ".output", "release", ".data"]);
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
