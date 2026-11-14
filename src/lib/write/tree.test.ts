import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTree, chineseNumber, defaultChapterTitle, moveChapter, moveVolume, nextSortOrder, readingOrder, type ChapterLite, type VolumeLite } from "./tree.ts";

const volumes: VolumeLite[] = [
  { id: "v2", title: "第二卷", sortOrder: 2 },
  { id: "v1", title: "第一卷", sortOrder: 1 },
];
const chapters: ChapterLite[] = [
  { id: "a", title: "序", volumeId: null, sortOrder: 1 },
  { id: "b", title: "一", volumeId: "v1", sortOrder: 1 },
  { id: "c", title: "二", volumeId: "v1", sortOrder: 2 },
  { id: "d", title: "三", volumeId: "v2", sortOrder: 1 },
  { id: "e", title: "孤", volumeId: "gone", sortOrder: 9 },
];

function apply(list: ChapterLite[], changes: { id: string; volumeId: string | null; sortOrder: number }[]): ChapterLite[] {
  return list.map((c) => {
    const hit = changes.find((x) => x.id === c.id);
    return hit ? { ...c, volumeId: hit.volumeId, sortOrder: hit.sortOrder } : c;
  });
}

describe("卷章树", () => {
  it("按序号建树，失联章节归入未分卷", () => {
    const tree = buildTree(volumes, chapters);
    assert.deepEqual(tree.volumes.map((v) => v.volume.id), ["v1", "v2"]);
    assert.deepEqual(tree.loose.map((c) => c.id), ["a", "e"]);
    assert.deepEqual(tree.volumes[0].chapters.map((c) => c.id), ["b", "c"]);
    assert.deepEqual(readingOrder(volumes, chapters).map((c) => c.id), ["a", "e", "b", "c", "d"]);
  });

  it("同卷内调换顺序", () => {
    const changes = moveChapter(volumes, chapters, "c", "v1", 0);
    const next = apply(chapters, changes);
    assert.deepEqual(buildTree(volumes, next).volumes[0].chapters.map((c) => c.id), ["c", "b"]);
    assert.equal(changes.every((x) => x.volumeId === "v1"), true);
  });

  it("跨卷移动，两边都重新编号", () => {
    const changes = moveChapter(volumes, chapters, "b", "v2", 1);
    const next = apply(chapters, changes);
    const tree = buildTree(volumes, next);
    assert.deepEqual(tree.volumes[0].chapters.map((c) => [c.id, c.sortOrder]), [["c", 1]]);
    assert.deepEqual(tree.volumes[1].chapters.map((c) => [c.id, c.sortOrder]), [["d", 1], ["b", 2]]);
  });

  it("移到未分卷，越界下标夹到末尾", () => {
    const changes = moveChapter(volumes, chapters, "d", null, 99);
    const next = apply(chapters, changes);
    assert.deepEqual(buildTree(volumes, next).loose.map((c) => c.id), ["a", "e", "d"]);
  });

  it("目标卷不存在或章节不存在时不改动", () => {
    assert.deepEqual(moveChapter(volumes, chapters, "b", "nope", 0), []);
    assert.deepEqual(moveChapter(volumes, chapters, "zz", "v1", 0), []);
  });

  it("没有实际变化时不返回多余写入", () => {
    assert.deepEqual(moveChapter(volumes, chapters, "b", "v1", 0), []);
  });

  it("卷的排序", () => {
    const changes = moveVolume(volumes, "v2", 0);
    assert.deepEqual(changes.sort((x, y) => x.id.localeCompare(y.id)), [
      { id: "v1", sortOrder: 2 },
      { id: "v2", sortOrder: 1 },
    ]);
    assert.deepEqual(moveVolume(volumes, "missing", 0), []);
  });

  it("序号与中文数字", () => {
    assert.equal(nextSortOrder([]), 1);
    assert.equal(nextSortOrder([{ sortOrder: 3 }, { sortOrder: 7 }]), 8);
    assert.equal(chineseNumber(1), "一");
    assert.equal(chineseNumber(10), "十");
    assert.equal(chineseNumber(12), "十二");
    assert.equal(chineseNumber(20), "二十");
    assert.equal(chineseNumber(105), "一百零五");
    assert.equal(chineseNumber(1010), "一千零一十");
    assert.equal(defaultChapterTitle(11), "第十二章");
  });
});
