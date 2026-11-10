import { useEffect, useRef, useState } from "react";
import { extendLeaf, loadShelf, publishText, removeLeaf, saveLeaf, unpublishText } from "@/lib/novel/api";
import type { Leaf, SharedLeaf } from "@/lib/novel/types";
import { useDesk } from "@/components/desk";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

const KIND_WORD = { poem: "诗", note: "手记", chapter: "一章" } as const;

export function PoetryPane() {
  return <LeafPane kind="poem" />;
}

export function NotesPane() {
  return <LeafPane kind="note" />;
}

function LeafPane({ kind }: { kind: "poem" | "note" }) {
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [ready, setReady] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState("");
  const [mark, setMark] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    let dead = false;
    loadShelf()
      .then((res) => {
        if (dead) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const list = kind === "poem" ? res.poems : res.notes;
        setLeaves(list);
        const first = list[0];
        if (first) {
          setId(first.id);
          setTitle(first.title);
          setBody(first.body);
        }
      })
      .finally(() => {
        if (!dead) setReady(true);
      });
    return () => {
      dead = true;
    };
  }, [kind]);

  useEffect(() => {
    if (!id || !dirty.current) return;
    const current = { id, kind, title, body };
    const handle = window.setTimeout(() => {
      dirty.current = false;
      void saveLeaf({ data: current }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setLeaves((prev) => prev.map((item) => (item.id === res.leaf.id ? res.leaf : item)));
        setMark("已记下");
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [id, kind, title, body]);

  function openLeaf(leaf: Leaf) {
    if (id && dirty.current && id !== leaf.id) {
      dirty.current = false;
      void saveLeaf({ data: { id, kind, title, body } });
    }
    dirty.current = false;
    setId(leaf.id);
    setTitle(leaf.title);
    setBody(leaf.body);
    setMark("");
    setError("");
  }

  async function begin(text: string) {
    setBusy(true);
    setError("");
    try {
      const res = await saveLeaf({
        data: { kind, title: kind === "poem" ? "无题" : "手记", body: text },
      });
      if (!res.ok) return setError(res.error);
      setLeaves((prev) => [res.leaf, ...prev.filter((item) => item.id !== res.leaf.id)]);
      setId(res.leaf.id);
      setTitle(res.leaf.title);
      setBody(res.leaf.body);
      setDraft("");
      setMark("已记下");
    } finally {
      setBusy(false);
    }
  }

  async function extend() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const res = await extendLeaf({ data: { kind, body } });
      if (!res.ok) return setError(res.error);
      dirty.current = true;
      setBody((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${res.text}` : res.text));
      setMark(kind === "poem" ? "接了两行" : "接了两句");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await removeLeaf({ data: { id } });
      if (!res.ok) return setError(res.error);
      const rest = leaves.filter((item) => item.id !== id);
      setLeaves(rest);
      const next = rest[0];
      dirty.current = false;
      setId(next?.id ?? "");
      setTitle(next?.title ?? "");
      setBody(next?.body ?? "");
      setMark("已删去");
    } finally {
      setBusy(false);
    }
  }

  const heading = kind === "poem" ? "诗歌" : "手记";
  const hint = kind === "poem" ? "一行也是一首。蓝稿只接两行，就停。" : "还不是一本书的话，先放在这里。蓝稿只接两句。";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="font-serif text-3xl">{heading}</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">{hint}</p>
      {error ? <p className="mt-4 text-sm text-ink">{error}</p> : null}
      {leaves.length ? (
        <div className="mt-6 flex gap-4 overflow-x-auto">
          {leaves.map((leaf) => (
            <button
              key={leaf.id}
              type="button"
              className={cn("shrink-0 py-2 text-sm", leaf.id === id ? "text-ink" : "text-faint hover:text-mist")}
              onClick={() => openLeaf(leaf)}
            >
              {leaf.title || "无题"}
            </button>
          ))}
          <button type="button" className="shrink-0 py-2 text-sm text-faint hover:text-mist" onClick={() => void begin("")}>
            {kind === "poem" ? "新的一首" : "新的一则"}
          </button>
        </div>
      ) : null}
      {!ready ? <p className="mt-8 text-sm text-faint">正在翻开</p> : null}
      {ready && !id ? (
        <form
          className="mt-10"
          onSubmit={(event) => {
            event.preventDefault();
            void begin(draft);
          }}
        >
          <textarea
            className="w-full resize-none bg-transparent font-serif text-3xl leading-snug text-ink outline-none placeholder:text-faint"
            rows={4}
            placeholder={kind === "poem" ? "写一行" : "写一则"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button className="mt-6" type="submit" disabled={busy || draft.trim().length < 1}>
            留下
          </Button>
        </form>
      ) : null}
      {id ? (
        <div className="mt-8">
          <input
            className="w-full border-0 bg-transparent font-serif text-3xl text-ink outline-none"
            value={title}
            onChange={(event) => {
              dirty.current = true;
              setMark("");
              setTitle(event.target.value);
            }}
          />
          <textarea
            className="mt-4 min-h-64 w-full resize-none border-0 bg-transparent font-serif text-lg leading-[1.9] text-ink outline-none"
            value={body}
            onChange={(event) => {
              dirty.current = true;
              setMark("");
              setBody(event.target.value);
            }}
          />
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button type="button" className="min-h-11 text-sm text-faint hover:text-ink" disabled={busy} onClick={() => void extend()}>
              {busy ? "在写" : kind === "poem" ? "接两行" : "接两句"}
            </button>
            {/* 2026-11-02 分享架下线，原发布按钮：
            <button type="button" className="min-h-11 text-sm text-faint hover:text-ink" disabled={busy} onClick={() => void publish()}>
              放到架上
            </button>
            */}
            <button type="button" className="min-h-11 text-sm text-faint hover:text-ink" disabled={busy} onClick={() => void destroy()}>
              删去
            </button>
            {mark ? <span className="text-sm text-faint">{mark}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SharePane() {
  const desk = useDesk();
  const [shares, setShares] = useState<SharedLeaf[]>([]);
  const [openId, setOpenId] = useState("");
  const [mark, setMark] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const chapter = desk.detail?.chapters.find((item) => item.id === desk.selectedChapterId) ?? desk.detail?.chapters[0];

  useEffect(() => {
    let dead = false;
    loadShelf().then((res) => {
      if (dead || !res.ok) return;
      setShares(res.shares);
    });
    return () => {
      dead = true;
    };
  }, []);

  const open = shares.find((item) => item.id === openId) ?? null;

  async function publishChapter() {
    if (!chapter?.body.trim()) return setError("这一章还是空的");
    setBusy(true);
    setError("");
    try {
      const res = await publishText({
        data: { kind: "chapter", title: chapter.title, body: chapter.body, sourceId: chapter.id },
      });
      if (!res.ok) return setError(res.error);
      const fresh = await loadShelf();
      if (fresh.ok) setShares(fresh.shares);
      setMark("已放到架上");
    } finally {
      setBusy(false);
    }
  }

  async function takeDown(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await unpublishText({ data: { id } });
      if (!res.ok) return setError(res.error);
      setShares((prev) => prev.filter((item) => item.id !== id));
      setOpenId("");
      setMark("已收回");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="font-serif text-3xl">分享</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">放到架上的，别人也能读。没有放上的原稿，仍只在你的桌上。</p>
      {error ? <p className="mt-4 text-sm text-ink">{error}</p> : null}
      {chapter?.body.trim() ? (
        <button type="button" className="mt-6 min-h-11 text-sm text-faint hover:text-ink" disabled={busy} onClick={() => void publishChapter()}>
          把《{chapter.title}》放到架上
        </button>
      ) : null}
      {mark ? <p className="mt-2 text-sm text-faint">{mark}</p> : null}
      {open ? (
        <article className="mt-8">
          <button type="button" className="min-h-11 text-sm text-faint hover:text-ink" onClick={() => setOpenId("")}>
            回到架上
          </button>
          <p className="mt-4 text-sm text-faint">
            {KIND_WORD[open.kind]} · {open.author}
          </p>
          <h3 className="mt-2 font-serif text-3xl">{open.title}</h3>
          <p className="mt-6 whitespace-pre-wrap font-serif text-lg leading-[1.9] text-ink">{open.body}</p>
          {open.mine ? (
            <button type="button" className="mt-6 min-h-11 text-sm text-faint hover:text-ink" disabled={busy} onClick={() => void takeDown(open.id)}>
              收回
            </button>
          ) : null}
        </article>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {shares.length === 0 ? <li className="py-6 text-sm text-faint">架上还空着。</li> : null}
          {shares.map((item) => (
            <li key={item.id}>
              <button type="button" className="block w-full py-4 text-left" onClick={() => setOpenId(item.id)}>
                <span className="text-sm text-faint">
                  {KIND_WORD[item.kind]} · {item.author}
                  {item.mine ? " · 你的" : ""}
                </span>
                <span className="mt-1 block font-serif text-xl text-ink">{item.title}</span>
                <span className="mt-1 block truncate text-sm text-mist">{item.body.replace(/\s+/g, " ").slice(0, 42)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
