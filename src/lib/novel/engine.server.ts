import { findWhitelisted, MODEL_WHITELIST, NOT_LISTED, PROVIDER_FAMILIES } from "./model-whitelist";
import { CLIENT_CODE_TEXT, clientErrorFromThrown, upstreamFailureFromResponse } from "./client-error";
import { WEB_SEARCH_ENABLED } from "./plan.server";
import type { Sql } from "@/lib/db";
import { CONTEXT_LIMIT, PLUGINS, SKILLS, TRANSCRIPT_LIMIT } from "./catalog";
import {
  addMessage,
  addSource,
  agentUpdateBible,
  agentWriteChapter,
  listSources,
  readDetail,
  readSecretSettings,
  readTranscript,
  readVoice,
  replaceOutline,
  saveCharacter,
  saveCommentary,
  saveTranscript,
  saveVoice,
  seedFromLine,
  updateLedger,
  noteUsage,
  readUsage,
} from "./store.server";
import { chapterFact, driftNote, reviewSides } from "./format";
import { transcriptCap } from "./plan";
import { readPlan } from "./plan.server";
import type { Novel, NovelDetail, Settings, UsageDay, VoiceDocs } from "./types";

type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type ApiMessage = {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  reasoning_content?: string;
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "update_bible",
      description: "更新这部小说的一句话、故事核和文风。只在用户要定调或改设定时调用。",
      parameters: {
        type: "object",
        properties: {
          logline: { type: "string" },
          premise: { type: "string" },
          style_notes: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_outline",
      description: "用一份新大纲替换现有大纲。用户要求建大纲、重做结构时调用。父节点必须排在子节点前面。",
      parameters: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ref: { type: "string" },
                parent: { type: "string" },
                kind: { type: "string", enum: ["volume", "chapter", "beat"] },
                title: { type: "string" },
                summary: { type: "string" },
              },
              required: ["ref", "kind", "title"],
            },
          },
        },
        required: ["nodes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_chapter",
      description: "把一章正文写入稿库。同名章节会被覆盖。正文不要重复标题。so_far 是覆盖后的全书进度。fact 是一两句以后不能改的事实；这一章已有事实就不要传。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          summary: { type: "string" },
          so_far: { type: "string" },
          fact: { type: "string", description: "一两句以后不能改的事实。这一章若已有事实，留空。" },
        },
        required: ["title", "body", "so_far"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_character",
      description: "新增或按姓名覆盖一个人物。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          bio: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_voice",
      description: "在原有风格画像.md、笔触.md或偏好.md上增补，保留仍成立的句子。传入合并后的完整 markdown。",
      parameters: {
        type: "object",
        properties: {
          portrait: { type: "string" },
          touch: { type: "string" },
          preference: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_ledger",
      description: "覆盖这部小说手里的线。写完一章，或用户要求核对连续性时调用。全文替换，保留仍成立的句子。",
      parameters: {
        type: "object",
        properties: {
          ledger: { type: "string" },
        },
        required: ["ledger"],
      },
    },
  },
];

