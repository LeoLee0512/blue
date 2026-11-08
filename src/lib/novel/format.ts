import type { Chapter, Character, Novel, OutlineNode } from "./types";

export type NetKind = "person" | "chapter" | "thread";

export type NetPoint = { id: string; kind: NetKind; label: string };

export type NetLink = { from: string; to: string };

export function storyNet(input: { characters: Character[]; chapters: Chapter[]; ledger: string }): { points: NetPoint[]; links: NetLink[] } {
  const people = input.characters.slice(0, 24).filter((person) => person.name.trim().length >= 2);
  const chapters = input.chapters.slice(0, 40).filter((chapter) => chapter.title.trim());
  const threads = threadLines(input.ledger).slice(0, 16);
  const points: NetPoint[] = [
    ...people.map((person) => ({ id: `p:${person.id}`, kind: "person" as const, label: person.name })),
    ...chapters.map((chapter) => ({ id: `c:${chapter.id}`, kind: "chapter" as const, label: chapter.title })),
    ...threads.map((line, index) => ({ id: `t:${index}`, kind: "thread" as const, label: line.split("｜")[0]?.slice(0, 16) || line.slice(0, 16) })),
  ];
  const links: NetLink[] = [];
  for (const person of people) {
    for (const other of people) {
      if (other.id <= person.id) continue;
      if (other.bio.includes(person.name) || person.bio.includes(other.name)) links.push({ from: `p:${person.id}`, to: `p:${other.id}` });
    }
    for (const chapter of chapters) {
      if (chapter.body.includes(person.name) || chapter.title.includes(person.name)) links.push({ from: `p:${person.id}`, to: `c:${chapter.id}` });
    }
  }
  threads.forEach((line, index) => {
    for (const chapter of chapters) {
      if (chapter.title && line.includes(chapter.title)) links.push({ from: `t:${index}`, to: `c:${chapter.id}` });
    }
  });
  return { points, links };
}

export function chapterFact(chapter: { fact?: string; body: string }): string {
  const kept = chapter.fact?.trim();
  if (kept) return kept;
  const text = chapter.body.replace(/\s+/g, "");
  const bits = text.split(/(?<=[。！？])/).map((item) => item.trim()).filter(Boolean);
  return bits.slice(0, 2).join("").slice(0, 80);
}

export function reviewSides(commentary: string): { want: string; loose: string } {
  return {
    want: headingSlice(commentary, "想听下去", ["松了", "线还在不在", "这一回"]),
    loose: headingSlice(commentary, "松了", ["线还在不在", "想听下去", "这一回"]),
  };
}

export function driftNote(
  characters: { name: string }[],
  chapters: { title: string; body: string }[],
  ledger: string,
): string {
  const stale = staleThread(chapters, ledger);
  if (stale) return stale;
  return driftedName(characters, chapters);
}

function headingSlice(text: string, title: string, stops: string[]): string {
  const head = `(?:^|\\n)\\s*#{0,3}\\s*(?:\\*\\*|__)?\\s*${title}`;
  const start = text.search(new RegExp(head));
  if (start < 0) return "";
  const from = text.slice(start).replace(new RegExp(`^\\s*#{0,3}\\s*(?:\\*\\*|__)?\\s*${title}\\s*(?:\\*\\*|__)?\\s*[:：]?\\s*`), "");
  let end = from.length;
  for (const stop of stops) {
    const at = from.search(new RegExp(`\\n\\s*#{0,3}\\s*(?:\\*\\*|__)?\\s*${stop}`));
    if (at >= 0) end = Math.min(end, at);
  }
  return from.slice(0, end).replace(/\s+/g, " ").trim().slice(0, 180);
}

function staleThread(chapters: { title: string; body: string }[], ledger: string): string {
  let best = "";
  let gap = 2;
  for (const line of threadLines(ledger)) {
    const thing = line.split("｜")[0]?.trim() ?? "";
    if (thing.length < 2 || thing.length > 12) continue;
    let last = -1;
    chapters.forEach((chapter, index) => {
      if (`${chapter.title}\n${chapter.body}`.includes(thing)) last = index;
    });
    if (last < 0) continue;
    const after = chapters.length - 1 - last;
    if (after > gap) {
      gap = after;
      best = `${thing}从《${chapters[last]?.title || "前面"}》后再没出现。`;
    }
  }
  return best;
}

function driftedName(characters: { name: string }[], chapters: { title: string; body: string }[]): string {
  const names = characters.map((person) => person.name.trim()).filter((name) => name.length >= 2 && name.length <= 4);
  const taken = new Set(names);
  for (const name of names) {
    for (const chapter of chapters) {
      const hit = nearName(`${chapter.title}${chapter.body}`, name, taken);
      if (hit) return `正文里写过「${hit}」，人物是${name}。`;
    }
  }
  return "";
}

