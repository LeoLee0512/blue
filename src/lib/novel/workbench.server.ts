/**
 * 蓝稿 v2 书桌的数据层：卷、章节排序、版本、人物卡、设定库、每日字数、完整备份。
 * 只在服务端运行。所有查询都带 user_id，作品归属先校验再写。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "@/lib/db";
import { countWords } from "@/lib/write/wordcount";
import { moveChapter, moveVolume, defaultVolumeTitle, defaultChapterTitle } from "@/lib/write/tree";
import { asVersionKind, pruneVersions, shouldAutoSnapshot, type VersionKind } from "@/lib/write/versions";
import { makePack, NOVEL_TABLES, PACK_COLUMNS, PACK_TABLES, packSummary, remapForMerge, type Pack, type PackRow, type PackSummary, type PackTable } from "@/lib/write/data-pack";
import { dataDir } from "../../../scripts/data-dir.mjs";
import { clip, CodedError, mapChapter, mapCharacter, nid, stamp, type ChapterRow, type CharacterRow } from "./store.server";
import { todayKey } from "./format";
import type { Chapter, ChapterVersion, ChapterVersionMeta, Character, LoreEntry, LoreKind, NovelDay, NovelStat, Volume } from "./types";

type VolumeRow = { id: string; title: string; summary: string; sort_order: number };
type LoreRow = { id: string; kind: string; name: string; summary: string; body: string; tags: string; sort_order: number; updated_at: unknown };
type VersionRow = { id: string; chapter_id: string; kind: string; label: string; title: string; words: number; created_at: unknown; body?: string };

const LORE_KINDS: LoreKind[] = ["place", "item", "faction", "concept", "event", "other"];

export function asLoreKind(value: unknown): LoreKind {
  return LORE_KINDS.includes(value as LoreKind) ? (value as LoreKind) : "other";
}

function mapVolume(row: VolumeRow): Volume {
  return { id: row.id, title: row.title, summary: row.summary ?? "", sortOrder: Number(row.sort_order) || 0 };
}

function mapLore(row: LoreRow): LoreEntry {
  return {
    id: row.id,
    kind: asLoreKind(row.kind),
    name: row.name,
    summary: row.summary ?? "",
    body: row.body ?? "",
    tags: row.tags ?? "",
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: stamp(row.updated_at),
  };
}

function mapVersion(row: VersionRow): ChapterVersionMeta {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    kind: asVersionKind(row.kind),
    label: row.label ?? "",
    title: row.title ?? "",
    words: Number(row.words) || 0,
    createdAt: stamp(row.created_at),
  };
}

async function ownsNovel(sql: Sql, userId: string, novelId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`select id from novels where id = ${novelId} and user_id = ${userId}`;
  return Boolean(rows[0]);
}

async function requireNovel(sql: Sql, userId: string, novelId: string): Promise<void> {
  if (!(await ownsNovel(sql, userId, novelId))) throw new CodedError("MISSING", "找不到这部作品");
}

async function touch(sql: Sql, userId: string, novelId: string) {
  await sql`update novels set updated_at = now() where id = ${novelId} and user_id = ${userId}`;
}

/* ---------------- 读 ---------------- */

export async function readVolumes(sql: Sql, userId: string, novelId: string): Promise<Volume[]> {
  const rows = await sql<VolumeRow>`
    select id, title, summary, sort_order from volumes
    where novel_id = ${novelId} and user_id = ${userId}
    order by sort_order asc, created_at asc
  `;
  return rows.map(mapVolume);
}

export async function readLore(sql: Sql, userId: string, novelId: string): Promise<LoreEntry[]> {
  const rows = await sql<LoreRow>`
    select id, kind, name, summary, body, tags, sort_order, updated_at from lore_entries
    where novel_id = ${novelId} and user_id = ${userId}
    order by kind asc, sort_order asc, name asc
  `;
  return rows.map(mapLore);
}

export async function readNovelDays(sql: Sql, userId: string, novelId: string): Promise<NovelDay[]> {
  const rows = await sql<{ day: string; words: number }>`
    select day, words from novel_days
    where novel_id = ${novelId} and user_id = ${userId}
    order by day desc
    limit 120
  `;
  return rows.map((row) => ({ day: String(row.day).slice(0, 10), words: Number(row.words) || 0 }));
}

