// 2026-11-03 Sam：只读统计孤儿行（user_id 在 "user" 表里不存在的行）。整个过程在 BEGIN READ ONLY 事务里，不写库、不删数据。
// 用法：DATABASE_URL=... node scripts/count_orphans.mjs
import pg from "pg";
const url = process.env.DATABASE_URL?.trim();
if (!url) { console.error("需要 DATABASE_URL"); process.exit(1); }
const TABLES = ["novels","chapters","characters","outline_nodes","messages","profiles","voice_docs","source_texts","usage_days","pieces","shares","wallets","ledger"];
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin read only");
  for (const t of TABLES) {
    const exists = (await client.query("select to_regclass($1) is not null as ok", [t])).rows[0].ok;
    if (!exists) { console.log(`${t}\t（表不存在）`); continue; }
    const n = (await client.query(`select count(*)::int n from "${t}" x where not exists (select 1 from "user" u where u.id = x.user_id)`)).rows[0].n;
    const ids = n ? (await client.query(`select distinct user_id from "${t}" x where not exists (select 1 from "user" u where u.id = x.user_id) limit 20`)).rows.map((r) => r.user_id) : [];
    console.log(`${t}\t${n}${ids.length ? "\t" + ids.join(",") : ""}`);
  }
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
