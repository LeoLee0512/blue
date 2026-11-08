import { entryById, findWhitelisted, isWhitelisted, NOT_LISTED, resolveConnection } from "./model-whitelist";
import type { Sql } from "@/lib/db";
import { readPlan, WEB_SEARCH_ENABLED } from "./plan.server";
import { SecretBoxError, compareAndSetStoredKey, isSealed, openSecret, sealSecret } from "./secret-box.server";
import { chapterFact, todayKey } from "./format";
import {
  DEFAULT_PLUGINS,
  DEFAULT_SKILLS,
  EMPTY_ACTS,
  EMPTY_VOICE,
  GENRES,
  INK,
  knownPluginIds,
  knownSkillIds,
  packById,
} from "./catalog";
import type {
  AccountSnapshot,
  Chapter,
  Character,
  ChatMessage,
  LedgerEntry,
  Novel,
  NovelDetail,
  NodeKind,
  OutlineNode,
  Settings,
  SourceNote,
  UsageDay,
  VoiceDocs,
  Wallet,
} from "./types";

type NovelRow = {
  id: string;
  title: string;
  genre: string;
  logline: string;
  premise: string;
  style_notes: string;
  so_far: string;
  ledger: string;
  commentary: string;
  updated_at: unknown;
};

type OutlineRow = {
  id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  summary: string;
  sort_order: number;
  status: string;
};

type ChapterRow = {
  id: string;
  node_id: string | null;
  title: string;
  body: string;
  fact: string;
  sort_order: number;
  updated_at: unknown;
};

type CharacterRow = {
  id: string;
  name: string;
  role: string;
  bio: string;
  sort_order: number;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  tool_name: string | null;
  created_at: unknown;
};

type ProfileRow = {
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  skills: string;
  plugins: string;
  wild?: number | boolean | null;
  web_on?: number | boolean | null;
  thinking?: string | null;
  context_used?: number | null;
};

type WalletRow = { balance: number; hosted_calls: number };
type LedgerRow = { id: number; delta: number; reason: string; created_at: unknown };

export function nid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function stamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

function mapNovel(row: NovelRow): Novel {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre,
    logline: row.logline,
    premise: row.premise,
    styleNotes: row.style_notes,
    soFar: row.so_far ?? "",
    ledger: row.ledger ?? "",
    commentary: row.commentary ?? "",
    updatedAt: stamp(row.updated_at),
  };
}

function asKind(value: string): NodeKind {
  if (value === "volume" || value === "chapter" || value === "beat") return value;
  return "beat";
}

function mapNode(row: OutlineRow): OutlineNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: asKind(row.kind),
    title: row.title,
    summary: row.summary,
    sortOrder: Number(row.sort_order) || 0,
    status: row.status,
  };
}

function mapChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    nodeId: row.node_id,
    title: row.title,
    body: row.body,
    fact: row.fact ?? "",
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: stamp(row.updated_at),
  };
}

function mapCharacter(row: CharacterRow): Character {
  return { id: row.id, name: row.name, role: row.role, bio: row.bio };
}