/** 旧数据的 words 列是 0：按需补算一次并写回。 */
export async function backfillWords(sql: Sql, userId: string, chapters: Chapter[]): Promise<Chapter[]> {
  const out: Chapter[] = [];
  for (const chapter of chapters) {
    if (chapter.words === 0 && chapter.body.trim()) {
      const words = countWords(chapter.body);
      await sql`update chapters set words = ${words} where id = ${chapter.id} and user_id = ${userId}`;
      out.push({ ...chapter, words });
    } else out.push(chapter);
  }
  return out;
}

export async function readNovelStats(sql: Sql, userId: string): Promise<NovelStat[]> {
  const stale = await sql<{ id: string; body: string }>`
    select id, body from chapters where user_id = ${userId} and words = 0 and body <> '' limit 500
  `;
  for (const row of stale) {
    await sql`update chapters set words = ${countWords(row.body)} where id = ${row.id} and user_id = ${userId}`;
  }
  const rows = await sql<{ novel_id: string; chapters: number; words: number }>`
    select novel_id, count(*)::int as chapters, coalesce(sum(words), 0)::int as words
    from chapters where user_id = ${userId}
    group by novel_id
  `;
  return rows.map((row) => ({ novelId: row.novel_id, chapters: Number(row.chapters) || 0, words: Number(row.words) || 0 }));
}

/* ---------------- 字数 ---------------- */

export async function noteNovelWords(sql: Sql, userId: string, novelId: string, words: number): Promise<void> {
  const n = Math.max(0, Math.round(words));
  if (!n) return;
  await sql`
    insert into novel_days (user_id, novel_id, day, words)
    select ${userId}, ${novelId}, ${todayKey()}, ${n}
    where exists (select 1 from "user" where id = ${userId})
    on conflict (user_id, novel_id, day) do update set words = novel_days.words + ${n}
  `;
}

/* ---------------- 卷与章节顺序 ---------------- */

export async function appendOrder(sql: Sql, userId: string, novelId: string, volumeId: string | null): Promise<number> {
  const rows = await sql<{ next: number }>`
    select coalesce(max(sort_order), 0) + 1 as next from chapters
    where novel_id = ${novelId} and user_id = ${userId} and volume_id is not distinct from ${volumeId}
  `;
  return Number(rows[0]?.next) || 1;
}

