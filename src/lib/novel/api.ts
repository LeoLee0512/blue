import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "@/lib/db";
import type { AccountSnapshot, Chapter, Character, Leaf, LedgerEntry, Novel, NovelDetail, OutlineNode, Settings, SharedLeaf, SourceNote, UsageDay, VoiceDocs, Wallet } from "./types";
import type { Seat } from "./plan.server";

type Err = { ok: false; error: string; code?: string };
const PAYMENT_DISABLED = "蓝稿已全部免费，不再提供充值或订阅。";

// 2026-11-01 全免费：计费类接口服务端一律 410 Gone。
async function gone(): Promise<Err> {
  try {
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    setResponseStatus(410);
  } catch {
    // 拿不到响应对象时（如单元测试直接调用）只返回错误体。
  }
  return { ok: false as const, error: PAYMENT_DISABLED };
}

async function run<T>(userId: string, fn: (sql: Sql) => Promise<T>): Promise<T | Err> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    // 注销后 cookieCache 窗口内旧 Cookie 仍能过鉴权：所有接口统一先确认用户还在（Jim s6 H1 / s8）。
    // 2026-11-03：关闭登录的开发模式下，dev-user 也要有 "user" 行（0013 外键需要）。生产环境不会走到这里（verify.server 启动即失败）。
    if (userId === "dev-user" && process.env.NODE_ENV !== "production" && process.env.VITE_AUTH_ENABLED?.trim() === "false") {
      await sql`insert into "user" (id, name, email, "emailVerified") values ('dev-user', 'Dev User', 'dev-user@localhost', true) on conflict (id) do nothing`;
    }
    const alive = await sql<{ id: string }>`select id from "user" where id = ${userId} limit 1`;
    if (!alive[0]) throw new Error("ACCOUNT_GONE");
    return await fn(sql);
  } catch (error) {
    // 2026-11-08 Sam（M6 / Jim）：对外只回我们主动抛出的文案；编程异常一律「没有完成」，不把 TypeError 等原文给前端。
    const code = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
    const msg = error instanceof Error ? error.message : "";
    const bugRe = /TypeError|ReferenceError|SyntaxError|RangeError|Cannot read|is not a function|ECONN|ENOENT|Unexpected/;
    const looksLikeBug = bugRe.test(msg) || msg.includes(" at ");
    if (code && msg && !looksLikeBug) return { ok: false, error: msg, code };
    const hasHan = /[一-鿿]/.test(msg);
    if (msg && !looksLikeBug && (msg === "ACCOUNT_GONE" || msg === "参数无效" || msg === PAYMENT_DISABLED || hasHan)) {
      return code ? { ok: false, error: msg, code } : { ok: false, error: msg };
    }
    return code ? { ok: false, error: "没有完成", code } : { ok: false, error: "没有完成" };
  }
}

export const bootstrap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; account: AccountSnapshot } | Err> => {
    const result = await run(context.userId, async (sql) => {
      const { readAccount } = await import("./store.server");
      return { ok: true as const, account: await readAccount(sql, context.userId) };
    });
    return result;
  });

export const loadNovel = createServerFn({ method: "POST" })
  .validator((input: { novelId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; detail: NovelDetail | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { readDetail } = await import("./store.server");
      return { ok: true as const, detail: await readDetail(sql, context.userId, data.novelId) };
    });
  });

export const createNovel = createServerFn({ method: "POST" })
  .validator((input: { title: string; genre: string; logline: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; novel: Novel } | Err> => {
    return run(context.userId, async (sql) => {
      const { createNovel: insertNovel } = await import("./store.server");
      return { ok: true as const, novel: await insertNovel(sql, context.userId, data) };
    });
  });

export const updateNovel = createServerFn({ method: "POST" })
  .validator((input: { id: string; title: string; genre: string; logline: string; premise: string; styleNotes: string; soFar: string; ledger?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; novel: Novel | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { updateNovel: editNovel } = await import("./store.server");
      return { ok: true as const, novel: await editNovel(sql, context.userId, data) };
    });
  });

export const removeNovel = createServerFn({ method: "POST" })
  .validator((input: { novelId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { deleteNovel } = await import("./store.server");
      const done = await deleteNovel(sql, context.userId, data.novelId);
      if (!done) return { ok: false as const, error: "找不到这部作品" };
      return { ok: true as const };
    });
  });

export const saveOutlineNode = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; id?: string; parentId?: string | null; kind: string; title: string; summary: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; node: OutlineNode | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveNode } = await import("./store.server");
      return { ok: true as const, node: await saveNode(sql, context.userId, data) };
    });
  });