function mapMessage(row: MessageRow): ChatMessage {
  const role = row.role === "assistant" || row.role === "tool" ? row.role : "user";
  return {
    id: row.id,
    role,
    content: row.content,
    toolName: row.tool_name,
    createdAt: stamp(row.created_at),
  };
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

function parseIds(raw: string, fallback: string[]): string[] {
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return ids.length ? ids : fallback;
}

function readStoredKey(stored: string, userId: string): string {
  try {
    return openSecret(stored, userId);
  } catch (error) {
    if (error instanceof SecretBoxError) throw new CodedError(error.code, error.message);
    throw error;
  }
}

function sealStoredKey(plain: string, userId: string): string {
  try {
    return sealSecret(plain, userId);
  } catch (error) {
    if (error instanceof SecretBoxError) throw new CodedError(error.code, error.message);
    throw error;
  }
}

function maskStoredKey(stored: string, userId: string): string {
  if (!stored) return "";
  if (!isSealed(stored)) return maskKey(stored);
  try {
    return maskKey(openSecret(stored, userId));
  } catch (error) {
    if (error instanceof SecretBoxError) return "无法读取";
    throw error;
  }
}

async function migratePlainApiKey(sql: Sql, userId: string, original: string): Promise<void> {
  await compareAndSetStoredKey(async (sealed, unchanged) => {
    const rows = await sql<{ api_key: string }>`
      update profiles set api_key = ${sealed}
      where user_id = ${userId} and api_key = ${unchanged}
      returning api_key
    `;
    return Boolean(rows[0]);
  }, userId, original);
}

function mapSettings(row: ProfileRow, userId: string): Settings {
  const provider = row.provider === "custom" ? "custom" : "hosted";
  return {
    provider,
    baseUrl: row.base_url,
    model: row.model,
    hasKey: Boolean(row.api_key),
    usable: isWhitelisted(row.base_url, row.model),
    connection: resolveConnection(row.base_url, row.model, Boolean(row.api_key)),
    keyMask: maskStoredKey(row.api_key, userId),
    skills: knownSkillIds(parseIds(row.skills, DEFAULT_SKILLS)),
    plugins: knownPluginIds(parseIds(row.plugins, DEFAULT_PLUGINS)),
    wild: Number(row.wild) === 1,
    web: Number(row.web_on) === 1,
    thinking: row.thinking === "low" || row.thinking === "high" ? row.thinking : "mid",
    contextUsed: Number(row.context_used) || 0,
  };
}

export async function ensureAccount(sql: Sql, userId: string): Promise<void> {
  // 注销后旧 Cookie 在 cookieCache 有效期内仍可通过鉴权；建账前必须确认用户仍存在，
  // 否则会把已注销账号的 wallets/ledger/profiles/voice_docs 重新建出来（Jim s6 H1）。
  const alive = await sql<{ id: string }>`select id from "user" where id = ${userId} limit 1`;
  if (!alive[0]) throw new Error("ACCOUNT_GONE");
  // 2026-11-01 全免费：不再开钱包、不再写“开通赠送”墨点流水（wallets/ledger 表与旧数据保留，只停写）。
  const skills = DEFAULT_SKILLS.join(",");
  const plugins = DEFAULT_PLUGINS.join(",");
  await sql`
    insert into profiles (user_id, provider, base_url, model, api_key, skills, plugins)
    values (${userId}, 'custom', '', '', '', ${skills}, ${plugins}) -- 2026-11-01 不再预填 DeepSeek，由用户自己填写
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into voice_docs (user_id, portrait_md, touch_md, preference_md)
    values (${userId}, ${EMPTY_VOICE.portrait}, ${EMPTY_VOICE.touch}, ${EMPTY_VOICE.preference})
    on conflict (user_id) do nothing
  `;
}

async function touchNovel(sql: Sql, userId: string, novelId: string) {
  await sql`
    update novels set updated_at = now()
    where id = ${novelId} and user_id = ${userId}
  `;
}

export async function readAccount(sql: Sql, userId: string): Promise<AccountSnapshot> {
  await ensureAccount(sql, userId);
  const novels = await sql<NovelRow>`
    select id, title, genre, logline, premise, style_notes, so_far, ledger, commentary, updated_at
    from novels where user_id = ${userId}
    order by updated_at desc
  `;
  // 2026-11-01 全免费：bootstrap 不再读、不再返回钱包与墨点流水。
  const profiles = await sql<ProfileRow>`
    select provider, base_url, model, api_key, skills, plugins, wild, web_on, thinking, context_used
    from profiles where user_id = ${userId}
  `;
  const profile = profiles[0] ?? {
    provider: "hosted",
    base_url: "",
    model: "",
    api_key: "",
    skills: DEFAULT_SKILLS.join(","),
    plugins: DEFAULT_PLUGINS.join(","),
    wild: 0,
    web_on: 0,
    thinking: "mid",
    context_used: 0,
  };
  if (profile.api_key && !isSealed(profile.api_key)) {
    try {
      await migratePlainApiKey(sql, userId, profile.api_key);
    } catch (error) {
      if (!(error instanceof SecretBoxError)) throw error;
    }
  }
  return {
    novels: novels.map(mapNovel),
    settings: mapSettings(profile, userId),
    voice: await readVoice(sql, userId),
    sources: await listSources(sql, userId),
    usage: await readUsage(sql, userId),
  };
}

async function ownedNovel(sql: Sql, userId: string, novelId: string): Promise<Novel | null> {
  const rows = await sql<NovelRow>`
    select id, title, genre, logline, premise, style_notes, so_far, ledger, commentary, updated_at
    from novels where id = ${novelId} and user_id = ${userId}
  `;
  return rows[0] ? mapNovel(rows[0]) : null;
}

export async function readDetail(sql: Sql, userId: string, novelId: string): Promise<NovelDetail | null> {
  const novel = await ownedNovel(sql, userId, novelId);
  if (!novel) return null;
  const outline = await sql<OutlineRow>`
    select id, parent_id, kind, title, summary, sort_order, status
    from outline_nodes where novel_id = ${novelId} and user_id = ${userId}
    order by sort_order asc, title asc
  `;
  const chapters = await sql<ChapterRow>`
    select id, node_id, title, body, fact, sort_order, updated_at
    from chapters where novel_id = ${novelId} and user_id = ${userId}
    order by sort_order asc, updated_at asc
  `;
  const characters = await sql<CharacterRow>`
    select id, name, role, bio, sort_order
    from characters where novel_id = ${novelId} and user_id = ${userId}
    order by sort_order asc, name asc
  `;
  const messages = await sql<MessageRow>`
    select id, role, content, tool_name, created_at
    from messages where novel_id = ${novelId} and user_id = ${userId}
    order by created_at asc
    limit 80
  `;
  return {
    novel,
    outline: outline.map(mapNode),
    chapters: chapters.map(mapChapter),
    characters: characters.map(mapCharacter),
    messages: messages.map(mapMessage),
  };
}

export async function createNovel(
  sql: Sql,
  userId: string,
  input: { title: string; genre: string; logline: string },
): Promise<Novel> {
  await ensureAccount(sql, userId);
  const seat = await readPlan(sql, userId);
  if (seat.id === "free") {
    const taken = await sql<{ id: string }>`select id from novels where user_id = ${userId}`;
    if (taken.length >= 1) throw new Error("第二本书，要先坐下来。一杯咖啡，一个月。");
  }
  const title = clip(input.title, 80);
  if (!title) throw new Error("请写一个书名");
  const genre = GENRES.includes(input.genre as (typeof GENRES)[number]) ? input.genre : GENRES[0];
  const id = nid("n");
  const rows = await sql<NovelRow>`
    insert into novels (id, user_id, title, genre, logline)
    values (${id}, ${userId}, ${title}, ${genre}, ${clip(input.logline, 400)})
    returning id, title, genre, logline, premise, style_notes, so_far, ledger, commentary, updated_at
  `;
  return mapNovel(rows[0]);
}

export async function updateNovel(
  sql: Sql,
  userId: string,
  input: { id: string; title: string; genre: string; logline: string; premise: string; styleNotes: string; soFar: string; ledger?: string },
): Promise<Novel | null> {
  const title = clip(input.title, 80);
  if (!title) throw new Error("书名不能空");
  const genre = GENRES.includes(input.genre as (typeof GENRES)[number]) ? input.genre : "";
  const rows = await sql<NovelRow>`
    update novels set
      title = ${title},
      genre = ${genre},
      logline = ${clip(input.logline, 400)},
      premise = ${clip(input.premise, 6000)},
      style_notes = ${clip(input.styleNotes, 2400)},
      so_far = ${clip(input.soFar, 2400)},
      ledger = ${clip(input.ledger ?? "", 8000)},
      updated_at = now()
    where id = ${input.id} and user_id = ${userId}
    returning id, title, genre, logline, premise, style_notes, so_far, ledger, commentary, updated_at
  `;
  return rows[0] ? mapNovel(rows[0]) : null;
}

export async function updateLedger(sql: Sql, userId: string, novelId: string, ledger: string): Promise<string> {
  const text = clip(ledger, 8000).trim();
  if (!text) return "手里的线是空的";
  const rows = await sql<{ id: string }>`
    update novels set ledger = ${text}, updated_at = now()
    where id = ${novelId} and user_id = ${userId}
    returning id
  `;
  return rows[0] ? "已记下手里的线" : "没有这部作品";
}

export async function saveCommentary(sql: Sql, userId: string, novelId: string, commentary: string): Promise<void> {
  await sql`
    update novels set commentary = ${clip(commentary, 8000)}, updated_at = now()
    where id = ${novelId} and user_id = ${userId}
  `;
}

export async function deleteNovel(sql: Sql, userId: string, novelId: string): Promise<boolean> {
  const owned = await ownedNovel(sql, userId, novelId);
  if (!owned) return false;
  await sql`delete from messages where novel_id = ${novelId} and user_id = ${userId}`;
  await sql`delete from characters where novel_id = ${novelId} and user_id = ${userId}`;
  await sql`delete from chapters where novel_id = ${novelId} and user_id = ${userId}`;
  await sql`delete from outline_nodes where novel_id = ${novelId} and user_id = ${userId}`;
  await sql`delete from novels where id = ${novelId} and user_id = ${userId}`;
  return true;
}

export async function saveNode(
  sql: Sql,
  userId: string,
  input: {
    novelId: string;
    id?: string;
    parentId?: string | null;
    kind: string;
    title: string;
    summary: string;
  },
): Promise<OutlineNode | null> {
  const novel = await ownedNovel(sql, userId, input.novelId);
  if (!novel) return null;
  const kind = asKind(input.kind);
  const title = clip(input.title, 80) || "未命名";
  const summary = clip(input.summary, 500);
  let parentId = input.parentId ? clip(input.parentId, 40) : "";
  if (parentId) {
    const parent = await sql<{ id: string }>`
      select id from outline_nodes
      where id = ${parentId} and novel_id = ${input.novelId} and user_id = ${userId}
    `;
    if (!parent[0]) parentId = "";
  }
  if (input.id) {
    const rows = await sql<OutlineRow>`
      update outline_nodes set
        parent_id = ${parentId || null},
        kind = ${kind},
        title = ${title},
        summary = ${summary}
      where id = ${input.id} and novel_id = ${input.novelId} and user_id = ${userId}
      returning id, parent_id, kind, title, summary, sort_order, status
    `;
    if (!rows[0]) return null;
    await touchNovel(sql, userId, input.novelId);
    return mapNode(rows[0]);
  }
  const orderRows = await sql<{ next: number }>`
    select coalesce(max(sort_order), 0) + 1 as next
    from outline_nodes where novel_id = ${input.novelId} and user_id = ${userId}
  `;
  const id = nid("o");
  const rows = await sql<OutlineRow>`
    insert into outline_nodes (id, novel_id, user_id, parent_id, kind, title, summary, sort_order)
    values (
      ${id}, ${input.novelId}, ${userId}, ${parentId || null}, ${kind}, ${title}, ${summary},
      ${Number(orderRows[0]?.next) || 1}
    )
    returning id, parent_id, kind, title, summary, sort_order, status
  `;
  await touchNovel(sql, userId, input.novelId);
  return mapNode(rows[0]);
}

export async function deleteNode(sql: Sql, userId: string, novelId: string, nodeId: string): Promise<boolean> {
  const rows = await sql<{ id: string; parent_id: string | null }>`
    select id, parent_id from outline_nodes
    where novel_id = ${novelId} and user_id = ${userId}
  `;
  const drop = new Set<string>();
  const visit = (id: string) => {
    drop.add(id);
    for (const row of rows) if (row.parent_id === id) visit(row.id);
  };
  if (!rows.some((row) => row.id === nodeId)) return false;
  visit(nodeId);
  for (const id of drop) {
    await sql`delete from outline_nodes where id = ${id} and user_id = ${userId}`;
  }
  await touchNovel(sql, userId, novelId);
  return true;
}

export async function applyEmptyActs(sql: Sql, userId: string, novelId: string, force: boolean): Promise<string | null> {
  const novel = await ownedNovel(sql, userId, novelId);
  if (!novel) return "找不到这部作品";
  const existing = await sql<{ id: string }>`
    select id from outline_nodes where novel_id = ${novelId} and user_id = ${userId} limit 1
  `;
  if (existing[0] && !force) return "大纲里已经有内容";
  await sql`delete from outline_nodes where novel_id = ${novelId} and user_id = ${userId}`;
  const ids = new Map<string, string>();
  let order = 1;
  for (const node of EMPTY_ACTS) {
    const id = nid("o");
    ids.set(node.ref, id);
    const parentId = node.parent ? (ids.get(node.parent) ?? null) : null;
    await sql`
      insert into outline_nodes (id, novel_id, user_id, parent_id, kind, title, summary, sort_order)
      values (${id}, ${novelId}, ${userId}, ${parentId}, ${node.kind}, ${node.title}, ${node.summary}, ${order})
    `;
    order += 1;
  }
  await touchNovel(sql, userId, novelId);
  return null;
}

export async function saveChapter(
  sql: Sql,
  userId: string,
  input: { novelId: string; id?: string; title: string; body: string; nodeId?: string | null },
): Promise<Chapter | null> {
  const novel = await ownedNovel(sql, userId, input.novelId);
  if (!novel) return null;
  const title = clip(input.title, 80) || "未命名章节";
  const body = clip(input.body, 20000);
  let nodeId = input.nodeId ? clip(input.nodeId, 40) : "";
  if (nodeId) {
    const node = await sql<{ id: string }>`
      select id from outline_nodes
      where id = ${nodeId} and novel_id = ${input.novelId} and user_id = ${userId}
    `;
    if (!node[0]) nodeId = "";
  }
  if (input.id) {
    const previous = await sql<{ body: string }>`
      select body from chapters where id = ${input.id} and novel_id = ${input.novelId} and user_id = ${userId}
    `;
    const rows = await sql<ChapterRow>`
      update chapters set title = ${title}, body = ${body}, node_id = ${nodeId || null}, updated_at = now()
      where id = ${input.id} and novel_id = ${input.novelId} and user_id = ${userId}
      returning id, node_id, title, body, fact, sort_order, updated_at
    `;
    if (!rows[0]) return null;
    const grown = Math.max(0, body.length - (previous[0]?.body.length ?? 0));
    if (grown) await noteUsage(sql, userId, { userChars: grown });
    if (body.trim()) await rememberProgress(sql, userId, input.novelId, novel.soFar, title, body);
    else await touchNovel(sql, userId, input.novelId);
    return mapChapter(rows[0]);
  }
  const orderRows = await sql<{ next: number }>`
    select coalesce(max(sort_order), 0) + 1 as next
    from chapters where novel_id = ${input.novelId} and user_id = ${userId}
  `;
  const id = nid("c");
  const rows = await sql<ChapterRow>`
    insert into chapters (id, novel_id, user_id, node_id, title, body, sort_order)
    values (${id}, ${input.novelId}, ${userId}, ${nodeId || null}, ${title}, ${body}, ${Number(orderRows[0]?.next) || 1})
    returning id, node_id, title, body, fact, sort_order, updated_at
  `;
  await touchNovel(sql, userId, input.novelId);
  if (body.length) await noteUsage(sql, userId, { userChars: body.length });
  if (body.trim()) await rememberProgress(sql, userId, input.novelId, novel.soFar, title, body);
  return mapChapter(rows[0]);
}

export async function deleteChapter(sql: Sql, userId: string, novelId: string, chapterId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    delete from chapters where id = ${chapterId} and novel_id = ${novelId} and user_id = ${userId}
    returning id
  `;
  if (!rows[0]) return false;
  await touchNovel(sql, userId, novelId);
  return true;
}

export async function saveCharacter(
  sql: Sql,
  userId: string,
  input: { novelId: string; id?: string; name: string; role: string; bio: string },
): Promise<Character | null> {
  const novel = await ownedNovel(sql, userId, input.novelId);
  if (!novel) return null;
  const name = clip(input.name, 40);
  if (!name) throw new Error("人物需要一个名字");
  const role = clip(input.role, 80);
  const bio = clip(input.bio, 2400);
  if (input.id) {
    const rows = await sql<CharacterRow>`
      update characters set name = ${name}, role = ${role}, bio = ${bio}
      where id = ${input.id} and novel_id = ${input.novelId} and user_id = ${userId}
      returning id, name, role, bio, sort_order
    `;
    if (!rows[0]) return null;
    await touchNovel(sql, userId, input.novelId);
    return mapCharacter(rows[0]);
  }
  const same = await sql<CharacterRow>`
    select id, name, role, bio, sort_order from characters
    where novel_id = ${input.novelId} and user_id = ${userId} and name = ${name}
    limit 1
  `;
  if (same[0]) {
    const rows = await sql<CharacterRow>`
      update characters set role = ${role}, bio = ${bio}
      where id = ${same[0].id} and user_id = ${userId}
      returning id, name, role, bio, sort_order
    `;
    await touchNovel(sql, userId, input.novelId);
    return mapCharacter(rows[0]);
  }
  const orderRows = await sql<{ next: number }>`
    select coalesce(max(sort_order), 0) + 1 as next
    from characters where novel_id = ${input.novelId} and user_id = ${userId}
  `;
  const id = nid("p");
  const rows = await sql<CharacterRow>`
    insert into characters (id, novel_id, user_id, name, role, bio, sort_order)
    values (${id}, ${input.novelId}, ${userId}, ${name}, ${role}, ${bio}, ${Number(orderRows[0]?.next) || 1})
    returning id, name, role, bio, sort_order
  `;
  await touchNovel(sql, userId, input.novelId);
  return mapCharacter(rows[0]);
}

export async function deleteCharacter(
  sql: Sql,
  userId: string,
  novelId: string,
  characterId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    delete from characters where id = ${characterId} and novel_id = ${novelId} and user_id = ${userId}
    returning id
  `;
  if (!rows[0]) return false;
  await touchNovel(sql, userId, novelId);
  return true;
}

export async function readSecretSettings(sql: Sql, userId: string): Promise<Settings & { apiKey: string }> {
  await ensureAccount(sql, userId);
  const rows = await sql<ProfileRow>`
    select provider, base_url, model, api_key, skills, plugins, wild, web_on, thinking, context_used
    from profiles where user_id = ${userId}
  `;
  const row = rows[0] ?? {
    provider: "hosted",
    base_url: "",
    model: "",
    api_key: "",
    skills: "",
    plugins: "",
    wild: 0,
    web_on: 0,
    thinking: "mid",
    context_used: 0,
  };
  const apiKey = readStoredKey(row.api_key, userId);
  // 旧明文按原值比较后再改写，避免并发保存被旧明文覆盖。坏密文不改写。
  if (row.api_key && !isSealed(row.api_key)) {
    try {
      await migratePlainApiKey(sql, userId, row.api_key);
    } catch (error) {
      if (!(error instanceof SecretBoxError)) throw error;
    }
  }
  return { ...mapSettings(row, userId), apiKey };
}

export async function saveSettings(
  sql: Sql,
  userId: string,
  input: {
    provider: string;
    baseUrl: string;
    model: string;
    /** 2026-11-04 Sam（Mia §5.3）：新连接页只提交 providerId（白名单 entry id）+ modelId，地址由服务端查表。 */
    providerId?: string;
    modelId?: string;
    skills: string[];
    plugins: string[];
    keyAction: string;
    apiKey?: string;
  },
): Promise<Settings> {
  await ensureAccount(sql, userId);
  const current = await sql<ProfileRow>`
    select provider, base_url, model, api_key, skills, plugins, wild, web_on, thinking, context_used
    from profiles where user_id = ${userId}
  `;
  const prev = current[0];
  const provider = "custom";
  // 2026-11-04 Sam（Mia §5.3 ④）：超长密钥报错，不再静默截断。
  if (input.keyAction === "set" && String(input.apiKey ?? "").length > 400) throw new CodedError("KEY_TOO_LONG", "密钥太长了（超过 400 个字符），请检查是否复制多了。");
  if (input.providerId !== undefined) return saveByProvider(sql, userId, prev, input);
  let apiKey = "";
  if (input.keyAction === "set") apiKey = clip(input.apiKey, 400);
  else if (input.keyAction !== "clear") apiKey = readStoredKey(prev?.api_key ?? "", userId);
  const sealedKey = sealStoredKey(apiKey, userId);
  const skills = knownSkillIds(input.skills).join(",");
  const plugins = knownPluginIds(input.plugins).join(",");
  // 2026-11-01：不再回落到 DeepSeek，留空就存空，调用时再提示用户填写。
  // 2026-11-04 Sam（Jim wl 建议 1）：名单内的组合一律存规范地址，不存用户的原文写法。
  const rawBase = clip(input.baseUrl, 200).trim();
  const model = clip(input.model, 80).trim();
  const baseUrl = findWhitelisted(rawBase, model)?.base ?? rawBase;
  // 2026-11-04 Sam：保存时校验白名单。两项都留空可以（清空）；和已存的旧值完全相同也可以（保留旧设置，调用时再拦）；
  // 其余必须是名单里的「地址 + 模型」。
  const unchanged = baseUrl === (prev?.base_url ?? "").trim() && model === (prev?.model ?? "").trim();
  if (!unchanged && (baseUrl || model) && !isWhitelisted(baseUrl, model)) throw new Error(NOT_LISTED);
  await sql`
    update profiles set
      provider = ${provider},
      base_url = ${baseUrl},
      model = ${model},
      api_key = ${sealedKey},
      skills = ${skills},
      plugins = ${plugins}
    where user_id = ${userId}
  `;
  const next = await sql<ProfileRow>`
    select provider, base_url, model, api_key, skills, plugins, wild, web_on, thinking, context_used
    from profiles where user_id = ${userId}
  `;
  return mapSettings(next[0], userId);
}

export class CodedError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// 2026-11-04 Sam（Mia §5.3）：新保存路径。只认白名单 entry + 模型；地址取规范地址；换服务商（主机名变化）必须重填密钥。
async function saveByProvider(
  sql: Sql,
  userId: string,
  prev: ProfileRow | undefined,
  input: { providerId?: string; modelId?: string; keyAction: string; apiKey?: string; skills: string[]; plugins: string[] },
): Promise<Settings> {
  const entry = entryById(String(input.providerId ?? ""));
  if (!entry) throw new CodedError("PROVIDER_UNKNOWN", "请先选择服务商。");
  const model = String(input.modelId ?? "");
  if (!entry.models.includes(model)) throw new CodedError("MODEL_UNKNOWN", "请选择这家服务商的一个模型。");
  const hostOf = (raw: string) => {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return "";
    }
  };
  const prevView = resolveConnection(prev?.base_url ?? "", prev?.model ?? "", Boolean(prev?.api_key));
  // 旧密钥只在「之前就是这家（主机名精确相同，且状态是 ok/needs_key/model_blocked）」时沿用（Mia §3.1 第 3 条）。
  const sameHost = prevView.state !== "legacy_blocked" && prevView.state !== "unconfigured" && hostOf(prev?.base_url ?? "") === hostOf(entry.base);
  if (input.keyAction === "clear") throw new CodedError("KEY_REQUIRED", "请填写密钥。");
  if (input.keyAction !== "set" && !sameHost) throw new CodedError("KEY_REQUIRED_AFTER_SWITCH", "更换了服务商，需要重新填写密钥。");
  // 沿用密钥时原样保留已存的密文（不重新加密，避免无谓改写）。
  const key = input.keyAction === "set" ? String(input.apiKey ?? "").trim() : readStoredKey(prev?.api_key ?? "", userId);
  if (!key) throw new CodedError("KEY_REQUIRED", "请填写密钥。");
  const skills = knownSkillIds(input.skills).join(",");
  const plugins = knownPluginIds(input.plugins).join(",");
  // 注意：用户主动保存新设置会覆盖旧的 base_url / model（与原来一致）；legacy_* 留档列是否加，待队长定（Mia §3.4）。
  await sql`
    update profiles set
      provider = 'custom',
      base_url = ${entry.base},
      model = ${model},
      api_key = ${input.keyAction === "set" ? sealStoredKey(key, userId) : (prev?.api_key ?? "")},
      skills = ${skills},
      plugins = ${plugins}
    where user_id = ${userId}
  `;
  const next = await sql<ProfileRow>`
    select provider, base_url, model, api_key, skills, plugins, wild, web_on, thinking, context_used
    from profiles where user_id = ${userId}
  `;
  return mapSettings(next[0], userId);
}