function nearName(text: string, name: string, taken: Set<string>): string {
  const size = [...name].length;
  if (size < 2 || size > 4) return "";
  const consider = (chunk: string) => {
    const chars = [...chunk];
    if (chars.length < size) return "";
    for (let index = 0; index + size <= chars.length; index += 1) {
      const gram = chars.slice(index, index + size).join("");
      if (gram === name || taken.has(gram)) continue;
      if (uncommonSwap(gram, name)) return gram;
    }
    return "";
  };
  let run = "";
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      run += char;
      continue;
    }
    const found = consider(run);
    if (found) return found;
    run = "";
  }
  return consider(run);
}

const COMMON = new Set(
  "的一是不了人我在有他这为之大来以个中上们到说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应战向头文体政美相见被利什二等产或新己制身果加西月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活尔更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直德资命山金指克许统区保至队形社便空决治展马科司五基眼识劳色光".split(
    "",
  ),
);

function uncommonSwap(gram: string, name: string): boolean {
  const left = [...gram];
  const right = [...name];
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    diff += 1;
    if (diff > 1 || COMMON.has(left[index] ?? "") || COMMON.has(right[index] ?? "")) return false;
  }
  return diff === 1;
}

function threadLines(ledger: string): string[] {
  const start = ledger.search(/未收的线/);
  if (start < 0) return [];
  return ledger
    .slice(start)
    .split(/\n(?:作者知道|人物此刻)/)[0]
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.length > 1 && !line.startsWith("未收的线"));
}

export function threadPreview(ledger: string): string {
  const start = ledger.search(/未收的线/);
  if (start < 0) return "";
  return ledger
    .slice(start)
    .split("\n")
    .filter((line) => /^\s*[-*]/.test(line))
    .slice(0, 4)
    .join("\n");
}

export function openThreads(ledger: string): number {
  const start = ledger.search(/未收的线/);
  const slice = start < 0 ? "" : ledger.slice(start).split(/\n(?:作者知道|人物此刻)/)[0];
  return slice.split("\n").filter((line) => /^\s*[-*]/.test(line) && line.replace(/^[-*\s]+/, "").length > 1).length;
}

export function bookMark(chapters: number, outline: number, ledger: string): string {
  const stage = chapters > 0 ? `写到第 ${chapters} 章` : outline > 0 ? "骨头立了" : "还在起笔";
  const open = openThreads(ledger);
  return open ? `${stage} · 未收 ${open} 条` : stage;
}

export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function todayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function childrenOf(nodes: OutlineNode[], parentId: string | null): OutlineNode[] {
  return nodes
    .filter((n) => (n.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh"));
}

export function exportMarkdown(input: {
  novel: Novel;
  outline: OutlineNode[];
  chapters: Chapter[];
  characters: Character[];
}): string {
  const { novel, outline, chapters, characters } = input;
  const lines: string[] = [`# ${novel.title}`, ""];
  if (novel.genre) lines.push(`类型：${novel.genre}`, "");
  if (novel.logline) lines.push(novel.logline, "");
  if (novel.premise) lines.push("## 故事核", "", novel.premise, "");
  if (novel.soFar) lines.push("## 到这里为止", "", novel.soFar, "");
  if (novel.ledger) lines.push("## 手里的线", "", novel.ledger, "");
  if (novel.commentary) lines.push("## 评书", "", novel.commentary, "");
  if (novel.styleNotes) lines.push("## 文风", "", novel.styleNotes, "");

  lines.push("## 大纲", "");
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf(outline, parentId)) {
      const pad = "  ".repeat(depth);
      const mark = node.kind === "volume" ? "卷" : node.kind === "chapter" ? "章" : "拍";
      lines.push(`${pad}- ${mark} ${node.title}`);
      if (node.summary) lines.push(`${pad}  ${node.summary}`);
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  if (outline.length === 0) lines.push("（空）");

  lines.push("", "## 人物", "");
  if (characters.length === 0) lines.push("（空）");
  for (const person of characters) {
    lines.push(`### ${person.name}`, "");
    if (person.role) lines.push(person.role, "");
    if (person.bio) lines.push(person.bio, "");
  }

  lines.push("## 正文", "");
  if (chapters.length === 0) lines.push("（空）");
  for (const chapter of chapters) {
    lines.push(`### ${chapter.title}`, "", chapter.body || "（空白）", "");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
