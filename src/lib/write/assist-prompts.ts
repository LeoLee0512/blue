/**
 * AI 写作工具（续写、润色、扩写、缩写、改写、大纲、自定义）的提示词。纯函数。
 * 只组装发给用户自己所选服务商的消息，不涉及地址和密钥。
 */
export type AssistTool = "continue" | "polish" | "expand" | "shorten" | "rewrite" | "outline" | "custom";

export const ASSIST_TOOLS: { id: AssistTool; label: string; needsSelection: boolean; blurb: string }[] = [
  { id: "continue", label: "续写", needsSelection: false, blurb: "接着光标前的内容往下写" },
  { id: "polish", label: "润色", needsSelection: true, blurb: "修正病句，理顺节奏，保持原意" },
  { id: "expand", label: "扩写", needsSelection: true, blurb: "补充动作、环境、心理和对话细节" },
  { id: "shorten", label: "缩写", needsSelection: true, blurb: "压缩篇幅，保留关键情节" },
  { id: "rewrite", label: "改写", needsSelection: true, blurb: "换一种写法或风格" },
  { id: "outline", label: "大纲", needsSelection: false, blurb: "生成后续章节大纲或本章细纲" },
  { id: "custom", label: "自由指令", needsSelection: false, blurb: "按你的要求处理选中文字" },
];

export const REWRITE_STYLES = ["更生动", "更简洁", "更口语", "更古典", "更紧张", "更抒情", "改为第一人称", "改为第三人称"] as const;

export const CONTINUE_LENGTHS = [200, 500, 1000] as const;

export const MAX_SELECTION = 6000;

export type AssistContext = {
  title: string;
  genre: string;
  logline: string;
  premise: string;
  styleNotes: string;
  /** 用户的笔触档案（可空） */
  touch: string;
  chapterTitle: string;
  characters: { name: string; role: string; bio: string; aliases: string }[];
  lore: { name: string; kind: string; summary: string }[];
  /** 已有章节（标题 + 一句事实），大纲工具用 */
  chapterFacts: string[];
};

export type AssistInput = {
  tool: AssistTool;
  /** 选中的文字 */
  selection: string;
  /** 光标（或选区）前的正文 */
  before: string;
  /** 光标（或选区）后的正文 */
  after: string;
  /** 改写风格 / 大纲范围 / 自由指令 */
  instruction: string;
  /** 续写字数 */
  length: number;
};

export type ChatMessage = { role: "system" | "user"; content: string };

const clipEnd = (text: string, max: number) => (text.length > max ? text.slice(text.length - max) : text);
const clipStart = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

