import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, Copy, ListTree, RefreshCw, Replace, Sparkles, Square, Wand2, X } from "lucide-react";
import { ASSIST_TOOLS, CONTINUE_LENGTHS, MAX_SELECTION, REWRITE_STYLES, type AssistTool } from "@/lib/write/assist-prompts";
import { countWords } from "@/lib/write/wordcount";
import { applyJob, runAssist, stopAssist, useAssist, type AssistJob } from "@/components/assist-run";
import { useDesk } from "@/components/desk";
import { useWriteState } from "@/components/write-store";
import { Button, Segmented, areaClass } from "@/components/ui";
import { cn } from "@/lib/cn";

const TOOL_ICON: Partial<Record<AssistTool, typeof Sparkles>> = { outline: ListTree, custom: Wand2 };

/** 右侧面板里的 AI 写作工具。 */
export function AssistPanel() {
  const desk = useDesk();
  const { job, options, setOptions, setJob } = useAssist();
  const [selLength, setSelLength] = useState(0);
  const selectionWords = useWriteState((s) => s.selectionWords);
  const connected = Boolean(desk.account?.settings.hasKey && desk.account.settings.model);

  useEffect(() => {
    setSelLength(desk.editor.current?.selection().text.length ?? 0);
  }, [selectionWords, desk.editor]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-3">
        {!connected ? (
          <div className="rounded-lg border border-line bg-sunk p-3 text-[13px] leading-relaxed text-mist">
            <p>还没接上模型。AI 工具使用你在「设置 → 模型与 API」里填写的服务商和密钥，只发往白名单里的官方地址。</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => desk.setPane("connect")}>
              去连接模型
            </Button>
          </div>
        ) : null}
        <p className="text-[12px] text-faint">
          {selLength > 0 ? (
            <>
              已选中 <span className="text-ink tabular-nums">{selectionWords}</span> 字
              {selLength > MAX_SELECTION ? <span className="text-danger">（超过 {MAX_SELECTION} 字，请分段）</span> : null}
            </>
          ) : (
            "没有选中文字：续写从光标处接着写；其他工具需要先选中一段。"
          )}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {ASSIST_TOOLS.map((tool) => {
            const Icon = TOOL_ICON[tool.id] ?? Sparkles;
            const disabled = tool.needsSelection && selLength === 0;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.blurb}
                disabled={job?.status === "streaming"}
                onClick={() => void runAssist(desk, tool.id)}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[12px] transition-colors disabled:opacity-50",
                  disabled ? "border-line text-faint" : "border-line bg-surface text-ink hover:border-accent/50 hover:bg-accent-soft hover:text-accent-ink",
                  job?.tool === tool.id && "border-accent/60 bg-accent-soft text-accent-ink",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {tool.label}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-mist">续写字数</span>
            <Segmented
              label="续写字数"
              value={String(options.length)}
              options={CONTINUE_LENGTHS.map((n) => ({ id: String(n), label: `${n}` }))}
              onChange={(v) => setOptions({ length: Number(v) })}
            />
          </div>
          <div>
            <span className="text-[12px] text-mist">改写风格</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {REWRITE_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setOptions({ style })}
                  className={cn(
                    "h-6 rounded-md px-2 text-[12px]",
                    options.style === style ? "bg-accent text-accent-fg" : "bg-sunk text-mist hover:text-ink",
                  )}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className={cn(areaClass, "text-[13px]")}
            rows={2}
            maxLength={600}
            placeholder="自由指令 / 大纲要求，例如：把这段改成雨夜；或：接下来三章的走向"
            value={options.instruction}
            onChange={(event) => setOptions({ instruction: event.target.value })}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {job ? (
          <JobCard
            job={job}
            onDismiss={() => {
              stopAssist();
              setJob(() => null);
            }}
          />
        ) : (
          <div className="px-2 py-8 text-center text-[13px] leading-relaxed text-faint">
            选中正文后会出现浮动工具条，也可以在这里点工具。
            <br />
            结果会逐字出现，确认后再替换或插入，原文会自动存进版本历史。
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job, onDismiss }: { job: AssistJob; onDismiss: () => void }) {
  const desk = useDesk();
  const tool = ASSIST_TOOLS.find((t) => t.id === job.tool);
  const streaming = job.status === "streaming";
  const canReplace = (tool?.needsSelection || job.tool === "custom") && Boolean(job.selection);
  const words = countWords(job.text);
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Sparkles className="size-3.5 text-accent" />
          {tool?.label}
          {job.instruction && job.tool !== "custom" ? <span className="font-normal text-faint">· {job.instruction.slice(0, 16)}</span> : null}
        </span>
        <span className="text-[11px] text-faint tabular-nums">
          {streaming ? "正在写…" : job.status === "stopped" ? "已停止" : job.status === "error" ? "" : `${words} 字`}
        </span>
      </div>
      {job.selection && job.tool !== "continue" ? (
        <p className="line-clamp-3 border-b border-line bg-sunk/60 px-3 py-2 text-[12px] leading-relaxed text-faint">原文：{job.selection}</p>
      ) : null}
      <div className="px-3 py-3">
        {job.status === "error" ? (
          <div className="space-y-2">
            <p className="text-[13px] leading-relaxed text-danger">{job.error}</p>
            {/密钥|连接|模型|服务商/.test(job.error) ? (
              <Button size="sm" variant="secondary" onClick={() => desk.setPane("connect")}>
                打开模型设置
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={cn("manuscript max-h-[46vh] overflow-y-auto text-[15px] whitespace-pre-wrap", streaming && "stream-caret")} style={{ lineHeight: 1.85 }}>
            {job.text || (streaming ? "" : "（空）")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
        {streaming ? (
          <Button size="sm" variant="secondary" onClick={stopAssist}>
            <Square className="size-3" /> 停止
          </Button>
        ) : null}
        {!streaming && job.text && job.status !== "error" ? (
          <>
            {canReplace ? (
              <Button size="sm" disabled={job.applied !== ""} onClick={() => void applyJob(desk, job, "replace")}>
                {job.applied === "replaced" ? <Check className="size-3.5" /> : <Replace className="size-3.5" />}
                {job.applied === "replaced" ? "已替换" : "替换原文"}
              </Button>
            ) : null}
            <Button size="sm" variant={canReplace ? "secondary" : "primary"} disabled={job.applied !== ""} onClick={() => void applyJob(desk, job, "insert")}>
              <ArrowDownToLine className="size-3.5" />
              {job.applied === "inserted" ? "已插入" : job.tool === "continue" ? "接到光标处" : "插入到后面"}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                void navigator.clipboard?.writeText(job.text).then(() => desk.note("已复制"));
              }}
            >
              <Copy className="size-3.5" /> 复制
            </Button>
          </>
        ) : null}
        {!streaming ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              const editor = desk.editor.current;
              if (editor && editor.chapterId === job.chapterId && job.selection) {
                const sel = editor.selection();
                const full = sel.before + sel.text + sel.after;
                const at = full.slice(job.start, job.end) === job.selection ? job.start : full.indexOf(job.selection);
                if (at >= 0) editor.replace(at, at + job.selection.length, job.selection);
              }
              void runAssist(desk, job.tool);
            }}
          >
            <RefreshCw className="size-3.5" /> 重来
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onDismiss}>
          <X className="size-3.5" /> 关闭
        </Button>
      </div>
    </div>
  );
}

/** 选中文字后出现的浮动工具条。 */
export function SelectionToolbar({ top, left, onPick }: { top: number; left: number; onPick: (tool: AssistTool, style?: string) => void }) {
  const [styles, setStyles] = useState(false);
  return (
    <div
      className="pop fixed z-30 flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
      style={{ top, left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Sparkles className="mx-1 size-3.5 text-accent" aria-hidden />
      {(["polish", "expand", "shorten"] as const).map((id) => (
        <button key={id} type="button" className="h-7 rounded-lg px-2 text-[13px] text-ink hover:bg-hover" onClick={() => onPick(id)}>
          {ASSIST_TOOLS.find((t) => t.id === id)?.label}
        </button>
      ))}
      <div className="relative">
        <button type="button" className="h-7 rounded-lg px-2 text-[13px] text-ink hover:bg-hover" onClick={() => setStyles((v) => !v)}>
          改写 ▾
        </button>
        {styles ? (
          <div className="pop absolute top-8 left-0 z-40 w-36 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
            {REWRITE_STYLES.map((style) => (
              <button key={style} type="button" className="flex h-7 w-full items-center rounded-lg px-2 text-left text-[13px] text-ink hover:bg-hover" onClick={() => onPick("rewrite", style)}>
                {style}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="h-7 rounded-lg px-2 text-[13px] text-mist hover:bg-hover hover:text-ink" onClick={() => onPick("custom")}>
        更多…
      </button>
    </div>
  );
}
