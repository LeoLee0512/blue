import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Cable, CalendarDays, Feather, Layers, ListTree, NotebookPen, PenLine, Puzzle, Quote, ScrollText, type LucideIcon } from "lucide-react";
import { GENRES, PLUGINS, SKILLS, VOICE_SKILLS } from "@/lib/novel/catalog";
import { countChars, childrenOf, downloadMarkdown, exportMarkdown, todayKey, openThreads, storyNet, threadPreview, chapterFact, driftNote, reviewSides } from "@/lib/novel/format";
import { exportMyShares } from "@/lib/novel/api"; // publishText 2026-11-02 下线
import type { OutlineNode } from "@/lib/novel/types";
import type { PaneId } from "@/components/desk";
import { useDesk } from "@/components/desk";
import { Button, Empty, Field, Switch, areaClass, fieldClass } from "@/components/ui";
import { LibraryHint } from "@/components/guide";
import { StudioBar } from "@/components/studio-bar";
import { NotesPane, PoetryPane } from "@/components/shelf"; // SharePane 2026-11-02 下线
import { cn } from "@/lib/cn";
import { modelOptions, PROVIDER_FAMILIES } from "@/lib/novel/model-whitelist";

// eslint-disable-next-line react-refresh/only-export-components -- nav table is shared with the panes in this file
export const NAV: { id: PaneId; label: string; icon: LucideIcon; mobile?: boolean }[] = [
  { id: "library", label: "书库", icon: BookOpen },
  { id: "studio", label: "工作台", icon: Feather },
  { id: "outline", label: "大纲", icon: ListTree },
  { id: "manuscript", label: "正文", icon: ScrollText },
  { id: "poetry", label: "诗歌", icon: Quote },
  { id: "notes", label: "手记", icon: NotebookPen },
  // { id: "share", label: "分享", icon: Library }, // 2026-11-02 分享架下线
  { id: "skills", label: "技能", icon: Layers },
  { id: "plugins", label: "插件", icon: Puzzle },
  { id: "connect", label: "模型连接", icon: Cable }, // 2026-11-04 原名「连接」
  { id: "stats", label: "日历", icon: CalendarDays },
  { id: "agent", label: "代理", icon: PenLine, mobile: true },
];

