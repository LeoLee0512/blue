import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makePack, packFileName, packSummary, remapForMerge, validatePack } from "./data-pack.ts";

const sample = () =>
  makePack(
    {
      novels: [{ id: "n1", title: "雨夜", genre: "现实", api_key: "sk-SECRET", created_at: new Date("2026-11-01T00:00:00Z") }],
      volumes: [{ id: "v1", novel_id: "n1", title: "第一卷", sort_order: 1 }],
      chapters: [
        { id: "c1", novel_id: "n1", volume_id: "v1", node_id: "o1", title: "第一章", body: "雨。", sort_order: 1 },
        { id: "c2", novel_id: "ghost", title: "孤儿", body: "", sort_order: 1 },
      ],
      chapter_versions: [{ id: "cv1", chapter_id: "c1", novel_id: "n1", kind: "manual", body: "旧" }],
      characters: [{ id: "p1", novel_id: "n1", name: "林", bio: "", evil: "x" }],
      outline_nodes: [
        { id: "o0", novel_id: "n1", parent_id: null, kind: "volume", title: "卷" },
        { id: "o1", novel_id: "n1", parent_id: "o0", kind: "chapter", title: "章" },
      ],
      settings: [{ skills: "a,b", plugins: "", wild: 0, thinking: "mid", api_key: "sk-SECRET" }],
    },
    "蓝稿",
    new Date("2026-11-14T08:00:00Z"),
  );

describe("完整备份格式", () => {
  it("永不包含密钥，也不带多余的列", () => {
    const pack = sample();
    const json = JSON.stringify(pack);
    assert.equal(json.includes("sk-SECRET"), false);
    assert.equal(json.includes("api_key"), false);
    assert.equal(json.includes("evil"), false);
    assert.equal(pack.secrets, "excluded");
    assert.equal(pack.tables.novels[0].created_at, "2026-11-01T00:00:00.000Z");
  });

  it("校验：能读回自己写的文件，丢掉指向不存在作品的行", () => {
    const check = validatePack(JSON.stringify(sample()));
    assert.equal(check.ok, true);
    if (!check.ok) return;
    assert.deepEqual(check.pack.tables.chapters.map((r) => r.id), ["c1"]);
    const summary = packSummary(check.pack);
    assert.equal(summary.novels, 1);
    assert.equal(summary.chapters, 1);
    assert.deepEqual(summary.titles, ["雨夜"]);
  });

  it("校验：拒绝非蓝稿文件、过新的版本、坏结构", () => {
    assert.equal(validatePack("not json").ok, false);
    assert.equal(validatePack({ format: "other" }).ok, false);
    assert.equal(validatePack({ ...sample(), version: 99 }).ok, false);
    assert.equal(validatePack({ ...sample(), tables: { novels: "x" } }).ok, false);
    assert.equal(validatePack({ ...sample(), tables: { novels: [{ title: "无编号" }] } }).ok, false);
  });

  it("校验：文件里塞进的密钥字段也会被丢掉", () => {
    const raw = sample() as unknown as { tables: { settings: Record<string, unknown>[] } };
    raw.tables.settings[0].api_key = "sk-INJECTED";
    const check = validatePack(raw);
    assert.equal(check.ok, true);
    assert.equal(JSON.stringify(check).includes("sk-INJECTED"), false);
  });

  it("作为副本加入：所有 id 换新，内部引用一致", () => {
    const check = validatePack(sample());
    assert.equal(check.ok, true);
    if (!check.ok) return;
    let n = 0;
    const out = remapForMerge(check.pack, (prefix) => `${prefix}_new${++n}`, "（副本）");
    const novel = out.novels![0];
    assert.notEqual(novel.id, "n1");
    assert.equal(novel.title, "雨夜（副本）");
    const chapter = out.chapters![0];
    assert.equal(chapter.novel_id, novel.id);
    assert.equal(chapter.volume_id, out.volumes![0].id);
    const nodes = out.outline_nodes!;
    assert.equal(chapter.node_id, nodes.find((x) => x.kind === "chapter")!.id);
    assert.equal(nodes.find((x) => x.kind === "chapter")!.parent_id, nodes.find((x) => x.kind === "volume")!.id);
    assert.equal(out.chapter_versions![0].chapter_id, chapter.id);
    assert.equal(JSON.stringify(out).includes('"n1"'), false);
  });

  it("文件名", () => {
    assert.match(packFileName(new Date(2026, 10, 14, 6, 8)), /^蓝稿备份-20261114-0608\.langao\.json$/);
  });
});