// 2026-11-04 Sam（Mia §5）：只改技能/插件开关，不再顺带把接口地址和模型写回去。
export async function saveToolset(sql: Sql, userId: string, input: { skills: string[]; plugins: string[] }): Promise<Settings> {
  await ensureAccount(sql, userId);
  const skills = knownSkillIds(input.skills).join(",");
  const plugins = knownPluginIds(input.plugins).join(",");
  await sql`update profiles set skills = ${skills}, plugins = ${plugins} where user_id = ${userId}`;
  const next = await sql<ProfileRow>`
    select provider, base_url, model, api_key, skills, plugins, wild, web_on, thinking, context_used
    from profiles where user_id = ${userId}
  `;
  return mapSettings(next[0], userId);
}

export async function recharge(sql: Sql, userId: string, packId: string): Promise<
  | { ok: true; wallet: Wallet; entry: LedgerEntry }
  | { ok: false; error: string }
> {
  await ensureAccount(sql, userId);
  const pack = packById(packId);
  if (!pack) return { ok: false, error: "没有这个额度包" };
  const rows = await sql<WalletRow>`
    update wallets set balance = balance + ${pack.points}, updated_at = now()
    where user_id = ${userId}
    returning balance, hosted_calls
  `;
  const reason = `充值 · ${pack.name}`;
  const ledger = await sql<LedgerRow>`
    insert into ledger (user_id, delta, reason)
    values (${userId}, ${pack.points}, ${reason})
    returning id, delta, reason, created_at
  `;
  const wallet = rows[0];
  const entry = ledger[0];
  return {
    ok: true,
    wallet: { balance: Number(wallet.balance) || 0, hostedCalls: Number(wallet.hosted_calls) || 0 },
    entry: {
      id: Number(entry.id),
      delta: Number(entry.delta) || 0,
      reason: entry.reason,
      createdAt: stamp(entry.created_at),
    },
  };
}

