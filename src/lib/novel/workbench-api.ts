/**
 * 蓝稿 v2 书桌的服务端函数：卷章、版本、人物卡、设定库、作品信息、完整备份。
 * 都以本机唯一用户运行，返回 `{ ok: true, ... }` 或 `{ ok: false, error }`。
 */
import { createServerFn } from "@tanstack/react-start";
import { localUserMiddleware } from "@/lib/local-session";
import { clientErrorFromThrown, sanitizeClientResult } from "./client-error";
import type { Sql } from "@/lib/db";
import type { Chapter, ChapterVersion, ChapterVersionMeta, Character, LoreEntry, Volume } from "./types";
import type { PackSummary } from "@/lib/write/data-pack";

type Err = { ok: false; error: string; code?: string };

async function run<T>(userId: string, fn: (sql: Sql) => Promise<T>, opts: { tx?: boolean } = {}): Promise<T | Err> {
  try {
    const { getSql, withTransaction } = await import("@/lib/db");
    const sql = await getSql();
    const { ensureLocalUser } = await import("@/lib/local-user.server");
    await ensureLocalUser(sql, userId);
    const result = opts.tx ? await withTransaction(fn) : await fn(sql);
    return sanitizeClientResult(result);
  } catch (error) {
    return clientErrorFromThrown(error);
  }
}

const str = (v: unknown, name = "参数") => {
  if (typeof v !== "string") throw new Error(`${name}无效`);
  return v;
};
const optStr = (v: unknown) => (v === undefined || v === null ? undefined : str(v));
const obj = (v: unknown) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("参数无效");
  return v as Record<string, unknown>;
};

/* ---------------- 卷 ---------------- */

export const addVolume = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; title?: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), title: optStr(o.title) ?? "" };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; volume: Volume } | Err> =>
    run(context.userId, async (sql) => {
      const { createVolume } = await import("./workbench.server");
      return { ok: true as const, volume: await createVolume(sql, context.userId, data.novelId, data.title) };
    }),
  );

export const editVolume = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; volumeId: string; title?: string; summary?: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), volumeId: str(o.volumeId), title: optStr(o.title), summary: optStr(o.summary) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; volume: Volume } | Err> =>
    run(context.userId, async (sql) => {
      const { updateVolume } = await import("./workbench.server");
      const volume = await updateVolume(sql, context.userId, data.novelId, data.volumeId, data);
      if (!volume) return { ok: false as const, error: "找不到这一卷" };
      return { ok: true as const, volume };
    }),
  );

export const dropVolume = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; volumeId: string; withChapters: boolean }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), volumeId: str(o.volumeId), withChapters: o.withChapters === true };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> =>
    run(
      context.userId,
      async (sql) => {
        const { deleteVolume } = await import("./workbench.server");
        const done = await deleteVolume(sql, context.userId, data.novelId, data.volumeId, data.withChapters);
        if (!done) return { ok: false as const, error: "找不到这一卷" };
        return { ok: true as const };
      },
      { tx: true },
    ),
  );

export const reorderVolume = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; volumeId: string; toIndex: number }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), volumeId: str(o.volumeId), toIndex: Number(o.toIndex) || 0 };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> =>
    run(
      context.userId,
      async (sql) => {
        const { moveVolumeTo } = await import("./workbench.server");
        await moveVolumeTo(sql, context.userId, data.novelId, data.volumeId, data.toIndex);
        return { ok: true as const };
      },
      { tx: true },
    ),
  );

/* ---------------- 章节 ---------------- */

export const addChapter = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; volumeId: string | null; title?: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), volumeId: o.volumeId ? str(o.volumeId) : null, title: optStr(o.title) ?? "" };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; chapter: Chapter } | Err> =>
    run(context.userId, async (sql) => {
      const { createChapterIn } = await import("./workbench.server");
      return { ok: true as const, chapter: await createChapterIn(sql, context.userId, data.novelId, data.volumeId, data.title) };
    }),
  );

