/**
 * 导出：TXT、Markdown、Word（.docx）、EPUB。纯函数，返回字符串或字节，
 * 由界面负责下载。正文按换行分段。
 */
import { utf8, zipStore } from "./zip.ts";

export type ExportChapter = { id: string; title: string; body: string };
export type ExportPart = { id: string; title: string | null; chapters: ExportChapter[] };
export type ExportBook = {
  id: string;
  title: string;
  author?: string;
  genre?: string;
  logline?: string;
  parts: ExportPart[];
  /** 生成时间，便于测试固定 */
  date?: Date;
};

/** 去掉 XML 不允许的控制字符。 */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  return String(text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
}

export function escapeXml(text: string): string {
  return clean(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** 把正文拆成段落：去掉每段首尾空白（含全角空格缩进），丢掉空段。 */
export function paragraphs(body: string): string[] {
  return clean(body)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""))
    .filter(Boolean);
}

/** 文件名里不能用的字符换成下划线。 */
export function safeFileName(name: string, fallback = "蓝稿导出"): string {
  // eslint-disable-next-line no-control-regex
  const value = clean(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 80);
  return value || fallback;
}

function allChapters(book: ExportBook): ExportChapter[] {
  return book.parts.flatMap((part) => part.chapters);
}

/** 纯文本。Windows 换行，段首两个全角空格。 */
export function toTxt(book: ExportBook, opts: { indent?: boolean } = {}): string {
  const indent = opts.indent === false ? "" : "\u3000\u3000";
  const lines: string[] = [book.title];
  if (book.author) lines.push(`作者：${book.author}`);
  if (book.logline) lines.push("", book.logline);
  for (const part of book.parts) {
    if (part.title) lines.push("", "", part.title);
    for (const chapter of part.chapters) {
      lines.push("", "", chapter.title, "");
      for (const p of paragraphs(chapter.body)) lines.push(indent + p);
    }
  }
  return lines.join("\r\n") + "\r\n";
}

