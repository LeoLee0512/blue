/**
 * 作品 → 卷 → 章节 的树形排序。纯函数，不碰数据库；服务端按返回的结果写回。
 */
export type VolumeLite = { id: string; title: string; sortOrder: number };
export type ChapterLite = { id: string; title: string; volumeId: string | null; sortOrder: number };

export type TreeVolume<V extends VolumeLite, C extends ChapterLite> = { volume: V; chapters: C[] };
export type Tree<V extends VolumeLite, C extends ChapterLite> = {
  /** 不属于任何卷（或所属卷已不存在）的章节 */
  loose: C[];
  volumes: TreeVolume<V, C>[];
};

const byOrder = <T extends { sortOrder: number; id: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildTree<V extends VolumeLite, C extends ChapterLite>(volumes: V[], chapters: C[]): Tree<V, C> {
  const known = new Set(volumes.map((v) => v.id));
  const sortedVolumes = [...volumes].sort(byOrder);
  const loose = chapters.filter((c) => !c.volumeId || !known.has(c.volumeId)).sort(byOrder);
  return {
    loose,
    volumes: sortedVolumes.map((volume) => ({
      volume,
      chapters: chapters.filter((c) => c.volumeId === volume.id).sort(byOrder),
    })),
  };
}

/** 阅读顺序：先「未分卷」，再按卷顺序。 */
export function readingOrder<V extends VolumeLite, C extends ChapterLite>(volumes: V[], chapters: C[]): C[] {
  const tree = buildTree(volumes, chapters);
  return [...tree.loose, ...tree.volumes.flatMap((v) => v.chapters)];
}

export type ChapterPlacement = { id: string; volumeId: string | null; sortOrder: number };
export type VolumePlacement = { id: string; sortOrder: number };

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

/**
 * 把一章移到 `toVolumeId`（null 表示「未分卷」）的第 `toIndex` 个位置。
 * 返回位置发生变化的章节（新卷、新序号）。原卷和目标卷都会重新编号为 1..n。
 * 找不到章节或目标卷时返回空数组。
 */
export function moveChapter<V extends VolumeLite, C extends ChapterLite>(
  volumes: V[],
  chapters: C[],
  chapterId: string,
  toVolumeId: string | null,
  toIndex: number,
): ChapterPlacement[] {
  const moving = chapters.find((c) => c.id === chapterId);
  if (!moving) return [];
  const known = new Set(volumes.map((v) => v.id));
  const target = toVolumeId && known.has(toVolumeId) ? toVolumeId : null;
  if (toVolumeId && !target) return [];
  const tree = buildTree(volumes, chapters);
  const listOf = (volumeId: string | null): C[] =>
    volumeId === null ? tree.loose : (tree.volumes.find((v) => v.volume.id === volumeId)?.chapters ?? []);
  const currentVolume = moving.volumeId && known.has(moving.volumeId) ? moving.volumeId : null;
  const source = listOf(currentVolume).filter((c) => c.id !== chapterId);
  const dest = currentVolume === target ? source : listOf(target).filter((c) => c.id !== chapterId);
  const index = clampIndex(toIndex, dest.length);
  const nextDest = [...dest.slice(0, index), moving, ...dest.slice(index)];
  const changes = new Map<string, ChapterPlacement>();
  const assign = (list: C[], volumeId: string | null) => {
    list.forEach((c, i) => {
      const sortOrder = i + 1;
      const cur = c.volumeId && known.has(c.volumeId) ? c.volumeId : null;
      if (c.sortOrder !== sortOrder || cur !== volumeId || (c.volumeId ?? null) !== volumeId) {
        changes.set(c.id, { id: c.id, volumeId, sortOrder });
      }
    });
  };
  if (currentVolume !== target) assign(source, currentVolume);
  assign(nextDest, target);
  return [...changes.values()];
}

/** 把一卷移到第 `toIndex` 个位置，返回序号变化的卷。 */
export function moveVolume<V extends VolumeLite>(volumes: V[], volumeId: string, toIndex: number): VolumePlacement[] {
  const sorted = [...volumes].sort(byOrder);
  const moving = sorted.find((v) => v.id === volumeId);
  if (!moving) return [];
  const rest = sorted.filter((v) => v.id !== volumeId);
  const index = clampIndex(toIndex, rest.length);
  const next = [...rest.slice(0, index), moving, ...rest.slice(index)];
  return next.flatMap((v, i) => (v.sortOrder === i + 1 ? [] : [{ id: v.id, sortOrder: i + 1 }]));
}

/** 末尾追加时用的序号。 */
export function nextSortOrder(items: { sortOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0) + 1;
}

const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1 → 一，12 → 十二，105 → 一百零五，2024 → 二千零二十四（最大 99999）。 */
export function chineseNumber(n: number): string {
  const value = Math.trunc(n);
  if (!Number.isFinite(value) || value < 0 || value > 99999) return String(n);
  if (value < 10) return DIGITS[value];
  const units = ["", "十", "百", "千", "万"];
  const digits = String(value).split("").map(Number);
  let out = "";
  let zero = false;
  digits.forEach((d, i) => {
    const unit = units[digits.length - 1 - i];
    if (d === 0) {
      zero = true;
      return;
    }
    if (zero && out) out += "零";
    zero = false;
    out += DIGITS[d] + unit;
  });
  return out.startsWith("一十") ? out.slice(1) : out;
}

/** 新章节的默认标题：第 N 章。 */
export function defaultChapterTitle(existingCount: number): string {
  return `第${chineseNumber(existingCount + 1)}章`;
}

/** 新卷的默认标题：第 N 卷。 */
export function defaultVolumeTitle(existingCount: number): string {
  return `第${chineseNumber(existingCount + 1)}卷`;
}