function aliasList(raw: string): string[] {
  return raw
    .split(/[，,、;；\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 1);
}

/** 文本里提到了哪些人物和设定（按名字或别名匹配）。 */
export function mentioned(ctx: AssistContext, text: string): { characters: AssistContext["characters"]; lore: AssistContext["lore"] } {
  const characters = ctx.characters.filter((c) => [c.name, ...aliasList(c.aliases)].some((n) => n && text.includes(n))).slice(0, 8);
  const lore = ctx.lore.filter((l) => l.name && text.includes(l.name)).slice(0, 8);
  return { characters, lore };
}

export function validateAssist(input: AssistInput): string | null {
  const tool = ASSIST_TOOLS.find((t) => t.id === input.tool);
  if (!tool) return "不认识这个写作工具。";
  if (input.selection.length > MAX_SELECTION) return `这一段太长了，请分几次处理（单次最多 ${MAX_SELECTION} 字）。`;
  if (tool.needsSelection && !input.selection.trim()) return "先选中一段文字，或把光标放在要续写的位置。";
  if (input.tool === "continue" && !input.before.trim() && !input.selection.trim()) return "先选中一段文字，或把光标放在要续写的位置。";
  if (input.tool === "custom" && !input.instruction.trim()) return "先写一句你想做什么";
  return null;
}

const SYSTEM = [
  "你是蓝稿里的中文写作助手，帮作者处理他自己的小说稿子。",
  "只输出可以直接放进正文的文字：不要标题、不要解释、不要前言后语、不要用引号把结果包起来、不要 Markdown 标记（大纲工具除外）。",
  "保持作品已有的人物设定、世界观、人称和时态。中文标点用全角。",
].join("\n");

function bookBlock(ctx: AssistContext, focus: string): string {
  const { characters, lore } = mentioned(ctx, focus);
  const lines = [
    `书名：${ctx.title || "未定"}`,
    ctx.genre ? `类型：${ctx.genre}` : "",
    ctx.logline ? `一句话：${clipStart(ctx.logline, 200)}` : "",
    ctx.premise ? `故事核：${clipStart(ctx.premise, 800)}` : "",
    ctx.styleNotes ? `文风要求：${clipStart(ctx.styleNotes, 400)}` : "",
    ctx.touch && !ctx.touch.includes("还没有") ? `作者的笔触：${clipStart(ctx.touch, 600)}` : "",
    ctx.chapterTitle ? `当前章节：${ctx.chapterTitle}` : "",
    characters.length ? `相关人物：\n${characters.map((c) => `- ${c.name}${c.role ? `（${c.role}）` : ""}${c.bio ? `：${clipStart(c.bio, 160)}` : ""}`).join("\n")}` : "",
    lore.length ? `相关设定：\n${lore.map((l) => `- ${l.name}${l.summary ? `：${clipStart(l.summary, 120)}` : ""}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildAssistMessages(ctx: AssistContext, input: AssistInput): { messages: ChatMessage[]; temperature: number } {
  const before = clipEnd(input.before, 1800);
  const after = clipStart(input.after, 300);
  const selection = input.selection;
  const focus = `${before}${selection}${after}`;
  const book = bookBlock(ctx, focus);
  const extra = input.instruction.trim() ? `\n作者的额外要求：${clipStart(input.instruction.trim(), 300)}` : "";
  let task = "";
  let temperature = 0.8;
  switch (input.tool) {
    case "continue": {
      const length = Math.max(100, Math.min(2000, Math.round(input.length || 500)));
      const base = selection.trim() ? `${before}${selection}` : before;
      task = [`【前文】\n${clipEnd(base, 1800)}`, after ? `【后文（续写内容要能自然接上它）】\n${after}` : "", `请接着前文往下写约 ${length} 字。直接从前文最后一个字之后开始写，不要重复前文。${extra}`].filter(Boolean).join("\n\n");
      temperature = 0.9;
      break;
    }
    case "polish":
      task = `【上文】\n${before || "（无）"}\n\n【要润色的段落】\n${selection}\n\n请润色这段：修正病句和错别字，理顺节奏，让画面更清楚。保持原意、情节、人物说话方式和大致篇幅。只输出润色后的段落。${extra}`;
      temperature = 0.6;
      break;
    case "expand":
      task = `【上文】\n${before || "（无）"}\n\n【要扩写的段落】\n${selection}\n\n请把这段扩写到原来的两倍左右：补充动作、环境、感官、心理和必要的对话，不改变情节走向，不引入新的重要人物。只输出扩写后的段落。${extra}`;
      temperature = 0.85;
      break;
    case "shorten":
      task = `【要缩写的段落】\n${selection}\n\n请把这段压缩到原来的一半左右，保留关键情节、人物动作和重要对白，删去重复和冗余。只输出缩写后的段落。${extra}`;
      temperature = 0.5;
      break;
    case "rewrite": {
      const style = input.instruction.trim() || "换一种写法";
      task = `【上文】\n${before || "（无）"}\n\n【要改写的段落】\n${selection}\n\n请改写这段，要求：${clipStart(style, 300)}。情节和信息不变。只输出改写后的段落。`;
      temperature = 0.85;
      break;
    }
    case "outline": {
      const facts = ctx.chapterFacts.slice(-40).join("\n");
      const ask = input.instruction.trim() || "接下来五章";
      task = `【已有章节】\n${facts || "（还没有章节）"}\n\n${selection.trim() ? `【参考片段】\n${clipStart(selection, 2000)}\n\n` : ""}请为这部作品生成「${clipStart(ask, 200)}」的大纲。每章一行，格式：第X章 标题：一两句梗概（写清冲突和转折）。章节编号接着已有章节往下排。可以用 Markdown 列表。不要写正文。`;
      temperature = 0.8;
      break;
    }
    case "custom":
      task = `${selection.trim() ? `【选中的文字】\n${selection}\n\n` : `【前文】\n${before || "（无）"}\n\n`}请按作者的要求处理：${clipStart(input.instruction.trim(), 400)}\n只输出结果文字。`;
      temperature = 0.8;
      break;
  }
  return {
    messages: [
      { role: "system", content: `${SYSTEM}\n\n${book}` },
      { role: "user", content: task },
    ],
    temperature,
  };
}

/**
 * 解析 OpenAI 兼容的流式（SSE）返回。把收到的文本块喂进来，返回其中的正文增量；
 * 思考内容（reasoning_content）不输出。
 */
export function createSseParser(): { push: (chunk: string) => { text: string; done: boolean } } {
  let buffer = "";
  let finished = false;
  return {
    push(chunk: string) {
      if (finished) return { text: "", done: true };
      buffer += chunk;
      let text = "";
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          finished = true;
          break;
        }
        try {
          const parsed = JSON.parse(data) as { choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[] };
          const piece = parsed.choices?.[0]?.delta?.content;
          if (typeof piece === "string") text += piece;
        } catch {
          // 半截或非 JSON 的行：跳过
        }
      }
      return { text, done: finished };
    },
  };
}

/** 去掉模型偶尔加上的包裹引号或「以下是…：」前言。 */
export function tidyAssistOutput(text: string, tool: AssistTool): string {
  let out = text.replace(/^\s*(以下是|下面是|好的[，,]?)[^\n]{0,30}[:：]\s*\n?/, "");
  if (tool !== "outline") out = out.replace(/^```[a-z]*\n?|\n?```$/g, "");
  const trimmed = out.trim();
  if (/^[“"「].*[”"」]$/s.test(trimmed) && !/[“"「]/.test(trimmed.slice(1, -1))) return trimmed.slice(1, -1);
  return out;
}
