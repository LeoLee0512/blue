import { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { VOICE_FILES } from "@/lib/novel/catalog";
import { downloadMarkdown } from "@/lib/novel/format";
import type { VoiceDocs } from "@/lib/novel/types";
import { Button } from "@/components/ui";
import { StudioBar } from "@/components/studio-bar";
import { useDesk, type Desk } from "@/components/desk";

function hintsFor(desk: Desk): { label: string; prompt: string; intent: "talk" | "write" }[] {
  const node = desk.detail?.outline.find((item) => item.id === desk.selectedNodeId);
  const chapter = desk.detail?.chapters.find((item) => item.id === desk.selectedChapterId) ?? desk.detail?.chapters[0];
  if (desk.pane === "outline" && node) {
    return [
      { label: "续这一节", prompt: `按笔触把大纲里的《${node.title}》写成一章。`, intent: "write" },
      { label: "这一节还缺什么", prompt: `只谈大纲《${node.title}》还缺什么。不要改稿。`, intent: "talk" },
    ];
  }
  if (desk.pane === "manuscript" && chapter) {
    return [
      { label: "续这一章", prompt: `按笔触把《${chapter.title}》再往下写一截。`, intent: "write" },
      { label: "哪里不稳", prompt: `只谈《${chapter.title}》读起来哪里不稳。不要改稿。`, intent: "talk" },
    ];
  }
  return [
    { label: "先聊聊人物", prompt: "先聊聊这本书想写什么样的人。不要改稿。", intent: "talk" },
    { label: "收成三幕", prompt: "把现有的一句话收成三幕大纲，写进稿里。", intent: "write" },
  ];
}

type Tab = "talk" | keyof VoiceDocs;

const TABS: { id: Tab; label: string }[] = [
  { id: "talk", label: "对话" },
  { id: "portrait", label: "风格画像" },
  { id: "touch", label: "笔触" },
  { id: "preference", label: "偏好" },
];

export function AgentPane() {
  const desk = useDesk();
  const { detail, draft, setDraft, running, send, account } = desk;
  const scroller = useRef<HTMLDivElement>(null);
  const workInput = useRef<HTMLInputElement>(null);
  const likeInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("talk");
  const [doc, setDoc] = useState("");
  const [fileError, setFileError] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [intent, setIntent] = useState<"talk" | "write">("talk");
  const [readOpen, setReadOpen] = useState(false);
  const [docMark, setDocMark] = useState("");
  const messages = detail?.messages ?? [];
  const voice = account?.voice;
  const docEdited = useRef(false);
  const docGen = useRef(0);
  const saveVoiceRef = useRef(desk.saveVoice);
  saveVoiceRef.current = desk.saveVoice;

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, running]);

  useEffect(() => {
    if (tab === "talk" || !voice || docEdited.current) return;
    setDoc(voice[tab]);
    setDocMark("");
  }, [tab, voice]);

  useEffect(() => {
    if (tab === "talk" || !voice || !docEdited.current) return;
    const mine = ++docGen.current;
    const next = { ...voice, [tab]: doc };
    const handle = window.setTimeout(() => {
      void saveVoiceRef.current(next, { quiet: true }).then((ok) => {
        if (docGen.current !== mine) return;
        docEdited.current = false;
        if (ok) setDocMark("已记下");
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [doc, tab, voice]);

  async function onFile(kind: "work" | "favorite", file: File | undefined) {
    if (!file) return;
    try {
      setFileError("");
      const text = await readUpload(file);
      const title = file.name.replace(/\.(txt|md|markdown)$/i, "") || "未命名";
      await desk.learnText({ kind, title, body: text, via: "file" });
      setTab("talk");
    } catch {
      setFileError("没有读到文件");
    }
  }

  if (!detail) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <header className="px-5 py-4">
          <h2 className="font-serif text-lg">蓝稿</h2>
        </header>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PenLine className="size-4 text-mist" strokeWidth={1.75} />
            <h2 className="font-serif text-lg">蓝稿</h2>
          </div>
          {account?.settings.model ? <p className="text-sm text-faint">{account.settings.model}</p> : null}
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-11 shrink-0 px-2 text-sm ${tab === item.id ? "text-ink" : "text-faint"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <StudioBar />
      {tab === "talk" ? (
        <>
          <div ref={scroller} className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6">
            {messages.map((message) =>
                message.role === "tool" ? (
                  <p key={message.id} className="enter font-sans text-sm text-faint">
                    {labelFor(message.toolName)} · {message.content}
                  </p>
                ) : message.role === "user" ? (
                  <article key={message.id} className="enter">
                    <p className="font-serif text-xs text-faint">你</p>
                    <p className="mt-1 whitespace-pre-wrap font-serif text-lg leading-[1.9] text-mist">{message.content}</p>
                  </article>
                ) : (
                  <article key={message.id} className="enter">
                    <p className="font-sans text-xs text-faint">蓝稿</p>
                    <p className="mt-2 whitespace-pre-wrap font-serif text-lg leading-[1.9] text-ink">{message.content}</p>
                  </article>
                ),
              )}
            {running ? <p className="font-serif text-sm text-faint">蓝稿在想</p> : null}
            {fileError ? <p className="text-sm text-ink">{fileError}</p> : null}
            {account?.sources.length ? (
              <p className="text-sm text-faint">
                已读过
                {account.sources
                  .slice(0, 4)
                  .map((item) => `《${item.title}》`)
                  .join("、")}
              </p>
            ) : null}
          </div>
          <form
            className="shrink-0 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft, intent);
            }}
          >
            {detail ? (
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {hintsFor(desk).map((hint) => (
                  <button
                    key={hint.label}
                    type="button"
                    disabled={running}
                    className="text-sm text-faint hover:text-mist disabled:opacity-50"
                    onClick={() => {
                      setIntent(hint.intent);
                      void send(hint.prompt, hint.intent);
                    }}
                  >
                    {hint.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mb-2 flex flex-wrap gap-x-4">
              <button type="button" className={intent === "talk" ? "text-sm text-ink underline underline-offset-4" : "text-sm text-faint"} onClick={() => setIntent("talk")}>
                只聊聊
              </button>
              <button type="button" className={intent === "write" ? "text-sm text-ink underline underline-offset-4" : "text-sm text-faint"} onClick={() => setIntent("write")}>
                落到稿上
              </button>
              <button type="button" className="text-sm text-faint hover:text-mist" onClick={() => setReadOpen((open) => !open)}>
                让蓝稿读一节
              </button>
            </div>
            {readOpen ? (
              <div className="mb-2 space-y-2">
                <div className="flex flex-wrap gap-x-4">
                  <button type="button" className="text-sm text-faint hover:text-mist" disabled={running} onClick={() => workInput.current?.click()}>
                    上传我的作品
                  </button>
                  <button type="button" className="text-sm text-faint hover:text-mist" disabled={running} onClick={() => likeInput.current?.click()}>
                    上传我喜欢的小说
                  </button>
                  <button type="button" className="text-sm text-faint hover:text-mist" disabled={running} onClick={() => setPasteOpen((open) => !open)}>
                    粘贴一节
                  </button>
                </div>
              <input
                ref={workInput}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                onChange={(event) => {
                  void onFile("work", event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <input
                ref={likeInput}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                onChange={(event) => {
                  void onFile("favorite", event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
                {pasteOpen ? (
                  <div className="space-y-2">
                    <textarea
                      className="min-h-28 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-faint"
                      placeholder="贴一小节。蓝稿只学手法，不保存原文。"
                      value={paste}
                      disabled={running}
                      onChange={(event) => setPaste(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-x-4">
                      <button
                        type="button"
                        className="text-sm text-faint hover:text-mist disabled:opacity-50"
                        disabled={running || paste.trim().length < 40}
                        onClick={() => {
                          const text = paste.trim();
                          const title = text.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 40) || "粘贴的一节";
                          setPaste("");
                          setPasteOpen(false);
                          void desk.learnText({ kind: "work", title, body: text, via: "paste" });
                        }}
                      >
                        这是我的作品
                      </button>
                      <button
                        type="button"
                        className="text-sm text-faint hover:text-mist disabled:opacity-50"
                        disabled={running || paste.trim().length < 40}
                        onClick={() => {
                          const text = paste.trim();
                          const title = text.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 40) || "粘贴的一节";
                          setPaste("");
                          setPasteOpen(false);
                          void desk.learnText({ kind: "favorite", title, body: text, via: "paste" });
                        }}
                      >
                        这是我喜欢的小说
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <textarea
              className="min-h-24 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-faint"
              placeholder={detail ? "跟蓝稿说话，或让它按笔触写一章" : "先创建一部作品，才能把对话写进这部书"}
              value={draft}
              disabled={!detail || running}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send(draft, intent);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-sm text-faint">蓝稿免费使用。模型费用由你的模型服务商按用量收取。</p>
              <Button type="submit" disabled={!detail || running || !draft.trim()}>
                发送
              </Button>
            </div>
          </form>
        </>
      ) : (
        <DocTab
          file={VOICE_FILES[tab]}
          value={doc}
          mark={docMark}
          hint={tab === "preference" ? "从你喜欢的小说里蒸馏出的手法记在这里。停笔会自己记下。" : "写小说时，蓝稿会把它当成技能。停笔会自己记下。"}
          onChange={(value) => {
            docEdited.current = true;
            setDocMark("");
            setDoc(value);
          }}
        />
      )}
    </section>
  );
}

function DocTab({
  file,
  value,
  mark,
  hint,
  onChange,
}: {
  file: string;
  value: string;
  mark: string;
  hint: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-serif text-xl">{file}</p>
        <button type="button" className="min-h-11 text-sm text-faint hover:text-ink" onClick={() => downloadMarkdown(file, value)}>
          下载
        </button>
      </div>
      <p className="mt-1 text-sm text-mist">{hint}</p>
      <textarea className="mt-6 min-h-0 w-full flex-1 resize-none border-0 bg-transparent font-serif text-lg leading-[1.9] text-ink outline-none" value={value} onChange={(event) => onChange(event.target.value)} />
      <p className="mt-3 text-sm text-faint">{mark}</p>
    </div>
  );
}

function labelFor(name: string | null): string {
  if (name === "update_bible") return "更新故事核";
  if (name === "set_outline") return "写入大纲";
  if (name === "write_chapter") return "写入章节";
  if (name === "save_character") return "写入人物";
  if (name === "update_voice") return "更新文风档案";
  if (name === "update_ledger") return "记下手里的线";
  return "工具";
}

function readUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 1_200_000) {
      reject(new Error("文件太大，请先裁成一篇"));
      return;
    }
    const named = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith("text/") || file.type === "";
    if (!named) {
      reject(new Error("请上传 .txt 或 .md"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("没有读到文件"));
    reader.readAsText(file);
  });
}
