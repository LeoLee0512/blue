import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  BookPlus,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  FilePlus2,
  FolderPlus,
  GripVertical,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { addChapter, addVolume, dropVolume, editChapterMeta, editVolume, reorderChapter, reorderVolume } from "@/lib/novel/workbench-api";
import { removeChapterText } from "@/lib/novel/api";
import type { Chapter, Volume } from "@/lib/novel/types";
import { buildTree, moveChapter, moveVolume } from "@/lib/write/tree";
import { formatCount } from "@/lib/write/wordcount";
import { useDesk } from "@/components/desk";
import { call } from "@/components/call";
import { IconButton, MenuItem, MenuRoot, MenuSeparator } from "@/components/ui";
import { cn } from "@/lib/cn";

type Drag = { kind: "chapter" | "volume"; id: string };
type Drop = { kind: "chapter"; id: string; after: boolean } | { kind: "volume"; id: string | null; after: boolean; into: boolean } | null;

const LOOSE = "__loose__";

/** 左侧目录：作品切换 + 卷 / 章节树，支持拖动排序、重命名、删除。 */
export function Binder() {
  const desk = useDesk();
  const detail = desk.detail;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<{ kind: "chapter" | "volume"; id: string } | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const drag = useRef<Drag | null>(null);

  const tree = useMemo(() => buildTree(detail?.volumes ?? [], detail?.chapters ?? []), [detail?.volumes, detail?.chapters]);
  if (!detail) return null;
  const novelId = detail.novel.id;
  const totalWords = detail.chapters.reduce((sum, c) => sum + (c.words || 0), 0);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });


  async function newChapter(volumeId: string | null) {
    await desk.editor.current?.flush();
    const res = await call(desk, addChapter({ data: { novelId, volumeId } }));
    if (!res) return;
    desk.patchDetail((d) => ({ ...d, chapters: [...d.chapters, res.chapter] }));
    if (volumeId) setCollapsed((prev) => new Set([...prev].filter((id) => id !== volumeId)));
    desk.setSelectedChapterId(res.chapter.id);
    if (!["manuscript", "studio"].includes(desk.pane)) desk.setPane("manuscript");
  }

  async function newVolume() {
    const res = await call(desk, addVolume({ data: { novelId } }));
    if (!res) return;
    desk.patchDetail((d) => ({ ...d, volumes: [...d.volumes, res.volume] }));
    setRenaming({ kind: "volume", id: res.volume.id });
  }

  async function rename(kind: "chapter" | "volume", id: string, title: string) {
    setRenaming(null);
    const clean = title.trim();
    if (!clean) return;
    if (kind === "chapter") {
      const before = detail?.chapters.find((c) => c.id === id);
      if (!before || before.title === clean) return;
      desk.patchDetail((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === id ? { ...c, title: clean } : c)) }));
      await call(desk, editChapterMeta({ data: { novelId, chapterId: id, title: clean } }));
    } else {
      const before = detail?.volumes.find((v) => v.id === id);
      if (!before || before.title === clean) return;
      desk.patchDetail((d) => ({ ...d, volumes: d.volumes.map((v) => (v.id === id ? { ...v, title: clean } : v)) }));
      await call(desk, editVolume({ data: { novelId, volumeId: id, title: clean } }));
    }
  }

  async function setStatus(chapter: Chapter, status: "draft" | "done") {
    desk.patchDetail((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === chapter.id ? { ...c, status } : c)) }));
    await call(desk, editChapterMeta({ data: { novelId, chapterId: chapter.id, status } }));
  }

  function askDeleteChapter(chapter: Chapter) {
    desk.ask({
      title: `删除《${chapter.title}》？`,
      body: (
        <>
          这一章的正文（{formatCount(chapter.words)} 字）和它的历史版本会一起删除，删除后不能恢复。
          <br />
          需要留底的话，可以先在「数据」里做一次完整备份。
        </>
      ),
      confirm: "删除这一章",
      danger: true,
      onConfirm: async () => {
        const res = await call(desk, removeChapterText({ data: { novelId, chapterId: chapter.id } }));
        if (!res) return;
        desk.patchDetail((d) => ({ ...d, chapters: d.chapters.filter((c) => c.id !== chapter.id) }));
        if (desk.selectedChapterId === chapter.id) desk.setSelectedChapterId("");
        desk.note("章节已删除");
      },
    });
  }

  function askDeleteVolume(volume: Volume, count: number) {
    const remove = async (withChapters: boolean) => {
      const res = await call(desk, dropVolume({ data: { novelId, volumeId: volume.id, withChapters } }));
      if (!res) return;
      await desk.refreshDetail();
      desk.note(withChapters ? "已删除这一卷和其中的章节" : "已删除这一卷，章节移到了「未分卷」");
    };
    if (count === 0) {
      desk.ask({ title: `删除「${volume.title}」？`, body: "这一卷是空的。", confirm: "删除", danger: true, onConfirm: () => remove(false) });
      return;
    }
    desk.ask({
      title: `删除「${volume.title}」？`,
      body: `这一卷有 ${count} 章。只删卷名时，章节会移到「未分卷」，正文都保留。`,
      confirm: "只删卷，保留章节",
      onConfirm: () => remove(false),
    });
  }

  function askDeleteVolumeAll(volume: Volume, count: number) {
    desk.ask({
      title: `连同 ${count} 章一起删除「${volume.title}」？`,
      body: "卷里所有章节的正文和历史版本都会删除，不能恢复。",
      confirm: "全部删除",
      danger: true,
      onConfirm: async () => {
        const res = await call(desk, dropVolume({ data: { novelId, volumeId: volume.id, withChapters: true } }));
        if (!res) return;
        await desk.refreshDetail();
        desk.note("已删除这一卷和其中的章节");
      },
    });
  }

  /* ---------- 拖动 ---------- */

  function onDragStart(event: DragEvent, item: Drag) {
    drag.current = item;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }

  function overChapter(event: DragEvent, chapter: Chapter) {
    if (!drag.current) return;
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    if (drag.current.kind === "chapter") {
      if (drag.current.id === chapter.id) return setDrop(null);
      setDrop({ kind: "chapter", id: chapter.id, after });
    }
  }

  function overVolume(event: DragEvent, volumeId: string | null) {
    if (!drag.current) return;
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (drag.current.kind === "chapter") {
      setDrop({ kind: "volume", id: volumeId, after: false, into: true });
    } else if (volumeId && drag.current.id !== volumeId) {
      setDrop({ kind: "volume", id: volumeId, after: event.clientY > box.top + box.height / 2, into: false });
    }
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    const item = drag.current;
    const target = drop;
    drag.current = null;
    setDrop(null);
    if (!item || !target || !detail) return;
    if (item.kind === "chapter") {
      let volumeId: string | null;
      let toIndex: number;
      if (target.kind === "chapter") {
        const anchor = detail.chapters.find((c) => c.id === target.id);
        if (!anchor) return;
        const known = new Set(detail.volumes.map((v) => v.id));
        volumeId = anchor.volumeId && known.has(anchor.volumeId) ? anchor.volumeId : null;
        const list = (volumeId ? (tree.volumes.find((v) => v.volume.id === volumeId)?.chapters ?? []) : tree.loose).filter((c) => c.id !== item.id);
        toIndex = list.findIndex((c) => c.id === anchor.id) + (target.after ? 1 : 0);
      } else {
        volumeId = target.id;
        const list = (volumeId ? (tree.volumes.find((v) => v.volume.id === volumeId)?.chapters ?? []) : tree.loose).filter((c) => c.id !== item.id);
        toIndex = list.length;
      }
      const changes = moveChapter(detail.volumes, detail.chapters, item.id, volumeId, toIndex);
      if (!changes.length) return;
      const byId = new Map(changes.map((c) => [c.id, c]));
      desk.patchDetail((d) => ({
        ...d,
        chapters: d.chapters.map((c) => {
          const next = byId.get(c.id);
          return next ? { ...c, volumeId: next.volumeId, sortOrder: next.sortOrder } : c;
        }),
      }));
      if (volumeId) setCollapsed((prev) => new Set([...prev].filter((id) => id !== volumeId)));
      await call(desk, reorderChapter({ data: { novelId, chapterId: item.id, volumeId, toIndex } }));
    } else if (target.kind === "volume" && target.id && !target.into) {
      const rest = tree.volumes.map((v) => v.volume).filter((v) => v.id !== item.id);
      const toIndex = rest.findIndex((v) => v.id === target.id) + (target.after ? 1 : 0);
      const changes = moveVolume(detail.volumes, item.id, toIndex);
      if (!changes.length) return;
      const byId = new Map(changes.map((c) => [c.id, c.sortOrder]));
      desk.patchDetail((d) => ({ ...d, volumes: d.volumes.map((v) => (byId.has(v.id) ? { ...v, sortOrder: byId.get(v.id) ?? v.sortOrder } : v)) }));
      await call(desk, reorderVolume({ data: { novelId, volumeId: item.id, toIndex } }));
    }
  }

  const chapterRow = (chapter: Chapter, index: number) => {
    const active = chapter.id === desk.selectedChapterId && ["manuscript", "studio", "review", "net", "people"].includes(desk.pane);
    const dropHere = drop?.kind === "chapter" && drop.id === chapter.id;
    return (
      <li
        key={chapter.id}
        draggable={renaming?.id !== chapter.id}
        onDragStart={(event) => onDragStart(event, { kind: "chapter", id: chapter.id })}
        onDragOver={(event) => overChapter(event, chapter)}
        onDrop={(event) => void onDrop(event)}
        onDragEnd={() => {
          drag.current = null;
          setDrop(null);
        }}
        className="relative"
      >
        {dropHere ? <span className={cn("absolute right-2 left-6 z-10 h-0.5 rounded bg-accent", drop.after ? "-bottom-px" : "-top-px")} /> : null}
        <div
          className={cn(
            "group flex h-8 items-center gap-1 rounded-lg pr-1 pl-2 text-[13px] transition-colors",
            active ? "bg-accent-soft text-accent-ink" : "text-ink hover:bg-hover",
          )}
        >
          <GripVertical className="size-3 shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" aria-hidden />
          {renaming?.kind === "chapter" && renaming.id === chapter.id ? (
            <RenameInput initial={chapter.title} onDone={(title) => void rename("chapter", chapter.id, title)} />
          ) : (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              onClick={async () => {
                if (chapter.id !== desk.selectedChapterId) await desk.editor.current?.flush();
                desk.setSelectedChapterId(chapter.id);
                if (!active) desk.setPane("manuscript");
              }}
              onDoubleClick={() => setRenaming({ kind: "chapter", id: chapter.id })}
              title={`${chapter.title} · ${chapter.words} 字`}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", chapter.status === "done" ? "bg-ok" : chapter.words > 0 ? "bg-accent/50" : "bg-line")} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{chapter.title || `第 ${index + 1} 章`}</span>
              <span className="shrink-0 text-[11px] text-faint tabular-nums group-hover:hidden">{chapter.words ? formatCount(chapter.words) : ""}</span>
            </button>
          )}
          <MenuRoot
            align="end"
            trigger={
              <IconButton label="章节操作" size="sm" className="hidden size-6 group-hover:inline-flex data-[state=open]:inline-flex">
                <MoreHorizontal className="size-3.5" />
              </IconButton>
            }
          >
            <MenuItem icon={<Pencil className="size-3.5" />} onSelect={() => setRenaming({ kind: "chapter", id: chapter.id })}>
              重命名
            </MenuItem>
            {chapter.status === "done" ? (
              <MenuItem icon={<CircleDot className="size-3.5" />} onSelect={() => void setStatus(chapter, "draft")}>
                标为草稿
              </MenuItem>
            ) : (
              <MenuItem icon={<Check className="size-3.5" />} onSelect={() => void setStatus(chapter, "done")}>
                标为完成
              </MenuItem>
            )}
            <MenuItem icon={<Download className="size-3.5" />} onSelect={() => desk.openExport({ kind: "chapter", id: chapter.id })}>
              导出本章
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => askDeleteChapter(chapter)}>
              删除
            </MenuItem>
          </MenuRoot>
        </div>
      </li>
    );
  };

  const group = (volume: Volume | null, chapters: Chapter[]) => {
    const key = volume?.id ?? LOOSE;
    const open = !collapsed.has(key);
    const words = chapters.reduce((sum, c) => sum + (c.words || 0), 0);
    const into = drop?.kind === "volume" && drop.into && drop.id === (volume?.id ?? null);
    const line = drop?.kind === "volume" && !drop.into && drop.id === volume?.id;
    return (
      <div key={key} className="relative">
        {line ? <span className={cn("absolute right-2 left-2 z-10 h-0.5 rounded bg-accent", drop.after ? "-bottom-px" : "-top-px")} /> : null}
        <div
          draggable={Boolean(volume) && renaming?.id !== volume?.id}
          onDragStart={(event) => volume && onDragStart(event, { kind: "volume", id: volume.id })}
          onDragOver={(event) => overVolume(event, volume?.id ?? null)}
          onDrop={(event) => void onDrop(event)}
          onDragEnd={() => {
            drag.current = null;
            setDrop(null);
          }}
          className={cn("group flex h-8 items-center gap-1 rounded-lg pr-1 pl-1 transition-colors hover:bg-hover", into && "bg-accent-soft ring-1 ring-accent/40")}
        >
          <button type="button" className="flex size-5 items-center justify-center text-faint" onClick={() => toggle(key)} aria-label={open ? "收起" : "展开"}>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {volume && renaming?.kind === "volume" && renaming.id === volume.id ? (
            <RenameInput initial={volume.title} onDone={(title) => void rename("volume", volume.id, title)} />
          ) : (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
              onClick={() => toggle(key)}
              onDoubleClick={() => volume && setRenaming({ kind: "volume", id: volume.id })}
            >
              <span className={cn("min-w-0 truncate text-[13px] font-semibold tracking-wide", volume ? "text-ink" : "text-mist")}>{volume?.title ?? "未分卷"}</span>
              <span className="shrink-0 text-[11px] text-faint tabular-nums">
                {chapters.length} 章{words ? ` · ${formatCount(words)}` : ""}
              </span>
            </button>
          )}
          <IconButton label="在这里新建章节" size="sm" className="hidden size-6 group-hover:inline-flex" onClick={() => void newChapter(volume?.id ?? null)}>
            <Plus className="size-3.5" />
          </IconButton>
          {volume ? (
            <MenuRoot
              align="end"
              trigger={
                <IconButton label="卷操作" size="sm" className="hidden size-6 group-hover:inline-flex data-[state=open]:inline-flex">
                  <MoreHorizontal className="size-3.5" />
                </IconButton>
              }
            >
              <MenuItem icon={<Pencil className="size-3.5" />} onSelect={() => setRenaming({ kind: "volume", id: volume.id })}>
                重命名
              </MenuItem>
              <MenuItem icon={<FilePlus2 className="size-3.5" />} onSelect={() => void newChapter(volume.id)}>
                新建章节
              </MenuItem>
              <MenuItem icon={<Download className="size-3.5" />} onSelect={() => desk.openExport({ kind: "volume", id: volume.id })}>
                导出本卷
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => askDeleteVolume(volume, chapters.length)}>
                删除卷（保留章节）
              </MenuItem>
              {chapters.length ? (
                <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => askDeleteVolumeAll(volume, chapters.length)}>
                  连同章节一起删除
                </MenuItem>
              ) : null}
            </MenuRoot>
          ) : null}
        </div>
        {open ? (
          <ul className="mt-0.5 ml-3 space-y-px border-l border-line pl-1">
            {chapters.map((c, i) => chapterRow(c, i))}
            {chapters.length === 0 ? (
              <li>
                <button type="button" className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-[13px] text-faint hover:bg-hover hover:text-mist" onClick={() => void newChapter(volume?.id ?? null)}>
                  <Plus className="size-3.5" /> 新建章节
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    );
  };

  const showLoose = tree.loose.length > 0 || tree.volumes.length === 0;
  const lastVolume = tree.volumes.at(-1)?.volume.id ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-3 pt-3 pb-2.5">
        <MenuRoot
          trigger={
            <button type="button" className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-hover">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent font-serif text-sm text-accent-fg">{detail.novel.title.slice(0, 1) || "稿"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[15px] font-semibold text-ink">{detail.novel.title}</span>
                <span className="block truncate text-[11px] text-faint">
                  {detail.novel.genre || "未定类型"} · {detail.chapters.length} 章 · {formatCount(totalWords)} 字
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-faint" />
            </button>
          }
        >
          {(desk.account?.novels ?? []).map((novel) => (
            <MenuItem key={novel.id} icon={novel.id === novelId ? <Check className="size-3.5" /> : null} onSelect={() => desk.openNovel(novel.id)}>
              <span className="max-w-56 truncate">{novel.title}</span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem icon={<Library className="size-3.5" />} onSelect={() => desk.setPane("library")}>
            打开书架
          </MenuItem>
          <MenuItem
            icon={<BookPlus className="size-3.5" />}
            onSelect={() => {
              desk.setCreating(true);
              desk.setPane("library");
            }}
          >
            新作品
          </MenuItem>
          <MenuItem icon={<Pencil className="size-3.5" />} onSelect={() => desk.setPane("story")}>
            作品信息与故事核
          </MenuItem>
          <MenuItem icon={<Download className="size-3.5" />} onSelect={() => desk.openExport({ kind: "work" })}>
            导出整部作品
          </MenuItem>
        </MenuRoot>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-[13px] font-medium text-accent-fg hover:bg-accent-ink"
            onClick={() => void newChapter(lastVolume)}
          >
            <FilePlus2 className="size-3.5" /> 新章节
          </button>
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink hover:bg-hover"
            onClick={() => void newVolume()}
          >
            <FolderPlus className="size-3.5" /> 新卷
          </button>
        </div>
      </div>
      <nav aria-label="目录" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2" onDragLeave={(event) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setDrop(null);
      }}>
        {showLoose ? group(null, tree.loose) : null}
        {tree.volumes.map((v) => group(v.volume, v.chapters))}
        <p className="px-2 pt-3 text-[11px] leading-relaxed text-faint">拖动章节或卷可以调整顺序；双击可重命名。</p>
      </nav>
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (next: string) => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
  return (
    <input
      autoFocus
      className="h-6 min-w-0 flex-1 rounded-md border border-accent bg-surface px-1.5 text-[13px] text-ink outline-none"
      value={value}
      maxLength={80}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(value);
        if (event.key === "Escape") finish(initial);
      }}
    />
  );
}
