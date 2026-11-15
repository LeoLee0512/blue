import { useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Download, FileArchive, FileText, FileType2, HardDriveDownload, ShieldCheck, Upload } from "lucide-react";
import { exportAllData, inspectDataPack, restoreDataPack } from "@/lib/novel/workbench-api";
import { EXPORT_MIME, renderExport, safeFileName, type ExportFormat } from "@/lib/write/exporters";
import { bookFor, downloadBlob } from "@/components/export-book";
import type { PackSummary } from "@/lib/write/data-pack";
import { countWords, formatCount } from "@/lib/write/wordcount";
import type { ExportScope } from "@/components/desk";
import { useDesk } from "@/components/desk";
import { Button, Modal, PageHeader, Segmented, fieldClass } from "@/components/ui";
import { cn } from "@/lib/cn";

const FORMATS: { id: ExportFormat; label: string; ext: string; blurb: string; icon: typeof FileText }[] = [
  { id: "docx", label: "Word", ext: "docx", blurb: "投稿、打印、发编辑", icon: FileType2 },
  { id: "epub", label: "EPUB", ext: "epub", blurb: "手机和阅读器上看", icon: BookOpen },
  { id: "txt", label: "TXT", ext: "txt", blurb: "纯文本，网文平台上传", icon: FileText },
  { id: "md", label: "Markdown", ext: "md", blurb: "带标题层级的纯文本", icon: FileText },
];