export async function readWallet(sql: Sql, userId: string): Promise<Wallet> {
  const rows = await sql<WalletRow>`
    select balance, hosted_calls from wallets where user_id = ${userId}
  `;
  const wallet = rows[0];
  return { balance: Number(wallet?.balance) || 0, hostedCalls: Number(wallet?.hosted_calls) || 0 };
}

export async function chargeHosted(
  sql: Sql,
  userId: string,
  reason = "落笔",
  cost: number = INK.turnCost,
  countCall = true,
): Promise<Wallet | null> {
  const rows = countCall
    ? await sql<WalletRow>`
        update wallets
        set balance = balance - ${cost},
            hosted_calls = hosted_calls + 1,
            updated_at = now()
        where user_id = ${userId}
          and balance >= ${cost}
          and hosted_calls < ${INK.hostedCap}
        returning balance, hosted_calls
      `
    : await sql<WalletRow>`
        update wallets
        set balance = balance - ${cost},
            updated_at = now()
        where user_id = ${userId}
          and balance >= ${cost}
        returning balance, hosted_calls
      `;
  if (!rows[0]) return null;
  await sql`
    insert into ledger (user_id, delta, reason)
    values (${userId}, ${-cost}, ${reason})
  `;
  return { balance: Number(rows[0].balance) || 0, hostedCalls: Number(rows[0].hosted_calls) || 0 };
}