export function NavList({ stacked }: { stacked?: boolean }) {
  const { pane, setPane } = useDesk();
  const shown = stacked ? NAV.filter((item) => item.id !== "agent") : NAV;
  return (
    <div className={stacked ? "space-y-1" : "flex gap-1"}>
      {shown.map((item) => {
        const Icon = item.icon;
        const active = pane === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setPane(item.id)}
            className={cn(
              "flex min-h-11 items-center gap-2 px-3 text-sm",
              stacked ? "w-full" : "shrink-0",
              active ? "font-medium text-ink" : "text-mist hover:text-ink",
              !stacked && item.id === "agent" ? "lg:hidden" : "",
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function NovelList() {
  const { account, novelId, selectNovel, setPane, setCreating } = useDesk();
  const novels = account?.novels ?? [];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-mist">作品</p>
        <button
          type="button"
          className="min-h-11 px-2 text-sm text-faint hover:text-ink"
          onClick={() => {
            setCreating(true);
            setPane("library");
          }}
        >
          新作品
        </button>
      </div>
      {novels.length === 0 ? <p className="px-1 text-sm text-faint">还没有书。</p> : null}
      {novels.map((novel) => (
        <button
          key={novel.id}
          type="button"
          onClick={() => selectNovel(novel.id)}
          className={cn("block w-full px-3 py-2 text-left", novel.id === novelId ? "text-ink" : "text-mist hover:text-ink")}
        >
          <span className="block truncate text-sm font-medium">{novel.title}</span>
          <span className="block truncate text-sm text-mist">
            {novel.genre || "未定类型"}
            {openThreads(novel.ledger) ? ` · 未收 ${openThreads(novel.ledger)} 条` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Center() {
  const { pane } = useDesk();
  if (pane === "studio") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="lg:hidden">
          <StudioBar />
        </div>
        <ManuscriptPane />
      </div>
    );
  }
  if (pane === "outline") return <OutlinePane />;
  if (pane === "manuscript" || pane === "review" || pane === "net" || pane === "people") return <ManuscriptPane />;
  if (pane === "poetry") return <PoetryPane />;
  if (pane === "notes") return <NotesPane />;
  // if (pane === "share") return <SharePane />; // 2026-11-02 分享架下线
  // 2026-11-01 全免费：套餐页下线，plan/billing 回落到书库。
  if (pane === "skills") return <SkillsPane />;
  if (pane === "plugins") return <PluginsPane />;
  if (pane === "connect") return <ConnectPane />;
  if (pane === "stats") return <StatsPane />;
  return <LibraryPane />;
}

function NeedBook({ children }: { children: React.ReactNode }) {
  const { detail, setPane } = useDesk();
  if (detail) return <>{children}</>;
  return (
    <Empty title="还没有打开的作品" body="先在书库里写下一句。">
      <Button onClick={() => setPane("library")}>去书库</Button>
    </Empty>
  );
}

function BookSide() {
  const desk = useDesk();
  const detail = desk.detail;
  const [personId, setPersonId] = useState("");
  const [adding, setAdding] = useState(false);
  if (!detail) return null;
  const note = driftNote(detail.characters, detail.chapters, detail.novel.ledger);
  const sides = reviewSides(detail.novel.commentary);
  const threads = threadPreview(detail.novel.ledger);
  const facts = detail.chapters
    .map((chapter) => ({ title: chapter.title, fact: chapterFact(chapter) }))
    .filter((item) => item.fact);
  return (
    <aside className="w-full shrink-0 space-y-8 lg:w-72">
      {note ? <p className="font-serif text-sm leading-relaxed text-ink">{note}</p> : null}
      {detail.novel.soFar ? <p className="text-sm leading-relaxed text-faint">到这里为止 {detail.novel.soFar}</p> : null}
      {threads ? (
        <div>
          <p className="text-sm text-faint">未收的线</p>
          <p className="mt-2 whitespace-pre-wrap font-serif text-sm leading-relaxed text-mist">{threads}</p>
        </div>
      ) : null}
      {facts.length ? (
        <div>
          <p className="text-sm text-faint">不能改的事实</p>
          <ul className="mt-2 space-y-2">
            {facts.slice(-3).map((item) => (
              <li key={item.title} className="font-serif text-sm leading-relaxed text-mist">
                《{item.title}》{item.fact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-faint">评书</p>
          <button type="button" className="min-h-11 text-sm text-faint hover:text-ink" disabled={desk.busy} onClick={() => void desk.review()}>
            {desk.busy ? "在听" : "评这一回"}
          </button>
        </div>
        {sides.want ? <p className="font-serif text-sm leading-relaxed text-ink">{sides.want}</p> : null}
        {sides.loose ? <p className="mt-2 font-serif text-sm leading-relaxed text-mist">{sides.loose}</p> : null}
        {!sides.want && !sides.loose ? <p className="text-sm text-faint">还没评过。</p> : null}
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-faint">人物</p>
          <button
            type="button"
            className="min-h-11 text-sm text-faint hover:text-ink"
            onClick={() => {
              setPersonId("");
              setAdding(true);
            }}
          >
            新人
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {detail.characters.map((person) => (
            <button
              key={person.id}
              type="button"
              className={cn("min-h-11 text-sm", personId === person.id ? "text-ink underline underline-offset-4" : "text-mist hover:text-ink")}
              onClick={() => {
                setAdding(false);
                setPersonId(personId === person.id ? "" : person.id);
              }}
            >
              {person.name}
            </button>
          ))}
        </div>
        {personId ? <PersonFold personId={personId} onGone={() => setPersonId("")} /> : null}
        {adding ? <PersonForm onDone={() => setAdding(false)} /> : null}
      </div>
      {/* 2026-11-01 全免费：「这一页是送的」提示已下线。 */}
    </aside>
  );
}

function PersonFold({ personId, onGone }: { personId: string; onGone: () => void }) {
  const desk = useDesk();
  const person = desk.detail?.characters.find((item) => item.id === personId);
  const [role, setRole] = useState(person?.role ?? "");
  const [bio, setBio] = useState(person?.bio ?? "");
  useEffect(() => {
    setRole(person?.role ?? "");
    setBio(person?.bio ?? "");
  }, [person?.id, person?.role, person?.bio]);
  if (!person || !desk.detail) return null;
  const chapters = desk.detail.chapters.filter((chapter) => chapter.body.includes(person.name) || chapter.title.includes(person.name));
  const threads = threadPreview(desk.detail.novel.ledger)
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.includes(person.name));
  const others = storyNet({ characters: desk.detail.characters, chapters: desk.detail.chapters, ledger: desk.detail.novel.ledger }).links
    .filter((link) => link.from === `p:${person.id}` || link.to === `p:${person.id}`)
    .map((link) => (link.from === `p:${person.id}` ? link.to : link.from))
    .filter((id) => id.startsWith("p:"))
    .map((id) => desk.detail?.characters.find((item) => item.id === id.slice(2))?.name)
    .filter((name): name is string => Boolean(name));
  return (
    <div className="mt-3 space-y-3">
      {chapters.length ? <p className="text-sm leading-relaxed text-mist">出现在 {chapters.map((chapter) => chapter.title).join("、")}</p> : <p className="text-sm text-faint">还没在正文里出现。</p>}
      {threads.length ? <p className="text-sm leading-relaxed text-mist">{threads.join("；")}</p> : null}
      {others.length ? <p className="text-sm leading-relaxed text-mist">与 {others.join("、")} 有关</p> : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void desk.savePerson({ id: person.id, name: person.name, role, bio });
        }}
      >
        <Field label="身份">
          <input className={fieldClass} value={role} onChange={(event) => setRole(event.target.value)} />
        </Field>
        <Field label="档案">
          <textarea className={areaClass} rows={4} value={bio} onChange={(event) => setBio(event.target.value)} />
        </Field>
        <div className="flex gap-4">
          <Button type="submit" variant="quiet" disabled={desk.busy}>
            保存
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              onGone();
              void desk.destroyPerson(person.id);
            }}
          >
            删除
          </Button>
        </div>
      </form>
    </div>
  );
}

function PersonForm({ onDone }: { onDone: () => void }) {
  const desk = useDesk();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void desk.savePerson({ name, role, bio }).then(onDone);
      }}
    >
      <Field label="姓名">
        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label="身份">
        <input className={fieldClass} value={role} onChange={(event) => setRole(event.target.value)} />
      </Field>
      <Field label="档案">
        <textarea className={areaClass} rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />
      </Field>
      <Button type="submit" variant="quiet" disabled={desk.busy}>
        保存
      </Button>
    </form>
  );
}

function LibraryPane() {
  const desk = useDesk();
  const novel = desk.detail?.novel;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {(desk.account?.novels.length ?? 0) > 0 ? <LibraryHint /> : null}
      {desk.creating || !novel ? <CreateForm /> : <EditForm />}
      <div className="mt-8 lg:hidden">
        <NovelList />
      </div>
    </div>
  );
}

function CreateForm() {
  const desk = useDesk();
  const [line, setLine] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<string>(GENRES[0]);
  const [logline, setLogline] = useState("");
  const first = (desk.account?.novels.length ?? 0) === 0;
  return (
    <div className={first ? "space-y-16 pt-10" : "space-y-16"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void desk.seedLine(line);
        }}
      >
        <label className="block">
          <span className="sr-only">一句话</span>
          <textarea
            className="w-full resize-none bg-transparent font-serif text-4xl leading-snug text-ink outline-none placeholder:text-faint"
            rows={3}
            placeholder="写下一句"
            value={line}
            onChange={(event) => setLine(event.target.value)}
            required
          />
        </label>
        <Button className="mt-8" type="submit" disabled={desk.busy || line.trim().length < 4}>
          起稿
        </Button>
        {first ? <p className="mt-6 text-sm leading-relaxed text-mist">蓝稿接两句，就停。</p> : null}
      </form>
      {first ? null : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void desk.createWork({ title, genre, logline });
          }}
        >
          <p className="text-sm text-faint">自己填书名</p>
          <Field label="书名">
            <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <GenreRow genre={genre} onChange={setGenre} />
          <Field label="一句话">
            <textarea className={areaClass} rows={3} value={logline} onChange={(event) => setLogline(event.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="quiet" disabled={desk.busy}>
              创建
            </Button>
            {desk.detail ? (
              <Button variant="quiet" onClick={() => desk.setCreating(false)}>
                取消
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

function EditForm() {
  const desk = useDesk();
  const novel = desk.detail?.novel;
  const [title, setTitle] = useState(novel?.title ?? "");
  const [genre, setGenre] = useState(novel?.genre || GENRES[0]);
  const [logline, setLogline] = useState(novel?.logline ?? "");
  const [premise, setPremise] = useState(novel?.premise ?? "");
  const [styleNotes, setStyleNotes] = useState(novel?.styleNotes ?? "");
  const [soFar, setSoFar] = useState(novel?.soFar ?? "");
  const [ledger, setLedger] = useState(novel?.ledger ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(novel?.title ?? "");
    setGenre(novel?.genre || GENRES[0]);
    setLogline(novel?.logline ?? "");
    setPremise(novel?.premise ?? "");
    setStyleNotes(novel?.styleNotes ?? "");
    setSoFar(novel?.soFar ?? "");
    setLedger(novel?.ledger ?? "");
    setConfirmDelete(false);
  }, [novel?.id, novel?.updatedAt, novel?.title, novel?.genre, novel?.logline, novel?.premise, novel?.styleNotes, novel?.soFar, novel?.ledger]);

  if (!novel) return null;
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void desk.saveStory({ title, genre, logline, premise, styleNotes, soFar, ledger });
      }}
    >
      <p className="text-sm text-mist">
        {desk.detail?.outline.length ?? 0} 个大纲节点 · {desk.detail?.chapters.length ?? 0} 章 · {desk.detail?.characters.length ?? 0} 人
      </p>
      <Field label="书名">
        <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <GenreRow genre={genre} onChange={setGenre} />
      <Field label="一句话">
        <textarea className={areaClass} rows={2} value={logline} onChange={(event) => setLogline(event.target.value)} />
      </Field>
      <Field label="故事核">
        <textarea className={areaClass} rows={5} value={premise} onChange={(event) => setPremise(event.target.value)} />
      </Field>
      <Field label="文风">
        <textarea className={areaClass} rows={3} value={styleNotes} onChange={(event) => setStyleNotes(event.target.value)} />
      </Field>
      <Field label="到这里为止">
        <textarea className={areaClass} rows={4} value={soFar} onChange={(event) => setSoFar(event.target.value)} />
      </Field>
      <Field label="手里的线">
        <textarea className={areaClass} rows={6} value={ledger} onChange={(event) => setLedger(event.target.value)} placeholder={"作者知道\n- \n\n未收的线\n- 物件｜埋在哪｜打算在哪收回\n\n人物此刻\n- "} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={desk.busy}>
          保存故事核
        </Button>
        <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
          删除这部
        </Button>
      </div>
      {confirmDelete ? (
        <div className="flex flex-wrap items-center gap-2 py-2">
          <p className="text-sm">删除后不能恢复。</p>
          <Button
            variant="quiet"
            onClick={() => {
              setConfirmDelete(false);
              void desk.destroyWork();
            }}
          >
            确认删除
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            留下
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function GenreRow({ genre, onChange }: { genre: string; onChange: (genre: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn("min-h-11 px-1 text-sm", item === genre ? "text-ink underline decoration-ink underline-offset-4" : "text-faint hover:text-mist")}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function OutlinePane() {
  const desk = useDesk();
  const nodes = desk.detail?.outline ?? [];
  const selected = nodes.find((node) => node.id === desk.selectedNodeId) ?? null;
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [mark, setMark] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const [armed, setArmed] = useState(false);
  const edited = useRef(false);
  const seen = useRef("");
  const gen = useRef(0);
  const saveRef = useRef(desk.saveNode);
  saveRef.current = desk.saveNode;

  if (selected && seen.current !== selected.id) {
    seen.current = selected.id;
    edited.current = false;
    setTitle(selected.title);
    setSummary(selected.summary);
    setMark("");
    setArmDelete(false);
  }

  const selectedId = selected?.id ?? "";
  const selectedTitle = selected?.title ?? "";
  const selectedSummary = selected?.summary ?? "";
  const selectedParentId = selected?.parentId ?? null;
  const selectedKind = selected?.kind ?? "chapter";
  useEffect(() => {
    if (!selectedId || edited.current) return;
    setTitle(selectedTitle);
    setSummary(selectedSummary);
  }, [selectedId, selectedTitle, selectedSummary]);

  useEffect(() => {
    if (!selectedId || !edited.current) return;
    const mine = ++gen.current;
    const payload = { id: selectedId, parentId: selectedParentId, kind: selectedKind, title, summary };
    const handle = window.setTimeout(() => {
      void saveRef.current(payload, { quiet: true }).then((ok) => {
        if (gen.current !== mine) return;
        edited.current = false;
        if (ok) setMark("已记下");
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [title, summary, selectedId, selectedParentId, selectedKind]);

  return (
    <NeedBook>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" onClick={() => void desk.saveNode({ kind: "volume", title: "新的一卷", summary: "", parentId: null }, { quiet: true })}>
            添加卷
          </Button>
          <Button variant="quiet" onClick={() => void desk.saveNode({ kind: "chapter", title: "新的一章", summary: "", parentId: parentFor("chapter", selected) }, { quiet: true })}>
            添加章
          </Button>
          <Button variant="quiet" onClick={() => void desk.saveNode({ kind: "beat", title: "新的节拍", summary: "", parentId: parentFor("beat", selected) }, { quiet: true })}>
            添加节拍
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void desk.plantTemplate(armed).then((result) => setArmed(result === "confirm"));
            }}
          >
            {armed ? "再点一次，替换现有大纲" : "放入三幕空表"}
          </Button>
        </div>
        {nodes.length === 0 ? (
          <Empty title="大纲还是空的" body="放一张三幕空表，或让代理按故事核来建。点开一节就能改。" />
        ) : (
          <ul className="mt-4">
            {renderNodes(nodes, null, 0, {
              selectedId: desk.selectedNodeId,
              title,
              summary,
              mark,
              armDelete,
              onSelect: desk.setSelectedNodeId,
              onTitle: (value) => {
                edited.current = true;
                setMark("");
                setTitle(value);
              },
              onSummary: (value) => {
                edited.current = true;
                setMark("");
                setSummary(value);
              },
              onDelete: () => {
                if (!selected) return;
                if (!armDelete) {
                  setArmDelete(true);
                  return;
                }
                void desk.destroyNode(selected.id);
              },
            })}
          </ul>
        )}
      </div>
    </NeedBook>
  );
}

function renderNodes(
  nodes: OutlineNode[],
  parentId: string | null,
  depth: number,
  editor: {
    selectedId: string;
    title: string;
    summary: string;
    mark: string;
    armDelete: boolean;
    onSelect: (id: string) => void;
    onTitle: (value: string) => void;
    onSummary: (value: string) => void;
    onDelete: () => void;
  },
) {
  const pad = depth === 0 ? "pl-2" : depth === 1 ? "pl-6" : depth === 2 ? "pl-10" : "pl-14";
  return childrenOf(nodes, parentId).map((node) => (
    <li key={node.id}>
      {node.id === editor.selectedId ? (
        <div className={cn("py-2 pr-2", pad)}>
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-faint">{kindMark(node.kind)}</span>
            <input
              className="w-full border-0 bg-transparent text-sm font-medium text-ink outline-none"
              value={editor.title}
              onChange={(event) => editor.onTitle(event.target.value)}
            />
          </div>
          <textarea
            className="mt-1 w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-mist outline-none"
            rows={2}
            placeholder="这一节要发生什么"
            value={editor.summary}
            onChange={(event) => editor.onSummary(event.target.value)}
          />
          <div className="mt-1 flex items-center gap-3">
            <span className="text-sm text-faint">{editor.mark}</span>
            <button type="button" className="text-sm text-faint hover:text-ink" onClick={editor.onDelete}>
              {editor.armDelete ? "再点一次删除" : "删除"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => editor.onSelect(node.id)}
          className={cn("flex min-h-11 w-full items-start py-2 pr-2 text-left text-mist hover:text-ink", pad)}
        >
          <span>
            <span className="block text-sm font-medium">
              {kindMark(node.kind)} {node.title}
              {node.status === "written" ? <span className="ml-2 text-sm font-normal text-faint">已写</span> : null}
            </span>
            {node.summary ? <span className="mt-1 block text-sm leading-relaxed text-mist">{node.summary}</span> : null}
          </span>
        </button>
      )}
      <ul>{renderNodes(nodes, node.id, depth + 1, editor)}</ul>
    </li>
  ));
}

function kindMark(kind: string) {
  if (kind === "volume") return "卷";
  if (kind === "chapter") return "章";
  return "拍";
}

function parentFor(kind: "chapter" | "beat", selected: OutlineNode | null): string | null {
  if (!selected) return null;
  if (kind === "chapter") {
    if (selected.kind === "volume") return selected.id;
    return selected.parentId;
  }
  if (selected.kind === "chapter" || selected.kind === "volume") return selected.id;
  return selected.parentId;
}

function ManuscriptPane() {
  const desk = useDesk();
  const chapters = desk.detail?.chapters ?? [];
  const selected = chapters.find((chapter) => chapter.id === desk.selectedChapterId) ?? chapters[0] ?? null;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mark, setMark] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const edited = useRef(false);
  const seen = useRef("");
  const gen = useRef(0);
  const saveRef = useRef(desk.saveChapter);
  saveRef.current = desk.saveChapter;

  if (selected && seen.current !== selected.id) {
    seen.current = selected.id;
    edited.current = false;
    setTitle(selected.title);
    setBody(selected.body);
    setMark("");
    setArmDelete(false);
  }

  const selectedId = selected?.id ?? "";
  const selectedTitle = selected?.title ?? "";
  const selectedBody = selected?.body ?? "";
  useEffect(() => {
    if (!selectedId || edited.current) return;
    setTitle(selectedTitle);
    setBody(selectedBody);
  }, [selectedId, selectedTitle, selectedBody]);

  useEffect(() => {
    if (!selectedId || !edited.current) return;
    const mine = ++gen.current;
    const payload = { id: selectedId, title, body };
    const handle = window.setTimeout(() => {
      void saveRef.current(payload, { quiet: true }).then((ok) => {
        if (gen.current !== mine) return;
        edited.current = false;
        if (ok) setMark("已记下");
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [title, body, selectedId]);

  return (
    <NeedBook>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-8 lg:flex-row">
        <div className="flex min-h-0 w-full max-w-[35em] flex-1 flex-col text-lg">
        <div className="flex items-baseline gap-5 overflow-x-auto font-sans">
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => desk.setSelectedChapterId(chapter.id)}
              className={cn("shrink-0 py-2 text-sm", selected?.id === chapter.id ? "text-ink" : "text-faint hover:text-mist")}
            >
              {chapter.title}
            </button>
          ))}
          <button
            type="button"
            className="shrink-0 py-2 text-sm text-faint hover:text-mist"
            onClick={() => void desk.saveChapter({ title: "未命名章节", body: "" }, { quiet: true })}
          >
            新章节
          </button>
        </div>
        {selected ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <input
              className="w-full border-0 bg-transparent font-serif text-3xl text-ink outline-none"
              value={title}
              onChange={(event) => {
                edited.current = true;
                setMark("");
                setTitle(event.target.value);
              }}
            />
            <textarea
              className="mt-4 min-h-64 w-full flex-1 resize-none border-0 bg-transparent font-serif text-lg leading-[1.9] text-ink outline-none"
              value={body}
              onChange={(event) => {
                edited.current = true;
                setMark("");
                setBody(event.target.value);
              }}
            />
            <div className="mt-4 flex items-center justify-between gap-3 font-sans">
              <p className="text-sm text-faint">
                <span className="tabular-nums">{countChars(body)} 字</span>
                {mark ? <span className="ml-3">{mark}</span> : null}
              </p>
              <div className="flex items-center gap-4">
              {/* 2026-11-02 分享架下线，原「放到架上」按钮见 panes.tsx.bak_20261102_sam_b2 */}
              <button
                type="button"
                className="text-sm text-faint hover:text-ink"
                onClick={() => {
                  if (!armDelete) {
                    setArmDelete(true);
                    return;
                  }
                  void desk.destroyChapter(selected.id);
                }}
              >
                {armDelete ? "再点一次删除" : "删除"}
              </button>
              </div>
            </div>
          </div>
        ) : (
          <Empty title="还没有章节" body="从空页写起，或让代理按大纲落一章。" />
        )}
        </div>
        <BookSide />
      </div>
    </NeedBook>
  );
}

function SkillsPane() {
  const { account, toggleSkill } = useDesk();
  const on = new Set(account?.settings.skills ?? []);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h2 className="font-serif text-3xl">技能</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">打开的技能会写进代理的工作说明。风格画像和笔触来自你上传的作品，写小说时始终启用。</p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {VOICE_SKILLS.map((skill) => {
          const text = skill.id === "portrait" ? account?.voice.portrait : account?.voice.touch;
          const ready = Boolean(text && !text.includes("还没有"));
          return (
            <li key={skill.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-medium">{skill.name}</p>
                <p className="mt-1 text-sm text-mist">
                  {skill.file} · {skill.blurb}
                </p>
              </div>
              <span className="shrink-0 text-sm text-faint">{ready ? "已启用" : "待上传"}</span>
            </li>
          );
        })}
        {SKILLS.map((skill) => (
          <li key={skill.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium">{skill.name}</p>
              <p className="mt-1 text-sm text-mist">{skill.blurb}</p>
            </div>
            <Switch on={on.has(skill.id)} label={skill.name} onToggle={() => void toggleSkill(skill.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PluginsPane() {
  const desk = useDesk();
  const on = new Set(desk.account?.settings.plugins ?? []);
  const detail = desk.detail;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h2 className="font-serif text-3xl">插件</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">插件改变代理怎么组织故事，或给你一份可以带走的稿。</p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {PLUGINS.map((plugin) => (
          <li key={plugin.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium">{plugin.name}</p>
              <p className="mt-1 text-sm text-mist">{plugin.blurb}</p>
            </div>
            <Switch on={on.has(plugin.id)} label={plugin.name} onToggle={() => void desk.togglePlugin(plugin.id)} />
          </li>
        ))}
      </ul>
      {on.has("export") && detail ? (
        <Button
          className="mt-6"
          variant="quiet"
          onClick={() => {
            downloadMarkdown(`${detail.novel.title}.md`, exportMarkdown(detail));
          }}
        >
          带走这部作品
        </Button>
      ) : null}
    </div>
  );
}

// 2026-11-04 Sam：连接页按 Mia 白名单版设计稿改为下拉选择。旧实现保留在下方注释里（亦见 panes.tsx.bak_20261104_sam_ui）。
function ConnectPane() {
  const desk = useDesk();
  const settings = desk.account?.settings;
  const conn = settings?.connection;
  const [familyId, setFamilyId] = useState(conn?.familyId || "");
  const [modelValue, setModelValue] = useState(conn?.entryId && conn.modelId ? `${conn.entryId}|${conn.modelId}` : "");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    setFamilyId(conn?.familyId || "");
    setModelValue(conn?.entryId && conn.modelId ? `${conn.entryId}|${conn.modelId}` : "");
    setApiKey("");
  }, [conn?.state, conn?.familyId, conn?.entryId, conn?.modelId, settings?.keyMask]);

  const family = PROVIDER_FAMILIES.find((f) => f.id === familyId);
  const options = familyId ? modelOptions(familyId) : [];
  const picked = options.find((o) => o.value === modelValue);
  // 已存的是同一家（主机名相同）时密钥可沿用；换了服务商必须重填（服务端同样强制）。
  const savedFamily = conn && (conn.state === "ok" || conn.state === "needs_key" || conn.state === "model_blocked") ? conn.familyId : "";
  const keyReusable = Boolean(settings?.hasKey) && savedFamily !== "" && savedFamily === familyId;
  const switched = Boolean(settings?.hasKey) && familyId !== "" && !keyReusable;
  const needKey = !keyReusable && !apiKey.trim();
  const blocker = !familyId ? "请先选择服务商" : !picked ? "请选择模型" : needKey ? (switched ? "更换了服务商，需要重新填写密钥" : "请填写密钥") : "";

  const save = async () => {
    if (!picked) return null;
    const keyAction = apiKey.trim() ? "set" : "keep";
    const res = await desk.saveLink({ providerId: picked.entryId, modelId: picked.model, keyAction, apiKey: apiKey.trim() });
    if (!res.ok) setResult({ tone: "bad", text: res.error });
    return res;
  };

  return (
    <form
      className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        void save().then((res) => res?.ok && setResult({ tone: "ok", text: "已保存。" }));
      }}
    >
      <div>
        <h2 className="font-serif text-3xl">模型连接</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">蓝稿不提供模型，请从下面的名单里选择服务商和模型，并填写你在该服务商申请的密钥。调用费用由服务商直接向你收取。</p>
      </div>

      {conn?.state === "legacy_blocked" ? (
        <div role="alert" className="space-y-1 rounded border border-amber-300 p-3 text-sm leading-relaxed text-amber-800">
          <p>你之前保存的服务商不在当前可用名单里，AI 功能暂时不可用。你的作品没有受影响，请重新选择服务商。</p>
          <p className="text-faint">旧设置：{conn.legacy?.host}{conn.legacy?.model ? ` · ${conn.legacy.model}` : ""}（已保留，不会再被调用）</p>
        </div>
      ) : conn?.state === "model_blocked" ? (
        <p role="alert" className="rounded border border-amber-300 p-3 text-sm leading-relaxed text-amber-800">
          你之前使用的模型「{conn.legacy?.model || "（空）"}」不在可选列表里，请重新选择一个模型。服务商和密钥可以沿用。
        </p>
      ) : conn?.state === "needs_key" ? (
        <p role="alert" className="rounded border border-amber-300 p-3 text-sm leading-relaxed text-amber-800">还差密钥：填写后保存即可使用。</p>
      ) : null}

      {conn?.state === "ok" ? (
        <div className="rounded border border-line p-3 text-sm leading-relaxed">
          <p>当前连接：{PROVIDER_FAMILIES.find((f) => f.id === conn.familyId)?.displayName} · {conn.modelId}</p>
          <p className="text-faint">密钥 {settings?.keyMask}</p>
        </div>
      ) : null}

      <Field label="服务商">
        <select
          className={fieldClass}
          value={familyId}
          onChange={(event) => {
            setFamilyId(event.target.value);
            setModelValue("");
            setResult(null);
          }}
        >
          <option value="">请选择服务商</option>
          {PROVIDER_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="模型">
        <select className={fieldClass} value={modelValue} disabled={!familyId} onChange={(event) => setModelValue(event.target.value)}>
          <option value="">{familyId ? "请选择模型" : "先选择服务商"}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {family ? (
        <div className="space-y-1 rounded border border-line p-3 text-sm leading-relaxed text-mist">
          <p className="text-ink">备案信息</p>
          {family.filings.map((f) => (
            <p key={f.no}>
              {f.name} · 备案号 {f.no}
            </p>
          ))}
          <p className="text-faint">信息来自国家网信办公布的生成式人工智能服务备案名单，核对日期 {family.filingsCheckedAt}。</p>
          {family.aggregator ? <p className="text-faint">这是一个模型平台，名单里只列出该平台自有的已备案模型。</p> : null}
          <p className="pt-1"><Link to="/about" className="underline-offset-4 hover:underline">查看全部服务商的备案信息</Link></p>
        </div>
      ) : null}

      <Field label={keyReusable ? `密钥 ${settings?.keyMask}` : family?.keyLabelNote ? `密钥（${family.keyLabelNote}）` : "密钥"}>
        <input
          className={fieldClass}
          type="password"
          placeholder={keyReusable ? "留空则沿用已存密钥" : "填写在该服务商申请的密钥"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
        />
      </Field>
      {switched ? <p className="text-sm text-amber-700">更换了服务商，需要重新填写密钥。旧密钥不会发给新的服务商。</p> : null}
      <p className="text-sm leading-relaxed text-faint">密钥加密保存在你的账户里，不会回显，只用于向你选的服务商发送请求。</p>

      {result ? (
        <p role="status" className={cn("text-sm leading-relaxed", result.tone === "ok" ? "text-emerald-700" : "text-amber-700")}>
          {result.text}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={desk.busy || Boolean(blocker)}>
          保存
        </Button>
        <Button
          variant="quiet"
          disabled={desk.busy || Boolean(blocker)}
          onClick={() => {
            setResult(null);
            void (async () => {
              const saved = await save();
              if (!saved?.ok) return;
              const res = await desk.testLink();
              setResult(res.ok ? { tone: "ok", text: "已保存，连接正常。" } : { tone: "bad", text: `已保存，但测试没有通过：${res.error}` });
            })();
          }}
        >
          保存并测试
        </Button>
        {blocker ? <span className="text-sm text-faint">{blocker}</span> : null}
      </div>
      <ExportSharesZone />
    </form>
  );
}

/* 2026-11-04 之前的连接页（自由填写接口地址和模型名）：
function ConnectPane() {
  const desk = useDesk();
  const settings = desk.account?.settings;
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl || "");
  const [model, setModel] = useState(settings?.model || "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);

  useEffect(() => {
    setBaseUrl(settings?.baseUrl || "");
    setModel(settings?.model || "");
    setApiKey("");
    setClearKey(false);
  }, [settings?.baseUrl, settings?.model, settings?.keyMask]);

  // 2026-11-01：DeepSeek 预设按钮已下线（原代码见 panes.tsx.bak_20261101_sam_c1）。

  return (
    <form
      className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        const keyAction = clearKey ? "clear" : apiKey.trim() ? "set" : "keep";
        void desk.saveLink({ provider: "custom", baseUrl, model, keyAction, apiKey: apiKey.trim() });
      }}
    >
      <div>
        <h2 className="font-serif text-3xl">连接</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">只接你自己的模型 API，没有托管模型，也没有默认模型。请填写服务商给你的接口地址、模型名和密钥；调用费用由服务商直接向你收取。</p>
      </div>
      {settings && (settings.baseUrl || settings.model) && !settings.usable ? (
        // 2026-11-04 Sam：旧设置保留但不在白名单里，明确告诉用户当前不可用（下拉选择留到连接页改版）。
        <p role="alert" className="text-sm leading-relaxed text-amber-700">当前保存的接口地址和模型不在可用名单里，暂时无法调用。请改填名单内的服务商地址和模型名。</p>
      ) : null}
      <Field label="接口地址">
        <input className={fieldClass} placeholder="例如 https://你的服务商地址/v1" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} autoComplete="off" />
      </Field>
      <Field label="模型名">
        <input className={fieldClass} placeholder="服务商提供的模型名" value={model} onChange={(event) => setModel(event.target.value)} />
      </Field>
      <Field label={settings?.hasKey ? `密钥 ${settings.keyMask}` : "密钥"}>
        <input
          className={fieldClass}
          type="password"
          placeholder={settings?.hasKey ? "留空则保持原密钥" : "只保存在你的账户里"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
        />
      </Field>
      {settings?.hasKey ? (
        <label className="flex min-h-11 items-center gap-2 text-sm text-mist">
          <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
          清除已存密钥
        </label>
      ) : null}
      <p className="text-sm leading-relaxed text-faint">说明和工具固定在前面，这一轮的稿面放在末尾。只接受公开的 https。密钥不再回显。</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={desk.busy}>
          保存连接
        </Button>
        <Button variant="quiet" onClick={() => void desk.testLink()}>
          测试连接
        </Button>
      </div>
      <ExportSharesZone />
      <DeleteAccountZone />
    </form>
  );
}
*/

function StatsPane() {
  const usage = useDesk().account?.usage ?? [];
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [picked, setPicked] = useState(() => todayKey());
  const byDay = new Map(usage.map((day) => [day.day, day]));
  const [year, monthIndex] = month.split("-").map(Number);
  const count = new Date(year, monthIndex, 0).getDate();
  const pad = (new Date(`${month}-01T12:00:00+08:00`).getUTCDay() + 6) % 7;
  const cells = [...Array(pad).fill(0), ...Array.from({ length: count }, (_, index) => index + 1)];
  const inMonth = usage.filter((day) => day.day.startsWith(month));
  const sum = inMonth.reduce(
    (total, day) => ({
      tokens: total.tokens + day.tokens,
      userChars: total.userChars + day.userChars,
      aiChars: total.aiChars + day.aiChars,
    }),
    { tokens: 0, userChars: 0, aiChars: 0 },
  );
  const chosen = byDay.get(picked);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-3xl">日历</h2>
        <div className="flex gap-4 text-sm text-faint">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}>
            上个月
          </button>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))}>
            下个月
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-mist">
        {year} 年 {monthIndex} 月 · Token {sum.tokens} · 你写了 {sum.userChars} 字 · 蓝稿写了 {sum.aiChars} 字
      </p>
      <div className="mt-6 grid grid-cols-7 gap-1 text-center text-sm">
        {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
          <span key={label} className="py-1 text-faint">
            {label}
          </span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const hit = byDay.get(key);
          const active = key === picked;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(key)}
              className={`min-h-11 ${active ? "text-ink underline underline-offset-4" : hit ? "text-ink" : "text-faint"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-8 space-y-2 text-sm leading-relaxed text-mist">
        <p className="font-serif text-xl text-ink">{picked}</p>
        <p>Token {chosen?.tokens ?? 0}</p>
        <p>你写了 {chosen?.userChars ?? 0} 字</p>
        <p>蓝稿写了 {chosen?.aiChars ?? 0} 字</p>
      </div>
    </div>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}


// 2026-11-02：分享架下线后，作者导出自己发布过的分享。
function ExportSharesZone() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function onExport() {
    setError("");
    setPending(true);
    try {
      const result = await exportMyShares();
      if (!result.ok) return setError(result.error);
      downloadMarkdown("我的分享.md", result.markdown);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-10 border-t border-line pt-6">
      <h3 className="font-serif text-xl">导出我的分享</h3>
      <p className="mt-2 text-sm leading-relaxed text-mist">分享架已下线。你以前放到架上的内容，可以在这里导出发布时的版本。</p>
      {error ? <p className="mt-2 text-sm text-ink">{error}</p> : null}
      <Button type="button" variant="quiet" className="mt-3" disabled={pending} onClick={() => void onExport()}>
        {pending ? "正在导出…" : "导出"}
      </Button>
    </div>
  );
}