export async function lastVolumeId(sql: Sql, userId: string, novelId: string): Promise<string | null> {
  const rows = await sql<{ id: string }>`
    select id from volumes where novel_id = ${novelId} and user_id = ${userId}
    order by sort_order desc, created_at desc limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function createVolume(sql: Sql, userId: string, novelId: string, title: string): Promise<Volume> {
  await requireNovel(sql, userId, novelId);
  const existing = await readVolumes(sql, userId, novelId);
  const name = clip(title, 80) || defaultVolumeTitle(existing.length);
  const order = existing.reduce((max, v) => Math.max(max, v.sortOrder), 0) + 1;
  const rows = await sql<VolumeRow>`
    insert into volumes (id, novel_id, user_id, title, sort_order)
    values (${nid("v")}, ${novelId}, ${userId}, ${name}, ${order})
    returning id, title, summary, sort_order
  `;
  await touch(sql, userId, novelId);
  return mapVolume(rows[0]);
}

export async function updateVolume(sql: Sql, userId: string, novelId: string, volumeId: string, input: { title?: string; summary?: string }): Promise<Volume | null> {
  const current = await sql<VolumeRow>`select id, title, summary, sort_order from volumes where id = ${volumeId} and novel_id = ${novelId} and user_id = ${userId}`;
  if (!current[0]) return null;
  const title = input.title === undefined ? current[0].title : clip(input.title, 80) || current[0].title;
  const summary = input.summary === undefined ? current[0].summary : clip(input.summary, 2000);
  const rows = await sql<VolumeRow>`
    update volumes set title = ${title}, summary = ${summary}, updated_at = now()
    where id = ${volumeId} and user_id = ${userId}
    returning id, title, summary, sort_order
  `;
  await touch(sql, userId, novelId);
  return mapVolume(rows[0]);
}

/**
 * 删除一卷。`withChapters` 为 false 时，卷里的章节移到「未分卷」末尾；
 * 为 true 时连同章节（及其版本）一起删除。
 */
export async function deleteVolume(sql: Sql, userId: string, novelId: string, volumeId: string, withChapters: boolean): Promise<boolean> {
  const hit = await sql<{ id: string }>`select id from volumes where id = ${volumeId} and novel_id = ${novelId} and user_id = ${userId}`;
  if (!hit[0]) return false;
  const inside = await sql<{ id: string }>`
    select id from chapters where volume_id = ${volumeId} and novel_id = ${novelId} and user_id = ${userId} order by sort_order asc
  `;
  if (withChapters) {
    for (const row of inside) {
      await sql`delete from chapter_versions where chapter_id = ${row.id} and user_id = ${userId}`;
      await sql`delete from chapters where id = ${row.id} and user_id = ${userId}`;
    }
  } else {
    let order = await appendOrder(sql, userId, novelId, null);
    for (const row of inside) {
      await sql`update chapters set volume_id = null, sort_order = ${order} where id = ${row.id} and user_id = ${userId}`;
      order += 1;
    }
  }
  await sql`delete from volumes where id = ${volumeId} and user_id = ${userId}`;
  await touch(sql, userId, novelId);
  return true;
}

async function orderingRows(sql: Sql, userId: string, novelId: string) {
  const volumes = (await readVolumes(sql, userId, novelId)).map((v) => ({ id: v.id, title: v.title, sortOrder: v.sortOrder }));
  const chapters = (
    await sql<{ id: string; title: string; volume_id: string | null; sort_order: number }>`
      select id, title, volume_id, sort_order from chapters where novel_id = ${novelId} and user_id = ${userId}
    `
  ).map((row) => ({ id: row.id, title: row.title, volumeId: row.volume_id, sortOrder: Number(row.sort_order) || 0 }));
  return { volumes, chapters };
}

export async function moveChapterTo(sql: Sql, userId: string, novelId: string, chapterId: string, toVolumeId: string | null, toIndex: number): Promise<number> {
  await requireNovel(sql, userId, novelId);
  const { volumes, chapters } = await orderingRows(sql, userId, novelId);
  if (!chapters.some((c) => c.id === chapterId)) throw new CodedError("MISSING", "找不到这一章");
  const changes = moveChapter(volumes, chapters, chapterId, toVolumeId, toIndex);
  for (const change of changes) {
    await sql`
      update chapters set volume_id = ${change.volumeId}, sort_order = ${change.sortOrder}
      where id = ${change.id} and novel_id = ${novelId} and user_id = ${userId}
    `;
  }
  if (changes.length) await touch(sql, userId, novelId);
  return changes.length;
}

export async function moveVolumeTo(sql: Sql, userId: string, novelId: string, volumeId: string, toIndex: number): Promise<number> {
  await requireNovel(sql, userId, novelId);
  const { volumes } = await orderingRows(sql, userId, novelId);
  const changes = moveVolume(volumes, volumeId, toIndex);
  for (const change of changes) {
    await sql`update volumes set sort_order = ${change.sortOrder} where id = ${change.id} and novel_id = ${novelId} and user_id = ${userId}`;
  }
  if (changes.length) await touch(sql, userId, novelId);
  return changes.length;
}

export async function createChapterIn(sql: Sql, userId: string, novelId: string, volumeId: string | null, title: string): Promise<Chapter> {
  await requireNovel(sql, userId, novelId);
  let target: string | null = volumeId ? clip(volumeId, 40) : null;
  if (target) {
    const vol = await sql<{ id: string }>`select id from volumes where id = ${target} and novel_id = ${novelId} and user_id = ${userId}`;
    if (!vol[0]) target = null;
  }
  const count = await sql<{ n: number }>`select count(*)::int as n from chapters where novel_id = ${novelId} and user_id = ${userId}`;
  const name = clip(title, 80) || defaultChapterTitle(Number(count[0]?.n) || 0);
  const order = await appendOrder(sql, userId, novelId, target);
  const rows = await sql<ChapterRow>`
    insert into chapters (id, novel_id, user_id, volume_id, title, body, words, sort_order)
    values (${nid("c")}, ${novelId}, ${userId}, ${target}, ${name}, '', 0, ${order})
    returning id, node_id, volume_id, title, body, fact, status, note, words, sort_order, updated_at
  `;
  await touch(sql, userId, novelId);
  return mapChapter(rows[0]);
}

export async function updateChapterMeta(
  sql: Sql,
  userId: string,
  novelId: string,
  chapterId: string,
  input: { title?: string; status?: string; note?: string },
): Promise<Chapter | null> {
  const current = await sql<ChapterRow>`
    select id, node_id, volume_id, title, body, fact, status, note, words, sort_order, updated_at
    from chapters where id = ${chapterId} and novel_id = ${novelId} and user_id = ${userId}
  `;
  if (!current[0]) return null;
  const title = input.title === undefined ? current[0].title : clip(input.title, 80) || current[0].title;
  const status = input.status === undefined ? (current[0].status ?? "draft") : input.status === "done" ? "done" : "draft";
  const note = input.note === undefined ? (current[0].note ?? "") : clip(input.note, 4000);
  const rows = await sql<ChapterRow>`
    update chapters set title = ${title}, status = ${status}, note = ${note}, updated_at = now()
    where id = ${chapterId} and user_id = ${userId}
    returning id, node_id, volume_id, title, body, fact, status, note, words, sort_order, updated_at
  `;
  await touch(sql, userId, novelId);
  return mapChapter(rows[0]);
}

/* ---------------- 版本 ---------------- */

async function pruneChapterVersions(sql: Sql, userId: string, chapterId: string) {
  const rows = await sql<{ id: string; kind: string; created_at: unknown }>`
    select id, kind, created_at from chapter_versions where chapter_id = ${chapterId} and user_id = ${userId}
  `;
  const drop = pruneVersions(rows.map((row) => ({ id: row.id, kind: asVersionKind(row.kind), createdAt: stamp(row.created_at) })));
  for (const id of drop) await sql`delete from chapter_versions where id = ${id} and user_id = ${userId}`;
}

/** 把章节当前的内容存成一个版本。正文为空时不存。 */
export async function createVersion(sql: Sql, userId: string, novelId: string, chapterId: string, kind: VersionKind, label: string): Promise<ChapterVersionMeta | null> {
  const current = await sql<{ title: string; body: string }>`
    select title, body from chapters where id = ${chapterId} and novel_id = ${novelId} and user_id = ${userId}
  `;
  const chapter = current[0];
  if (!chapter || (!chapter.body.trim() && kind !== "manual")) return null;
  const rows = await sql<VersionRow>`
    insert into chapter_versions (id, chapter_id, novel_id, user_id, kind, label, title, body, words)
    values (${nid("cv")}, ${chapterId}, ${novelId}, ${userId}, ${kind}, ${clip(label, 80)}, ${chapter.title}, ${chapter.body}, ${countWords(chapter.body)})
    returning id, chapter_id, kind, label, title, words, created_at
  `;
  await pruneChapterVersions(sql, userId, chapterId);
  return mapVersion(rows[0]);
}

/** 保存正文后调用：按策略决定是否自动存一版。 */
export async function snapshotIfDue(sql: Sql, userId: string, novelId: string, chapterId: string, title: string, body: string): Promise<boolean> {
  const last = await sql<{ body: string; created_at: unknown }>`
    select body, created_at from chapter_versions
    where chapter_id = ${chapterId} and user_id = ${userId}
    order by created_at desc limit 1
  `;
  const prev = last[0] ? { body: last[0].body, createdAt: stamp(last[0].created_at) } : null;
  if (!shouldAutoSnapshot(prev, body)) return false;
  await sql`
    insert into chapter_versions (id, chapter_id, novel_id, user_id, kind, label, title, body, words)
    values (${nid("cv")}, ${chapterId}, ${novelId}, ${userId}, 'auto', '', ${title}, ${body}, ${countWords(body)})
  `;
  await pruneChapterVersions(sql, userId, chapterId);
  return true;
}

export async function listVersions(sql: Sql, userId: string, novelId: string, chapterId: string): Promise<ChapterVersionMeta[]> {
  const rows = await sql<VersionRow>`
    select id, chapter_id, kind, label, title, words, created_at from chapter_versions
    where chapter_id = ${chapterId} and novel_id = ${novelId} and user_id = ${userId}
    order by created_at desc
    limit 200
  `;
  return rows.map(mapVersion);
}

export async function readVersion(sql: Sql, userId: string, novelId: string, versionId: string): Promise<ChapterVersion | null> {
  const rows = await sql<VersionRow>`
    select id, chapter_id, kind, label, title, words, created_at, body from chapter_versions
    where id = ${versionId} and novel_id = ${novelId} and user_id = ${userId}
  `;
  return rows[0] ? { ...mapVersion(rows[0]), body: rows[0].body ?? "" } : null;
}

/** 恢复到某个版本：先把当前内容存为「恢复前」，再写回。 */
export async function restoreVersion(sql: Sql, userId: string, novelId: string, versionId: string): Promise<Chapter | null> {
  const version = await readVersion(sql, userId, novelId, versionId);
  if (!version) return null;
  await createVersion(sql, userId, novelId, version.chapterId, "restore", "恢复前");
  const rows = await sql<ChapterRow>`
    update chapters set body = ${version.body}, words = ${countWords(version.body)}, updated_at = now()
    where id = ${version.chapterId} and novel_id = ${novelId} and user_id = ${userId}
    returning id, node_id, volume_id, title, body, fact, status, note, words, sort_order, updated_at
  `;
  if (!rows[0]) return null;
  await touch(sql, userId, novelId);
  return mapChapter(rows[0]);
}

export async function deleteVersion(sql: Sql, userId: string, novelId: string, versionId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    delete from chapter_versions where id = ${versionId} and novel_id = ${novelId} and user_id = ${userId} returning id
  `;
  return Boolean(rows[0]);
}