export async function addMessage(
  sql: Sql,
  userId: string,
  novelId: string,
  role: "user" | "assistant" | "tool",
  content: string,
  toolName: string | null,
): Promise<void> {
  const id = nid("m");
  await sql`
    insert into messages (id, novel_id, user_id, role, content, tool_name)
    select ${id}, ${novelId}, ${userId}, ${role}, ${clip(content, 20000)}, ${toolName}
    where exists (select 1 from "user" where id = ${userId})
  `;
}

export async function replaceOutline(
  sql: Sql,
  userId: string,
  novelId: string,
  nodes: { ref: string; parent: string; kind: string; title: string; summary: string }[],
): Promise<{ count: number } | { error: string }> {
  const novel = await ownedNovel(sql, userId, novelId);
  if (!novel) return { error: "找不到这部作品" };
  if (nodes.length === 0 || nodes.length > 48) return { error: "大纲节点需要在 1 到 48 个之间" };
  const refs = new Set<string>();
  for (const node of nodes) {
    const ref = clip(node.ref, 24);
    if (!ref || refs.has(ref)) return { error: "大纲节点编号重复或为空" };
    refs.add(ref);
    if (!clip(node.title, 80)) return { error: "每个节点都要有标题" };
  }
  for (const node of nodes) {
    const parent = clip(node.parent, 24);
    if (parent && !refs.has(parent)) return { error: "有节点指向了不存在的上级" };
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const parent = clip(nodes[i].parent, 24);
    if (!parent) continue;
    const parentIndex = nodes.findIndex((node) => clip(node.ref, 24) === parent);
    if (parentIndex < 0 || parentIndex >= i) return { error: "上级节点需要排在子节点前面" };
  }
  await sql`delete from outline_nodes where novel_id = ${novelId} and user_id = ${userId}`;
  const ids = new Map<string, string>();
  let order = 1;
  for (const node of nodes) {
    const ref = clip(node.ref, 24);
    const id = nid("o");
    ids.set(ref, id);
    const parentRef = clip(node.parent, 24);
    const parentId = parentRef ? (ids.get(parentRef) ?? null) : null;
    await sql`
      insert into outline_nodes (id, novel_id, user_id, parent_id, kind, title, summary, sort_order, status)
      values (
        ${id}, ${novelId}, ${userId}, ${parentId}, ${asKind(node.kind)},
        ${clip(node.title, 80)}, ${clip(node.summary, 500)}, ${order}, 'draft'
      )
    `;
    order += 1;
  }
  await touchNovel(sql, userId, novelId);
  return { count: nodes.length };
}

