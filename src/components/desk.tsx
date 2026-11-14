import { createContext, useContext, type MutableRefObject } from "react";
import type { AccountSnapshot, NovelDetail, UsageDay, VoiceDocs } from "@/lib/novel/types";
import type { ConfirmRequest } from "@/components/ui";

export type PaneId =
  | "library"
  | "outline"
  | "manuscript"
  | "review"
  | "net"
  | "people"
  | "skills"
  | "plugins"
  | "connect"
  | "billing"
  | "stats"
  | "studio"
  | "agent"
  | "poetry"
  | "notes"
  | "share"
  | "plan"
  // v2
  | "story"
  | "data"
  | "settings";

/** 右侧面板 */
export type SideTab = "cards" | "lore" | "assist" | "versions" | "threads" | "agent";

/** 导出范围 */
export type ExportScope = { kind: "chapter"; id: string } | { kind: "volume"; id: string | null } | { kind: "work" };

/** 编辑器向外暴露的能力（AI 工具、人物卡插入用）。 */
export type EditorBridge = {
  chapterId: string;
  /** 当前选区；没有选中时 start === end */
  selection: () => { start: number; end: number; text: string; before: string; after: string };
  /** 用 text 替换 [start, end)，并把光标放到新文字末尾 */
  replace: (start: number, end: number, text: string) => void;
  focus: () => void;
  /** 立即保存（AI 替换之前、切换章节之前） */
  flush: () => Promise<boolean>;
  /** 当前正文（含未保存的修改） */
  text: () => string;
};

export type Desk = {
  account: AccountSnapshot | null;
  detail: NovelDetail | null;
  novelId: string;
  pane: PaneId;
  setPane: (pane: PaneId) => void;
  error: string;
  notice: string;
  busy: boolean;
  running: boolean;
  draft: string;
  setDraft: (value: string) => void;
  selectedNodeId: string;
  setSelectedNodeId: (id: string) => void;
  selectedChapterId: string;
  setSelectedChapterId: (id: string) => void;
  creating: boolean;
  setCreating: (value: boolean) => void;
  selectNovel: (id: string) => void;
  refreshAll: () => Promise<void>;
  refreshDetail: () => Promise<void>;
  send: (prompt: string, intent?: "talk" | "write") => Promise<void>;
  createWork: (input: { title: string; genre: string; logline: string }) => Promise<void>;
  seedLine: (sentence: string) => Promise<void>;
  saveStory: (input: { title: string; genre: string; logline: string; premise: string; styleNotes: string; soFar: string; ledger: string }) => Promise<void>;
  destroyWork: () => Promise<void>;
  saveNode: (input: { id?: string; parentId?: string | null; kind: string; title: string; summary: string }, opts?: { quiet?: boolean }) => Promise<boolean>;
  destroyNode: (nodeId: string) => Promise<void>;
  plantTemplate: (force: boolean) => Promise<"ok" | "confirm" | "fail">;
  saveChapter: (input: { id?: string; title: string; body: string }, opts?: { quiet?: boolean }) => Promise<boolean>;
  destroyChapter: (chapterId: string) => Promise<void>;
  savePerson: (input: { id?: string; name: string; role: string; bio: string }) => Promise<void>;
  destroyPerson: (characterId: string) => Promise<void>;
  toggleSkill: (id: string) => Promise<void>;
  togglePlugin: (id: string) => Promise<void>;
  // 2026-11-04 Sam（Mia §5.5）：改为 providerId/modelId，并把结果交回连接页就近显示。旧签名：
  // saveLink: (input: { provider: string; baseUrl: string; model: string; keyAction: string; apiKey?: string }) => Promise<void>;
  // testLink: () => Promise<void>;
  saveLink: (input: { providerId: string; modelId: string; keyAction: string; apiKey?: string }) => Promise<LinkResult>;
  testLink: () => Promise<LinkResult>;
  saveVoice: (input: VoiceDocs, opts?: { quiet?: boolean }) => Promise<boolean>;
  learnText: (input: { kind: "work" | "favorite"; title: string; body: string; via?: "paste" | "file" }) => Promise<void>;
  review: () => Promise<void>;
  setStudio: (patch: { wild?: boolean; web?: boolean; thinking?: "low" | "mid" | "high" }) => Promise<void>;
  noteToday: (today: UsageDay) => void;
  // v2
  patchDetail: (fn: (detail: NovelDetail) => NovelDetail) => void;
  patchAccount: (fn: (account: AccountSnapshot) => AccountSnapshot) => void;
  note: (text: string) => void;
  fail: (text: string) => void;
  ask: (request: ConfirmRequest) => void;
  side: SideTab | null;
  setSide: (tab: SideTab | null) => void;
  focus: boolean;
  setFocus: (on: boolean) => void;
  /** 打开导出对话框；传 novelId 时先切到那部作品 */
  openExport: (scope: ExportScope, novelId?: string) => void;
  editor: MutableRefObject<EditorBridge | null>;
  openNovel: (id: string) => void;
};

const DeskContext = createContext<Desk | null>(null);

export function DeskProvider({ value, children }: { value: Desk; children: React.ReactNode }) {
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives with the provider it reads
export function useDesk(): Desk {
  const desk = useContext(DeskContext);
  if (!desk) throw new Error("书桌还没有准备好");
  return desk;
}

export type LinkResult = { ok: true; text?: string } | { ok: false; error: string; code?: string };