const WEB_TOOL = {
  type: "function",
  function: {
    name: "search_web",
    description: "查一件需要现实依据的事：年代、地名、器物、习俗。不要用来抄小说。",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};

const FIXED_TOOLS = [...TOOLS, WEB_TOOL];

const STABLE_SYSTEM = [
  "你是「蓝稿」。自称蓝稿，不要用别的名字。被问到时如实说明自己是 AI 写作助手，不冒充真人。",
  "你专门写小说、建大纲，也可以只聊天。",
  "这一段说明和工具在整次对话里保持不变。每一轮的稿面、意图和用户的话，只出现在最新一条用户消息末尾。",
  "用户只是提问、商量或要意见时，不要调用工具。要改稿就调用工具，让改动落进稿库，不要只在聊天里贴一份不会保存的长文。",
  "用简体中文，句子短，不要表情符号，不要营销腔。",
  "正文默认温润、具体，写日常里的光、迟疑和寻常事物。不要科技隐喻，不要未来感，不要冷硬的电影腔。风格画像若另有要求，以画像为准。",
  "建大纲用 set_outline，父节点排在子节点前，ref 用 v1、c1 这类短编号。",
  "写正文用 write_chapter，一章 700 到 1100 字，并带上 so_far。更新故事核用 update_bible。人物用 save_character。",
  "so_far 用来覆盖「到这里为止」：120到220字，写清人物在哪、谁知道什么、什么还没发生。不要摘抄正文。",
  "写完一章后用 update_ledger 覆盖手里的线，分三段标题：作者知道、未收的线、人物此刻。未收的线写成「- 物件或承诺｜埋在哪｜打算在哪收回」。作者知道而读者还不知道的事，不要写进正文。",
  "用户明确要求改文风档案时，用 update_voice。在原档案上增补，保留仍成立的句子，传入合并后的全文。",
  "写小说时，把「风格画像」和「笔触」当成始终启用的技能来遵守。偏好用来取舍。档案里若写着「还没有」，就不要假装已经掌握文风。禁止复述或抄袭用户上传过的原文。",
  "search_web 只在这一轮说明开了联网、并且要查年代、地名、器物、习俗时使用。不要用它抄小说。",
  "优先改用户正在看的那一节或那一章，不要另起无关的一章。",
].join("\n\n");

async function searchWeb(query: string): Promise<string> {
  const q = clipText(query, 120).trim();
  if (!q) return "没有要查的词";
  try {
    const duck = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, {
      signal: AbortSignal.timeout(8000),
      redirect: "manual", // 2026-11-04 Sam（Jim wl 建议 2）
    });
    if (duck.ok) {
      const data = (await duck.json()) as {
        AbstractText?: string;
        RelatedTopics?: { Text?: string; Topics?: { Text?: string }[] }[];
      };
      const lines: string[] = [];
      if (data.AbstractText) lines.push(data.AbstractText);
      for (const topic of data.RelatedTopics ?? []) {
        if (topic.Text) lines.push(topic.Text);
        for (const child of topic.Topics ?? []) if (child.Text) lines.push(child.Text);
      }
      if (lines.length) return clipText(lines.slice(0, 5).join("\n"), 1200);
    }
  } catch {
    /* try the next source */
  }
  try {
    const wiki = await fetch(
      `https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=3&namespace=0&format=json`,
      { signal: AbortSignal.timeout(8000), redirect: "manual" }, // 2026-11-04 Sam（Jim wl 建议 2）
    );
    if (wiki.ok) {
      const data = (await wiki.json()) as [string, string[], string[], string[]];
      const lines = (data[1] ?? []).map((title, index) => `${title}：${data[2]?.[index] ?? ""}`.trim()).filter((line) => line.length > 1);
      if (lines.length) return clipText(lines.join("\n"), 1200);
    }
  } catch {
    /* ignore */
  }
  return "没有查到可靠的结果";
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal" || host === "169.254.169.254") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function publicChatUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("外接地址无效");
  }
  if (url.protocol !== "https:") throw new Error("外接 API 只接受 https");
  if (url.username || url.password) throw new Error("地址里不要写账号");
  if (isPrivateHost(url.hostname)) throw new Error("不能连接内网地址");
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/chat/completions")) {
    url.pathname = `${path}/chat/completions`.replace(/\/{2,}/g, "/");
  }
  return url.toString();
}