export async function agentUpdateBible(
  sql: Sql,
  userId: string,
  novelId: string,
  input: { logline?: string; premise?: string; styleNotes?: string },
): Promise<string> {
  const novel = await ownedNovel(sql, userId, novelId);
  if (!novel) return "找不到这部作品";
  const logline = input.logline === undefined ? novel.logline : clip(input.logline, 400);
  const premise = input.premise === undefined ? novel.premise : clip(input.premise, 6000);
  const styleNotes = input.styleNotes === undefined ? novel.styleNotes : clip(input.styleNotes, 2400);
  await sql`
    update novels set logline = ${logline}, premise = ${premise}, style_notes = ${styleNotes}, updated_at = now()
    where id = ${novelId} and user_id = ${userId}
  `;
  return "已更新故事核";
}

export async function agentWriteChapter(
  sql: Sql,
  userId: string,
  novelId: string,
  input: { title: string; body: string; summary?: string; soFar?: string; aiChars?: number; fact?: string },
): Promise<string> {
  const novel = await ownedNovel(sql, userId, novelId);
  if (!novel) return "找不到这部作品";
  const title = clip(input.title, 80);
  const body = clip(input.body, 20000);
  if (!title || !body) return "章节标题和正文都不能空";
  const existing = await sql<{ id: string; fact: string }>`
    select id, fact from chapters
    where novel_id = ${novelId} and user_id = ${userId} and title = ${title}
    limit 1
  `;
  const fact = existing[0]?.fact?.trim() || clip(input.fact || chapterFact({ body }), 160);
  if (existing[0]) {
    await sql`
      update chapters set body = ${body}, fact = ${fact}, updated_at = now()
      where id = ${existing[0].id} and user_id = ${userId}
    `;
  } else {
    const orderRows = await sql<{ next: number }>`
      select coalesce(max(sort_order), 0) + 1 as next
      from chapters where novel_id = ${novelId} and user_id = ${userId}
    `;
    await sql`
      insert into chapters (id, novel_id, user_id, title, body, fact, sort_order)
      values (${nid("c")}, ${novelId}, ${userId}, ${title}, ${body}, ${fact}, ${Number(orderRows[0]?.next) || 1})
    `;
  }
  if (input.summary) {
    await sql`
      update outline_nodes set summary = ${clip(input.summary, 500)}, status = 'written'
      where novel_id = ${novelId} and user_id = ${userId} and title = ${title}
    `;
  } else {
    await sql`
      update outline_nodes set status = 'written'
      where novel_id = ${novelId} and user_id = ${userId} and title = ${title}
    `;
  }
  const progress = clip(input.soFar, 2400) || fallbackSoFar(novel.soFar, title, body);
  await sql`
    update novels set so_far = ${progress}, updated_at = now()
    where id = ${novelId} and user_id = ${userId}
  `;
  const tally = input.aiChars === undefined ? body.length : input.aiChars;
  if (tally > 0) await noteUsage(sql, userId, { aiChars: tally });
  return `已写入《${title}》，${body.replace(/\s/g, "").length} 字`;
}

