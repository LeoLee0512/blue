import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyTemplate,
  bootstrap,
  createNovel,
  loadNovel,
  pingModel,
  removeChapterText,
  removeNovel,
  removeOutlineNode,
  removePerson,
  runAgent,
  saveChapterText,
  saveConnection,
  saveToolset,
  saveOutlineNode,
  savePerson,
  saveStudio,
  saveVoice,
  learnText,
  reviewNovel,
  seedFromLine,
  updateNovel,
} from "@/lib/novel/api";
import type { AccountSnapshot, NovelDetail, UsageDay } from "@/lib/novel/types";
import { DeskProvider, type Desk, type EditorBridge, type ExportScope, type PaneId, type SideTab } from "@/components/desk";
import { NAV } from "@/components/panes";
import { Confirm, type ConfirmRequest } from "@/components/ui";
import { Shell } from "@/components/shell";
import { toast } from "sonner";
import { readingOrder } from "@/lib/write/tree";

function blame(_error: unknown): string {
  return "没有完成";
}

function cacheNote(cache: { hit: number; miss: number } | undefined): string {
  const hit = cache?.hit ?? 0;
  const total = hit + (cache?.miss ?? 0);
  if (hit <= 0 || total <= 0) return "已完成";
  const rate = (hit / total) * 100;
  const text = rate >= 99.5 && rate < 100 ? rate.toFixed(1) : String(Math.round(rate));
  return `已完成。缓存命中 ${text}%`;
}

function mergeToday(prev: AccountSnapshot | null, today: UsageDay, settings?: Partial<AccountSnapshot["settings"]>): AccountSnapshot | null {
  if (!prev) return prev;
  return {
    ...prev,
    usage: [today, ...(prev.usage ?? []).filter((day) => day.day !== today.day)],
    settings: settings ? { ...prev.settings, ...settings } : prev.settings,
  };
}

const LAST_CHAPTER = "langao-last-chapter:";

/** 打开作品时停在上次写的那一章；没有记录就从阅读顺序的第一章开始。 */
function firstChapter(detail: NovelDetail | null): string {
  if (!detail) return "";
  try {
    const last = window.localStorage.getItem(LAST_CHAPTER + detail.novel.id);
    if (last && detail.chapters.some((c) => c.id === last)) return last;
  } catch {
    // 读不到就用第一章
  }
  return readingOrder(detail.volumes, detail.chapters)[0]?.id ?? "";
}