export const removeOutlineNode = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; nodeId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { deleteNode } = await import("./store.server");
      const done = await deleteNode(sql, context.userId, data.novelId, data.nodeId);
      if (!done) return { ok: false as const, error: "找不到这个节点" };
      return { ok: true as const };
    });
  });

export const applyTemplate = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; force: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { applyEmptyActs } = await import("./store.server");
      const error = await applyEmptyActs(sql, context.userId, data.novelId, data.force);
      if (error) return { ok: false as const, error };
      return { ok: true as const };
    });
  });

export const saveChapterText = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; id?: string; title: string; body: string; nodeId?: string | null }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; chapter: Chapter | null; today: UsageDay } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveChapter, noteUsage } = await import("./store.server");
      const chapter = await saveChapter(sql, context.userId, data);
      const today = await noteUsage(sql, context.userId, {});
      return { ok: true as const, chapter, today };
    });
  });

export const removeChapterText = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; chapterId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { deleteChapter } = await import("./store.server");
      const done = await deleteChapter(sql, context.userId, data.novelId, data.chapterId);
      if (!done) return { ok: false as const, error: "找不到这一章" };
      return { ok: true as const };
    });
  });

export const savePerson = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; id?: string; name: string; role: string; bio: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; character: Character | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveCharacter } = await import("./store.server");
      return { ok: true as const, character: await saveCharacter(sql, context.userId, data) };
    });
  });

export const removePerson = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; characterId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { deleteCharacter } = await import("./store.server");
      const done = await deleteCharacter(sql, context.userId, data.novelId, data.characterId);
      if (!done) return { ok: false as const, error: "找不到这个人物" };
      return { ok: true as const };
    });
  });

export const saveConnection = createServerFn({ method: "POST" })
  .validator((input: {
    provider: string;
    baseUrl: string;
    model: string;
    providerId?: string;
    modelId?: string;
    skills: string[];
    plugins: string[];
    keyAction: string;
    apiKey?: string;
  }) => {
    // 2026-11-04 Sam（Jim wl 应修）：先查入参类型，避免把内部异常文本回给前端。
    if (!input || typeof input !== "object") throw new Error("参数无效");
    const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
    // 2026-11-04 Sam（Mia §5.3）：新连接页提交 providerId + modelId（不带 baseUrl）；旧形态仍收，但同样只放行白名单组合。
    if (input.providerId !== undefined) {
      if (typeof input.providerId !== "string" || typeof input.modelId !== "string" || typeof input.keyAction !== "string") throw new Error("参数无效");
      input = { ...input, baseUrl: "", model: "", provider: "custom" };
    }
    if (typeof input.baseUrl !== "string" || typeof input.model !== "string" || typeof input.keyAction !== "string") throw new Error("参数无效");
    if (!strs(input.skills) || !strs(input.plugins)) throw new Error("参数无效");
    if (input.apiKey !== undefined && typeof input.apiKey !== "string") throw new Error("参数无效");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; settings: Settings } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveSettings } = await import("./store.server");
      return { ok: true as const, settings: await saveSettings(sql, context.userId, data) };
    });
  });

export const saveToolset = createServerFn({ method: "POST" })
  .validator((input: { skills: string[]; plugins: string[] }) => {
    const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
    if (!input || typeof input !== "object" || !strs(input.skills) || !strs(input.plugins)) throw new Error("参数无效");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; settings: Settings } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveToolset: save } = await import("./store.server");
      return { ok: true as const, settings: await save(sql, context.userId, { skills: data.skills, plugins: data.plugins }) };
    });
  });

export const buyPack = createServerFn({ method: "POST" })
  .validator((input: { packId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; wallet: Wallet; entry: LedgerEntry } | Err> => {
    // 安全修复（2026-10-30 Sam）：真实支付接入前，服务端关闭充值，防止无限领墨点。
    void context;
    void data;
    return gone();
  });

export const saveStudio = createServerFn({ method: "POST" })
  .validator((input: { wild?: boolean; web?: boolean; thinking?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; settings: Settings } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveStudio: writeStudio } = await import("./store.server");
      return { ok: true as const, settings: await writeStudio(sql, context.userId, data) };
    });
  });

export const reviewNovel = createServerFn({ method: "POST" })
  .validator((input: { novelId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    return run(context.userId, async (sql) => {
      const { reviewBook } = await import("./engine.server");
      return reviewBook(sql, context.userId, data.novelId);
    });
  });

export const runAgent = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; prompt: string; view: string; intent?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    return run(context.userId, async (sql) => {
      const { runNovelAgent } = await import("./engine.server");
      return runNovelAgent(sql, context.userId, data);
    });
  });

export const pingModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return run(context.userId, async (sql) => {
      const { testCustomConnection } = await import("./engine.server");
      return testCustomConnection(sql, context.userId);
    });
  });