/* ---------------- 人物卡 ---------------- */

export type CardInput = { novelId: string; id?: string; name: string; role: string; bio: string; aliases?: string; appearance?: string; personality?: string; tags?: string };

export async function saveCard(sql: Sql, userId: string, input: CardInput): Promise<Character> {
  await requireNovel(sql, userId, input.novelId);
  const name = clip(input.name, 40);
  if (!name) throw new CodedError("NAME", "人物需要一个名字");
  const fields = {
    role: clip(input.role, 80),
    bio: clip(input.bio, 6000),
    aliases: clip(input.aliases, 200),
    appearance: clip(input.appearance, 2000),
    personality: clip(input.personality, 2000),
    tags: clip(input.tags, 200),
  };
  if (input.id) {
    const rows = await sql<CharacterRow>`
      update characters set name = ${name}, role = ${fields.role}, bio = ${fields.bio}, aliases = ${fields.aliases},
        appearance = ${fields.appearance}, personality = ${fields.personality}, tags = ${fields.tags}, updated_at = now()
      where id = ${input.id} and novel_id = ${input.novelId} and user_id = ${userId}
      returning id, name, role, bio, aliases, appearance, personality, tags, sort_order
    `;
    if (!rows[0]) throw new CodedError("MISSING", "找不到这个人物");
    await touch(sql, userId, input.novelId);
    return mapCharacter(rows[0]);
  }
  const order = await sql<{ next: number }>`
    select coalesce(max(sort_order), 0) + 1 as next from characters where novel_id = ${input.novelId} and user_id = ${userId}
  `;
  const rows = await sql<CharacterRow>`
    insert into characters (id, novel_id, user_id, name, role, bio, aliases, appearance, personality, tags, sort_order)
    values (${nid("p")}, ${input.novelId}, ${userId}, ${name}, ${fields.role}, ${fields.bio}, ${fields.aliases},
      ${fields.appearance}, ${fields.personality}, ${fields.tags}, ${Number(order[0]?.next) || 1})
    returning id, name, role, bio, aliases, appearance, personality, tags, sort_order
  `;
  await touch(sql, userId, input.novelId);
  return mapCharacter(rows[0]);
}

