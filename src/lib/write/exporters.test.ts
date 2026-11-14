import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeXml, paragraphs, renderExport, safeFileName, toDocx, toEpub, toMarkdown, toTxt, type ExportBook } from "./exporters.ts";
import { crc32, unzipStore, utf8, zipStore } from "./zip.ts";

const book: ExportBook = {
  id: "n_1",
  title: "雨夜<灯>",
  author: "Leo Lee",
  logline: "一盏灯 & 一扇门",
  date: new Date("2026-11-14T08:00:00Z"),
  parts: [
    { id: "loose", title: null, chapters: [{ id: "c0", title: "楔子", body: "　　门开了。\n\n灯亮着。" }] },
    { id: "v1", title: "第一卷", chapters: [{ id: "c1", title: "第一章", body: "雨下了一夜。\r\n她没有回来。" }] },
  ],
};

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("ZIP", () => {
  it("CRC32 与标准值一致", () => {
    assert.equal(crc32(utf8("123456789")), 0xcbf43926);
  });
  it("写入后能读回，中文文件名可用", () => {
    const zip = zipStore([{ name: "目录/文件.txt", data: "内容" }, { name: "b.bin", data: new Uint8Array([1, 2, 3]) }]);
    const files = unzipStore(zip);
    assert.deepEqual(files.map((f) => f.name), ["目录/文件.txt", "b.bin"]);
    assert.equal(text(files[0].data), "内容");
    assert.deepEqual([...files[1].data], [1, 2, 3]);
  });
});

describe("导出", () => {
  it("段落拆分去掉缩进和空行", () => {
    assert.deepEqual(paragraphs("　　门开了。\n\n  灯亮着。 \n"), ["门开了。", "灯亮着。"]);
  });
  it("XML 转义与控制字符清理", () => {
    assert.equal(escapeXml(`<a href="x">&'\u0001`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });
  it("文件名安全", () => {
    assert.equal(safeFileName('a/b:c*?"<>|'), "a_b_c______");
    assert.equal(safeFileName("   "), "蓝稿导出");
  });
  it("TXT：卷名、章名、全角缩进、CRLF", () => {
    const txt = toTxt(book);
    assert.match(txt, /^雨夜<灯>\r\n作者：Leo Lee/);
    assert.match(txt, /第一卷\r\n\r\n\r\n第一章\r\n\r\n\u3000\u3000雨下了一夜。\r\n\u3000\u3000她没有回来。/);
    assert.equal(txt.includes("\n\n\n\n\n"), false);
    const bytes = renderExport(book, "txt");
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  });
  it("Markdown：卷用二级标题、卷内章用三级标题", () => {
    const md = toMarkdown(book);
    assert.match(md, /^# 雨夜<灯>/);
    assert.match(md, /## 楔子/);
    assert.match(md, /## 第一卷\n\n### 第一章/);
  });
  it("DOCX：包结构完整，正文已转义", () => {
    const files = unzipStore(toDocx(book));
    const names = files.map((f) => f.name);
    for (const need of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "docProps/core.xml"]) {
      assert.ok(names.includes(need), need);
    }
    const doc = text(files.find((f) => f.name === "word/document.xml")!.data);
    assert.match(doc, /雨夜&lt;灯&gt;/);
    assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
    assert.match(doc, /她没有回来。/);
    assert.equal(doc.includes("<灯>"), false);
  });
  it("EPUB：mimetype 在首位且不压缩，目录含卷和章", () => {
    const bytes = toEpub(book);
    assert.equal(text(bytes.slice(30, 38)), "mimetype");
    const files = unzipStore(bytes);
    assert.equal(files[0].name, "mimetype");
    assert.equal(text(files[0].data), "application/epub+zip");
    const opf = text(files.find((f) => f.name === "OEBPS/content.opf")!.data);
    assert.match(opf, /<dc:language>zh-CN<\/dc:language>/);
    assert.match(opf, /雨夜&lt;灯&gt;/);
    const nav = text(files.find((f) => f.name === "OEBPS/nav.xhtml")!.data);
    assert.match(nav, /第一卷<\/a><ol><li><a href="ch2.xhtml">第一章/);
    assert.ok(files.some((f) => f.name === "OEBPS/ch1.xhtml"));
    assert.ok(files.some((f) => f.name === "OEBPS/toc.ncx"));
  });
});
