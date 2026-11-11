import type { Sql } from "@/lib/db";
import type { Leaf, SharedLeaf } from "./types";
import { clip, nid } from "./store.server";
import { readPlan, SHELF_OFF } from "./plan.server";

type PieceRow = { id: string; title: string; body: string; updated_at: unknown };
type ShareRow = {
  id: string;
  user_id: string;
  author_name: string;
  kind: string;
  title: string;
  body: string;
  created_at: unknown;
};

function stamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

function mapLeaf(row: PieceRow): Leaf {
  return { id: row.id, title: row.title, body: row.body, updatedAt: stamp(row.updated_at) };
}

function asKind(value: string): "poem" | "note" | "chapter" | "" {
  if (value === "poem" || value === "note" || value === "chapter") return value;
  return "";
}

async function authorName(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ name: string }>`select name from "user" where id = ${userId} limit 1`;
  const name = rows[0]?.name?.trim() ?? "";
  if (!name || name === "Dev User") return "未署名";
  return clip(name, 40);
}

export async function readShelf(sql: Sql, userId: string): Promise<{ poems: Leaf[]; notes: Leaf[]; shares: SharedLeaf[] }> {
  const pieces = await sql<PieceRow & { kind: string }>`
    select id, kind, title, body, updated_at from pieces
    where user_id = ${userId}
    order by updated_at desc
    limit 80
  `;
  // 2026-11-02 分享架整体下线：不再读 shares 表，作者本人也不返回（数据保留不动）。
  // const shared = await sql<ShareRow>`select id, user_id, author_name, kind, title, body, created_at from shares order by created_at desc limit 48`;
  const shared: ShareRow[] = [];
  const poems = pieces.filter((row) => row.kind === "poem").map(mapLeaf);
  const notes = pieces.filter((row) => row.kind === "note").map(mapLeaf);
  const shares = shared
    .map((row) => {
      const kind = asKind(row.kind);
      if (!kind) return null;
      return {
        id: row.id,
        author: row.author_name || "未署名",
        kind,
        title: row.title,
        body: row.body,
        mine: row.user_id === userId,
        createdAt: stamp(row.created_at),
      };
    })
    .filter((row): row is SharedLeaf => Boolean(row));
  return { poems, notes, shares };
}

export async function saveLeaf(
  sql: Sql,
  userId: string,
  input: { id?: string; kind: string; title: string; body: string },
): Promise<Leaf | null> {
  const kind = input.kind === "note" ? "note" : input.kind === "poem" ? "poem" : "";
  if (!kind) return null;
  const title = clip(input.title, 40) || (kind === "poem" ? "无题" : "手记");
  const body = clip(input.body, 8000);
  if (!input.id && (await readPlan(sql, userId)).id === "free") {
    const taken = await sql<{ id: string }>`
      select id from pieces where user_id = ${userId} and kind = ${kind}
    `;
    if (taken.length >= 3) throw new Error(kind === "poem" ? "习作先留三首。再写，一杯就够。" : "习作先留三则。再写，一杯就够。");
  }
  if (input.id) {
    const rows = await sql<PieceRow>`
      update pieces set title = ${title}, body = ${body}, updated_at = now()
      where id = ${clip(input.id, 40)} and user_id = ${userId} and kind = ${kind}
      returning id, title, body, updated_at
    `;
    return rows[0] ? mapLeaf(rows[0]) : null;
  }
  const rows = await sql<PieceRow>`
    insert into pieces (id, user_id, kind, title, body)
    values (${nid(kind === "poem" ? "pm" : "nt")}, ${userId}, ${kind}, ${title}, ${body})
    returning id, title, body, updated_at
  `;
  return rows[0] ? mapLeaf(rows[0]) : null;
}

export async function removeLeaf(sql: Sql, userId: string, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    delete from pieces where id = ${clip(id, 40)} and user_id = ${userId}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function publishText(
  sql: Sql,
  userId: string,
  input: { kind: string; title: string; body: string; sourceId?: string },
): Promise<string | null> {
  if (true as boolean) throw new Error(SHELF_OFF); // 2026-11-03：开关检查挪到第一行（Jim b2 低优先级）
  const kind = asKind(input.kind);
  const body = clip(input.body, 6000);
  if (!kind || !body) return null;
  // （原 2026-11-01 开关位置，已挪到函数第一行）
  const title = clip(input.title, 40) || (kind === "poem" ? "无题" : kind === "note" ? "手记" : "一章");
  const sourceId = clip(input.sourceId ?? "", 40);
  const author = await authorName(sql, userId);
  if (sourceId) {
    const existing = await sql<{ id: string }>`
      select id from shares where user_id = ${userId} and source_id = ${sourceId} limit 1
    `;
    if (existing[0]) {
      await sql`
        update shares set title = ${title}, body = ${body}, author_name = ${author}, kind = ${kind}
        where id = ${existing[0].id} and user_id = ${userId}
      `;
      return existing[0].id;
    }
  }
  const id = nid("sh");
  await sql`
    insert into shares (id, user_id, author_name, kind, title, body, source_id)
    values (${id}, ${userId}, ${author}, ${kind}, ${title}, ${body}, ${sourceId})
  `;
  return id;
}

/** 2026-11-02：作者导出自己发布过的分享（独立快照，书里不一定有原稿）。只读，只取本人的行。 */
export async function exportOwnShares(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<ShareRow>`
    select id, user_id, author_name, kind, title, body, created_at
    from shares
    where user_id = ${userId}
    order by created_at asc
  `;
  const own = rows.filter((row) => row.user_id === userId);
  const word: Record<string, string> = { poem: "诗", note: "手记", chapter: "章节" };
  const parts = own.map(
    (row) => `## ${row.title || "无题"}\n\n- 类型：${word[row.kind] ?? row.kind}\n- 发布时间：${stamp(row.created_at)}\n\n${row.body}\n`,
  );
  return `# 我在分享架上发布过的内容\n\n共 ${own.length} 条。分享架已下线，这里是发布时保存的版本。\n\n${parts.join("\n---\n\n")}`;
}

export async function unpublishText(sql: Sql, userId: string, id: string): Promise<boolean> {
  // 2026-11-02 分享架下线：服务端拒绝删除分享。导出仍可读到本人以前发布的快照。
  if (true as boolean) throw new Error(SHELF_OFF);
  const rows = await sql<{ id: string }>`
    delete from shares where id = ${clip(id, 40)} and user_id = ${userId}
    returning id
  `;
  return Boolean(rows[0]);
}