export function ExportDialog({ scope, onClose }: { scope: ExportScope | null; onClose: () => void }) {
  const desk = useDesk();
  const detail = desk.detail;
  const [format, setFormat] = useState<ExportFormat>("docx");
  const [chosen, setChosen] = useState<ExportScope | null>(null);
  const active = chosen ?? scope;
  const book = useMemo(() => {
    if (!detail || !active) return null;
    const editor = desk.editor.current;
    return bookFor(detail, active, editor ? { id: editor.chapterId, body: editor.text() } : undefined);
  }, [detail, active, desk.editor]);
  if (!detail || !scope || !active || !book) return null;
  const chapters = book.parts.reduce((n, p) => n + p.chapters.length, 0);
  const words = book.parts.reduce((n, p) => n + p.chapters.reduce((m, c) => m + countWords(c.body), 0), 0);
  const currentChapter = desk.selectedChapterId;
  const currentVolume = detail.chapters.find((c) => c.id === currentChapter)?.volumeId ?? null;
  const scopeId = active.kind;
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) {
          setChosen(null);
          onClose();
        }
      }}
      title="导出"
      description="文件在本机生成，不经过网络。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={chapters === 0}
            onClick={() => {
              const meta = FORMATS.find((f) => f.id === format);
              const data = renderExport(book, format);
              downloadBlob(`${safeFileName(book.title)}.${meta?.ext ?? format}`, data as BlobPart, EXPORT_MIME[format]);
              desk.note("已导出");
              setChosen(null);
              onClose();
            }}
          >
            <Download className="size-4" /> 导出 {FORMATS.find((f) => f.id === format)?.label}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-mist">范围</p>
          <Segmented
            label="导出范围"
            value={scopeId}
            onChange={(kind) =>
              setChosen(
                kind === "chapter"
                  ? { kind: "chapter", id: active.kind === "chapter" ? active.id : currentChapter }
                  : kind === "volume"
                    ? { kind: "volume", id: active.kind === "volume" ? active.id : currentVolume }
                    : { kind: "work" },
              )
            }
            options={[
              { id: "chapter", label: "本章" },
              { id: "volume", label: "本卷" },
              { id: "work", label: "整部作品" },
            ]}
          />
          <p className="mt-2 text-[13px] text-faint">
            《{book.title}》 · {chapters} 章 · {formatCount(words)} 字
          </p>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-mist">格式</p>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  format === f.id ? "border-accent bg-accent-soft" : "border-line hover:bg-hover",
                )}
              >
                <f.icon className={cn("size-5 shrink-0", format === f.id ? "text-accent" : "text-faint")} strokeWidth={1.6} />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {f.label} <span className="font-normal text-faint">.{f.ext}</span>
                  </span>
                  <span className="block text-[12px] text-mist">{f.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ======================= 数据：完整备份与恢复 ======================= */

export function DataPane() {
  const desk = useDesk();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<PackSummary | null>(null);
  const [pending, setPending] = useState<{ name: string; text: string; summary: PackSummary } | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [typed, setTyped] = useState("");

  async function doExport() {
    setBusy(true);
    try {
      const res = await exportAllData();
      if (!res.ok) return desk.fail(res.error);
      downloadBlob(res.fileName, res.json, "application/json");
      setLastExport(res.summary);
      desk.note("完整数据已导出");
    } catch {
      desk.fail("没有完成");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(f: File | undefined) {
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) return desk.fail("文件太大了");
    setBusy(true);
    try {
      const text = await f.text();
      const res = await inspectDataPack({ data: { text } });
      if (!res.ok) return desk.fail(res.error);
      setPending({ name: f.name, text, summary: res.summary });
      setMode("merge");
      setTyped("");
    } catch {
      desk.fail("没有读到文件");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  async function doRestore() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await restoreDataPack({ data: { text: pending.text, mode } });
      if (!res.ok) return desk.fail(res.error);
      setPending(null);
      await desk.refreshAll();
      await desk.refreshDetail();
      desk.note(mode === "replace" ? "已用备份覆盖。原来的数据另存成了恢复点文件。" : `已导入 ${res.summary.novels} 部作品（书名带「导入」字样）`);
    } catch {
      desk.fail("没有完成");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="数据" body="作品都保存在这台电脑上。定期导出一份完整数据，换电脑或重装时可以原样恢复。" />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <HardDriveDownload className="size-5" />
          </div>
          <h2 className="mt-3 font-serif text-lg font-semibold">一键导出全部</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mist">所有作品、卷章、历史版本、人物卡、设定、诗歌手记、文风档案，存成一个 .langao.json 文件。</p>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-ok">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> 不包含模型密钥。恢复后需要在「设置 → 模型与 API」里重新填写。
          </p>
          <Button className="mt-4" disabled={busy} onClick={() => void doExport()}>
            <Download className="size-4" /> 导出完整数据
          </Button>
          {lastExport ? (
            <p className="mt-3 text-[12px] text-faint">
              刚才导出了 {lastExport.novels} 部作品、{lastExport.chapters} 章、{lastExport.versions} 个版本。
            </p>
          ) : null}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <FileArchive className="size-5" />
          </div>
          <h2 className="mt-3 font-serif text-lg font-semibold">从文件恢复</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mist">选择之前导出的 .langao.json。可以作为副本并入现有作品，也可以整体覆盖。</p>
          <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
          <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => file.current?.click()}>
            <Upload className="size-4" /> 选择备份文件
          </Button>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-serif text-lg font-semibold">导出单部作品</h2>
        <p className="mt-1 text-[13px] text-mist">导出成 Word、EPUB、TXT 或 Markdown，可以按章、按卷或整部。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(desk.account?.novels ?? []).map((n) => (
            <Button
              key={n.id}
              size="sm"
              variant="secondary"
              onClick={() => desk.openExport({ kind: "work" }, n.id)}
            >
              <Download className="size-3.5" /> {n.title}
            </Button>
          ))}
        </div>
      </section>
      {pending ? (
        <Modal
          open
          onOpenChange={(o) => (!o ? setPending(null) : undefined)}
          title="恢复数据"
          description={pending.name}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPending(null)}>
                取消
              </Button>
              <Button variant={mode === "replace" ? "danger" : "primary"} disabled={busy || (mode === "replace" && typed.trim() !== "覆盖")} onClick={() => void doRestore()}>
                {mode === "replace" ? "覆盖现有数据" : "作为副本导入"}
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-[13px]">
            <div className="rounded-xl bg-sunk p-3 leading-relaxed text-mist">
              备份时间 {new Date(pending.summary.createdAt).toLocaleString("zh-CN")}
              <br />
              {pending.summary.novels} 部作品 · {pending.summary.chapters} 章 · {pending.summary.characters} 个人物 · {pending.summary.lore} 条设定 · {pending.summary.versions} 个版本 · {pending.summary.pieces} 篇诗歌手记
              {pending.summary.titles.length ? <span className="mt-1 block text-faint">《{pending.summary.titles.join("》《")}》</span> : null}
            </div>
            <div className="space-y-2">
              {(
                [
                  ["merge", "作为副本导入（推荐）", "备份里的作品会作为新作品加进来，书名后加「（导入）」，现有作品不受影响。"],
                  ["replace", "覆盖现有数据", "清空现在的作品，换成备份里的内容。覆盖前会自动把现有数据另存为恢复点文件。模型连接和密钥保持不变。"],
                ] as const
              ).map(([id, label, blurb]) => (
                <label key={id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3", mode === id ? "border-accent bg-accent-soft" : "border-line")}>
                  <input type="radio" name="restore-mode" className="mt-1 accent-[var(--color-accent)]" checked={mode === id} onChange={() => setMode(id)} />
                  <span>
                    <span className="block font-medium text-ink">{label}</span>
                    <span className="block leading-relaxed text-mist">{blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            {mode === "replace" ? (
              <div className="space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-3">
                <p className="flex items-start gap-1.5 text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> 现有的作品会被替换。请输入「覆盖」两个字确认。
                </p>
                <input className={fieldClass} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="覆盖" />
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
