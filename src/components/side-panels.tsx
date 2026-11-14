import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, CornerDownLeft, History, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { backToVersion, dropVersion, keepVersion, loadVersion, loadVersions, removeLoreEntry, saveCharacterCard, saveLoreEntry } from "@/lib/novel/workbench-api";
import { removePerson } from "@/lib/novel/api";
import type { ChapterVersion, ChapterVersionMeta, Character, LoreEntry, LoreKind } from "@/lib/novel/types";
import { diffStats, diffText } from "@/lib/write/diff";
import { VERSION_LABEL } from "@/lib/write/versions";
import { formatCount } from "@/lib/write/wordcount";
import { useDesk } from "@/components/desk";
import { useWriteState } from "@/components/write-store";
import { call } from "@/components/call";
import { Badge, Button, Field, IconButton, Modal, Segmented, areaClass, fieldClass } from "@/components/ui";
import { cn } from "@/lib/cn";

/* ======================= 共用 ======================= */

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
      <input className={cn(fieldClass, "h-8 pl-8 text-[13px]")} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function insertName(desk: ReturnType<typeof useDesk>, name: string) {
  const editor = desk.editor.current;
  if (!editor) {
    desk.fail("先打开一章正文");
    return;
  }
  const sel = editor.selection();
  editor.replace(sel.start, sel.end, name);
  desk.note(`已插入「${name}」`);
}

