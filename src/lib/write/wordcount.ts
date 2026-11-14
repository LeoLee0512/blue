/**
 * 中文写作字数统计。
 *
 * 规则（与常见中文写作软件、Word「字数」接近）：
 * - 每个汉字（含扩展区）、日文假名、韩文音节各算 1 字；
 * - 连续的拉丁字母（可带撇号、连字符）算 1 个词，记 1 字；
 * - 连续的数字（可带小数点、千分位逗号）算 1 字；
 * - 标点单独统计，默认不计入「字数」，`withPunct` 里包含；
 * - 空白不计。
 */
export type TextCount = {
  /** 汉字、假名、韩文音节数 */
  hanzi: number;
  /** 拉丁词数 */
  words: number;
  /** 数字串数 */
  numbers: number;
  /** 标点符号数（中英文标点都算） */
  punct: number;
  /** 字数（不含标点）：hanzi + words + numbers */
  total: number;
  /** 字数（含标点） */
  withPunct: number;
  /** 非空段落数 */
  paragraphs: number;
};

function isHan(cp: number): boolean {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x3134f) ||
    (cp >= 0x3040 && cp <= 0x30ff) || // 假名
    (cp >= 0xac00 && cp <= 0xd7af) || // 韩文音节
    cp === 0x3007 // 〇
  );
}

function isLatin(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f && cp !== 0xd7 && cp !== 0xf7);
}

function isDigit(cp: number): boolean {
  return (cp >= 0x30 && cp <= 0x39) || (cp >= 0xff10 && cp <= 0xff19);
}

function isSpace(cp: number): boolean {
  return cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x0b || cp === 0x0c || cp === 0x3000 || cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200b) || cp === 0xfeff;
}

export function countText(text: string): TextCount {
  let hanzi = 0;
  let words = 0;
  let numbers = 0;
  let punct = 0;
  let mode: "" | "word" | "num" = "";
  const value = String(text ?? "");
  const chars = [...value];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const cp = ch.codePointAt(0) ?? 0;
    if (isHan(cp)) {
      hanzi += 1;
      mode = "";
      continue;
    }
    if (isLatin(cp)) {
      if (mode !== "word") {
        words += 1;
        mode = "word";
      }
      continue;
    }
    if (isDigit(cp)) {
      if (mode === "word") continue; // abc123 仍算一个词
      if (mode !== "num") {
        numbers += 1;
        mode = "num";
      }
      continue;
    }
    if (isSpace(cp)) {
      mode = "";
      continue;
    }
    // 词内的撇号、连字符，数字里的小数点、千分位逗号，不打断也不计标点。
    const next = chars[i + 1]?.codePointAt(0) ?? 0;
    if (mode === "word" && (ch === "'" || ch === "’" || ch === "-") && isLatin(next)) continue;
    if (mode === "num" && (ch === "." || ch === ",") && isDigit(next)) continue;
    punct += 1;
    mode = "";
  }
  const paragraphs = value.split(/\n+/).filter((line) => line.trim()).length;
  const total = hanzi + words + numbers;
  return { hanzi, words, numbers, punct, total, withPunct: total + punct, paragraphs };
}

/** 字数（不含标点）。 */
export function countWords(text: string): number {
  return countText(text).total;
}

/** 这次修改净增的字数；删字不记负数。 */
export function addedWords(before: string, after: string): number {
  return Math.max(0, countWords(after) - countWords(before));
}

/** 「1.2 万」式的简短显示。 */
export function formatCount(n: number): string {
  const value = Math.max(0, Math.round(n || 0));
  if (value >= 100000000) return `${(value / 100000000).toFixed(value >= 1000000000 ? 0 : 1).replace(/\.0$/, "")} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, "")} 万`;
  return String(value);
}

/** 预计阅读时长（分钟），按每分钟 400 字估算，至少 1 分钟。 */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round((words || 0) / 400));
}
