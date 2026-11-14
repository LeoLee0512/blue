/**
 * 章节版本（快照）的策略：什么时候自动存一版、超出上限时删哪些。
 */
export type VersionKind = "auto" | "manual" | "restore" | "ai";

export type VersionMeta = { id: string; kind: VersionKind; createdAt: string };

export const AUTO_INTERVAL_MS = 10 * 60 * 1000;
export const BIG_CHANGE_CHARS = 500;
export const MAX_AUTO_VERSIONS = 60;
export const MAX_VERSIONS = 200;

export function asVersionKind(value: unknown): VersionKind {
  return value === "manual" || value === "restore" || value === "ai" ? value : "auto";
}

/**
 * 保存正文时是否顺手存一个自动版本。
 * - 正文没变：不存；
 * - 从来没存过且正文非空：存；
 * - 距上一版超过 10 分钟：存；
 * - 一次改动超过 500 字（长度差）：立即存。
 */
export function shouldAutoSnapshot(
  last: { createdAt: string; body: string } | null,
  body: string,
  now: number = Date.now(),
): boolean {
  if (!last) return body.trim().length > 0;
  if (last.body === body) return false;
  const age = now - Date.parse(last.createdAt);
  if (!Number.isFinite(age) || age >= AUTO_INTERVAL_MS) return true;
  return Math.abs(body.length - last.body.length) >= BIG_CHANGE_CHARS;
}

/**
 * 超过上限时要删掉的版本 id。
 * 先删最旧的自动版本，使自动版本不超过 MAX_AUTO_VERSIONS；
 * 总数仍超过 MAX_VERSIONS 时，再从最旧的开始删（手动版本最后才删）。
 */
export function pruneVersions(list: VersionMeta[], maxAuto = MAX_AUTO_VERSIONS, maxTotal = MAX_VERSIONS): string[] {
  const oldestFirst = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
  const drop = new Set<string>();
  const autos = oldestFirst.filter((v) => v.kind !== "manual");
  for (const v of autos.slice(0, Math.max(0, autos.length - maxAuto))) drop.add(v.id);
  let remaining = oldestFirst.filter((v) => !drop.has(v.id));
  if (remaining.length > maxTotal) {
    const over = remaining.length - maxTotal;
    const order = [...remaining.filter((v) => v.kind !== "manual"), ...remaining.filter((v) => v.kind === "manual")];
    for (const v of order.slice(0, over)) drop.add(v.id);
    remaining = remaining.filter((v) => !drop.has(v.id));
  }
  return [...drop];
}

export const VERSION_LABEL: Record<VersionKind, string> = {
  auto: "自动保存",
  manual: "手动版本",
  restore: "恢复前",
  ai: "AI 改写前",
};