const splitTags = (raw: string) =>
  raw
    .split(/[，,、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/* ======================= 人物卡 ======================= */

export function CardsPanel() {
  const desk = useDesk();
  const detail = desk.detail;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>("");
  const [editing, setEditing] = useState<Character | "new" | null>(null);
  const people = useMemo(() => {
    const q = query.trim();
    return (detail?.characters ?? []).filter((c) => !q || [c.name, c.aliases, c.role, c.tags, c.bio].some((f) => f.includes(q)));
  }, [detail?.characters, query]);
  if (!detail) return null;
  const appearances = (c: Character) => {
    const names = [c.name, ...splitTags(c.aliases)].filter((n) => n.length >= 1);
    return detail.chapters.filter((ch) => names.some((n) => ch.body.includes(n))).length;
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <div className="min-w-0 flex-1">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索名字、别名、标签" />
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> 新人物
        </Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {people.length === 0 ? <li className="py-10 text-center text-[13px] text-faint">{query ? "没有找到。" : "还没有人物卡。写下主角的名字、外貌和性格，AI 工具也会参考。"}</li> : null}
        {people.map((c) => {
          const expanded = open === c.id;
          return (
            <li key={c.id} className="rounded-xl border border-line bg-surface">
              <div className="group flex items-center gap-2 px-2.5 py-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setOpen(expanded ? "" : c.id)}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-sm text-accent">{c.name.slice(0, 1)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {c.name}
                      {c.aliases ? <span className="ml-1.5 font-normal text-faint">{splitTags(c.aliases).slice(0, 2).join(" / ")}</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-mist">{c.role || "未写身份"}</span>
                  </span>
                </button>
                <IconButton label={`插入「${c.name}」`} size="sm" onClick={() => insertName(desk, c.name)}>
                  <CornerDownLeft className="size-3.5" />
                </IconButton>
                <IconButton label="编辑" size="sm" onClick={() => setEditing(c)}>
                  <Pencil className="size-3.5" />
                </IconButton>
              </div>
              {expanded ? (
                <div className="space-y-2 border-t border-line px-3 py-2.5 text-[12px] leading-relaxed">
                  {c.appearance ? <CardLine label="外貌" text={c.appearance} /> : null}
                  {c.personality ? <CardLine label="性格" text={c.personality} /> : null}
                  {c.bio ? <CardLine label="档案" text={c.bio} /> : null}
                  <div className="flex flex-wrap items-center gap-1">
                    {splitTags(c.tags).map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                    <span className="text-faint">出现在 {appearances(c)} 章</span>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {editing ? <CardEditor card={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CardLine({ label, text }: { label: string; text: string }) {
  return (
    <p>
      <span className="mr-1.5 text-faint">{label}</span>
      <span className="whitespace-pre-wrap text-ink">{text}</span>
    </p>
  );
}

function CardEditor({ card, onClose }: { card: Character | null; onClose: () => void }) {
  const desk = useDesk();
  const [form, setForm] = useState({
    name: card?.name ?? "",
    aliases: card?.aliases ?? "",
    role: card?.role ?? "",
    appearance: card?.appearance ?? "",
    personality: card?.personality ?? "",
    bio: card?.bio ?? "",
    tags: card?.tags ?? "",
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async () => {
    if (!form.name.trim()) return desk.fail("名字不能为空");
    const res = await call(desk, saveCharacterCard({ data: { novelId: desk.novelId, id: card?.id, ...form, name: form.name.trim() } }), { refresh: false });
    if (!res) return;
    desk.patchDetail((d) => ({
      ...d,
      characters: card ? d.characters.map((c) => (c.id === res.character.id ? res.character : c)) : [...d.characters, res.character],
    }));
    desk.note("人物卡已保存");
    onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={card ? `编辑人物：${card.name}` : "新人物"}
      wide
      footer={
        <>
          {card ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:text-danger"
              onClick={() =>
                desk.ask({
                  title: `删除人物「${card.name}」？`,
                  body: "只删除人物卡，正文里的名字不会改动。",
                  confirm: "删除",
                  danger: true,
                  onConfirm: async () => {
                    const res = await call(desk, removePerson({ data: { novelId: desk.novelId, characterId: card.id } }));
                    if (!res) return;
                    desk.patchDetail((d) => ({ ...d, characters: d.characters.filter((c) => c.id !== card.id) }));
                    onClose();
                  },
                })
              }
            >
              <Trash2 className="size-3.5" /> 删除
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()}>保存</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="名字">
          <input className={fieldClass} autoFocus maxLength={40} value={form.name} onChange={set("name")} />
        </Field>
        <Field label="别名" hint="用逗号或顿号分隔">
          <input className={fieldClass} maxLength={120} value={form.aliases} onChange={set("aliases")} placeholder="阿照、林记者" />
        </Field>
        <Field label="身份">
          <input className={fieldClass} maxLength={80} value={form.role} onChange={set("role")} placeholder="主角 / 反派 / 主角的师父" />
        </Field>
        <Field label="标签">
          <input className={fieldClass} maxLength={120} value={form.tags} onChange={set("tags")} placeholder="记者、雾镇人" />
        </Field>
        <Field label="外貌">
          <textarea className={areaClass} rows={3} maxLength={1000} value={form.appearance} onChange={set("appearance")} />
        </Field>
        <Field label="性格">
          <textarea className={areaClass} rows={3} maxLength={1000} value={form.personality} onChange={set("personality")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="档案" hint="经历、动机、秘密、人物关系">
            <textarea className={areaClass} rows={5} maxLength={4000} value={form.bio} onChange={set("bio")} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ======================= 设定库 ======================= */

const LORE_KINDS: { id: LoreKind; label: string }[] = [
  { id: "place", label: "地点" },
  { id: "item", label: "物品" },
  { id: "faction", label: "势力" },
  { id: "concept", label: "概念" },
  { id: "event", label: "事件" },
  { id: "other", label: "其他" },
];

export function LorePanel() {
  const desk = useDesk();
  const detail = desk.detail;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LoreKind | "all">("all");
  const [open, setOpen] = useState("");
  const [editing, setEditing] = useState<LoreEntry | "new" | null>(null);
  const entries = useMemo(() => {
    const q = query.trim();
    return (detail?.lore ?? []).filter((l) => (kind === "all" || l.kind === kind) && (!q || [l.name, l.summary, l.body, l.tags].some((f) => f.includes(q))));
  }, [detail?.lore, kind, query]);
  if (!detail) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="搜索设定" />
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" /> 新设定
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {[{ id: "all" as const, label: "全部" }, ...LORE_KINDS].map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn("h-6 rounded-md px-2 text-[12px]", kind === k.id ? "bg-accent text-accent-fg" : "bg-sunk text-mist hover:text-ink")}
            >
              {k.label}
              {k.id !== "all" ? <span className="ml-1 opacity-60">{detail.lore.filter((l) => l.kind === k.id).length || ""}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {entries.length === 0 ? <li className="py-10 text-center text-[13px] text-faint">{query || kind !== "all" ? "没有找到。" : "还没有设定。地名、门派、法宝、历史事件都可以记在这里。"}</li> : null}
        {entries.map((l) => (
          <li key={l.id} className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === l.id ? "" : l.id)}>
                <span className="flex items-center gap-1.5">
                  <Badge tone="accent">{LORE_KINDS.find((k) => k.id === l.kind)?.label}</Badge>
                  <span className="truncate text-[13px] font-medium text-ink">{l.name}</span>
                </span>
                {l.summary ? <span className="mt-0.5 block truncate text-[12px] text-mist">{l.summary}</span> : null}
              </button>
              <IconButton label={`插入「${l.name}」`} size="sm" onClick={() => insertName(desk, l.name)}>
                <CornerDownLeft className="size-3.5" />
              </IconButton>
              <IconButton label="编辑" size="sm" onClick={() => setEditing(l)}>
                <Pencil className="size-3.5" />
              </IconButton>
            </div>
            {open === l.id && (l.body || l.tags) ? (
              <div className="space-y-2 border-t border-line px-3 py-2.5 text-[12px] leading-relaxed">
                {l.body ? <p className="whitespace-pre-wrap text-ink">{l.body}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {splitTags(l.tags).map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? <LoreEditor entry={editing === "new" ? null : editing} defaultKind={kind === "all" ? "place" : kind} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function LoreEditor({ entry, defaultKind, onClose }: { entry: LoreEntry | null; defaultKind: LoreKind; onClose: () => void }) {
  const desk = useDesk();
  const [form, setForm] = useState({ kind: entry?.kind ?? defaultKind, name: entry?.name ?? "", summary: entry?.summary ?? "", body: entry?.body ?? "", tags: entry?.tags ?? "" });
  const submit = async () => {
    if (!form.name.trim()) return desk.fail("名字不能为空");
    const res = await call(desk, saveLoreEntry({ data: { novelId: desk.novelId, id: entry?.id, ...form, name: form.name.trim() } }), { refresh: false });
    if (!res) return;
    desk.patchDetail((d) => ({ ...d, lore: entry ? d.lore.map((l) => (l.id === res.entry.id ? res.entry : l)) : [...d.lore, res.entry] }));
    desk.note("设定已保存");
    onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={entry ? `编辑设定：${entry.name}` : "新设定"}
      wide
      footer={
        <>
          {entry ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:text-danger"
              onClick={() =>
                desk.ask({
                  title: `删除设定「${entry.name}」？`,
                  body: "删除后不能恢复。",
                  confirm: "删除",
                  danger: true,
                  onConfirm: async () => {
                    const res = await call(desk, removeLoreEntry({ data: { novelId: desk.novelId, loreId: entry.id } }));
                    if (!res) return;
                    desk.patchDetail((d) => ({ ...d, lore: d.lore.filter((l) => l.id !== entry.id) }));
                    onClose();
                  },
                })
              }
            >
              <Trash2 className="size-3.5" /> 删除
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented label="类别" value={form.kind} options={LORE_KINDS} onChange={(kind) => setForm((f) => ({ ...f, kind }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="名字">
            <input className={fieldClass} autoFocus maxLength={60} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="标签">
            <input className={fieldClass} maxLength={120} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </Field>
        </div>
        <Field label="一句话说明" hint="AI 工具会参考">
          <input className={fieldClass} maxLength={200} value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
        </Field>
        <Field label="详细设定">
          <textarea className={areaClass} rows={8} maxLength={8000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

/* ======================= 版本历史 ======================= */

const KIND_TONE: Record<ChapterVersionMeta["kind"], "plain" | "accent" | "ok" | "warn"> = { auto: "plain", manual: "accent", restore: "warn", ai: "ok" };

export function VersionsPanel() {
  const desk = useDesk();
  const chapterId = desk.selectedChapterId;
  const tick = useWriteState((s) => s.versionTick);
  const [list, setList] = useState<ChapterVersionMeta[] | null>(null);
  const [viewing, setViewing] = useState<ChapterVersion | null>(null);
  const chapter = desk.detail?.chapters.find((c) => c.id === chapterId);

  useEffect(() => {
    if (!chapterId || !desk.novelId) return;
    let dead = false;
    const t = window.setTimeout(() => {
      loadVersions({ data: { novelId: desk.novelId, chapterId } })
        .then((res) => {
          if (!dead && res.ok) setList(res.versions);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
  }, [chapterId, desk.novelId, tick]);

  if (!chapter) return <p className="p-6 text-center text-[13px] text-faint">先打开一章。</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line p-3">
        <p className="min-w-0 truncate text-[13px] text-mist">
          《{chapter.title}》 的历史版本
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await desk.editor.current?.flush();
            const res = await call(desk, keepVersion({ data: { novelId: desk.novelId, chapterId: chapter.id, label: "" } }), { refresh: false });
            if (res) {
              useWriteState.getState().bumpVersions();
              desk.note(res.version ? "已存为版本" : "和上一个版本相同，没有重复保存");
            }
          }}
        >
          <BookmarkPlus className="size-3.5" /> 存一版
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {list === null ? <li className="p-6 text-center text-[13px] text-faint">正在读取…</li> : null}
        {list?.length === 0 ? (
          <li className="p-6 text-center text-[13px] leading-relaxed text-faint">
            还没有版本。写作时每隔十分钟、或改动较大时会自动留一版；AI 替换前也会留一版。
          </li>
        ) : null}
        {list?.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
              onClick={async () => {
                const res = await call(desk, loadVersion({ data: { novelId: desk.novelId, versionId: v.id } }), { refresh: false });
                if (res) setViewing(res.version);
              }}
            >
              <History className="mt-0.5 size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Badge tone={KIND_TONE[v.kind]}>{VERSION_LABEL[v.kind]}</Badge>
                  <span className="truncate text-[13px] text-ink">{v.label || v.title}</span>
                </span>
                <span className="mt-0.5 block text-[11px] text-faint tabular-nums">
                  {formatTime(v.createdAt)} · {formatCount(v.words)} 字
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {viewing ? <VersionDiff version={viewing} onClose={() => setViewing(null)} onChanged={() => useWriteState.getState().bumpVersions()} /> : null}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `今天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function VersionDiff({ version, onClose, onChanged }: { version: ChapterVersion; onClose: () => void; onChanged: () => void }) {
  const desk = useDesk();
  const current = desk.editor.current?.chapterId === version.chapterId ? desk.editor.current.text() : (desk.detail?.chapters.find((c) => c.id === version.chapterId)?.body ?? "");
  const [mode, setMode] = useState<"diff" | "old">("diff");
  const rows = useMemo(() => diffText(version.body, current), [version.body, current]);
  const stats = useMemo(() => diffStats(version.body, current), [version.body, current]);
  const same = stats.added === 0 && stats.removed === 0;
  return (
    <Modal
      open
      wide
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={`${VERSION_LABEL[version.kind]} · ${formatTime(version.createdAt)}`}
      description={same ? "与当前正文相同。" : `与当前正文相比：当前多了 ${stats.added} 字，少了 ${stats.removed} 字。`}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-danger hover:text-danger"
            onClick={() =>
              desk.ask({
                title: "删除这个版本？",
                body: "只删除这份历史快照，不影响正文。",
                confirm: "删除版本",
                danger: true,
                onConfirm: async () => {
                  const res = await call(desk, dropVersion({ data: { novelId: desk.novelId, versionId: version.id } }), { refresh: false });
                  if (res) {
                    onChanged();
                    onClose();
                  }
                },
              })
            }
          >
            <Trash2 className="size-3.5" /> 删除版本
          </Button>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button
            disabled={same}
            onClick={() =>
              desk.ask({
                title: "恢复到这个版本？",
                body: "当前正文会先自动存成一个「恢复前」版本，随时可以再换回来。",
                confirm: "恢复",
                onConfirm: async () => {
                  await desk.editor.current?.flush();
                  const res = await call(desk, backToVersion({ data: { novelId: desk.novelId, versionId: version.id } }));
                  if (!res) return;
                  desk.patchDetail((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === res.chapter.id ? res.chapter : c)) }));
                  useWriteState.getState().reload();
                  onChanged();
                  onClose();
                  desk.note("已恢复，原来的正文存成了「恢复前」版本");
                },
              })
            }
          >
            <RotateCcw className="size-3.5" /> 恢复这个版本
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          label="查看方式"
          value={mode}
          onChange={setMode}
          options={[
            { id: "diff", label: "对比当前" },
            { id: "old", label: "只看此版本" },
          ]}
        />
        <span className="flex items-center gap-3 text-[12px] text-faint">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-del" /> 此版本有、当前没有
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-ins" /> 当前新增
          </span>
        </span>
      </div>
      <div className="manuscript max-h-[56vh] overflow-y-auto rounded-xl border border-line bg-page p-4 text-[15px]" style={{ lineHeight: 1.9 }}>
        {mode === "old" ? (
          <div className="whitespace-pre-wrap">{version.body || "（空）"}</div>
        ) : (
          rows.map((row, i) => {
            if (row.type === "equal") return <p key={i} className="whitespace-pre-wrap text-mist">{row.text || "\u00a0"}</p>;
            if (row.type === "insert") return <p key={i} className="rounded bg-ins whitespace-pre-wrap">{row.text || "\u00a0"}</p>;
            if (row.type === "delete") return <p key={i} className="rounded bg-del whitespace-pre-wrap line-through decoration-danger/40">{row.text || "\u00a0"}</p>;
            return (
              <p key={i} className="whitespace-pre-wrap">
                {row.parts.map((part, j) =>
                  part.type === "equal" ? (
                    <span key={j}>{part.text}</span>
                  ) : part.type === "insert" ? (
                    <ins key={j} className="rounded-sm bg-ins no-underline">
                      {part.text}
                    </ins>
                  ) : (
                    <del key={j} className="rounded-sm bg-del decoration-danger/40">
                      {part.text}
                    </del>
                  ),
                )}
              </p>
            );
          })
        )}
      </div>
    </Modal>
  );
}

