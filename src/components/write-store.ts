import { create } from "zustand";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** 编辑器的实时状态（状态栏、版本面板读）。 */
export const useWriteState = create<{
  save: SaveState;
  savedAt: number;
  chapterWords: number;
  selectionWords: number;
  /** 当前章节在数据库里的字数（算全书实时字数用） */
  storedWords: number;
  /** 版本列表需要刷新时自增 */
  versionTick: number;
  /** 外部改了正文（恢复版本等），要求编辑器重新载入 */
  reloadTick: number;
  set: (patch: Partial<{ save: SaveState; savedAt: number; chapterWords: number; selectionWords: number; storedWords: number }>) => void;
  bumpVersions: () => void;
  reload: () => void;
}>((set) => ({
  save: "idle",
  savedAt: 0,
  chapterWords: 0,
  selectionWords: 0,
  storedWords: 0,
  versionTick: 0,
  reloadTick: 0,
  set: (patch) => set(patch),
  bumpVersions: () => set((s) => ({ versionTick: s.versionTick + 1 })),
  reload: () => set((s) => ({ reloadTick: s.reloadTick + 1 })),
}));
