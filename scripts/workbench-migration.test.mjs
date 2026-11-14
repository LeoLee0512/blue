// 0014 迁移：在内存 PGLite 上按顺序跑完全部迁移，确认新表、新列存在，且可以重复执行。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

test("all migrations apply in order on a fresh database and 0014 is re-runnable", async () => {
  const db = new PGlite();
  try {
    for (const { name } of pendingMigrations(readdirSync(dir), [])) {
      await db.exec(readFileSync(join(dir, name), "utf8"));
    }
    // 0014 again: must be a no-op, not an error.
    await db.exec(readFileSync(join(dir, "0014_workbench.sql"), "utf8"));
    const cols = async (table) =>
      (await db.query("select column_name from information_schema.columns where table_name = $1", [table])).rows.map((r) => r.column_name);
    for (const table of ["volumes", "chapter_versions", "lore_entries", "novel_days"]) {
      assert.ok((await cols(table)).length > 0, table);
    }
    const chapterCols = await cols("chapters");
    for (const c of ["volume_id", "status", "note", "words"]) assert.ok(chapterCols.includes(c), c);
    const charCols = await cols("characters");
    for (const c of ["aliases", "appearance", "personality", "tags"]) assert.ok(charCols.includes(c), c);
    const novelCols = await cols("novels");
    for (const c of ["author", "daily_goal"]) assert.ok(novelCols.includes(c), c);

    // Existing rows survive with defaults.
    await db.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('local','本地用户','local@desktop',true,now(),now())`);
    await db.query("insert into novels (id, user_id, title) values ('n1','local','书')");
    await db.query("insert into chapters (id, novel_id, user_id, title, body) values ('c1','n1','local','章','正文')");
    const row = (await db.query("select volume_id, status, words from chapters where id = 'c1'")).rows[0];
    assert.deepEqual(row, { volume_id: null, status: "draft", words: 0 });
  } finally {
    await db.close();
  }
});
