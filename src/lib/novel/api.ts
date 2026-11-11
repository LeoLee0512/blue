import { createServerFn } from "@tanstack/react-start";
import { localUserMiddleware } from "@/lib/local-session";
import { clientErrorFromThrown, sanitizeClientResult } from "./client-error";
import type { Sql } from "@/lib/db";
import type { AccountSnapshot, Chapter, Character, Leaf, Novel, NovelDetail, OutlineNode, Settings, SharedLeaf, SourceNote, UsageDay, VoiceDocs } from "./types";

type Err = { ok: false; error: string; code?: string };

async function run<T>(userId: string, fn: (sql: Sql) => Promise<T>): Promise<T | Err> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const { ensureLocalUser } = await import("@/lib/local-user.server");
    await ensureLocalUser(sql, userId);
    return sanitizeClientResult(await fn(sql));
  } catch (error) {
    return clientErrorFromThrown(error);
  }
}

export const bootstrap = createServerFn({ method: "GET" })
  .middleware([localUserMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; account: AccountSnapshot } | Err> => {
    const result = await run(context.userId, async (sql) => {
      const { readAccount } = await import("./store.server");
      return { ok: true as const, account: await readAccount(sql, context.userId) };
    });
    return result;
  });

export const loadNovel = createServerFn({ method: "POST" })
  .validator((input: { novelId: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; detail: NovelDetail | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { readDetail } = await import("./store.server");
      return { ok: true as const, detail: await readDetail(sql, context.userId, data.novelId) };
    });
  });

export const createNovel = createServerFn({ method: "POST" })
  .validator((input: { title: string; genre: string; logline: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; novel: Novel } | Err> => {
    return run(context.userId, async (sql) => {
      const { createNovel: insertNovel } = await import("./store.server");
      return { ok: true as const, novel: await insertNovel(sql, context.userId, data) };
    });
  });

export const updateNovel = createServerFn({ method: "POST" })
  .validator((input: { id: string; title: string; genre: string; logline: string; premise: string; styleNotes: string; soFar: string; ledger?: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; novel: Novel | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { updateNovel: editNovel } = await import("./store.server");
      return { ok: true as const, novel: await editNovel(sql, context.userId, data) };
    });
  });

export const removeNovel = createServerFn({ method: "POST" })
  .validator((input: { novelId: string }) => input)
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; node: OutlineNode | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveNode } = await import("./store.server");
      return { ok: true as const, node: await saveNode(sql, context.userId, data) };
    });
  });

export const removeOutlineNode = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; nodeId: string }) => input)
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; character: Character | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveCharacter } = await import("./store.server");
      return { ok: true as const, character: await saveCharacter(sql, context.userId, data) };
    });
  });

export const removePerson = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; characterId: string }) => input)
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; settings: Settings } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveToolset: save } = await import("./store.server");
      return { ok: true as const, settings: await save(sql, context.userId, { skills: data.skills, plugins: data.plugins }) };
    });
  });

export const saveStudio = createServerFn({ method: "POST" })
  .validator((input: { wild?: boolean; web?: boolean; thinking?: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; settings: Settings } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveStudio: writeStudio } = await import("./store.server");
      return { ok: true as const, settings: await writeStudio(sql, context.userId, data) };
    });
  });

export const reviewNovel = createServerFn({ method: "POST" })
  .validator((input: { novelId: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }) => {
    return run(context.userId, async (sql) => {
      const { reviewBook } = await import("./engine.server");
      return reviewBook(sql, context.userId, data.novelId);
    });
  });

export const runAgent = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; prompt: string; view: string; intent?: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }) => {
    return run(context.userId, async (sql) => {
      const { runNovelAgent } = await import("./engine.server");
      return runNovelAgent(sql, context.userId, data);
    });
  });

export const pingModel = createServerFn({ method: "POST" })
  .middleware([localUserMiddleware])
  .handler(async ({ context }) => {
    return run(context.userId, async (sql) => {
      const { testCustomConnection } = await import("./engine.server");
      return testCustomConnection(sql, context.userId);
    });
  });

export const saveVoice = createServerFn({ method: "POST" })
  .validator((input: { portrait: string; touch: string; preference: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; voice: VoiceDocs } | Err> => {
    return run(context.userId, async (sql) => {
      const { saveVoice: writeVoice } = await import("./store.server");
      return { ok: true as const, voice: await writeVoice(sql, context.userId, data) };
    });
  });

export const seedFromLine = createServerFn({ method: "POST" })
  .validator((input: { sentence: string }) => input)
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; novel: Novel; detail: NovelDetail; today: UsageDay | null } | Err> => {
    return run(context.userId, async (sql) => {
      const { beginFromLine } = await import("./engine.server");
      return { ok: true as const, ...(await beginFromLine(sql, context.userId, data.sentence)) };
    });
  });

export const learnText = createServerFn({ method: "POST" })
  .validator((input: { kind: string; title: string; body: string; novelId?: string; via?: string }) => input)
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; poems: Leaf[]; notes: Leaf[]; shares: SharedLeaf[] } | Err> => {
    return run(context.userId, async (sql) => {
      const { readShelf } = await import("./pages.server");
      return { ok: true as const, ...(await readShelf(sql, context.userId)) };
    });
  });

export const saveLeaf = createServerFn({ method: "POST" })
  .validator((input: { id?: string; kind: string; title: string; body: string }) => input)
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    return run(context.userId, async (sql) => {
      const { publishText: share } = await import("./pages.server");
      const id = await share(sql, context.userId, data);
      if (!id) return { ok: false as const, error: "没有可以放上的文字" };
      return { ok: true as const };
    });
  });

export const exportMyShares = createServerFn({ method: "GET" })
  .middleware([localUserMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; markdown: string } | Err> => {
    return run(context.userId, async (sql) => {
      const { exportOwnShares } = await import("./pages.server");
      return { ok: true as const, markdown: await exportOwnShares(sql, context.userId) };
    });
  });

export const unpublishText = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([localUserMiddleware])
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
  .middleware([localUserMiddleware])
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
