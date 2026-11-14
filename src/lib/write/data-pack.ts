/**
 * 「完整备份」文件格式（.langao.json）。
 *
 * - 只包含作品数据和写作偏好；永远不含模型密钥（api_key），也不含本机加密用的安装密钥。
 * - 每张表只认下面列出的列；文件里多出来的列一律丢掉，列名不会从文件进入 SQL。
 * - 恢复有两种方式：
 *   merge   —— 作为副本加入：所有 id 重新生成，现有作品不受影响；
 *   replace —— 覆盖恢复：先由服务端存一份恢复点，再清空并写入文件里的数据。
 */
export const PACK_FORMAT = "langao-pack";
export const PACK_VERSION = 1;
export const PACK_EXTENSION = ".langao.json";

export type PackRow = Record<string, string | number | boolean | null>;

/** 每张表允许的列（不含 user_id，恢复时由服务端填当前用户）。 */
export const PACK_COLUMNS = {
  novels: ["id", "title", "genre", "logline", "premise", "style_notes", "so_far", "ledger", "commentary", "transcript", "author", "daily_goal", "created_at", "updated_at"],
  volumes: ["id", "novel_id", "title", "summary", "sort_order", "created_at", "updated_at"],
  chapters: ["id", "novel_id", "node_id", "volume_id", "title", "body", "fact", "status", "note", "words", "sort_order", "updated_at"],
  chapter_versions: ["id", "chapter_id", "novel_id", "kind", "label", "title", "body", "words", "created_at"],
  characters: ["id", "novel_id", "name", "role", "bio", "aliases", "appearance", "personality", "tags", "sort_order", "updated_at"],
  lore_entries: ["id", "novel_id", "kind", "name", "summary", "body", "tags", "sort_order", "updated_at"],
  outline_nodes: ["id", "novel_id", "parent_id", "kind", "title", "summary", "sort_order", "status"],
  messages: ["id", "novel_id", "role", "content", "tool_name", "created_at"],
  novel_days: ["novel_id", "day", "words"],
  pieces: ["id", "kind", "title", "body", "updated_at"],
  voice_docs: ["portrait_md", "touch_md", "preference_md", "updated_at"],
  usage_days: ["day", "tokens", "user_chars", "ai_chars"],
  source_texts: ["id", "kind", "title", "created_at"],
  settings: ["skills", "plugins", "wild", "thinking"],
} as const;

export type PackTable = keyof typeof PACK_COLUMNS;
export const PACK_TABLES = Object.keys(PACK_COLUMNS) as PackTable[];

/** 属于某部作品的表（有 novel_id 列）。 */
export const NOVEL_TABLES: PackTable[] = ["volumes", "chapters", "chapter_versions", "characters", "lore_entries", "outline_nodes", "messages", "novel_days"];

export type Pack = {
  format: typeof PACK_FORMAT;
  version: number;
  app: string;
  createdAt: string;
  /** 明确声明：本文件不含任何密钥 */
  secrets: "excluded";
  tables: Record<PackTable, PackRow[]>;
};

/** 任何名字像密钥的字段都不会进入备份。 */
const SECRET_FIELD = /^(api_?key|apikey|secret|password|token|install_secret|key_encryption_secret)$/i;

const MAX_TEXT = 2_000_000;

function cleanValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

/** 只保留允许的列，丢掉密钥类字段和复杂值。 */
export function pickColumns(table: PackTable, row: Record<string, unknown>): PackRow {
  const out: PackRow = {};
  for (const column of PACK_COLUMNS[table]) {
    if (SECRET_FIELD.test(column)) continue;
    if (!(column in row)) continue;
    const value = cleanValue(row[column]);
    if (value !== undefined) out[column] = value;
  }
  return out;
}

export function makePack(tables: Partial<Record<PackTable, Record<string, unknown>[]>>, app = "蓝稿", now = new Date()): Pack {
  const out = {} as Record<PackTable, PackRow[]>;
  for (const table of PACK_TABLES) out[table] = (tables[table] ?? []).map((row) => pickColumns(table, row));
  return { format: PACK_FORMAT, version: PACK_VERSION, app, createdAt: now.toISOString(), secrets: "excluded", tables: out };
}

export type PackCheck = { ok: true; pack: Pack } | { ok: false; error: string };

/**
 * 校验并清洗一个备份文件。不认识的格式、版本过新、结构不对都拒绝；
 * 指向不存在作品的行会被丢掉。
 */
