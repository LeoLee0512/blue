import { useEffect, useMemo, useRef, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { installAccountGoneGuard } from "@/lib/auth/account-gone.client";
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
import { AgentPane } from "@/components/agent-pane";
import { DeskProvider, type Desk, type PaneId } from "@/components/desk";
import { Center, NAV, NavList, NovelList } from "@/components/panes";
import { cn } from "@/lib/cn";

function blame(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Unauthorized" || message === "ACCOUNT_GONE" || /unauthorized/i.test(message)) {
    return "登录已失效，请重新进入。";
  }
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

export function Workspace() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [detail, setDetail] = useState<NovelDetail | null>(null);
  const [novelId, setNovelId] = useState("");
  const [pane, setPane] = useState<PaneId>("library");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    installAccountGoneGuard(); // 2026-11-03：账号注销后自动退出登录
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
        setSelectedChapterId(res.detail?.chapters[0]?.id ?? "");
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
    setSelectedChapterId((current) => (chapters.some((chapter) => chapter.id === current) ? current : (chapters[0]?.id ?? "")));
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

  const desk = useMemo<Desk>(() => {
    const refreshDetail = () => refreshDetailRef.current();
    const note = (text: string) => {
      setError("");
      setNotice(text);
    };
    const fail = (text: string) => {
      setNotice("");
      setError(text);
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
          setPane("outline");
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
  ]);

  if (booting) {
    return (
      <main className="min-h-dvh bg-paper">
        <div className="h-0.5 bg-accent" />
        <p className="px-6 py-5 font-serif text-2xl">蓝稿</p>
        <p className="px-6 text-sm text-mist">正在铺开书桌</p>
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

  const title = detail?.novel.title ?? "";

  return (
    <DeskProvider value={desk}>
      <div className="flex h-dvh flex-col bg-paper">
        <div className="h-0.5 shrink-0 bg-accent" />
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
          <button type="button" className="font-serif text-xl" onClick={() => setPane("library")}>
            蓝稿
          </button>
          {title ? <p className="min-w-0 flex-1 truncate font-serif text-base text-ink">{title}</p> : <span className="min-w-0 flex-1" />}
          {/* 2026-11-01 全免费：顶栏套餐按钮（习作/一杯/长夜）已下线。 */}
          {(account?.novels.length ?? 0) > 0 ? (
            <button
              type="button"
              className="min-h-11 shrink-0 px-2 text-sm text-faint"
              onClick={() => {
                setPane("library");
                window.dispatchEvent(new Event("langao-guide"));
              }}
            >
              指引
            </button>
          ) : null}
          <UserButton />
        </header>
        {error || notice ? (
          <p className={cn("shrink-0 border-b border-line px-4 py-2 text-sm", error ? "text-ink" : "text-mist")}>{error || notice}</p>
        ) : null}
        <div className="shrink-0 overflow-x-auto border-b border-line bg-surface px-2 py-2 lg:hidden">
          <NavList />
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-12">
          <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-3 lg:col-span-3 lg:flex">
            <NavList stacked />
            <div className="h-px bg-line" />
            <NovelList />
          </aside>
          <main className={cn("flex min-h-0 flex-col overflow-y-auto lg:col-span-5", pane === "agent" && "hidden lg:block")}>
            <Center />
          </main>
          <aside className={cn("min-h-0 border-line lg:col-span-4 lg:flex lg:border-l", pane === "agent" ? "flex" : "hidden")}>
            <div className="min-h-0 w-full">
              <AgentPane />
            </div>
          </aside>
        </div>
      </div>
    </DeskProvider>
  );
}