function clipText(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function outlineLines(detail: NovelDetail): string {
  const byParent = new Map<string | null, typeof detail.outline>();
  for (const node of detail.outline) {
    const key = node.parentId;
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }
  const lines: string[] = [];
  const walk = (parent: string | null, depth: number) => {
    const list = (byParent.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of list) {
      if (lines.length >= 160) return;
      lines.push(`${"  ".repeat(depth)}- [${node.kind}] ${node.title}：${node.summary.slice(0, 320)}`);
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join("\n") || "（空）";
}

function voiceReady(text: string): boolean {
  return Boolean(text.trim()) && !text.includes("还没有");
}

function bookFacts(chapters: { title: string; fact?: string; body: string }[]): string {
  const lines = chapters
    .map((item) => {
      const fact = chapterFact(item);
      return fact ? `《${item.title}》${fact}` : "";
    })
    .filter(Boolean);
  if (lines.length <= 60) return lines.join("\n");
  return [...lines.slice(0, 20), "……", ...lines.slice(-40)].join("\n");
}

function recentExcerpts(chapters: { title: string; body: string }[], count: number, lastTake: number, olderTake: number): string {
  const recent = chapters.filter((chapter) => chapter.body.trim()).slice(-count);
  return recent
    .map((chapter, index) => {
      const take = index === recent.length - 1 ? lastTake : olderTake;
      const body = chapter.body.length > take ? `${chapter.body.slice(0, take)}……` : chapter.body;
      return `《${chapter.title}》\n${body}`;
    })
    .join("\n\n");
}

function turnPage(detail: NovelDetail, skills: string[], plugins: string[], view: string, voice: VoiceDocs, intent: "talk" | "write", settings: Settings, prompt: string): string {
  const skillText = SKILLS.filter((skill) => skills.includes(skill.id))
    .map((skill) => `- ${skill.name}：${skill.prompt}`)
    .join("\n");
  const pluginText = PLUGINS.filter((plugin) => plugins.includes(plugin.id) && plugin.prompt)
    .map((plugin) => `- ${plugin.name}：${plugin.prompt}`)
    .join("\n");
  const people = detail.characters
    .slice(0, 30)
    .map((person) => `- ${person.name}（${person.role || "未注身份"}）：${person.bio.slice(0, 400)}`)
    .join("\n");
  const excerpt = recentExcerpts(detail.chapters, 4, 6000, 2000);
  const facts = bookFacts(detail.chapters);
  const sides = reviewSides(detail.novel.commentary);
  const drift = driftNote(detail.characters, detail.chapters, detail.novel.ledger);
  return [
    "【这一轮稿面。只看这一段，不要改写前面的对话。】",
    intent === "talk" ? "这一轮只聊聊，不要调用改稿工具，不要改稿。" : "这一轮落到稿上。改动必须调用工具写进稿库。",
    settings.wild ? "这一轮天马行空。可以意外、出格、跳跃，不要收着写，也不要解释。" : "",
    settings.web ? "这一轮开了联网。遇到年代、地名、器物、习俗，先用 search_web。" : "这一轮没有开联网，不要调用 search_web。",
    settings.thinking === "low" ? "思考从短。先写，少绕。" : settings.thinking === "high" ? "想清楚再落笔。不要把推理过程铺给用户。" : "",
    skillText ? `已启用技能：\n${skillText}` : "没有启用技能。",
    pluginText ? `已启用插件：\n${pluginText}` : "",
    `风格画像.md${voiceReady(voice.portrait) ? "（写作时启用）" : "（尚未建立）"}：\n${voice.portrait.slice(0, 4000)}`,
    `笔触.md${voiceReady(voice.touch) ? "（写作时启用）" : "（尚未建立）"}：\n${voice.touch.slice(0, 4000)}`,
    `偏好.md：\n${voice.preference.slice(0, 4000)}`,
    `用户正在看：${view || "书桌"}`,
    `书名：${detail.novel.title}`,
    `类型：${detail.novel.genre || "未定"}`,
    `一句话：${detail.novel.logline || "未定"}`,
    `故事核：${detail.novel.premise || "未定"}`,
    `文风：${detail.novel.styleNotes || "未定"}`,
    `到这里为止：${detail.novel.soFar || "（还没有进度）"}`,
    `手里的线：\n${detail.novel.ledger || "（还没有）"}`,
    facts ? `各章不能改的事实：\n${facts}` : "",
    drift ? `核对：${drift}` : "",
    sides.want || sides.loose
      ? `上一回评书。写下去时接住想听下去的，避开松了的那一处。不要复述评书。\n想听下去：${sides.want || "（无）"}\n松了：${sides.loose || "（无）"}`
      : "",
    "若调用 write_chapter，带上 fact：一两句以后不能改的事实，谁在哪、什么已经发生。不要摘抄整段。这一章已有事实就留空。",
    `大纲：\n${outlineLines(detail)}`,
    `人物：\n${people || "（空）"}`,
    excerpt ? `近处的正文：\n${excerpt}` : "",
    `【你说】\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function postChat(input: {
  url: string;
  apiKey: string;
  model: string;
  messages: ApiMessage[];
  tools: boolean;
  wild?: boolean;
  thinking?: "low" | "mid" | "high";
  /** 2026-11-04 Sam（Mia §5.6）：测试连接用 15 秒，正常写作仍是 120 秒。 */
  timeoutMs?: number;
}): Promise<
  | { ok: true; message: ApiMessage; finish: string; tokens: number; exact: boolean; cache: { hit: number; miss: number } }
  | { ok: false; error: string; status: number; code: string }
> {
  const deep = deepseekHost(input.url);
  const thinkingOn = input.thinking !== "low";
  const payload = (withThinking: boolean) => ({
    model: input.model,
    temperature: input.wild ? 1 : 0.8,
    max_tokens: thinkingOn ? 8192 : 4096,
    messages: input.messages,
    ...(input.tools ? { tools: FIXED_TOOLS, tool_choice: "auto" as const } : {}),
    ...(deep && withThinking ? { thinking: { type: thinkingOn ? "enabled" : "disabled" } } : {}),
  });
  const send = async (body: Record<string, unknown>) => {
    let res: Response;
    try {
      res = await fetch(input.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(input.timeoutMs ?? 120000),
        redirect: "manual", // 2026-11-04 Sam：不跟随跳转，防止被引到名单外的地址
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return { ok: false as const, error: "模型没有连上", status: 0, code: timeout ? "TIMEOUT" : "NETWORK" };
    }
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400) || !res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return upstreamFailureFromResponse(res);
    }
    const parsed = (await res.json()) as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
      choices?: { finish_reason?: string; message?: ApiMessage & { tool_calls?: ToolCall[] } }[];
    };
    const choice = parsed.choices?.[0];
    if (!choice?.message) return { ok: false as const, error: "模型没有给出内容", status: res.status, code: "EMPTY_REPLY" };
    const usage = parsed.usage;
    const reported = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
    const hit = usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const miss = usage?.prompt_cache_miss_tokens ?? (usage?.prompt_tokens ? Math.max(0, usage.prompt_tokens - hit) : 0);
    return {
      ok: true as const,
      message: choice.message,
      finish: choice.finish_reason ?? "",
      tokens: reported > 0 ? reported : estimateTokens(input.messages) + estimateTokens(choice.message.content),
      exact: reported > 0,
      cache: { hit, miss },
    };
  };
  let result = await send(payload(true));
  if (!result.ok && deep && (result.status === 400 || result.status === 422)) {
    result = await send(payload(false));
  }
  return result;
}

function deepseekHost(url: string): boolean {
  // 2026-11-04 Sam（Mia §5.6）：改读白名单里的 thinkingParam，不再按域名猜。旧写法保留在下方注释。
  try {
    const u = new URL(url);
    const entry = MODEL_WHITELIST.find((e) => `${e.base}/chat/completions` === `${u.origin}${u.pathname}`);
    return entry ? (PROVIDER_FAMILIES.find((f) => f.id === entry.family)?.thinkingParam ?? false) : false;
  } catch {
    return false;
  }
  /* 旧写法：
  try {
    // 2026-11-04 Sam：原来是 hostname.endsWith("deepseek.com")，evildeepseek.com 也能匹配；改为逐字相等。
    return new URL(url).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
  */
}

function estimateTokens(value: unknown): number {
  const size = JSON.stringify(value ?? "").length;
  return Math.max(1, Math.ceil(size / 1.7));
}

function readToolCalls(message: ApiMessage): ToolCall[] {
  const raw = message.tool_calls;
  if (!Array.isArray(raw)) return [];
  const calls: ToolCall[] = [];
  for (const item of raw.slice(0, 6)) {
    const record = asRecord(item);
    const fn = asRecord(record.function);
    const name = clipText(fn.name ?? record.name, 60);
    if (!name) continue;
    let args = fn.arguments ?? record.arguments ?? "{}";
    if (typeof args !== "string") args = JSON.stringify(args);
    const id = clipText(record.id, 80) || `call_${calls.length}`;
    calls.push({ id, name, arguments: String(args).slice(0, 20000) });
  }
  return calls;
}

async function runTool(sql: Sql, userId: string, novelId: string, call: ToolCall): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments || "{}");
  } catch {
    return "参数不是合法的 JSON";
  }
  const data = asRecord(parsed);
  if (call.name === "update_bible") {
    return agentUpdateBible(sql, userId, novelId, {
      logline: data.logline === undefined ? undefined : String(data.logline),
      premise: data.premise === undefined ? undefined : String(data.premise),
      styleNotes: data.style_notes === undefined ? undefined : String(data.style_notes),
    });
  }
  if (call.name === "set_outline") {
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const result = await replaceOutline(
      sql,
      userId,
      novelId,
      nodes.map((item) => {
        const node = asRecord(item);
        return {
          ref: String(node.ref ?? ""),
          parent: String(node.parent ?? ""),
          kind: String(node.kind ?? "chapter"),
          title: String(node.title ?? ""),
          summary: String(node.summary ?? ""),
        };
      }),
    );
    return "error" in result ? result.error : `已写入 ${result.count} 个大纲节点`;
  }
  if (call.name === "write_chapter") {
    return agentWriteChapter(sql, userId, novelId, {
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      summary: data.summary === undefined ? undefined : String(data.summary),
      soFar: data.so_far === undefined ? undefined : String(data.so_far),
      fact: data.fact === undefined ? undefined : String(data.fact),
    });
  }
  if (call.name === "save_character") {
    try {
      const saved = await saveCharacter(sql, userId, {
        novelId,
        name: String(data.name ?? ""),
        role: String(data.role ?? ""),
        bio: String(data.bio ?? ""),
      });
      return saved ? `已保存人物 ${saved.name}` : "没有保存人物";
    } catch (error) {
      const mapped = clientErrorFromThrown(error).error;
      return mapped === "没有完成" ? "人物没有保存" : mapped;
    }
  }
  if (call.name === "update_ledger") {
    return updateLedger(sql, userId, novelId, String(data.ledger ?? ""));
  }
  if (call.name === "update_voice") {
    const patch: Partial<VoiceDocs> = {};
    if (typeof data.portrait === "string" && data.portrait.trim()) patch.portrait = data.portrait;
    if (typeof data.touch === "string" && data.touch.trim()) patch.touch = data.touch;
    if (typeof data.preference === "string" && data.preference.trim()) patch.preference = data.preference;
    if (!Object.keys(patch).length) return "没有要写入的档案";
    await saveVoice(sql, userId, patch);
    return "已更新文风档案";
  }
  if (call.name === "search_web") return searchWeb(String(data.query ?? ""));
  return "没有这个工具";
}

const TOOL_LABEL: Record<string, string> = {
  update_bible: "更新故事核",
  set_outline: "写入大纲",
  write_chapter: "写入章节",
  save_character: "写入人物",
  update_voice: "更新文风档案",
  update_ledger: "记下手里的线",
  search_web: "联网",
};

type ModelDoor = { ok: true; url: string; apiKey: string; model: string } | { ok: false; error: string };

function openModel(settings: Settings & { apiKey: string }): ModelDoor {
  // 2026-11-01：不预设任何模型或地址，缺哪项就明确提示用户自己填写。
  const model = settings.model.trim();
  const base = settings.baseUrl.trim();
  if (!base || !model || !settings.apiKey) return { ok: false, error: "还没接上模型：请在「连接」里填写接口地址、模型名和密钥。" };
  // 2026-11-04 Sam：只放行白名单里的「地址 + 模型」，请求一律发到名单里的规范地址。旧设置保留但在这里被拦下。
  // 旧写法（publicChatUrl 黑名单校验）：return { ok: true, url: publicChatUrl(base), apiKey: settings.apiKey, model };
  const entry = findWhitelisted(base, model);
  if (!entry) return { ok: false, error: NOT_LISTED };
  return { ok: true, url: `${entry.base}/chat/completions`, apiKey: settings.apiKey, model };
}

function sectionOf(markdown: string, title: string, others: string[]): string {
  const startRe = new RegExp(`(?:^|\\n)#{1,3}\\s*${title}\\s*\\n`, "i");
  const start = startRe.exec(markdown);
  if (!start) return "";
  const from = start.index + start[0].length;
  let end = markdown.length;
  for (const name of others) {
    const next = new RegExp(`\\n#{1,3}\\s*${name}\\s*(?:\\n|$)`, "i").exec(markdown.slice(from));
    if (next) end = Math.min(end, from + next.index);
  }
  return markdown.slice(from, end).trim();
}

function meaningfulLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^#{1,3}\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 6 && !line.includes("还没有") && line !== "此前仍成立：");
}

function keepOldLines(previous: string, incoming: string): string {
  if (!voiceReady(previous)) return incoming.trim();
  const kept = meaningfulLines(previous)
    .filter((line) => !incoming.includes(line))
    .slice(0, 10);
  if (!kept.length) return incoming.trim();
  return `${incoming.trim()}\n\n此前仍成立：\n${kept.map((line) => `- ${line}`).join("\n")}\n`;
}

function loadTranscript(raw: string): ApiMessage[] {
  if (!raw.trim()) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is ApiMessage => {
      const record = asRecord(item);
      return typeof record.role === "string";
    });
  } catch {
    return [];
  }
}

function trimTranscript(list: ApiMessage[], limit = TRANSCRIPT_LIMIT): ApiMessage[] {
  let next = list;
  while (JSON.stringify(next).length > limit && next.length > 6) {
    const start = next.findIndex((item, index) => index > 0 && item.role === "user");
    if (start <= 0) break;
    next = next.slice(start);
  }
  return next;
}

export async function runNovelAgent(
  sql: Sql,
  userId: string,
  input: { novelId: string; prompt: string; view: string; intent?: string },
): Promise<
  | {
      ok: true;
      detail: NovelDetail;
      spent: number;
      steps: { name: string; label: string; detail: string }[];
      cache: { hit: number; miss: number };
      usage: { tokens: number; exact: boolean; contextUsed: number; contextLimit: number; today: UsageDay };
    }
  | { ok: false; error: string }
> {
  const prompt = clipText(input.prompt, 12000).trim();
  if (!prompt) return { ok: false, error: "先写一句你想做什么" };
  const detail = await readDetail(sql, userId, input.novelId);
  if (!detail) return { ok: false, error: "找不到这部作品" };
  const settings = await readSecretSettings(sql, userId);
  const seat = await readPlan(sql, userId);
  void seat;
  // if (seat.id !== "night") settings.web = false; // 2026-11-02 改为单独开关
  if (!WEB_SEARCH_ENABLED) settings.web = false;
  const voice = await readVoice(sql, userId);
  const intent = input.intent === "write" ? "write" : "talk";
  const door = openModel(settings);
  if (!door.ok) return door;

  await addMessage(sql, userId, input.novelId, "user", prompt, null);

  const prior = loadTranscript(await readTranscript(sql, userId, input.novelId));
  const messages: ApiMessage[] = [
    { role: "system", content: STABLE_SYSTEM },
    ...prior,
    {
      role: "user",
      content: turnPage(detail, settings.skills, settings.plugins, clipText(input.view, 2000), voice, intent, settings, prompt),
    },
  ];

  const steps: { name: string; label: string; detail: string }[] = [];
  let reply = "";
  let hardError = "";
  let tokens = 0;
  let exact = true;
  let cacheHit = 0;
  let cacheMiss = 0;

  for (let round = 0; round < 3; round += 1) {
    const result = await postChat({
      url: door.url,
      apiKey: door.apiKey,
      model: door.model,
      messages,
      tools: true,
      wild: settings.wild,
      thinking: settings.thinking,
    });
    if (!result.ok) {
      hardError = result.error;
      break;
    }
    tokens += result.tokens;
    cacheHit += result.cache.hit;
    cacheMiss += result.cache.miss;
    if (!result.exact) exact = false;
    const calls = readToolCalls(result.message);
    if (calls.length) {
      const assistant: ApiMessage = {
        role: "assistant",
        content: result.message.content ?? null,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      };
      if (result.message.reasoning_content) assistant.reasoning_content = result.message.reasoning_content;
      messages.push(assistant);
      for (const call of calls) {
        const summary =
          intent === "talk" && call.name !== "search_web"
            ? "这一轮只聊聊，没有改稿。"
            : call.name === "search_web" && !settings.web
              ? "这一轮没有开联网。"
              : await runTool(sql, userId, input.novelId, call);
        if (summary !== "这一轮只聊聊，没有改稿。" && summary !== "这一轮没有开联网。") {
          steps.push({
            name: call.name,
            label: TOOL_LABEL[call.name] ?? call.name,
            detail: summary,
          });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: summary });
      }
      continue;
    }
    const closing: ApiMessage = { role: "assistant", content: clipText(result.message.content, 16000).trim() || null };
    if (result.message.reasoning_content) closing.reasoning_content = result.message.reasoning_content;
    messages.push(closing);
    reply = closing.content?.trim() ?? "";
    break;
  }

  if (!reply && steps.length === 0) {
    return { ok: false, error: hardError || "模型没有完成回复" };
  }
  if (!reply) reply = hardError ? `稿面已更新，但后续回复中断。${hardError}` : "稿面已更新。";

  await saveTranscript(sql, userId, input.novelId, JSON.stringify(trimTranscript(messages.slice(1), transcriptCap(seat.id))));


  for (const step of steps) {
    await addMessage(sql, userId, input.novelId, "tool", step.detail, step.name);
  }
  await addMessage(sql, userId, input.novelId, "assistant", reply, null);
  const fresh = await readDetail(sql, userId, input.novelId);
  if (!fresh) return { ok: false, error: "稿面刷新失败" };
  const contextUsed = estimateTokens(messages);
  const today = await noteUsage(sql, userId, { tokens, contextUsed });
  return {
    ok: true,
    detail: fresh,
    spent: 0,
    steps,
    cache: { hit: cacheHit, miss: cacheMiss },
    usage: { tokens, exact, contextUsed, contextLimit: CONTEXT_LIMIT, today },
  };
}

