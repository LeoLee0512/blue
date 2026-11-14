import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAssistMessages, createSseParser, mentioned, tidyAssistOutput, validateAssist, type AssistContext, type AssistInput } from "./assist-prompts.ts";

const ctx: AssistContext = {
  title: "雾镇",
  genre: "悬疑",
  logline: "回乡的人",
  premise: "林照回到雾镇调查父亲失踪",
  styleNotes: "冷静克制",
  touch: "",
  chapterTitle: "第一章",
  characters: [
    { name: "林照", role: "主角", bio: "记者", aliases: "阿照" },
    { name: "周叔", role: "邻居", bio: "知道秘密", aliases: "" },
  ],
  lore: [{ name: "灯塔", kind: "place", summary: "废弃多年" }],
  chapterFacts: ["第一章：林照回到雾镇"],
};

const base: AssistInput = { tool: "polish", selection: "阿照走向灯塔。", before: "雨很大。", after: "", instruction: "", length: 500 };

describe("AI 写作工具提示词", () => {
  it("按名字或别名找出相关人物和设定", () => {
    const hit = mentioned(ctx, "阿照走向灯塔。");
    assert.deepEqual(hit.characters.map((c) => c.name), ["林照"]);
    assert.deepEqual(hit.lore.map((l) => l.name), ["灯塔"]);
  });
  it("润色：系统消息带作品信息和相关人物，用户消息带选中段落", () => {
    const { messages, temperature } = buildAssistMessages(ctx, base);
    assert.equal(messages[0].role, "system");
    assert.match(messages[0].content, /书名：雾镇/);
    assert.match(messages[0].content, /林照（主角）/);
    assert.doesNotMatch(messages[0].content, /周叔/);
    assert.match(messages[1].content, /要润色的段落】\n阿照走向灯塔。/);
    assert.ok(temperature < 0.8);
  });
  it("续写：带前文和字数要求", () => {
    const { messages } = buildAssistMessages(ctx, { ...base, tool: "continue", selection: "", before: "雨很大。林照推开门。", length: 1000 });
    assert.match(messages[1].content, /约 1000 字/);
    assert.match(messages[1].content, /林照推开门。/);
  });
  it("改写用风格要求，大纲带已有章节", () => {
    assert.match(buildAssistMessages(ctx, { ...base, tool: "rewrite", instruction: "更口语" }).messages[1].content, /要求：更口语/);
    assert.match(buildAssistMessages(ctx, { ...base, tool: "outline", selection: "", instruction: "后三章" }).messages[1].content, /第一章：林照回到雾镇[\s\S]*后三章/);
  });
  it("校验：需要选区的工具、超长选区、空指令", () => {
    assert.equal(validateAssist({ ...base, selection: "" }), "先选中一段文字，或把光标放在要续写的位置。");
    assert.match(validateAssist({ ...base, selection: "字".repeat(7000) }) ?? "", /太长/);
    assert.equal(validateAssist({ ...base, tool: "custom", instruction: "" }), "先写一句你想做什么");
    assert.equal(validateAssist({ ...base, tool: "continue", selection: "", before: "" }), "先选中一段文字，或把光标放在要续写的位置。");
    assert.equal(validateAssist({ ...base, tool: "nope" as never }), "不认识这个写作工具。");
    assert.equal(validateAssist(base), null);
  });
  it("流式解析：跨块拼接、跳过思考内容、遇到 [DONE] 结束", () => {
    const p = createSseParser();
    const a = p.push('data: {"choices":[{"delta":{"reasoning_content":"想"}}]}\n\ndata: {"choices":[{"delta":{"content":"雨"}}]}\n\ndata: {"choi');
    assert.deepEqual(a, { text: "雨", done: false });
    const b = p.push('ces":[{"delta":{"content":"停了"}}]}\n\n: keep-alive\ndata: [DONE]\n\n');
    assert.deepEqual(b, { text: "停了", done: true });
    assert.deepEqual(p.push('data: {"choices":[{"delta":{"content":"多余"}}]}\n'), { text: "", done: true });
  });
  it("清理前言和包裹引号", () => {
    assert.equal(tidyAssistOutput("以下是润色后的段落：\n雨停了。", "polish"), "雨停了。");
    assert.equal(tidyAssistOutput("“雨停了。”", "polish"), "雨停了。");
    assert.equal(tidyAssistOutput("“你来了。”她说。“坐。”", "polish"), "“你来了。”她说。“坐。”");
  });
});
