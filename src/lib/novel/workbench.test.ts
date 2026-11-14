// 蓝稿 v2 书桌数据层的集成测试：在内存 PGLite 上跑真实迁移和真实服务端函数。
// 运行：node --experimental-strip-types --import ./scripts/ts-alias-hooks.mjs --test src/lib/novel/workbench.test.ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dataDir = mkdtempSync(path.join(tmpdir(), "langao-wb-"));
process.env.LANGAO_DATA_DIR = dataDir;
process.env.KEY_ENCRYPTION_SECRET = "workbench-test-secret-0123456789abcdef";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

let pg: PGlite;
let sql: Sql;
const U = "local";

function wrap(run: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>): Sql {
  const fn = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await run(text, values)).rows;
  }) as unknown as Sql;
  fn.query = (async (text: string, params: unknown[] = []) => (await run(text, params)).rows) as Sql["query"];
  return fn;
}

const store = await import("./store.server.ts");
const wb = await import("./workbench.server.ts");
const pack = await import("../write/data-pack.ts");

before(async () => {
  pg = new PGlite({ parsers: { 20: Number } });
  const dir = path.resolve(import.meta.dirname, "../../../migrations");
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(path.join(dir, name), "utf8"));
  await pg.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('local','本地用户','local@desktop',true,now(),now())`);
  sql = wrap((text, params) => pg.query(text, params));
});

after(async () => {
  await pg.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function newNovel(title = "雨夜") {
  // 每个用例先删掉已有作品（连同章节、卷、版本），互不影响
  for (const row of await sql<{ id: string }>`select id from novels where user_id = ${U}`) await store.deleteNovel(sql as never, U, row.id);
  return store.createNovel(sql as never, U, { title, genre: "", logline: "一句话" });
}

describe("卷与章节", () => {
  it("建卷、建章、跨卷拖动、删卷保留章节", async () => {
    const novel = await newNovel();
    const v1 = await wb.createVolume(sql as never, U, novel.id, "");
    const v2 = await wb.createVolume(sql as never, U, novel.id, "终卷");
    assert.equal(v1.title, "第一卷");
    assert.equal(v2.sortOrder, 2);
    const a = await wb.createChapterIn(sql as never, U, novel.id, v1.id, "");
    const b = await wb.createChapterIn(sql as never, U, novel.id, v1.id, "");
    const c = await wb.createChapterIn(sql as never, U, novel.id, v2.id, "");
    assert.equal(a.title, "第一章");
    assert.equal(c.title, "第三章");
    await wb.moveChapterTo(sql as never, U, novel.id, b.id, v2.id, 0);
    let detail = (await store.readDetail(sql as never, U, novel.id))!;
    const inV2 = detail.chapters.filter((x) => x.volumeId === v2.id).sort((x, y) => x.sortOrder - y.sortOrder).map((x) => x.id);
    assert.deepEqual(inV2, [b.id, c.id]);
    await wb.moveVolumeTo(sql as never, U, novel.id, v2.id, 0);
    detail = (await store.readDetail(sql as never, U, novel.id))!;
    assert.deepEqual(detail.volumes.map((v) => v.id), [v2.id, v1.id]);
    await wb.deleteVolume(sql as never, U, novel.id, v2.id, false);
    detail = (await store.readDetail(sql as never, U, novel.id))!;
    assert.equal(detail.volumes.length, 1);
    assert.deepEqual(detail.chapters.filter((x) => x.volumeId === null).map((x) => x.id).sort(), [b.id, c.id].sort());
    await wb.deleteVolume(sql as never, U, novel.id, v1.id, true);
    detail = (await store.readDetail(sql as never, U, novel.id))!;
    assert.equal(detail.chapters.some((x) => x.id === a.id), false);
  });
});

describe("正文、字数与版本", () => {
  it("保存正文记字数、每日字数，自动和手动版本，恢复前先存一版", async () => {
    const novel = await newNovel();
    const ch = await wb.createChapterIn(sql as never, U, novel.id, null, "开端");
    const saved = await store.saveChapter(sql as never, U, { novelId: novel.id, id: ch.id, title: "开端", body: "雨下了一夜。她没有回来。" });
    assert.equal(saved?.words, 10);
    let days = await wb.readNovelDays(sql as never, U, novel.id);
    assert.equal(days[0].words, 10);
    let versions = await wb.listVersions(sql as never, U, novel.id, ch.id);
    assert.equal(versions.length, 1, "第一次保存非空正文自动存一版");
    await store.saveChapter(sql as never, U, { novelId: novel.id, id: ch.id, title: "开端", body: "雨下了一夜。她没有回来。灯还亮着。" });
    versions = await wb.listVersions(sql as never, U, novel.id, ch.id);
    assert.equal(versions.length, 1, "十分钟内的小改动不另存");
    days = await wb.readNovelDays(sql as never, U, novel.id);
    assert.equal(days[0].words, 14);
    const manual = await wb.createVersion(sql as never, U, novel.id, ch.id, "manual", "定稿前");
    assert.equal(manual?.label, "定稿前");
    const first = versions[0];
    const restored = await wb.restoreVersion(sql as never, U, novel.id, first.id);
    assert.equal(restored?.body, "雨下了一夜。她没有回来。");
    versions = await wb.listVersions(sql as never, U, novel.id, ch.id);
    assert.ok(versions.some((v) => v.kind === "restore"));
    const restorePoint = versions.find((v) => v.kind === "restore")!;
    assert.equal((await wb.readVersion(sql as never, U, novel.id, restorePoint.id))?.body, "雨下了一夜。她没有回来。灯还亮着。");
    // 不传 nodeId 时保留大纲关联
    await sql`update chapters set node_id = 'o_keep' where id = ${ch.id}`;
    await store.saveChapter(sql as never, U, { novelId: novel.id, id: ch.id, title: "开端", body: "改。" });
    const row = (await sql<{ node_id: string }>`select node_id from chapters where id = ${ch.id}`)[0];
    assert.equal(row.node_id, "o_keep");
  });
});

describe("人物卡与设定库", () => {
  it("保存完整人物卡和设定", async () => {
    const novel = await newNovel();
    const card = await wb.saveCard(sql as never, U, { novelId: novel.id, name: "林照", role: "主角", bio: "", aliases: "阿照", appearance: "高", personality: "倔", tags: "主线" });
    assert.equal(card.aliases, "阿照");
    const edited = await wb.saveCard(sql as never, U, { novelId: novel.id, id: card.id, name: "林照", role: "主角", bio: "回乡", aliases: "阿照、小林" });
    assert.equal(edited.bio, "回乡");
    const lore = await wb.saveLore(sql as never, U, { novelId: novel.id, kind: "place", name: "雾镇", summary: "常年有雾", body: "" });
    assert.equal(lore.kind, "place");
    const odd = await wb.saveLore(sql as never, U, { novelId: novel.id, kind: "<script>", name: "怪", summary: "", body: "" });
    assert.equal(odd.kind, "other");
    const detail = (await store.readDetail(sql as never, U, novel.id))!;
    assert.equal(detail.lore.length, 2);
    assert.equal(detail.characters[0].aliases, "阿照、小林");
    assert.equal(await wb.deleteLore(sql as never, U, novel.id, odd.id), true);
  });
});

describe("完整备份", () => {
  it("导出不含密钥；覆盖恢复先写恢复点；合并导入作为副本", async () => {
    const novel = await newNovel("备份测试");
    await store.ensureAccount(sql as never, U);
    await sql`update profiles set api_key = 'enc:v2:SECRET-CIPHERTEXT', base_url = 'https://x', model = 'm' where user_id = ${U}`;
    const v = await wb.createVolume(sql as never, U, novel.id, "");
    const ch = await wb.createChapterIn(sql as never, U, novel.id, v.id, "");
    await store.saveChapter(sql as never, U, { novelId: novel.id, id: ch.id, title: "第一章", body: "正文在这里。" });
    const exported = await wb.exportPack(sql as never, U);
    const json = JSON.stringify(exported);
    assert.equal(json.includes("SECRET-CIPHERTEXT"), false);
    assert.equal(json.includes("api_key"), false);
    assert.equal(exported.tables.chapters.length, 1);

    // 改动后用覆盖恢复回去
    await store.saveChapter(sql as never, U, { novelId: novel.id, id: ch.id, title: "第一章", body: "被改坏了。" });
    const check = pack.validatePack(json);
    assert.equal(check.ok, true);
    if (!check.ok) return;
    const point = wb.writeRestorePoint(await wb.exportPack(sql as never, U));
    assert.ok(existsSync(point));
    assert.equal(readFileSync(point, "utf8").includes("被改坏了"), true);
    await pg.transaction(async (tx) => {
      await wb.restorePack(wrap((t, p) => tx.query(t, p)) as never, U, check.pack, "replace", point);
    });
    let body = (await sql<{ body: string }>`select body from chapters where id = ${ch.id}`)[0].body;
    assert.equal(body, "正文在这里。");
    const key = (await sql<{ api_key: string }>`select api_key from profiles where user_id = ${U}`)[0].api_key;
    assert.equal(key, "enc:v2:SECRET-CIPHERTEXT", "覆盖恢复不动密钥");

    // 合并导入：多出一部副本，原作不变
    await wb.restorePack(sql as never, U, check.pack, "merge", "");
    const titles = (await sql<{ title: string }>`select title from novels where user_id = ${U} order by title`).map((r) => r.title);
    assert.deepEqual(titles, ["备份测试", "备份测试（导入）"]);
    const copies = await sql<{ id: string; volume_id: string }>`select id, volume_id from chapters where user_id = ${U} and id <> ${ch.id}`;
    assert.equal(copies.length, 1);
    assert.notEqual(copies[0].volume_id, v.id);
    body = (await sql<{ body: string }>`select body from chapters where id = ${ch.id}`)[0].body;
    assert.equal(body, "正文在这里。");
  });
});
