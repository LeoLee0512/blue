#!/usr/bin/env node
/**
 * Apply migrations/*.sql to the local PGLite directory.
 *
 * The running app does this on startup as well. This command is for a manual
 * check: `LANGAO_DATA_DIR=... npm run db:migrate`.
 */
import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";
import { dataDir, pgliteDir } from "./data-dir.mjs";
import { ensureInstallKey } from "./install-key.mjs";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function listNames() {
  try {
    return await readdir(migrationsDir);
  } catch {
    return [];
  }
}

async function main() {
  if (process.env.DATABASE_URL?.trim()) {
    console.log("[migrate] 桌面版只使用本机 PGLite，已忽略 DATABASE_URL。");
  }
  ensureInstallKey({ force: true });
  const names = await listNames();
  if (pendingMigrations(names, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }
  const dir = pgliteDir();
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  try {
    await db.waitReady;
    await db.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const applied = (await db.query("select name from _migrations")).rows.map(
      (row) => /** @type {{ name: string }} */ (row).name,
    );
    let count = 0;
    for (const { name } of pendingMigrations(names, applied)) {
      const text = await readFile(join(migrationsDir, name), "utf8");
      try {
        await db.exec("begin");
        await db.exec(text);
        await db.query("insert into _migrations (name) values ($1)", [name]);
        await db.exec("commit");
      } catch (err) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await db.exec("rollback");
        } catch {
          // keep the original error
        }
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    await db.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ('local', '本地用户', 'local@desktop', true, now(), now())
       on conflict (id) do nothing`,
    );
    console.log(
      count
        ? `[migrate] done — ${count} migration(s) applied. data: ${dataDir()}`
        : `[migrate] up to date. data: ${dataDir()}`,
    );
  } finally {
    await db.close();
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[migrate] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