export async function learnFromText(
  sql: Sql,
  userId: string,
  input: { kind: "work" | "favorite"; title: string; body: string; novelId?: string; via?: string },
): Promise<
  | {
      ok: true;
      voice: VoiceDocs;
      sources: Awaited<ReturnType<typeof listSources>>;
      spent: number;
      note: string;
      detail: NovelDetail | null;
    }
  | { ok: false; error: string }
> {
  const kind = input.kind === "favorite" ? "favorite" : "work";
  if ((await readPlan(sql, userId)).id !== "night") return { ok: false, error: "把你写过的交给蓝稿，是长夜里的事。" };
  const title = clipText(input.title, 80).trim() || "未命名";
  const body = clipText(input.body, 12000).trim();
  if (body.length < 40) return { ok: false, error: "文字太短，读不出文风" };
  const settings = await readSecretSettings(sql, userId);
  const voice = await readVoice(sql, userId);
  const door = openModel(settings);
  if (!door.ok) return door;

  const ask =
    kind === "work"
      ? [
          "你是蓝稿。下面是用户自己作品的一小节选，不是全文。原文不会保存，不要复述原句。",
          "先单独写一行，点破一个具体习惯，十二到二十个字，不要形容词堆砌。例如：习惯：句子很短，几乎不写天气。",
          "然后在现有三份档案上增补。保留仍然成立的句子，只有被新文字明确推翻时才删。",
          "不要写「还没有」。不要表情符号。",
          "风格画像：叙事距离、冷热、怎么进入场景、不肯用的词。",
          "笔触：句子长短、动词、对白、留白、一章如何收住。要具体到能模仿手法。",
          "偏好：这名作者反复做的选择。",
          "第一行必须是「习惯：」，接着输出三段，标题必须是：",
          "## 风格画像",
          "## 笔触",
          "## 偏好",
        ].join("\n")
      : [
          "你是蓝稿。下面是用户喜欢的小说的一小节选，不是全文。原文不会保存。只蒸馏手法，不抄原句，不复述情节。",
          "只增补偏好。保留偏好里仍然成立的句子。不要改风格画像和笔触。",
          "写清节奏、距离、对白、意象，以及绝对不要模仿的地方。",
          "只输出合并后的完整一段：",
          "## 偏好",
        ].join("\n");

  const result = await postChat({
    url: door.url,
    apiKey: door.apiKey,
    model: door.model,
    tools: false,
    messages: [
      { role: "system", content: ask },
      {
        role: "user",
        content: `现有风格画像：\n${voice.portrait.slice(0, 1200)}\n\n现有笔触：\n${voice.touch.slice(0, 1200)}\n\n现有偏好：\n${voice.preference.slice(0, 1200)}\n\n篇名：${title}\n\n${body}`,
      },
    ],
  });
  if (!result.ok) return { ok: false, error: result.error };
  const markdown = clipText(result.message.content, 8000).trim();
  if (!markdown) return { ok: false, error: "模型没有写出档案" };

  const portrait = sectionOf(markdown, "风格画像", ["笔触", "偏好"]);
  const touch = sectionOf(markdown, "笔触", ["风格画像", "偏好"]);
  const preference = sectionOf(markdown, "偏好", ["风格画像", "笔触"]);
  const next = await saveVoice(sql, userId, {
    portrait: kind === "work" && portrait ? keepOldLines(voice.portrait, `# 风格画像\n\n${portrait}\n`) : undefined,
    touch: kind === "work" && touch ? keepOldLines(voice.touch, `# 笔触\n\n${touch}\n`) : undefined,
    preference: preference
      ? keepOldLines(voice.preference, `# 偏好\n\n${preference}\n`)
      : kind === "favorite"
        ? keepOldLines(voice.preference, `# 偏好\n\n${markdown}\n`)
        : undefined,
  });
  await addSource(sql, userId, kind, title);

  const spent = 0;

  const habit = oneHabit(markdown, next.touch);
  const note = kind === "work" ? habit : "只记住它怎么收句子，不抄情节。";

  let detail: NovelDetail | null = null;
  if (input.novelId) {
    const owned = await readDetail(sql, userId, input.novelId);
    if (owned) {
      await addMessage(
        sql,
        userId,
        input.novelId,
        "user",
        input.via === "paste"
          ? kind === "work"
            ? `贴了一节我的作品《${title}》`
            : `贴了一节我喜欢的小说《${title}》`
          : kind === "work"
            ? `上传了我的作品《${title}》`
            : `上传了我喜欢的小说《${title}》`,
        null,
      );
      await addMessage(sql, userId, input.novelId, "assistant", note, null);
      detail = await readDetail(sql, userId, input.novelId);
    }
  }

  return { ok: true, voice: next, sources: await listSources(sql, userId), spent, note, detail };
}

