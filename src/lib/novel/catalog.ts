import type { NodeKind } from "./types";

export const CONTEXT_LIMIT = 1_000_000;
export const TRANSCRIPT_LIMIT = 480_000;

export const GENRES = ["文学", "悬疑", "奇幻", "科幻", "言情", "现实", "历史"] as const;

export type SkillDef = {
  id: string;
  name: string;
  blurb: string;
  prompt: string;
};

export const SKILLS: SkillDef[] = [
  {
    id: "structure",
    name: "大纲建筑师",
    blurb: "按卷、章、节拍把故事立起来",
    prompt: "建大纲时分卷、章、节拍。每章用两三句写清事件与转折，不要写正文。",
  },
  {
    id: "character",
    name: "人物档案",
    blurb: "名字、关系、不肯说的事",
    prompt: "写人物时给出身份、欲望、弱点，以及一个不肯对别人说的事实。姓名前后保持一致。",
  },
  {
    id: "world",
    name: "世界观",
    blurb: "只写会改变情节的规则",
    prompt: "世界观只保留会压迫人物或改变选择的规则，不要堆砌名词。",
  },
  {
    id: "chapter",
    name: "章节撰写",
    blurb: "一章一事，七百到一千一百字",
    prompt: "写正文时一章只推进一件事。700到1100字，从动作或景物进入，少解释。",
  },
  {
    id: "voice",
    name: "文风统一",
    blurb: "对齐已写段落的语气",
    prompt: "若已有正文或文风备注，续写必须贴着那个语气，不要突然变腔。",
  },
  {
    id: "dialogue",
    name: "对白打磨",
    blurb: "话里有目的，少形容词",
    prompt: "对白要有目的。每个人说话方式不同。少用副词修饰说。",
  },
  {
    id: "plain",
    name: "去机器味",
    blurb: "少解释情绪，多留一个动作",
    prompt: "写正文时避开机器腔：不用破折号堆叠，不用「不是甲而是乙」的拐弯，不用「不禁」「仿佛」「心中涌起」。情绪用一个具体动作带出来。",
  },
  {
    id: "hook",
    name: "章末留一口",
    blurb: "收在还没被看见的那个动作上",
    prompt: "一章收在一个还没回答的具体问题上，或一个刚做完、还没被别人看见的动作。不要解释这一章的意义，不要写未完待续。",
  },
  {
    id: "thread",
    name: "未收的线",
    blurb: "埋下的物件和承诺要记下来",
    prompt: "物件、承诺和没说完的话记进手里的线。后文收回时用原来的名字。作者知道而读者还不知道的事，正文里只露边，不说破。",
  },
];

export type PluginDef = {
  id: string;
  name: string;
  blurb: string;
  prompt?: string;
};

export const PLUGINS: PluginDef[] = [
  {
    id: "beats",
    name: "节拍表",
    blurb: "把章节扣到起承转合的节拍上",
    prompt: "安排章节时尽量覆盖这些节拍：日常、裂口、进入新局面、中点、代价、高潮、余波。不要在正文里写出节拍的名字。",
  },
  {
    id: "continuity",
    name: "连续性校对",
    blurb: "核对姓名、地点和已写事实",
    prompt: "下笔前对照手里的线。姓名、地点和已经发生的事不能漂。作者知道而读者还不知道的事，正文里只能露边。若和用户的新决定冲突，先点明，再改。",
  },
  {
    id: "export",
    name: "Markdown 导出",
    blurb: "把大纲、人物、线和正文收成一个文件",
  },
  {
    id: "readback",
    name: "写完对读",
    blurb: "只说读者还想知道什么，不改稿",
    prompt: "若这一轮刚写完一章，回复里用两句说：读者此刻最想知道的一件事，以及一处可能和前文不符的地方。不要因此改稿，除非用户接着要求改。",
  },
];

export const DEFAULT_SKILLS = SKILLS.map((s) => s.id);
export const DEFAULT_PLUGINS = PLUGINS.filter((plugin) => plugin.id !== "readback").map((plugin) => plugin.id);

export const EMPTY_ACTS: {
  ref: string;
  parent: string;
  kind: NodeKind;
  title: string;
  summary: string;
}[] = [
  { ref: "v1", parent: "", kind: "volume", title: "卷一 · 起", summary: "人物还在原来的生活里。" },
  { ref: "c1", parent: "v1", kind: "chapter", title: "日常", summary: "写出场所、主角，以及一个还没被说破的不适。" },
  { ref: "b1", parent: "c1", kind: "beat", title: "开场画面", summary: "一个可以反复出现的物件或声音。" },
  { ref: "c2", parent: "v1", kind: "chapter", title: "裂口", summary: "一件事让原来的日子过不下去。" },
  { ref: "v2", parent: "", kind: "volume", title: "卷二 · 转", summary: "主角进入新的局面，并付出代价。" },
  { ref: "c3", parent: "v2", kind: "chapter", title: "深入", summary: "新规则出现，盟友或对手站到台前。" },
  { ref: "c4", parent: "v2", kind: "chapter", title: "代价", summary: "中点之后，主角失去一件原先倚仗的东西。" },
  { ref: "v3", parent: "", kind: "volume", title: "卷三 · 合", summary: "选择变得无法回头。" },
  { ref: "c5", parent: "v3", kind: "chapter", title: "对决", summary: "把卷一只埋下的那件事拿回来。" },
  { ref: "c6", parent: "v3", kind: "chapter", title: "余波", summary: "世界还在，但人物已经不能回到开头。" },
];

export function knownSkillIds(ids: string[]): string[] {
  const allow = new Set(SKILLS.map((s) => s.id));
  return [...new Set(ids.filter((id) => allow.has(id)))].slice(0, SKILLS.length);
}

export function knownPluginIds(ids: string[]): string[] {
  const allow = new Set(PLUGINS.map((p) => p.id));
  return [...new Set(ids.filter((id) => allow.has(id)))].slice(0, PLUGINS.length);
}

export const VOICE_FILES = {
  portrait: "风格画像.md",
  touch: "笔触.md",
  preference: "偏好.md",
} as const;

export const EMPTY_VOICE = {
  portrait: `# 风格画像

还没有你的作品。上传之后，这里记下叙事距离、句子长短、怎么进入一场戏，以及你不肯用的词。
`,
  touch: `# 笔触

还没有样本。这里只写句法：动词、对白、留白，和一章怎么收住。
`,
  preference: `# 偏好

还没有喜欢的小说。蒸馏之后，这里只留可学的手法，不留情节，也不留原句。
`,
} as const;

export const VOICE_SKILLS = [
  {
    id: "portrait",
    name: "你的风格画像",
    file: VOICE_FILES.portrait,
    blurb: "写小说时自动启用，像一项始终打开的技能。",
  },
  {
    id: "touch",
    name: "你的笔触",
    file: VOICE_FILES.touch,
    blurb: "写小说时自动启用。管句子，不管情节。",
  },
] as const;
