import { createContext, useContext } from "react";
import type { AccountSnapshot, NovelDetail, UsageDay, VoiceDocs } from "@/lib/novel/types";

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
  | "plan";

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
  buy: (packId: string) => Promise<void>;
  saveVoice: (input: VoiceDocs, opts?: { quiet?: boolean }) => Promise<boolean>;
  learnText: (input: { kind: "work" | "favorite"; title: string; body: string; via?: "paste" | "file" }) => Promise<void>;
  review: () => Promise<void>;
  setStudio: (patch: { wild?: boolean; web?: boolean; thinking?: "low" | "mid" | "high" }) => Promise<void>;
  noteToday: (today: UsageDay) => void;
};

const DeskContext = createContext<Desk | null>(null);

export function DeskProvider({ value, children }: { value: Desk; children: React.ReactNode }) {
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): Desk {
  const desk = useContext(DeskContext);
  if (!desk) throw new Error("书桌还没有准备好");
  return desk;
}

export type LinkResult = { ok: true; text?: string } | { ok: false; error: string; code?: string };