export const saveVoice = createServerFn({ method: "POST" })
  .validator((input: { portrait: string; touch: string; preference: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; voice: VoiceDocs } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveVoice: writeVoice } = await import("./store.server");
      return { ok: true as const, voice: await writeVoice(sql, context.userId, data) };
    });
  });

export const seedFromLine = createServerFn({ method: "POST" })
  .validator((input: { sentence: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; novel: Novel; detail: NovelDetail; today: UsageDay | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { beginFromLine } = await import("./engine.server");
      return { ok: true as const, ...(await beginFromLine(sql, context.userId, data.sentence)) };
    });
  });

export const learnText = createServerFn({ method: "POST" })
  .validator((input: { kind: string; title: string; body: string; novelId?: string; via?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<
    | { ok: true; voice: VoiceDocs; sources: SourceNote[]; spent: number; note: string; detail: NovelDetail | null }
    | Err
  > => {
    const kind = data.kind === "favorite" ? "favorite" : data.kind === "work" ? "work" : "";
    if (!kind) return { ok: false, error: "不知道这是作品还是喜欢的小说" };
    return run(context.userId, async (sql) => {
      const { learnFromText } = await import("./engine.server");
      return learnFromText(sql, context.userId, {
        kind,
        title: data.title,
        body: data.body,
        novelId: data.novelId,
        via: data.via,
      });
    });
  });

export const loadShelf = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; poems: Leaf[]; notes: Leaf[]; shares: SharedLeaf[] } | Err> => {
    return run(context.userId, async (sql) => {
      const { readShelf } = await import("./pages.server");
      return { ok: true as const, ...(await readShelf(sql, context.userId)) };
    });
  });

export const saveLeaf = createServerFn({ method: "POST" })
  .validator((input: { id?: string; kind: string; title: string; body: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; leaf: Leaf } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveLeaf: writeLeaf } = await import("./pages.server");
      const leaf = await writeLeaf(sql, context.userId, data);
      if (!leaf) return { ok: false as const, error: "没有留下" };
      return { ok: true as const, leaf };
    });
  });

export const removeLeaf = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { removeLeaf: dropLeaf } = await import("./pages.server");
      const done = await dropLeaf(sql, context.userId, data.id);
      if (!done) return { ok: false as const, error: "找不到这一页" };
      return { ok: true as const };
    });
  });

export const publishText = createServerFn({ method: "POST" })
  .validator((input: { kind: string; title: string; body: string; sourceId?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { publishText: share } = await import("./pages.server");
      const id = await share(sql, context.userId, data);
      if (!id) return { ok: false as const, error: "没有可以放上的文字" };
      return { ok: true as const };
    });
  });

export const exportMyShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; markdown: string } | Err> => {
    return run(context.userId, async (sql) => {
      const { exportOwnShares } = await import("./pages.server");
      return { ok: true as const, markdown: await exportOwnShares(sql, context.userId) };
    });
  });

export const unpublishText = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { unpublishText: drop } = await import("./pages.server");
      const done = await drop(sql, context.userId, data.id);
      if (!done) return { ok: false as const, error: "架上没有这一页" };
      return { ok: true as const };
    });
  });

export const extendLeaf = createServerFn({ method: "POST" })
  .validator((input: { kind: string; body: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; text: string } | Err> => {
    const kind = data.kind === "note" ? "note" : data.kind === "poem" ? "poem" : "";
    if (!kind) return { ok: false, error: "不知道这是诗还是手记" };
    return run(context.userId, async (sql) => {
      const { continueLines } = await import("./engine.server");
      const result = await continueLines(sql, context.userId, { kind, body: data.body });
      if (!result.ok) return result;
      return { ok: true as const, text: result.text };
    });
  });

export const takeSeat = createServerFn({ method: "POST" })
  .validator((input: { plan: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; plan: Seat } | Err> => {
    // 2026-11-01 全免费：订阅接口下线（原实现见 api.ts.bak_20261101_sam_b1）。
    void context;
    void data;
    return gone();
  });

// 注销账号（2026-10-30 Sam）：前端二次确认后，必须原样提交确认文字「注销账号」才执行。
export const DELETE_ACCOUNT_CONFIRM = "注销账号";

export const deleteAccount = createServerFn({ method: "POST" })
  .validator((input: { confirm: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    if (data.confirm !== DELETE_ACCOUNT_CONFIRM) return { ok: false as const, error: "请输入「注销账号」确认" };
    return run(context.userId, async (sql) => {
      const users = await sql<{ email: string }>`select "email" from "user" where "id" = ${context.userId}`;
      const { deleteAccountData } = await import("./store.server");
      await deleteAccountData(sql, context.userId, users[0]?.email ?? "");
      return { ok: true as const };
    });
  });