function oneHabit(markdown: string, touch: string): string {
  const raw = /习惯[:：]\s*([^\n]+)/.exec(markdown)?.[1]?.trim() ?? "";
  const line = raw.replace(/^[「"'']|[」"'']$/g, "").replace(/。+$/g, "").trim();
  if (line && line.length <= 32 && !line.includes("还没有")) return `${line}。`;
  const short = meaningfulLines(touch).find((item) => item.length <= 24 && !item.includes("还没有"));
  if (short) return `${short.replace(/。+$/g, "")}。`;
  return "句子有你自己的停顿。";
}

function threeSentences(text: string, avoid: string): string {
  let next = text.replace(/\s+/g, "").trim();
  next = next.replace(/^(开场|蓝稿)[:：]?/, "");
  if (avoid && next.startsWith(avoid.replace(/\s+/g, ""))) next = next.slice(avoid.replace(/\s+/g, "").length);
  const parts = next.split(/(?<=[。！？])/).map((item) => item.trim()).filter(Boolean);
  const joined = parts.slice(0, 3).join("");
  return joined.slice(0, 90);
}

export async function reviewBook(
  sql: Sql,
  userId: string,
  novelId: string,
): Promise<{ ok: true; detail: NovelDetail; cache: { hit: number; miss: number } } | { ok: false; error: string }> {
  const detail = await readDetail(sql, userId, novelId);
  if (!detail) return { ok: false, error: "找不到这部作品" };
  if (!detail.chapters.some((chapter) => chapter.body.trim()) && !detail.novel.premise.trim()) {
    return { ok: false, error: "还没有可以评的正文" };
  }
  if ((await readPlan(sql, userId)).id === "free" && detail.novel.commentary.trim()) {
    return { ok: false, error: "这一回听过了。下一回，大约一杯咖啡。" };
  }
  const settings = await readSecretSettings(sql, userId);
  const voice = await readVoice(sql, userId);
  const door = openModel(settings);
  if (!door.ok) return door;
  const excerpts = recentExcerpts(detail.chapters, 8, 2500, 1200);
  const facts = bookFacts(detail.chapters);
  const people = detail.characters
    .slice(0, 20)
    .map((person) => `${person.name}（${person.role || "未注身份"}）`)
    .join("、");
  const result = await postChat({
    url: door.url,
    apiKey: door.apiKey,
    model: door.model,
    tools: false,
    thinking: "low",
    messages: [
      {
        role: "system",
        content: [
          "你是蓝稿。这一次是评书，不是封面，不是分数，不是营销。",
          "用简体中文，句子短，温润、具体。",
          "只写四段，标题必须是：",
          "这一回",
          "想听下去",
          "松了",
          "线还在不在",
          "每一段两三句。指出具体的物件、人名或句子，不要空话。按用户的笔触和偏好来评，不要夸档案里没有的腔调。档案若写着还没有，就不要假装已经掌握。不要建议使用功能。不要自称模型。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `书名：${detail.novel.title}`,
          `一句话：${detail.novel.logline || "未定"}`,
          `故事核：${detail.novel.premise || "未定"}`,
          `到这里为止：${detail.novel.soFar || "（还没有）"}`,
          `手里的线：\n${detail.novel.ledger || "（还没有）"}`,
          facts ? `各章不能改的事实：\n${facts}` : "",
          `笔触：\n${voice.touch.slice(0, 2000)}`,
          `偏好：\n${voice.preference.slice(0, 2000)}`,
          `人物：${people || "（空）"}`,
          `大纲：\n${outlineLines(detail)}`,
          excerpts ? `最近的正文：\n${excerpts}` : "还没有正文。",
        ].join("\n\n"),
      },
    ],
  });
  if (!result.ok) return { ok: false, error: result.error };
  const text = clipText(result.message.content, 4000).trim();
  if (!text) return { ok: false, error: "这一回没有评成" };
  await saveCommentary(sql, userId, novelId, text);
  const fresh = await readDetail(sql, userId, novelId);
  if (!fresh) return { ok: false, error: "评书没有留下" };
  await noteUsage(sql, userId, { tokens: result.tokens, contextUsed: estimateTokens(text) });
  return { ok: true, detail: fresh, cache: result.cache };
}