export const reorderChapter = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; chapterId: string; volumeId: string | null; toIndex: number }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), chapterId: str(o.chapterId), volumeId: o.volumeId ? str(o.volumeId) : null, toIndex: Number(o.toIndex) || 0 };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> =>
    run(
      context.userId,
      async (sql) => {
        const { moveChapterTo } = await import("./workbench.server");
        await moveChapterTo(sql, context.userId, data.novelId, data.chapterId, data.volumeId, data.toIndex);
        return { ok: true as const };
      },
      { tx: true },
    ),
  );

export const editChapterMeta = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; chapterId: string; title?: string; status?: string; note?: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), chapterId: str(o.chapterId), title: optStr(o.title), status: optStr(o.status), note: optStr(o.note) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; chapter: Chapter } | Err> =>
    run(context.userId, async (sql) => {
      const { updateChapterMeta } = await import("./workbench.server");
      const chapter = await updateChapterMeta(sql, context.userId, data.novelId, data.chapterId, data);
      if (!chapter) return { ok: false as const, error: "找不到这一章" };
      return { ok: true as const, chapter };
    }),
  );

/** 写正文（自动保存用）。返回保存后的章节，以及今日字数。 */
export const writeChapter = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; chapterId: string; title: string; body: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), chapterId: str(o.chapterId), title: str(o.title), body: str(o.body) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }) =>
    run(context.userId, async (sql) => {
      const { saveChapter, noteUsage } = await import("./store.server");
      const chapter = await saveChapter(sql, context.userId, { novelId: data.novelId, id: data.chapterId, title: data.title, body: data.body });
      if (!chapter) return { ok: false as const, error: "找不到这一章" };
      const today = await noteUsage(sql, context.userId, {});
      const { readNovelDays } = await import("./workbench.server");
      const days = await readNovelDays(sql, context.userId, data.novelId);
      return { ok: true as const, chapter, today, days };
    }),
  );

/* ---------------- 版本 ---------------- */

export const loadVersions = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; chapterId: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), chapterId: str(o.chapterId) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; versions: ChapterVersionMeta[] } | Err> =>
    run(context.userId, async (sql) => {
      const { listVersions } = await import("./workbench.server");
      return { ok: true as const, versions: await listVersions(sql, context.userId, data.novelId, data.chapterId) };
    }),
  );

export const loadVersion = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; versionId: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), versionId: str(o.versionId) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; version: ChapterVersion } | Err> =>
    run(context.userId, async (sql) => {
      const { readVersion } = await import("./workbench.server");
      const version = await readVersion(sql, context.userId, data.novelId, data.versionId);
      if (!version) return { ok: false as const, error: "找不到这个版本" };
      return { ok: true as const, version };
    }),
  );

export const keepVersion = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; chapterId: string; label: string; kind?: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), chapterId: str(o.chapterId), label: optStr(o.label) ?? "", kind: o.kind === "ai" ? ("ai" as const) : ("manual" as const) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; version: ChapterVersionMeta | null } | Err> =>
    run(context.userId, async (sql) => {
      const { createVersion } = await import("./workbench.server");
      return { ok: true as const, version: await createVersion(sql, context.userId, data.novelId, data.chapterId, data.kind, data.label) };
    }),
  );

export const backToVersion = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; versionId: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), versionId: str(o.versionId) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; chapter: Chapter } | Err> =>
    run(
      context.userId,
      async (sql) => {
        const { restoreVersion } = await import("./workbench.server");
        const chapter = await restoreVersion(sql, context.userId, data.novelId, data.versionId);
        if (!chapter) return { ok: false as const, error: "找不到这个版本" };
        return { ok: true as const, chapter };
      },
      { tx: true },
    ),
  );

export const dropVersion = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; versionId: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), versionId: str(o.versionId) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> =>
    run(context.userId, async (sql) => {
      const { deleteVersion } = await import("./workbench.server");
      if (!(await deleteVersion(sql, context.userId, data.novelId, data.versionId))) return { ok: false as const, error: "找不到这个版本" };
      return { ok: true as const };
    }),
  );

/* ---------------- 人物卡与设定 ---------------- */