export function toMarkdown(book: ExportBook): string {
  const lines: string[] = [`# ${book.title}`, ""];
  if (book.author) lines.push(`作者：${book.author}`, "");
  if (book.logline) lines.push(`> ${book.logline}`, "");
  for (const part of book.parts) {
    if (part.title) lines.push(`## ${part.title}`, "");
    for (const chapter of part.chapters) {
      lines.push(`${part.title ? "###" : "##"} ${chapter.title}`, "");
      for (const p of paragraphs(chapter.body)) lines.push(p, "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/* ---------------- DOCX ---------------- */

function docxRun(text: string, extra = ""): string {
  return `<w:r>${extra ? `<w:rPr>${extra}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function docxPara(text: string, style: string, opts: { pageBreak?: boolean } = {}): string {
  const ppr = `<w:pPr><w:pStyle w:val="${style}"/>${opts.pageBreak ? "<w:pageBreakBefore/>" : ""}</w:pPr>`;
  return `<w:p>${ppr}${docxRun(text)}</w:p>`;
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="400" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="480"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="666666"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="480" w:after="360"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="360" w:after="360"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
</w:styles>`;

export function toDocx(book: ExportBook): Uint8Array {
  const date = book.date ?? new Date();
  const body: string[] = [docxPara(book.title, "Title")];
  if (book.author) body.push(docxPara(`作者：${book.author}`, "Subtitle"));
  if (book.logline) body.push(docxPara(book.logline, "Subtitle"));
  let first = true;
  for (const part of book.parts) {
    if (part.title) {
      body.push(docxPara(part.title, "Heading1", { pageBreak: true }));
      first = false;
    }
    for (const chapter of part.chapters) {
      body.push(docxPara(chapter.title, "Heading2", { pageBreak: first || !part.title || part.chapters[0] !== chapter }));
      first = false;
      const ps = paragraphs(chapter.body);
      for (const p of ps.length ? ps : [""]) body.push(docxPara(p, "Body"));
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;
  const iso = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  return zipStore([
    {
      name: "[Content_Types].xml",
      date,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      date,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      date,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "word/document.xml", date, data: document },
    { name: "word/styles.xml", date, data: DOCX_STYLES },
    {
      name: "docProps/core.xml",
      date,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.author ?? "")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`,
    },
  ]);
}

/* ---------------- EPUB ---------------- */

const EPUB_CSS = `body{font-family:"Songti SC","Noto Serif SC","SimSun",serif;line-height:1.8;margin:0 5%;}
h1{text-align:center;font-size:1.6em;margin:2em 0 1em;}
h2{text-align:center;font-size:1.3em;margin:1.5em 0 1em;}
p{text-indent:2em;margin:0 0 .4em;text-align:justify;}
.title{text-align:center;margin-top:30%;}
.meta{text-align:center;text-indent:0;color:#666;}`;

function xhtml(title: string, inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${inner}</body>
</html>`;
}

export function toEpub(book: ExportBook): Uint8Array {
  const date = book.date ?? new Date();
  const uid = `urn:langao:${escapeXml(book.id || "book")}`;
  const modified = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  type Item = { id: string; href: string; title: string; level: 1 | 2; content: string };
  const items: Item[] = [];
  const titleInner = `<h1 class="title">${escapeXml(book.title)}</h1>${book.author ? `<p class="meta">${escapeXml(book.author)}</p>` : ""}${book.logline ? `<p class="meta">${escapeXml(book.logline)}</p>` : ""}`;
  items.push({ id: "titlepage", href: "title.xhtml", title: book.title, level: 1, content: xhtml(book.title, titleInner) });
  let n = 0;
  book.parts.forEach((part, pi) => {
    if (part.title) {
      items.push({ id: `part${pi + 1}`, href: `part${pi + 1}.xhtml`, title: part.title, level: 1, content: xhtml(part.title, `<h1>${escapeXml(part.title)}</h1>`) });
    }
    for (const chapter of part.chapters) {
      n += 1;
      const inner = `<h2>${escapeXml(chapter.title)}</h2>${paragraphs(chapter.body)
        .map((p) => `<p>${escapeXml(p)}</p>`)
        .join("")}`;
      items.push({ id: `ch${n}`, href: `ch${n}.xhtml`, title: chapter.title, level: part.title ? 2 : 1, content: xhtml(chapter.title, inner) });
    }
  });

  // nav.xhtml（EPUB 3）—— 卷下嵌套章节
  const navList: string[] = [];
  let open = false;
  for (const item of items.slice(1)) {
    if (item.level === 1) {
      if (open) navList.push("</ol></li>");
      open = false;
      const isPart = item.id.startsWith("part");
      navList.push(`<li><a href="${item.href}">${escapeXml(item.title)}</a>${isPart ? "<ol>" : "</li>"}`);
      if (isPart) open = true;
    } else {
      navList.push(`<li><a href="${item.href}">${escapeXml(item.title)}</a></li>`);
    }
  }
  if (open) navList.push("</ol></li>");
  const navHtml = xhtml("目录", `<nav epub:type="toc" id="toc"><h1>目录</h1><ol>${navList.join("").replace(/<ol><\/ol>/g, "")}</ol></nav>`);

  // toc.ncx（给老阅读器）
  let play = 0;
  const ncxPoints = items
    .map((item) => {
      play += 1;
      return `<navPoint id="np${play}" playOrder="${play}"><navLabel><text>${escapeXml(item.title)}</text></navLabel><content src="${item.href}"/></navPoint>`;
    })
    .join("");
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${escapeXml(book.title)}</text></docTitle><navMap>${ncxPoints}</navMap></ncx>`;

  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...items.map((item) => `<item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml"/>`),
  ].join("");
  const spine = items.map((item) => `<itemref idref="${item.id}"/>`).join("");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${uid}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:language>zh-CN</dc:language>${book.author ? `<dc:creator>${escapeXml(book.author)}</dc:creator>` : ""}${book.logline ? `<dc:description>${escapeXml(book.logline)}</dc:description>` : ""}<meta property="dcterms:modified">${modified}</meta></metadata>
<manifest>${manifest}</manifest>
<spine toc="ncx">${spine}</spine>
</package>`;

  return zipStore([
    { name: "mimetype", data: "application/epub+zip", date },
    {
      name: "META-INF/container.xml",
      date,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    },
    { name: "OEBPS/content.opf", data: opf, date },
    { name: "OEBPS/nav.xhtml", data: navHtml, date },
    { name: "OEBPS/toc.ncx", data: ncx, date },
    { name: "OEBPS/style.css", data: EPUB_CSS, date },
    ...items.map((item) => ({ name: `OEBPS/${item.href}`, data: item.content, date })),
  ]);
}

export type ExportFormat = "txt" | "md" | "docx" | "epub";

export const EXPORT_MIME: Record<ExportFormat, string> = {
  txt: "text/plain;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
};

/** 生成指定格式的字节。TXT 带 UTF-8 BOM，旧版记事本也能正确识别中文。 */
export function renderExport(book: ExportBook, format: ExportFormat): Uint8Array {
  if (format === "docx") return toDocx(book);
  if (format === "epub") return toEpub(book);
  if (format === "md") return utf8(toMarkdown(book));
  const body = utf8(toTxt(book));
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

export function chapterCount(book: ExportBook): number {
  return allChapters(book).length;
}