function twoLines(text: string, avoid: string): string {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line && !line.startsWith("蓝稿") && !avoid.includes(line));
  return lines.slice(0, 2).join("\n").slice(0, 80);
}

export async function continueLines(
  sql: Sql,
  userId: string,
  input: { kind: "poem" | "note"; body: string },
): Promise<{ ok: true; text: string; today: UsageDay | null } | { ok: false; error: string }> {
  const body = input.body.trim();
  if (body.length < 2) return { ok: false, error: "先写一行。" };
  const settings = await readSecretSettings(sql, userId);
  const door = openModel(settings);
  if (!door.ok) return door;
  const poem = input.kind === "poem";
  const result = await postChat({
    url: door.url,
    apiKey: door.apiKey,
    model: door.model,
    tools: false,
    thinking: "low",
    messages: [
      {
        role: "system",
        content: poem
          ? "你是蓝稿。用户在写诗。只接两行，接在已有的句子后面。温润、具体，像门、灯、雨、手这样的日常。不要玻璃、金属、霓虹。不要标题，不要解释，不要重复已写下的句子。不要自称。"
          : "你是蓝稿。用户在写一则手记。只接两句，温润、具体，像门、灯、雨、手这样的日常。不要标题，不要解释，不要重复已写下的句子。不要自称。",
      },
      { role: "user", content: body.slice(0, 4000) },
    ],
  });
  if (!result.ok) return { ok: false, error: result.error };
  const text = poem ? twoLines(result.message.content ?? "", body) : threeSentences(result.message.content ?? "", body);
  if (!text) return { ok: false, error: "这一行没有接上" };
  const today = await noteUsage(sql, userId, { tokens: result.tokens, aiChars: text.length });
  return { ok: true, text, today };
}