export const saveCharacterCard = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; id?: string; name: string; role: string; bio: string; aliases?: string; appearance?: string; personality?: string; tags?: string }) => {
    const o = obj(input);
    return {
      novelId: str(o.novelId),
      id: optStr(o.id),
      name: str(o.name, "名字"),
      role: optStr(o.role) ?? "",
      bio: optStr(o.bio) ?? "",
      aliases: optStr(o.aliases) ?? "",
      appearance: optStr(o.appearance) ?? "",
      personality: optStr(o.personality) ?? "",
      tags: optStr(o.tags) ?? "",
    };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; character: Character } | Err> =>
    run(context.userId, async (sql) => {
      const { saveCard } = await import("./workbench.server");
      return { ok: true as const, character: await saveCard(sql, context.userId, data) };
    }),
  );

export const saveLoreEntry = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; id?: string; kind: string; name: string; summary: string; body: string; tags?: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), id: optStr(o.id), kind: optStr(o.kind) ?? "other", name: str(o.name, "名字"), summary: optStr(o.summary) ?? "", body: optStr(o.body) ?? "", tags: optStr(o.tags) ?? "" };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; entry: LoreEntry } | Err> =>
    run(context.userId, async (sql) => {
      const { saveLore } = await import("./workbench.server");
      return { ok: true as const, entry: await saveLore(sql, context.userId, data) };
    }),
  );

export const removeLoreEntry = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; loreId: string }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), loreId: str(o.loreId) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> =>
    run(context.userId, async (sql) => {
      const { deleteLore } = await import("./workbench.server");
      if (!(await deleteLore(sql, context.userId, data.novelId, data.loreId))) return { ok: false as const, error: "找不到这条设定" };
      return { ok: true as const };
    }),
  );

export const saveNovelMeta = createServerFn({ method: "POST" })
  .validator((input: { novelId: string; author?: string; dailyGoal?: number }) => {
    const o = obj(input);
    return { novelId: str(o.novelId), author: optStr(o.author), dailyGoal: o.dailyGoal === undefined ? undefined : Number(o.dailyGoal) || 0 };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> =>
    run(context.userId, async (sql) => {
      const { updateNovelMeta } = await import("./workbench.server");
      await updateNovelMeta(sql, context.userId, data.novelId, data);
      return { ok: true as const };
    }),
  );

/* ---------------- 完整备份 ---------------- */

export const exportAllData = createServerFn({ method: "POST" })
  .middleware([localUserMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; fileName: string; json: string; summary: PackSummary } | Err> =>
    run(context.userId, async (sql) => {
      const { exportPack } = await import("./workbench.server");
      const { packFileName, packSummary } = await import("@/lib/write/data-pack");
      const pack = await exportPack(sql, context.userId);
      return { ok: true as const, fileName: packFileName(), json: JSON.stringify(pack, null, 1), summary: packSummary(pack) };
    }),
  );

export const inspectDataPack = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => ({ text: str(obj(input).text) }))
  .middleware([localUserMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; summary: PackSummary } | Err> => {
    const { validatePack, packSummary } = await import("@/lib/write/data-pack");
    const check = validatePack(data.text);
    if (!check.ok) return { ok: false, error: check.error };
    return { ok: true, summary: packSummary(check.pack) };
  });

export const restoreDataPack = createServerFn({ method: "POST" })
  .validator((input: { text: string; mode: "merge" | "replace" }) => {
    const o = obj(input);
    return { text: str(o.text), mode: o.mode === "replace" ? ("replace" as const) : ("merge" as const) };
  })
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }) => {
    const { validatePack } = await import("@/lib/write/data-pack");
    const check = validatePack(data.text);
    if (!check.ok) return { ok: false as const, error: check.error };
    try {
      const { getSql, withTransaction } = await import("@/lib/db");
      const sql = await getSql();
      const { ensureLocalUser } = await import("@/lib/local-user.server");
      await ensureLocalUser(sql, context.userId);
      const { exportPack, restorePack, writeRestorePoint } = await import("./workbench.server");
      const { ensureAccount } = await import("./store.server");
      await ensureAccount(sql, context.userId);
      // 覆盖之前，先把现有数据写成恢复点文件；写不出来就不覆盖。
      const point = data.mode === "replace" ? writeRestorePoint(await exportPack(sql, context.userId)) : "";
      const result = await withTransaction((tx) => restorePack(tx, context.userId, check.pack, data.mode, point));
      return { ok: true as const, ...result };
    } catch (error) {
      return clientErrorFromThrown(error);
    }
  });