function fallbackSoFar(previous: string, title: string, body: string): string {
  const beat = body.replace(/\s+/g, "").slice(0, 80);
  const line = `《${title}》写过了。近处是：${beat}`;
  const kept = previous
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith(`《${title}》`))
    .slice(-5);
  return clip([...kept, line].join("\n"), 2400);
}

async function rememberProgress(sql: Sql, userId: string, novelId: string, previous: string, title: string, body: string) {
  await sql`
    update novels set so_far = ${fallbackSoFar(previous, title, body)}, updated_at = now()
    where id = ${novelId} and user_id = ${userId}
  `;
}

export async function noteUsage(
  sql: Sql,
  userId: string,
  patch: { tokens?: number; userChars?: number; aiChars?: number; contextUsed?: number },
): Promise<UsageDay> {
  const day = todayKey();
  const tokens = Math.max(0, Math.round(patch.tokens ?? 0));
  const userChars = Math.max(0, Math.round(patch.userChars ?? 0));
  const aiChars = Math.max(0, Math.round(patch.aiChars ?? 0));
  const rows = await sql<{ day: string; tokens: number; user_chars: number; ai_chars: number }>`
    insert into usage_days (user_id, day, tokens, user_chars, ai_chars)
    select ${userId}, ${day}, ${tokens}, ${userChars}, ${aiChars}
    where exists (select 1 from "user" where id = ${userId})
    on conflict (user_id, day) do update set
      tokens = usage_days.tokens + ${tokens},
      user_chars = usage_days.user_chars + ${userChars},
      ai_chars = usage_days.ai_chars + ${aiChars}
    returning day, tokens, user_chars, ai_chars
  `;
  if (patch.contextUsed) {
    await sql`update profiles set context_used = ${Math.round(patch.contextUsed)} where user_id = ${userId}`;
  }
  const row = rows[0];
  return {
    day: row?.day ?? day,
    tokens: Number(row?.tokens) || 0,
    userChars: Number(row?.user_chars) || 0,
    aiChars: Number(row?.ai_chars) || 0,
  };
}

export async function readUsage(sql: Sql, userId: string): Promise<UsageDay[]> {
  const rows = await sql<{ day: string; tokens: number; user_chars: number; ai_chars: number }>`
    select day, tokens, user_chars, ai_chars from usage_days
    where user_id = ${userId}
    order by day desc
    limit 70
  `;
  return rows.map((row) => ({
    day: String(row.day).slice(0, 10),
    tokens: Number(row.tokens) || 0,
    userChars: Number(row.user_chars) || 0,
    aiChars: Number(row.ai_chars) || 0,
  }));
}

export async function saveStudio(
  sql: Sql,
  userId: string,
  input: { wild?: boolean; web?: boolean; thinking?: string },
): Promise<Settings> {
  await ensureAccount(sql, userId);
  const current = await readSecretSettings(sql, userId);
  const wild = input.wild === undefined ? current.wild : input.wild;
  const web = input.web === undefined ? current.web : input.web;
  const thinking = input.thinking === "low" || input.thinking === "high" || input.thinking === "mid" ? input.thinking : current.thinking;
  // if (input.web && (await readPlan(sql, userId)).id !== "night") throw new Error("联网是长夜里的事。");
  if (input.web && !WEB_SEARCH_ENABLED) throw new Error("联网检索暂未开放。");
  await sql`
    update profiles set wild = ${wild ? 1 : 0}, web_on = ${web ? 1 : 0}, thinking = ${thinking}
    where user_id = ${userId}
  `;
  const next = await readSecretSettings(sql, userId);
  const { apiKey: _secret, ...settings } = next;
  return settings;
}