export async function beginFromLine(sql: Sql, userId: string, sentence: string): Promise<{ novel: Novel; detail: NovelDetail; today: UsageDay | null }> {
  const settings = await readSecretSettings(sql, userId);
  const door = openModel(settings);
  // 2026-11-04 Sam（Mia §5）：已经填了连接却被名单拦下时明确报错，不再悄悄跳过；完全没填连接时照旧只建草稿。
  if (!door.ok && door.error === NOT_LISTED) throw new Error(NOT_LISTED);
  const novel = await seedFromLine(sql, userId, sentence);
  const line = novel.logline.trim();
  let extra = "";
  if (door.ok) {
    const result = await postChat({
      url: door.url,
      apiKey: door.apiKey,
      model: door.model,
      tools: false,
      messages: [
        {
          role: "system",
          content: "你是蓝稿。用户只给了一句话。只接两到三句，写在这句话后面。温润、具体，像门、灯、雨、手这样的日常。不要玻璃、金属、霓虹，不要硬汉腔，不要未来感。不要重复这句话。不要标题，不要解释，不要自称。",
        },
        { role: "user", content: line },
      ],
    });
    if (result.ok) extra = threeSentences(result.message.content ?? "", line);
  }
  if (extra) {
    await agentWriteChapter(sql, userId, novel.id, {
      title: "开场",
      body: `${line}\n\n${extra}`,
      summary: clipText(line, 80),
      soFar: `刚起笔。${clipText(line, 80)} ${clipText(extra, 80)}`,
      aiChars: extra.length,
    });
    await addMessage(sql, userId, novel.id, "user", line, null);
    await addMessage(sql, userId, novel.id, "assistant", extra, null);
  }
  const detail = await readDetail(sql, userId, novel.id);
  if (!detail) throw new Error("草稿没有留下");
  const usage = await readUsage(sql, userId);
  return { novel: detail.novel, detail, today: usage[0] ?? null };
}

