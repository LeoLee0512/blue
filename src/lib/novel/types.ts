export type NodeKind = "volume" | "chapter" | "beat";

export type Novel = {
  id: string;
  title: string;
  genre: string;
  logline: string;
  premise: string;
  styleNotes: string;
  soFar: string;
  ledger: string;
  commentary: string;
  updatedAt: string;
};

export type OutlineNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  summary: string;
  sortOrder: number;
  status: string;
};

export type Chapter = {
  id: string;
  nodeId: string | null;
  title: string;
  body: string;
  fact: string;
  sortOrder: number;
  updatedAt: string;
};

export type Character = {
  id: string;
  name: string;
  role: string;
  bio: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName: string | null;
  createdAt: string;
};

export type Settings = {
  provider: "hosted" | "custom";
  baseUrl: string;
  model: string;
  hasKey: boolean;
  /** 2026-11-04：当前「地址 + 模型」是否在白名单里；false 表示旧设置，保留但不可用。 */
  usable: boolean;
  /** 2026-11-04 Sam（Mia §2.4）：服务端算好的连接状态，前端不得自己用 baseUrl 判断。 */
  connection: import("./model-whitelist").ConnectionView;
  keyMask: string;
  skills: string[];
  plugins: string[];
  wild: boolean;
  web: boolean;
  thinking: "low" | "mid" | "high";
  contextUsed: number;
};

export type UsageDay = {
  day: string;
  tokens: number;
  userChars: number;
  aiChars: number;
};

export type NovelDetail = {
  novel: Novel;
  outline: OutlineNode[];
  chapters: Chapter[];
  characters: Character[];
  messages: ChatMessage[];
};

export type VoiceDocs = {
  portrait: string;
  touch: string;
  preference: string;
};

export type SourceNote = {
  id: string;
  kind: "work" | "favorite";
  title: string;
  createdAt: string;
};

export type Leaf = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type SharedLeaf = {
  id: string;
  author: string;
  kind: "poem" | "note" | "chapter";
  title: string;
  body: string;
  mine: boolean;
  createdAt: string;
};

export type AccountSnapshot = {
  novels: Novel[];
  // 2026-11-01 全免费：不再返回 wallet / ledger（墨点流水）/ plan。
  settings: Settings;
  voice: VoiceDocs;
  sources: SourceNote[];
  usage: UsageDay[];
};