export function titleFromLine(sentence: string): string {
  const clean = sentence.replace(/\s+/g, " ").trim();
  const cut = clean.split(/[。！？.!?\n]/)[0]?.trim() || clean;
  return clip(cut, 18) || "从这一句开始";
}

export async function seedFromLine(sql: Sql, userId: string, sentence: string): Promise<Novel> {
  const line = clip(sentence, 400);
  if (line.length < 4) throw new Error("再多写几个字");
  const novel = await createNovel(sql, userId, { title: titleFromLine(line), genre: GENRES[0], logline: line });
  await sql`
    update novels set premise = ${line}, updated_at = now()
    where id = ${novel.id} and user_id = ${userId}
  `;
  const planted = await applyEmptyActs(sql, userId, novel.id, true);
  if (planted) throw new Error(planted);
  await sql`
    update outline_nodes set summary = ${clip(line, 500)}
    where novel_id = ${novel.id} and user_id = ${userId} and title = ${"日常"}
  `;
  await agentWriteChapter(sql, userId, novel.id, {
    title: "开场",
    body: line,
    summary: clip(line, 80),
    soFar: `刚起笔。${clip(line, 180)}`,
    aiChars: 0,
  });
  const fresh = await ownedNovel(sql, userId, novel.id);
  if (!fresh) throw new Error("草稿没有留下");
  return fresh;
}

export async function readTranscript(sql: Sql, userId: string, novelId: string): Promise<string> {
  const rows = await sql<{ transcript: string }>`
    select transcript from novels where id = ${novelId} and user_id = ${userId}
  `;
  return rows[0]?.transcript ?? "";
}

export async function saveTranscript(sql: Sql, userId: string, novelId: string, transcript: string): Promise<void> {
  await sql`
    update novels set transcript = ${transcript}
    where id = ${novelId} and user_id = ${userId}
  `;
}

export async function markOutlineStatus(sql: Sql, userId: string, novelId: string, nodeId: string, status: string) {
  const next = status === "written" ? "written" : "draft";
  await sql`
    update outline_nodes set status = ${next}
    where id = ${nodeId} and novel_id = ${novelId} and user_id = ${userId}
  `;
}

type VoiceRow = { portrait_md: string; touch_md: string; preference_md: string };
type SourceRow = { id: string; kind: string; title: string; created_at: unknown };

function filledVoice(text: string, fallback: string): string {
  const value = text.trim();
  return value || fallback;
}

export async function readVoice(sql: Sql, userId: string): Promise<VoiceDocs> {
  await ensureAccount(sql, userId);
  const rows = await sql<VoiceRow>`
    select portrait_md, touch_md, preference_md from voice_docs where user_id = ${userId}
  `;
  const row = rows[0];
  return {
    portrait: filledVoice(row?.portrait_md ?? "", EMPTY_VOICE.portrait),
    touch: filledVoice(row?.touch_md ?? "", EMPTY_VOICE.touch),
    preference: filledVoice(row?.preference_md ?? "", EMPTY_VOICE.preference),
  };
}

export async function saveVoice(sql: Sql, userId: string, input: Partial<VoiceDocs>): Promise<VoiceDocs> {
  const current = await readVoice(sql, userId);
  const next = {
    portrait: clip(input.portrait ?? current.portrait, 8000) || EMPTY_VOICE.portrait,
    touch: clip(input.touch ?? current.touch, 8000) || EMPTY_VOICE.touch,
    preference: clip(input.preference ?? current.preference, 8000) || EMPTY_VOICE.preference,
  };
  await sql`
    update voice_docs
    set portrait_md = ${next.portrait},
        touch_md = ${next.touch},
        preference_md = ${next.preference},
        updated_at = now()
    where user_id = ${userId}
  `;
  return next;
}

export async function listSources(sql: Sql, userId: string): Promise<SourceNote[]> {
  const rows = await sql<SourceRow>`
    select id, kind, title, created_at from source_texts
    where user_id = ${userId}
    order by created_at desc
    limit 8
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind === "favorite" ? "favorite" : "work",
    title: row.title,
    createdAt: stamp(row.created_at),
  }));
}

export async function addSource(sql: Sql, userId: string, kind: "work" | "favorite", title: string): Promise<void> {
  await ensureAccount(sql, userId);
  await sql`
    insert into source_texts (id, user_id, kind, title)
    values (${nid("src")}, ${userId}, ${kind}, ${clip(title, 80) || "未命名"})
  `;
}



/**
 * 注销账号：删除该用户在所有业务表（含 user_id 列）和登录表里的数据。2026-10-30 Sam 新增。
 * 用一条带 CTE 的 SQL 语句完成，保证要么全删、要么全不删。
 * 业务表清单从 information_schema 动态读取，以后新增带 user_id 的表也会被覆盖。
 */
export async function deleteAccountData(sql: Sql, userId: string, email: string): Promise<{ tables: string[] }> {
  const rows = await sql<{ table_name: string }>`
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = current_schema() and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
    order by c.table_name
  `;
  const tables = rows.map((r) => r.table_name).filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
  const ctes = tables.map((name, i) => `d${i} as (delete from "${name}" where user_id = $1)`);
  ctes.push(`dv as (delete from "verification" where "identifier" = $2 or "value" = $1)`);
  // session / account 通过外键 on delete cascade 随 "user" 一起删除
  await sql.query(`with ${ctes.join(", ")} delete from "user" where "id" = $1`, [userId, email]);
  return { tables };
}