export function validatePack(raw: unknown): PackCheck {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: "这不是蓝稿的备份文件（无法解析）。" };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "这不是蓝稿的备份文件。" };
  const doc = value as Record<string, unknown>;
  if (doc.format !== PACK_FORMAT) return { ok: false, error: "这不是蓝稿的备份文件。" };
  const version = Number(doc.version);
  if (!Number.isInteger(version) || version < 1) return { ok: false, error: "备份文件的版本号无效。" };
  if (version > PACK_VERSION) return { ok: false, error: "这个备份来自更新版本的蓝稿，请先升级蓝稿再恢复。" };
  const tables = doc.tables;
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) return { ok: false, error: "备份文件缺少数据。" };
  const src = tables as Record<string, unknown>;
  const out = {} as Record<PackTable, PackRow[]>;
  for (const table of PACK_TABLES) {
    const rows = src[table];
    if (rows === undefined) {
      out[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) return { ok: false, error: "备份文件的结构不对。" };
    out[table] = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)).map((row) => pickColumns(table, row as Record<string, unknown>));
  }
  const ids = (rows: PackRow[]) => rows.every((row) => typeof row.id === "string" && row.id.length > 0 && row.id.length <= 80);
  for (const table of ["novels", "volumes", "chapters", "chapter_versions", "characters", "lore_entries", "outline_nodes", "messages", "pieces", "source_texts"] as const) {
    if (!ids(out[table])) return { ok: false, error: "备份文件里有缺少编号的记录。" };
  }
  if (!out.novels.every((row) => typeof row.title === "string")) return { ok: false, error: "备份文件里有缺少书名的作品。" };
  const novelIds = new Set(out.novels.map((row) => String(row.id)));
  for (const table of NOVEL_TABLES) out[table] = out[table].filter((row) => novelIds.has(String(row.novel_id ?? "")));
  const chapterIds = new Set(out.chapters.map((row) => String(row.id)));
  out.chapter_versions = out.chapter_versions.filter((row) => chapterIds.has(String(row.chapter_id ?? "")));
  out.voice_docs = out.voice_docs.slice(0, 1);
  out.settings = out.settings.slice(0, 1);
  return {
    ok: true,
    pack: {
      format: PACK_FORMAT,
      version,
      app: typeof doc.app === "string" ? doc.app.slice(0, 40) : "蓝稿",
      createdAt: typeof doc.createdAt === "string" ? doc.createdAt.slice(0, 40) : "",
      secrets: "excluded",
      tables: out,
    },
  };
}

export type PackSummary = { novels: number; chapters: number; characters: number; lore: number; versions: number; pieces: number; createdAt: string; titles: string[] };

export function packSummary(pack: Pack): PackSummary {
  return {
    novels: pack.tables.novels.length,
    chapters: pack.tables.chapters.length,
    characters: pack.tables.characters.length,
    lore: pack.tables.lore_entries.length,
    versions: pack.tables.chapter_versions.length,
    pieces: pack.tables.pieces.length,
    createdAt: pack.createdAt,
    titles: pack.tables.novels.map((row) => String(row.title)).slice(0, 12),
  };
}

/**
 * 「作为副本加入」：给作品数据换上全新的 id，并把内部引用（novel_id、volume_id、
 * node_id、chapter_id、parent_id）一并改掉。只返回作品相关的表和诗文手记。
 */
export function remapForMerge(pack: Pack, newId: (prefix: string) => string, titleSuffix = ""): Partial<Record<PackTable, PackRow[]>> {
  const maps: Record<string, Map<string, string>> = {};
  const mapFor = (name: string) => (maps[name] ??= new Map());
  const remap = (name: string, prefix: string, rows: PackRow[]) => {
    const map = mapFor(name);
    for (const row of rows) map.set(String(row.id), newId(prefix));
  };
  const t = pack.tables;
  remap("novels", "n", t.novels);
  remap("volumes", "v", t.volumes);
  remap("chapters", "c", t.chapters);
  remap("chapter_versions", "cv", t.chapter_versions);
  remap("characters", "p", t.characters);
  remap("lore_entries", "l", t.lore_entries);
  remap("outline_nodes", "o", t.outline_nodes);
  remap("messages", "m", t.messages);
  remap("pieces", "pc", t.pieces);
  const ref = (name: string, value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    return mapFor(name).get(String(value)) ?? null;
  };
  const withId = (name: string, row: PackRow): PackRow => ({ ...row, id: mapFor(name).get(String(row.id)) ?? String(row.id) });
  return {
    novels: t.novels.map((row) => ({ ...withId("novels", row), title: `${String(row.title)}${titleSuffix}`.slice(0, 80) })),
    volumes: t.volumes.map((row) => ({ ...withId("volumes", row), novel_id: ref("novels", row.novel_id) })),
    chapters: t.chapters.map((row) => ({
      ...withId("chapters", row),
      novel_id: ref("novels", row.novel_id),
      volume_id: ref("volumes", row.volume_id),
      node_id: ref("outline_nodes", row.node_id),
    })),
    chapter_versions: t.chapter_versions.map((row) => ({ ...withId("chapter_versions", row), novel_id: ref("novels", row.novel_id), chapter_id: ref("chapters", row.chapter_id) })),
    characters: t.characters.map((row) => ({ ...withId("characters", row), novel_id: ref("novels", row.novel_id) })),
    lore_entries: t.lore_entries.map((row) => ({ ...withId("lore_entries", row), novel_id: ref("novels", row.novel_id) })),
    outline_nodes: t.outline_nodes.map((row) => ({ ...withId("outline_nodes", row), novel_id: ref("novels", row.novel_id), parent_id: ref("outline_nodes", row.parent_id) })),
    messages: t.messages.map((row) => ({ ...withId("messages", row), novel_id: ref("novels", row.novel_id) })),
    novel_days: t.novel_days.map((row) => ({ ...row, novel_id: ref("novels", row.novel_id) })),
    pieces: t.pieces.map((row) => withId("pieces", row)),
  };
}

/** 备份文件名：蓝稿备份-20261114-0608.langao.json */
export function packFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `蓝稿备份-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${PACK_EXTENSION}`;
}
