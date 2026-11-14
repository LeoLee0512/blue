import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffChars, diffStats, diffText, diffTokens } from "./diff.ts";

function rebuild(ops: { type: string; text: string }[], side: "before" | "after"): string {
  return ops.filter((op) => op.type === "equal" || op.type === (side === "before" ? "delete" : "insert")).map((op) => op.text).join("");
}

describe("版本对比", () => {
  it("字符级 diff 能还原两边", () => {
    const a = "春眠不觉晓，处处闻啼鸟。";
    const b = "春眠不知晓，处处闻鸟啼。夜来风雨声。";
    const ops = diffChars(a, b);
    assert.equal(rebuild(ops, "before"), a);
    assert.equal(rebuild(ops, "after"), b);
  });

  it("随机文本 diff 还原正确", () => {
    const alphabet = "甲乙丙丁戊己庚辛";
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let round = 0; round < 40; round += 1) {
      const make = () => Array.from({ length: rand() % 30 }, () => alphabet[rand() % alphabet.length]).join("");
      const a = make();
      const b = make();
      const ops = diffChars(a, b);
      assert.equal(rebuild(ops, "before"), a);
      assert.equal(rebuild(ops, "after"), b);
    }
  });

  it("段落级：未改动、修改、新增、删除", () => {
    const rows = diffText("第一段\n第二段\n第三段", "第一段\n第二段改了\n第四段\n第五段");
    assert.equal(rows[0].type, "equal");
    assert.equal(rows[1].type, "change");
    assert.equal(rows.some((r) => r.type === "insert"), true);
  });

  it("完全相同时只有 equal", () => {
    assert.equal(diffText("a\nb", "a\nb").every((r) => r.type === "equal"), true);
    assert.deepEqual(diffStats("同样的文字", "同样的文字"), { added: 0, removed: 0 });
  });

  it("增删统计", () => {
    assert.deepEqual(diffStats("你好", "你好世界"), { added: 2, removed: 0 });
    assert.deepEqual(diffStats("你好世界", "世界"), { added: 0, removed: 2 });
  });

  it("超出上限时退化为整体替换，仍然正确", () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
    const edits = diffTokens(a, b, 5);
    assert.equal(edits.filter((e) => e.type === "delete").length, 50);
    assert.equal(edits.filter((e) => e.type === "insert").length, 50);
  });
});
