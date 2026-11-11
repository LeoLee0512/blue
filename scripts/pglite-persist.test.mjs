import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("PGLite keeps migrations and the local user across restarts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "langao-pg-"));
  const env = { ...process.env, LANGAO_DATA_DIR: dir };
  delete env.KEY_ENCRYPTION_SECRET;
  const run = () =>
    spawnSync(process.execPath, [path.join(root, "scripts/migrate.mjs")], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 180000,
    });
  try {
    const first = run();
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.match(first.stdout, /applied 0001_auth.sql/);
    assert.match(first.stdout, /applied 0013_user_fk.sql/);
    const second = run();
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(second.stdout, /up to date/);
    const db = new PGlite(path.join(dir, "pglite"));
    await db.waitReady;
    const users = await db.query(`select id from "user"`);
    assert.equal(users.rows[0].id, "local");
    const novels = await db.query(`select to_regclass('public.novels') as name`);
    assert.ok(novels.rows[0].name);
    await db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
