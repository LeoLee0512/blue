import { create } from "zustand";
import { ASSIST_TOOLS, MAX_SELECTION, REWRITE_STYLES, tidyAssistOutput, type AssistTool } from "@/lib/write/assist-prompts";
import { keepVersion } from "@/lib/novel/workbench-api";
import type { Desk } from "@/components/desk";
import { useWriteState } from "@/components/write-store";

export type AssistJob = {
  id: number;
  tool: AssistTool;
  status: "streaming" | "done" | "error" | "stopped";
  text: string;
  error: string;
  novelId: string;
  chapterId: string;
  start: number;
  end: number;
  selection: string;
  instruction: string;
  length: number;
  applied: "" | "replaced" | "inserted";
};

type Options = { length: number; style: string; instruction: string };

let controller: AbortController | null = null;
let seq = 0;

export const useAssist = create<{
  job: AssistJob | null;
  options: Options;
  setOptions: (patch: Partial<Options>) => void;
  setJob: (fn: (job: AssistJob | null) => AssistJob | null) => void;
}>((set) => ({
  job: null,
  options: { length: 500, style: REWRITE_STYLES[0], instruction: "" },
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
  setJob: (fn) => set((s) => ({ job: fn(s.job) })),
}));

export function stopAssist() {
  controller?.abort();
  controller = null;
  useAssist.getState().setJob((job) => (job && job.status === "streaming" ? { ...job, status: "stopped" } : job));
}

/** 按当前选区启动一个写作工具。返回 false 表示没有启动（例如没有选区）。 */
export async function runAssist(desk: Desk, tool: AssistTool, override?: Partial<Options>): Promise<boolean> {
  const editor = desk.editor.current;
  const novelId = desk.novelId;
  if (!editor || !novelId) {
    desk.fail("先打开一章正文");
    return false;
  }
  const meta = ASSIST_TOOLS.find((t) => t.id === tool);
  const sel = editor.selection();
  if (meta?.needsSelection && !sel.text.trim()) {
    desk.fail("先选中一段文字，或把光标放在要续写的位置。");
    desk.setSide("assist");
    return false;
  }
  if (sel.text.length > MAX_SELECTION) {
    desk.fail(`这一段太长了，请分几次处理（单次最多 ${MAX_SELECTION} 字）。`);
    return false;
  }
  const store = useAssist.getState();
  const options = { ...store.options, ...override };
  if (override) store.setOptions(override);
  const instruction = tool === "rewrite" ? options.style : tool === "custom" || tool === "outline" ? options.instruction : "";
  controller?.abort();
  const mine = new AbortController();
  controller = mine;
  const id = ++seq;
  store.setJob(() => ({
    id,
    tool,
    status: "streaming",
    text: "",
    error: "",
    novelId,
    chapterId: editor.chapterId,
    start: sel.start,
    end: sel.end,
    selection: sel.text,
    instruction,
    length: options.length,
    applied: "",
  }));
  desk.setSide("assist");
  const update = (fn: (job: AssistJob) => AssistJob) => useAssist.getState().setJob((job) => (job && job.id === id ? fn(job) : job));
  try {
    const res = await fetch("/api/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool,
        novelId,
        chapterId: editor.chapterId,
        selection: sel.text,
        before: sel.before.slice(-4000),
        after: sel.after.slice(0, 1000),
        instruction,
        length: options.length,
      }),
      signal: mine.signal,
    });
    if (!res.ok || !res.body) {
      let error = "没有完成";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) error = body.error;
      } catch {
        // 保持默认提示
      }
      update((job) => ({ ...job, status: "error", error }));
      return true;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) update((job) => ({ ...job, text: job.text + chunk }));
    }
    update((job) => {
      const text = tidyAssistOutput(job.text, job.tool);
      return text ? { ...job, status: "done", text } : { ...job, status: "error", error: "模型没有返回内容，换个说法再试一次。" };
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    update((job) => (aborted ? { ...job, status: job.status === "streaming" ? "stopped" : job.status } : { ...job, status: "error", error: "连接中断了，请重试。" }));
  } finally {
    if (controller === mine) controller = null;
  }
  return true;
}

/** 应用结果：替换原文或插入。替换前先存一个「AI 修改前」版本，可在版本里找回。 */
export async function applyJob(desk: Desk, job: AssistJob, how: "replace" | "insert") {
  const editor = desk.editor.current;
  if (!editor || editor.chapterId !== job.chapterId) {
    desk.fail("请先回到发起时的那一章");
    return;
  }
  const text = tidyAssistOutput(job.text, job.tool);
  const now = editor.selection();
  const full = now.before + now.text + now.after;
  let start = job.start;
  let end = job.end;
  if (how === "replace") {
    if (full.slice(start, end) !== job.selection) {
      const at = full.indexOf(job.selection);
      if (at < 0 || !job.selection) {
        desk.fail("原文已经改动，找不到要替换的那段。可以用「插入」或复制。");
        return;
      }
      start = at;
      end = at + job.selection.length;
    }
    await editor.flush();
    const label = `${ASSIST_TOOLS.find((t) => t.id === job.tool)?.label ?? "AI"}之前`;
    try {
      await keepVersion({ data: { novelId: job.novelId, chapterId: job.chapterId, label, kind: "ai" } });
      useWriteState.getState().bumpVersions();
    } catch {
      // 版本没存上也继续：编辑器本身还能撤销
    }
    editor.replace(start, end, text);
  } else {
    // 插入在原选区之后（续写插在光标处）
    const anchor = full.slice(job.start, job.end) === job.selection ? job.end : now.end;
    const glue = job.tool === "continue" || job.tool === "outline" ? "" : "\n";
    editor.replace(anchor, anchor, glue + text);
  }
  useAssist.getState().setJob((cur) => (cur && cur.id === job.id ? { ...cur, applied: how === "replace" ? "replaced" : "inserted" } : cur));
  desk.note(how === "replace" ? "已替换，原文存进了版本历史" : "已插入");
  editor.focus();
}