/* ---------------- 设定库 ---------------- */

export type LoreInput = { novelId: string; id?: string; kind: string; name: string; summary: string; body: string; tags?: string };

export async function saveLore(sql: Sql, userId: string, input: LoreInput): Promise<LoreEntry> {
  await requireNovel(sql, userId, input.novelId);
  const name = clip(input.name, 60);
  if (!name) throw new CodedError("NAME", "设定需要一个名字");
  const kind = asLoreKind(input.kind);
  const summary = clip(input.summary, 400);
  const body = clip(input.body, 12000);
  const tags = clip(input.tags, 200);
  if (input.id) {
    const rows = await sql<LoreRow>`
      update lore_entries set kind = ${kind}, name = ${name}, summary = ${summary}, body = ${body}, tags = ${tags}, updated_at = now()
      where id = ${input.id} and novel_id = ${input.novelId} and user_id = ${userId}
      returning id, kind, name, summary, body, tags, sort_order, updated_at
    `;
    if (!rows[0]) throw new CodedError("MISSING", "找不到这条设定");
    await touch(sql, userId, input.novelId);
    return mapLore(rows[0]);
  }
  const order = await sql<{ next: number }>`
    select coalesce(max(sort_order), 0) + 1 as next from lore_entries where novel_id = ${input.novelId} and user_id = ${userId}
  `;
  const rows = await sql<LoreRow>`
    insert into lore_entries (id, novel_id, user_id, kind, name, summary, body, tags, sort_order)
    values (${nid("l")}, ${input.novelId}, ${userId}, ${kind}, ${name}, ${summary}, ${body}, ${tags}, ${Number(order[0]?.next) || 1})
    returning id, kind, name, summary, body, tags, sort_order, updated_at
  `;
  await touch(sql, userId, input.novelId);
  return mapLore(rows[0]);
}

