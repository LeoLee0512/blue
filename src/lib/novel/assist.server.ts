/**
 * AI 写作工具的流式调用。沿用「模型连接」的设置和白名单：请求只发往名单里的
 * 规范地址，密钥只在服务端解密使用，不回给前端。
 */
import type { Sql } from "@/lib/db";
import { buildAssistMessages, createSseParser, validateAssist, type AssistInput, type AssistTool } from "@/lib/write/assist-prompts";
import { countWords } from "@/lib/write/wordcount";
import { UPSTREAM_CALL_TEXT, upstreamFailureFromResponse } from "./client-error";
import { deepseekHost, openModel } from "./engine.server";
import { chapterFact } from "./format";
import { noteUsage, readDetail, readSecretSettings, readVoice } from "./store.server";
import { NOT_LISTED } from "./model-whitelist";

export type AssistRequest = AssistInput & { novelId: string; chapterId: string };

const TOOLS: AssistTool[] = ["continue", "polish", "expand", "shorten", "rewrite", "outline", "custom"];

/** 把前端传来的 JSON 收成合法输入；不合法时抛出。 */
export function parseAssistRequest(raw: unknown): AssistRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
  const o = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const tool = TOOLS.includes(o.tool as AssistTool) ? (o.tool as AssistTool) : null;
  if (!tool || typeof o.novelId !== "string") throw new Error("参数无效");
  return {
    tool,
    novelId: s(o.novelId, 80),
    chapterId: s(o.chapterId, 80),
    // 选区按原长度传入，超长由 validateAssist 明确拒绝，而不是悄悄截断。
    selection: typeof o.selection === "string" ? o.selection.slice(0, 20000) : "",
    before: s(o.before, 4000),
    after: s(o.after, 1000),
    instruction: s(o.instruction, 600),
    length: Number(o.length) || 500,
  };
}

export type AssistStart = { ok: true; stream: ReadableStream<Uint8Array> } | { ok: false; error: string; status: number };

export async function startAssist(sql: Sql, userId: string, input: AssistRequest, signal?: AbortSignal): Promise<AssistStart> {
  const invalid = validateAssist(input);
  if (invalid) return { ok: false, error: invalid, status: 400 };
  const detail = await readDetail(sql, userId, input.novelId);
  if (!detail) return { ok: false, error: "找不到这部作品", status: 404 };
  const settings = await readSecretSettings(sql, userId);
  const door = openModel(settings);
  if (!door.ok) return { ok: false, error: door.error === NOT_LISTED ? NOT_LISTED : door.error, status: 400 };
  const voice = await readVoice(sql, userId);
  const chapter = detail.chapters.find((c) => c.id === input.chapterId);
  const { messages, temperature } = buildAssistMessages(
    {
      title: detail.novel.title,
      genre: detail.novel.genre,
      logline: detail.novel.logline,
      premise: detail.novel.premise,
      styleNotes: detail.novel.styleNotes,
      touch: voice.touch,
      chapterTitle: chapter?.title ?? "",
      characters: detail.characters.map((c) => ({ name: c.name, role: c.role, bio: c.bio, aliases: c.aliases })),
      lore: detail.lore.map((l) => ({ name: l.name, kind: l.kind, summary: l.summary })),
      chapterFacts: detail.chapters.map((c) => `${c.title}${chapterFact(c) ? `：${chapterFact(c)}` : ""}`),
    },
    input,
  );
  const thinkingParam = deepseekHost(door.url);
  const send = (withThinking: boolean) =>
    fetch(door.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${door.apiKey}` },
      body: JSON.stringify({
        model: door.model,
        stream: true,
        temperature,
        max_tokens: 4096,
        messages,
        // 写作小工具要快：支持思考开关的服务商一律关掉思考。
        ...(thinkingParam && withThinking ? { thinking: { type: "disabled" } } : {}),
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
      redirect: "manual", // 不跟随跳转，防止被引到名单外的地址
    });
  let res: Response;
  try {
    res = await send(true);
    if (thinkingParam && (res.status === 400 || res.status === 422)) {
      await res.body?.cancel().catch(() => undefined);
      res = await send(false);
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "已停止" : UPSTREAM_CALL_TEXT.NETWORK, status: 502 };
  }
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400) || !res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, error: upstreamFailureFromResponse(res).error, status: 502 };
  }
  const parser = createSseParser();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = res.body.getReader();
  let produced = "";
  const promptSize = JSON.stringify(messages).length;
  const finish = async () => {
    if (!produced) return;
    try {
      await noteUsage(sql, userId, { aiChars: countWords(produced), tokens: Math.ceil((promptSize + produced.length) / 1.7) });
    } catch {
      // 记账失败不影响写作结果
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          const tail = parser.push("\n");
          if (tail.text) {
            produced += tail.text;
            controller.enqueue(encoder.encode(tail.text));
          }
          await finish();
          controller.close();
          return;
        }
        const out = parser.push(decoder.decode(value, { stream: true }));
        if (out.text) {
          produced += out.text;
          controller.enqueue(encoder.encode(out.text));
        }
        if (out.done) {
          await reader.cancel().catch(() => undefined);
          await finish();
          controller.close();
        }
      } catch {
        await finish();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
      await finish();
    },
  });
  return { ok: true, stream };
}
