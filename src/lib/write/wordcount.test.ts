import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addedWords, countText, countWords, formatCount, readingMinutes } from "./wordcount.ts";

describe("中文字数统计", () => {
  it("每个汉字算一字，标点和空白不计", () => {
    assert.equal(countWords("你好，世界。"), 4);
    assert.equal(countWords("  春眠不觉晓\n处处闻啼鸟  "), 10);
    assert.equal(countText("你好，世界。").punct, 2);
    assert.equal(countText("你好，世界。").withPunct, 6);
  });
  it("英文按词、数字按串计", () => {
    assert.equal(countWords("Hello world"), 2);
    assert.equal(countWords("他在2026年读了3.5本Harry Potter's书"), 2 + 1 + 3 + 1 + 1 + 2 + 1);
    assert.equal(countWords("well-known 1,000"), 2);
  });
  it("扩展区汉字、假名、韩文都算字", () => {
    assert.equal(countWords("𠀀𪚥"), 2);
    assert.equal(countWords("ひらがなカタカナ"), 8);
    assert.equal(countWords("한국어"), 3);
  });
  it("段落数只算非空行", () => {
    assert.equal(countText("第一段\n\n\n第二段\n  \n第三段").paragraphs, 3);
  });
  it("空值安全", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords(undefined as unknown as string), 0);
  });
  it("净增字数不记负数", () => {
    assert.equal(addedWords("你好", "你好世界"), 2);
    assert.equal(addedWords("你好世界", "你好"), 0);
  });
  it("简短显示与阅读时长", () => {
    assert.equal(formatCount(9999), "9999");
    assert.equal(formatCount(12345), "1.2 万");
    assert.equal(formatCount(200000), "20 万");
    assert.equal(readingMinutes(0), 1);
    assert.equal(readingMinutes(4000), 10);
  });
});