export async function deleteLore(sql: Sql, userId: string, novelId: string, loreId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    delete from lore_entries where id = ${loreId} and novel_id = ${novelId} and user_id = ${userId} returning id
  `;
  if (rows[0]) await touch(sql, userId, novelId);
  return Boolean(rows[0]);
}

/* ---------------- 作品信息 ---------------- */

export async function updateNovelMeta(sql: Sql, userId: string, novelId: string, input: { author?: string; dailyGoal?: number }): Promise<void> {
  await requireNovel(sql, userId, novelId);
  if (input.author !== undefined) await sql`update novels set author = ${clip(input.author, 40)} where id = ${novelId} and user_id = ${userId}`;
  if (input.dailyGoal !== undefined) {
    const goal = Math.max(0, Math.min(200000, Math.round(Number(input.dailyGoal) || 0)));
    await sql`update novels set daily_goal = ${goal} where id = ${novelId} and user_id = ${userId}`;
  }
}

/* ---------------- 完整备份 ---------------- */

/** 每张表在数据库里对应的表名（settings 来自 profiles）。 */
const SOURCE_TABLE: Record<PackTable, string> = {
  novels: "novels",
  volumes: "volumes",
  chapters: "chapters",
  chapter_versions: "chapter_versions",
  characters: "characters",
  lore_entries: "lore_entries",
  outline_nodes: "outline_nodes",
  messages: "messages",
  novel_days: "novel_days",
  pieces: "pieces",
  voice_docs: "voice_docs",
  usage_days: "usage_days",
  source_texts: "source_texts",
  settings: "profiles",
};

const INT_COLUMNS = new Set(["sort_order", "words", "daily_goal", "tokens", "user_chars", "ai_chars", "wild"]);

export async function exportPack(sql: Sql, userId: string): Promise<Pack> {
  const tables: Partial<Record<PackTable, Record<string, unknown>[]>> = {};
  for (const table of PACK_TABLES) {
    // 列名只来自 PACK_COLUMNS 常量；绝不选 api_key。
    const columns = PACK_COLUMNS[table].map((c) => `"${c}"`).join(", ");
    tables[table] = await sql.query<Record<string, unknown>>(`select ${columns} from ${SOURCE_TABLE[table]} where user_id = $1`, [userId]);
  }
  return makePack(tables);
}

function coerce(column: string, value: PackRow[string]): unknown {
  if (INT_COLUMNS.has(column)) return Math.round(Number(value) || 0);
  if (column.endsWith("_at")) {
    const t = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
  }
  if (value === null) return null;
  return typeof value === "string" ? value : String(value);
}

async function insertRows(sql: Sql, userId: string, table: PackTable, rows: PackRow[]): Promise<number> {
  const allowed = PACK_COLUMNS[table] as readonly string[];
  let count = 0;
  for (const row of rows) {
    const columns = allowed.filter((c) => c in row);
    if (!columns.length) continue;
    const values = columns.map((c) => coerce(c, row[c]));
    const names = [...columns.map((c) => `"${c}"`), "user_id"].join(", ");
    const marks = [...columns.map((_, i) => `$${i + 1}`), `$${columns.length + 1}`].join(", ");
    await sql.query(`insert into ${SOURCE_TABLE[table]} (${names}) values (${marks}) on conflict do nothing`, [...values, userId]);
    count += 1;
  }
  return count;
}

/** 覆盖恢复前，把当前数据写成一个恢复点文件（在数据目录 restore-points 下）。 */
export function writeRestorePoint(pack: Pack, now = new Date()): string {
  const dir = path.join(dataDir(), "restore-points");
  mkdirSync(dir, { recursive: true });
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `恢复点-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.langao.json`;
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(pack), { encoding: "utf8", mode: 0o600 });
  return file;
}

export type RestoreResult = { mode: "merge" | "replace"; summary: PackSummary; restorePoint: string };

/**
 * 恢复。调用方负责把 `sql` 放进一个事务里（见 api 层的 withTransaction）。
 * replace：清空本机作品数据后写入；模型连接和密钥不动。
 * merge：作品作为副本加入，不影响现有数据。
 */
export async function restorePack(sql: Sql, userId: string, pack: Pack, mode: "merge" | "replace", restorePoint: string): Promise<RestoreResult> {
  const summary = packSummary(pack);
  if (mode === "merge") {
    const remapped = remapForMerge(pack, nid, "（导入）");
    for (const table of ["novels", ...NOVEL_TABLES, "pieces"] as PackTable[]) {
      await insertRows(sql, userId, table, remapped[table] ?? []);
    }
    return { mode, summary, restorePoint: "" };
  }
  for (const table of ["chapter_versions", "chapters", "volumes", "characters", "lore_entries", "outline_nodes", "messages", "novel_days", "novels", "pieces", "usage_days", "source_texts"] as PackTable[]) {
    await sql.query(`delete from ${SOURCE_TABLE[table]} where user_id = $1`, [userId]);
  }
  for (const table of ["novels", ...NOVEL_TABLES, "pieces", "usage_days", "source_texts"] as PackTable[]) {
    await insertRows(sql, userId, table, pack.tables[table]);
  }
  const voice = pack.tables.voice_docs[0];
  if (voice) {
    await sql`
      update voice_docs set portrait_md = ${String(voice.portrait_md ?? "")}, touch_md = ${String(voice.touch_md ?? "")},
        preference_md = ${String(voice.preference_md ?? "")}, updated_at = now()
      where user_id = ${userId}
    `;
  }
  const settings = pack.tables.settings[0];
  if (settings) {
    // 只恢复写作偏好；服务商、模型和密钥保持本机现状。
    await sql`
      update profiles set skills = ${String(settings.skills ?? "")}, plugins = ${String(settings.plugins ?? "")},
        wild = ${Number(settings.wild) ? 1 : 0}, thinking = ${["low", "mid", "high"].includes(String(settings.thinking)) ? String(settings.thinking) : "mid"}
      where user_id = ${userId}
    `;
  }
  return { mode, summary, restorePoint };
}