export function Workspace() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [detail, setDetail] = useState<NovelDetail | null>(null);
  const [novelId, setNovelId] = useState("");
  const [pane, setPaneState] = useState<PaneId>("library");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [creating, setCreating] = useState(false);
  const [side, setSide] = useState<SideTab | null>("cards");
  const [focus, setFocus] = useState(false);
  const [exportReq, setExportReq] = useState<{ scope: ExportScope; novelId: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const editor = useRef<EditorBridge | null>(null);

  useEffect(() => {
    let dead = false;
    bootstrap()
      .then((res) => {
        if (dead) return;
        if (!res.ok) {
          setBootError(res.error);
          return;
        }
        setAccount(res.account);
        setNovelId(res.account.novels[0]?.id ?? "");
        if (!res.account.novels[0]) setCreating(true);
      })
      .catch((err: unknown) => {
        if (!dead) setBootError(blame(err));
      })
      .finally(() => {
        if (!dead) setBooting(false);
      });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!novelId) {
      setDetail(null);
      return;
    }
    let dead = false;
    loadNovel({ data: { novelId } })
      .then((res) => {
        if (dead) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDetail(res.detail);
        setSelectedChapterId(firstChapter(res.detail));
        setSelectedNodeId(res.detail?.outline[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        if (!dead) setError(blame(err));
      });
    return () => {
      dead = true;
    };
  }, [novelId]);

  async function refreshDetail() {
    if (!novelId) return;
    const res = await loadNovel({ data: { novelId } });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDetail(res.detail);
    const chapters = res.detail?.chapters ?? [];
    const nodes = res.detail?.outline ?? [];
    setSelectedChapterId((current) => (chapters.some((chapter) => chapter.id === current) ? current : firstChapter(res.detail)));
    setSelectedNodeId((current) => (nodes.some((node) => node.id === current) ? current : (nodes[0]?.id ?? "")));
  }

  const refreshDetailRef = useRef(refreshDetail);
  refreshDetailRef.current = refreshDetail;

  async function refreshAll() {
    const res = await bootstrap();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAccount(res.account);
    setNovelId((current) => (res.account.novels.some((novel) => novel.id === current) ? current : (res.account.novels[0]?.id ?? "")));
  }

  useEffect(() => {
    if (!novelId || !selectedChapterId) return;
    try {
      window.localStorage.setItem(LAST_CHAPTER + novelId, selectedChapterId);
    } catch {
      // 记不住也没关系
    }
  }, [novelId, selectedChapterId]);

  const desk = useMemo<Desk>(() => {
    const refreshDetail = () => refreshDetailRef.current();
    const note = (text: string) => {
      setError("");
      setNotice(text);
      toast.success(text, { id: "langao-note" });
    };
    const fail = (text: string) => {
      setNotice("");
      setError(text);
      toast.error(text, { id: "langao-fail" });
    };
    // v2：「代理」不再是单独的一栏，而是右侧面板的一页
    const setPane = (next: PaneId) => {
      if (next === "agent") {
        setSide("agent");
        setPaneState((cur) => (["manuscript", "studio", "outline"].includes(cur) ? cur : "manuscript"));
        return;
      }
      setPaneState(next);
    };

    return {
      account,
      detail,
      novelId,
      pane,
      setPane,
      error,
      notice,
      busy,
      running,
      draft,
      setDraft,
      selectedNodeId,
      setSelectedNodeId,
      selectedChapterId,
      setSelectedChapterId,
      creating,
      setCreating,
      selectNovel: (id: string) => {
        setCreating(false);
        setNovelId(id);
      },
      refreshAll,
      refreshDetail,
      send: async (prompt: string, intent: "talk" | "write" = "talk") => {
        const text = prompt.trim();
        if (!text || !novelId || running) return;
        setDraft("");
        setRunning(true);
        setError("");
        setNotice("");
        const chapter = detail?.chapters.find((item) => item.id === selectedChapterId) ?? detail?.chapters.at(-1);
        const node = detail?.outline.find((item) => item.id === selectedNodeId);
        const view =
          pane === "manuscript" && chapter
            ? `正文《${chapter.title}》\n${chapter.body.slice(0, 500)}`
            : pane === "outline" && node
              ? `大纲《${node.title}》：${node.summary}`
              : (NAV.find((item) => item.id === pane)?.label ?? "书桌");
        try {
          const res = await runAgent({ data: { novelId, prompt: text, view, intent } });
          if (!res.ok) {
            fail(res.error);
            await refreshDetail();
            return;
          }
          setDetail(res.detail);
          setAccount((prev) =>
            mergeToday(
              prev ? { ...prev, novels: prev.novels.map((novel) => (novel.id === res.detail.novel.id ? res.detail.novel : novel)) } : prev,
              res.usage.today,
              { contextUsed: res.usage.contextUsed },
            ),
          );
          const written = res.steps.find((step) => step.name === "write_chapter");
          if (written) {
            const title = /《([^》]+)》/.exec(written.detail)?.[1];
            const next = res.detail.chapters.find((item) => item.title === title) ?? res.detail.chapters.at(-1);
            if (next) setSelectedChapterId(next.id);
            setPane("manuscript");
          }
          note(cacheNote(res.cache));
        } catch (err) {
          fail(blame(err));
        } finally {
          setRunning(false);
        }
      },
      createWork: async (input) => {
        setBusy(true);
        try {
          const res = await createNovel({ data: input });
          if (!res.ok) return fail(res.error);
          setAccount((prev) => (prev ? { ...prev, novels: [res.novel, ...prev.novels.filter((novel) => novel.id !== res.novel.id)] } : prev));
          setCreating(false);
          setNovelId(res.novel.id);
          setPane("manuscript");
          note("作品已放上书桌");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      seedLine: async (sentence) => {
        setBusy(true);
        try {
          const res = await seedFromLine({ data: { sentence } });
          if (!res.ok) return fail(res.error);
          setAccount((prev) => (prev ? { ...prev, novels: [res.novel, ...prev.novels.filter((novel) => novel.id !== res.novel.id)] } : prev));
          setCreating(false);
          setDetail(res.detail);
          setSelectedChapterId(res.detail.chapters.find((chapter) => chapter.title === "开场")?.id ?? res.detail.chapters[0]?.id ?? "");
          setNovelId(res.novel.id);
          setPane("studio");
          setNotice("");
          const today = res.today;
          if (today) setAccount((prev) => mergeToday(prev, today));
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      saveStory: async (input) => {
        if (!novelId) return;
        setBusy(true);
        try {
          const res = await updateNovel({ data: { id: novelId, ...input } });
          if (!res.ok) return fail(res.error);
          if (!res.novel) return fail("找不到这部作品");
          setAccount((prev) => (prev ? { ...prev, novels: prev.novels.map((novel) => (novel.id === res.novel?.id ? res.novel : novel)) } : prev));
          setDetail((prev) => (prev ? { ...prev, novel: res.novel ?? prev.novel } : prev));
          note("故事核已保存");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      destroyWork: async () => {
        if (!novelId) return;
        setBusy(true);
        try {
          const res = await removeNovel({ data: { novelId } });
          if (!res.ok) return fail(res.error);
          const rest = (account?.novels ?? []).filter((novel) => novel.id !== novelId);
          setAccount((prev) => (prev ? { ...prev, novels: rest } : prev));
          setNovelId(rest[0]?.id ?? "");
          setCreating(rest.length === 0);
          setPane("library");
          note("已删除");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      saveNode: async (input, opts) => {
        if (!novelId) return false;
        const quiet = opts?.quiet;
        if (!quiet) setBusy(true);
        try {
          const res = await saveOutlineNode({ data: { novelId, ...input } });
          if (!res.ok) {
            fail(res.error);
            return false;
          }
          if (res.node) setSelectedNodeId(res.node.id);
          await refreshDetail();
          if (!quiet) note("大纲已保存");
          return true;
        } catch (err) {
          fail(blame(err));
          return false;
        } finally {
          if (!quiet) setBusy(false);
        }
      },
      destroyNode: async (nodeId: string) => {
        if (!novelId) return;
        setBusy(true);
        try {
          const res = await removeOutlineNode({ data: { novelId, nodeId } });
          if (!res.ok) return fail(res.error);
          await refreshDetail();
          note("节点已删除");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      plantTemplate: async (force: boolean) => {
        if (!novelId) return "fail";
        setBusy(true);
        try {
          const res = await applyTemplate({ data: { novelId, force } });
          if (!res.ok) {
            if (res.error.includes("已经有内容")) return "confirm";
            fail(res.error);
            return "fail";
          }
          await refreshDetail();
          note("三幕空表已放好");
          return "ok";
        } catch (err) {
          fail(blame(err));
          return "fail";
        } finally {
          setBusy(false);
        }
      },
      saveChapter: async (input, opts) => {
        if (!novelId) return false;
        const quiet = opts?.quiet;
        if (!quiet) setBusy(true);
        try {
          const res = await saveChapterText({ data: { novelId, ...input } });
          if (!res.ok) {
            fail(res.error);
            return false;
          }
          if (res.chapter) setSelectedChapterId(res.chapter.id);
          await refreshDetail();
          if (res.today) setAccount((prev) => mergeToday(prev, res.today));
          if (!quiet) note("正文已保存");
          return true;
        } catch (err) {
          fail(blame(err));
          return false;
        } finally {
          if (!quiet) setBusy(false);
        }
      },
      destroyChapter: async (chapterId: string) => {
        if (!novelId) return;
        setBusy(true);
        try {
          const res = await removeChapterText({ data: { novelId, chapterId } });
          if (!res.ok) return fail(res.error);
          await refreshDetail();
          note("章节已删除");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      savePerson: async (input) => {
        if (!novelId) return;
        setBusy(true);
        try {
          const res = await savePerson({ data: { novelId, ...input } });
          if (!res.ok) return fail(res.error);
          await refreshDetail();
          note("人物已保存");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      destroyPerson: async (characterId: string) => {
        if (!novelId) return;
        setBusy(true);
        try {
          const res = await removePerson({ data: { novelId, characterId } });
          if (!res.ok) return fail(res.error);
          await refreshDetail();
          note("人物已删除");
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      toggleSkill: async (id: string) => {
        if (!account) return;
        const skills = account.settings.skills.includes(id)
          ? account.settings.skills.filter((skill) => skill !== id)
          : [...account.settings.skills, id];
        await writeSettings({ skills, plugins: account.settings.plugins });
      },
      togglePlugin: async (id: string) => {
        if (!account) return;
        const plugins = account.settings.plugins.includes(id)
          ? account.settings.plugins.filter((plugin) => plugin !== id)
          : [...account.settings.plugins, id];
        await writeSettings({ skills: account.settings.skills, plugins });
      },
      saveLink: async (input) => {
        if (!account) return { ok: false as const, error: "账户还没加载好" };
        setBusy(true);
        try {
          const res = await saveConnection({
            data: {
              provider: "custom",
              baseUrl: "",
              model: "",
              providerId: input.providerId,
              modelId: input.modelId,
              skills: account.settings.skills,
              plugins: account.settings.plugins,
              keyAction: input.keyAction,
              apiKey: input.apiKey,
            },
          });
          if (!res.ok) return { ok: false as const, error: res.error, code: res.code };
          setAccount((prev) => (prev ? { ...prev, settings: res.settings } : prev));
          note("连接已保存");
          return { ok: true as const };
        } catch (err) {
          return { ok: false as const, error: blame(err) };
        } finally {
          setBusy(false);
        }
      },
      testLink: async () => {
        setBusy(true);
        try {
          const res = await pingModel();
          if (!res.ok) return { ok: false as const, error: res.error, code: (res as { code?: string }).code };
          return { ok: true as const, text: res.text };
        } catch (err) {
          return { ok: false as const, error: blame(err) };
        } finally {
          setBusy(false);
        }
      },
      review: async () => {
        if (!novelId || running) return;
        setBusy(true);
        setError("");
        try {
          const res = await reviewNovel({ data: { novelId } });
          if (!res.ok) return fail(res.error);
          setDetail(res.detail);
          setAccount((prev) =>
            prev ? { ...prev, novels: prev.novels.map((novel) => (novel.id === res.detail.novel.id ? res.detail.novel : novel)) } : prev,
          );
          if (pane !== "studio") setPane("manuscript");
          note(cacheNote(res.cache));
        } catch (err) {
          fail(blame(err));
        } finally {
          setBusy(false);
        }
      },
      saveVoice: async (input, opts) => {
        const quiet = opts?.quiet;
        if (!quiet) setBusy(true);
        try {
          const res = await saveVoice({ data: input });
          if (!res.ok) {
            fail(res.error);
            return false;
          }
          setAccount((prev) => (prev ? { ...prev, voice: res.voice } : prev));
          if (!quiet) note("文风档案已保存");
          return true;
        } catch (err) {
          fail(blame(err));
          return false;
        } finally {
          if (!quiet) setBusy(false);
        }
      },
      learnText: async (input) => {
        setRunning(true);
        setError("");
        setNotice("");
        try {
          const res = await learnText({ data: { ...input, novelId: novelId || undefined } });
          if (!res.ok) return fail(res.error);
          setAccount((prev) => (prev ? { ...prev, voice: res.voice, sources: res.sources } : prev));
          if (res.detail) setDetail(res.detail);
          setPane("agent");
        } catch (err) {
          fail(blame(err));
        } finally {
          setRunning(false);
        }
      },
      setStudio: async (patch) => {
        if (!account) return;
        const next = {
          wild: patch.wild ?? account.settings.wild,
          web: patch.web ?? account.settings.web,
          thinking: patch.thinking ?? account.settings.thinking,
        };
        setAccount((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...next } } : prev));
        try {
          const res = await saveStudio({ data: next });
          if (!res.ok) return fail(res.error);
          setAccount((prev) => (prev ? { ...prev, settings: res.settings } : prev));
        } catch (err) {
          fail(blame(err));
        }
      },
      noteToday: (today) => setAccount((prev) => mergeToday(prev, today)),
      patchDetail: (fn) => setDetail((prev) => (prev ? fn(prev) : prev)),
      patchAccount: (fn) => setAccount((prev) => (prev ? fn(prev) : prev)),
      note,
      fail,
      ask: (request) => setConfirm(request),
      side,
      setSide,
      focus,
      setFocus,
      editor,
      openExport: (scope, id) => {
        const target = id ?? novelId;
        if (target && target !== novelId) {
          setCreating(false);
          setNovelId(target);
        }
        setExportReq({ scope, novelId: target });
      },
      openNovel: (id: string) => {
        setCreating(false);
        if (id !== novelId) setNovelId(id);
        setPaneState("manuscript");
      },
    };

    // 2026-11-04 Sam（Mia §5）：技能/插件开关只走 saveToolset，不再把地址和模型一并写回。
    // 旧写法：saveConnection({ data: { ...account.settings, skills|plugins, keyAction: "keep" } })
    async function writeSettings(next: { skills: string[]; plugins: string[] }) {
      setBusy(true);
      try {
        const res = await saveToolset({ data: next });
        if (!res.ok) return fail(res.error);
        setAccount((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      } catch (err) {
        fail(blame(err));
      } finally {
        setBusy(false);
      }
    }
  }, [
    account,
    detail,
    novelId,
    pane,
    error,
    notice,
    busy,
    running,
    draft,
    selectedNodeId,
    selectedChapterId,
    creating,
    side,
    focus,
  ]);

  if (booting) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper">
        <p className="font-serif text-3xl font-semibold tracking-widest text-ink">蓝稿</p>
        <p className="text-sm text-faint">正在铺开书桌…</p>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="min-h-dvh bg-paper px-6 py-10">
        <p className="font-serif text-3xl">蓝稿</p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">{bootError}</p>
      </main>
    );
  }

  return (
    <DeskProvider value={desk}>
      <Shell exportReq={exportReq && detail?.novel.id === exportReq.novelId ? exportReq.scope : null} closeExport={() => setExportReq(null)} />
      <Confirm request={confirm} onClose={() => setConfirm(null)} />
    </DeskProvider>
  );
}