const TEST_TEXT: Record<string, string> = CLIENT_CODE_TEXT;

export async function testCustomConnection(sql: Sql, userId: string): Promise<{ ok: true; text: string } | { ok: false; error: string; code?: string }> {
  const settings = await readSecretSettings(sql, userId);
  // 原文案「先保存地址、模型名和密钥」已作废（Mia §5.1-2）。
  if (!settings.apiKey || !settings.model) return { ok: false, error: "请先选择服务商和模型、填写密钥并保存。", code: "NOT_CONFIGURED" };
  // 2026-11-04 Sam（Mia §5）：测试连接也走 openModel，和正式调用同一套白名单校验，不能绕开。
  const door = openModel(settings);
  if (!door.ok) return { ok: false, error: door.error, code: door.error === NOT_LISTED ? "NOT_LISTED" : "NOT_CONFIGURED" };
  const result = await postChat({
    url: door.url,
    apiKey: door.apiKey,
    model: door.model,
    tools: false,
    timeoutMs: 15000,
    messages: [
      { role: "system", content: "Reply with exactly OK." },
      { role: "user", content: "ping" },
    ],
  });
  // 上游原文只放在 detail（界面默认不展示）。
  // 2026-11-08 Sam（Jim 建议）：接口不再带回上游原文 detail，避免网络面板泄露。
if (!result.ok) return { ok: false, error: TEST_TEXT[result.code] ?? TEST_TEXT.UPSTREAM_ERROR, code: result.code };
  return { ok: true, text: clipText(result.message.content, 80).trim() || "已连通" };
}
