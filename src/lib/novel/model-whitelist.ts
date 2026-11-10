// 2026-11-04 Sam：模型服务商白名单（队长 11-04 批准：8 家 41 个；千帆暂缓；方舟角色扮演、滚动别名不收；
// 聚合平台第三方/开源模型不收；kimi-k2.6、讯飞 /agent/v1 不收）。出处见 review/jim_白名单_模型清单与判定标准_v1.md。
// 规则：只接受 https；主机名逐字相等（不做后缀匹配）；路径逐字相等（允许末尾 / 或 /chat/completions）；
// 不许端口、账号、查询串、片段；model 逐字相等（大小写也算），地址与 model 绑定校验。
// 前后端共用，不依赖任何服务端模块。

export type Filing = { name: string; no: string; batch: string };

/** 一家服务商（界面下拉里的一项）。讯飞按路径拆成多条 entry，但在界面上同属一家。 */
export type ProviderFamily = {
  id: string;
  displayName: string;
  aggregator: boolean;
  filings: readonly Filing[];
  filingsCheckedAt: string;
  keyLabelNote?: string;
  /** 是否接受 thinking: { type } 参数（取代原来按域名猜的 deepseekHost）。只有 DeepSeek 已知支持。 */
  thinkingParam: boolean;
};

// 备案信息原文抄自 Jim 清单 v1（核对日期 2026-11-03）；顺序固定，不代表推荐度。
export const PROVIDER_FAMILIES: readonly ProviderFamily[] = [
  { id: "deepseek", displayName: "DeepSeek（深度求索）", aggregator: false, filings: [{ name: "求索对话DeepSeek Chat", no: "Beijing-DeepseekChat-202404280016", batch: "附件2·152" }], filingsCheckedAt: "2026-11-03", thinkingParam: true },
  { id: "bailian", displayName: "阿里云百炼（千问）", aggregator: true, filings: [{ name: "通义千问大模型", no: "ZheJiang-TongYiQianWen-20230901", batch: "附件1·11" }], filingsCheckedAt: "2026-11-03", thinkingParam: false },
  { id: "ark", displayName: "火山方舟（豆包）", aggregator: true, filings: [{ name: "云雀大模型", no: "Beijing-YunQue-20230821", batch: "附件1·3" }], filingsCheckedAt: "2026-11-03", thinkingParam: false },
  { id: "zhipu", displayName: "智谱", aggregator: false, filings: [{ name: "智谱清言（ChatGLM）", no: "Beijing-ChatGLM-20230821", batch: "附件1·2" }], filingsCheckedAt: "2026-11-03", thinkingParam: false },
  { id: "kimi", displayName: "Kimi（月之暗面）", aggregator: false, filings: [{ name: "Moonshot", no: "Beijing-MoonShot-20231016", batch: "附件1·16" }], filingsCheckedAt: "2026-11-03", thinkingParam: false },
  { id: "minimax", displayName: "MiniMax", aggregator: false, filings: [{ name: "MiniMax", no: "Shanghai-MiniMax-202505230046", batch: "附件6·422" }], filingsCheckedAt: "2026-11-03", thinkingParam: false },
  { id: "xfyun", displayName: "讯飞星火", aggregator: false, filings: [{ name: "星火认知大模型", no: "Anhui-XingHuoRenZhiDaMoXing-20230823", batch: "附件1·9" }], filingsCheckedAt: "2026-11-03", keyLabelNote: "填控制台里的 APIPassword", thinkingParam: false },
  { id: "stepfun", displayName: "阶跃星辰", aggregator: false, filings: [{ name: "阶跃", no: "Shanghai-JieYue-20231106", batch: "附件1·35" }], filingsCheckedAt: "2026-11-03", thinkingParam: false },
];

export type WhitelistEntry = {
  id: string;
  /** 所属服务商（PROVIDER_FAMILIES 的 id）。 */
  family: string;
  label: string;
  /** 规范地址，不带末尾 / 。真正请求的是 `${base}/chat/completions`。 */
  base: string;
  models: readonly string[];
};

export const MODEL_WHITELIST: readonly WhitelistEntry[] = [
  { id: "deepseek", family: "deepseek", label: "DeepSeek", base: "https://api.deepseek.com", models: ["deepseek-flash", "deepseek-v4-pro"] },
  { id: "bailian", family: "bailian", label: "阿里云百炼（千问）", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen3.8-max", "qwen3.8-flash", "qwen3.7-plus", "qwen3.7-flash"] },
  {
    id: "ark",
    family: "ark",
    label: "火山方舟（豆包）",
    base: "https://ark.cn-beijing.volces.com/api/v3",
    models: [
      "doubao-seed-2-1-pro-260915",
      "doubao-seed-2-1-lite-260915",
      "doubao-seed-2-1-turbo-260628",
      "doubao-seed-2-1-pro-260628",
      "doubao-seed-2-0-lite-260428",
      "doubao-seed-2-0-mini-260428",
    ],
  },
  {
    id: "zhipu",
    family: "zhipu",
    label: "智谱",
    base: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-5.3", "glm-5.2", "glm-5.1", "glm-5-turbo", "glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx", "glm-4.6", "glm-4.5-air", "glm-4.5-airx", "glm-4.5-flash", "glm-4-flash-250414", "glm-4-flashx-250414"],
  },
  { id: "kimi", family: "kimi", label: "Kimi（月之暗面）", base: "https://api.moonshot.cn/v1", models: ["kimi-k3.1-pro", "kimi-k3.1-pro-highspeed", "kimi-k3"] },
  { id: "minimax", family: "minimax", label: "MiniMax", base: "https://api.minimax.cn/v1", models: ["MiniMax-M3.1-Flash", "MiniMax-M3"] },
  // 讯飞：同一个 model 串（spark-x）按路径区分实际模型，所以按「路径 + model」分条。
  { id: "xfyun", family: "xfyun", label: "讯飞星火", base: "https://spark-api-open.xf-yun.com/v1", models: ["4.0Ultra", "generalv3", "pro-128k", "lite"] },
  { id: "xfyun-x2", family: "xfyun", label: "讯飞星火 X2", base: "https://spark-api-open.xf-yun.com/x2", models: ["spark-x"] },
  { id: "xfyun-x15", family: "xfyun", label: "讯飞星火 X1.5", base: "https://spark-api-open.xf-yun.com/v2", models: ["spark-x"] },
  { id: "stepfun", family: "stepfun", label: "阶跃星辰", base: "https://api.stepfun.com/v1", models: ["step-5-preview", "step-3.7-flash", "step-3.5-flash", "step-3.5-flash-2603"] },
];

/** 把用户填的地址规范成 `https://host/path`（无末尾 / 、无 /chat/completions）；不合规返回 null。 */
export function normalizeBase(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/chat/completions")) path = path.slice(0, -"/chat/completions".length);
  return `https://${url.hostname.toLowerCase()}${path}`;
}

export function findWhitelisted(baseUrl: string, model: string): WhitelistEntry | null {
  const base = normalizeBase(baseUrl);
  if (!base) return null;
  const m = model.trim();
  return MODEL_WHITELIST.find((entry) => entry.base === base && entry.models.includes(m)) ?? null;
}

export function isWhitelisted(baseUrl: string, model: string): boolean {
  return findWhitelisted(baseUrl, model) !== null;
}

export const NOT_LISTED = "这个接口地址和模型不在可用名单里，请在「连接」里改选名单内的服务商和模型。";

export function familyOf(entry: WhitelistEntry): ProviderFamily {
  return PROVIDER_FAMILIES.find((f) => f.id === entry.family)!;
}

export function entryById(id: string): WhitelistEntry | null {
  return MODEL_WHITELIST.find((e) => e.id === id) ?? null;
}

/** 界面下拉用：每家服务商下的全部可选模型（value 为「entryId|model」，讯飞同名 model 靠 entryId 区分）。 */
export function modelOptions(familyId: string): { value: string; entryId: string; model: string; label: string }[] {
  return MODEL_WHITELIST.filter((e) => e.family === familyId).flatMap((e) =>
    e.models.map((m) => ({ value: `${e.id}|${m}`, entryId: e.id, model: m, label: e.id === e.family ? m : `${m}（${e.label}）` })),
  );
}

export type ConnectionState = "unconfigured" | "ok" | "needs_key" | "legacy_blocked" | "model_blocked";

export type ConnectionView = {
  state: ConnectionState;
  /** ok / needs_key：生效的 entry；model_blocked：主机名命中的那家（任取该主机的第一条 entry）。 */
  entryId: string;
  familyId: string;
  modelId: string;
  /** 仅 legacy_blocked / model_blocked：只含主机名与旧模型名，不含路径、账号。 */
  legacy: { host: string; model: string } | null;
};

/** 纯函数：由已存的 base_url / model / 是否有密钥算出连接状态（不写库）。 */
export function resolveConnection(baseUrl: string, model: string, hasKey: boolean): ConnectionView {
  const base = (baseUrl || "").trim();
  const m = (model || "").trim();
  const empty: ConnectionView = { state: "unconfigured", entryId: "", familyId: "", modelId: "", legacy: null };
  if (!base) return empty; // L0 / L5（只有密钥、没有地址）
  const entry = findWhitelisted(base, m);
  if (entry) return { state: hasKey ? "ok" : "needs_key", entryId: entry.id, familyId: entry.family, modelId: m, legacy: null };
  let host = "";
  try {
    const u = new URL(base);
    host = u.hostname.toLowerCase();
    const sameHost = u.protocol === "https:" && !u.port && !u.username && !u.password ? MODEL_WHITELIST.find((e) => new URL(e.base).hostname === host) : undefined;
    if (sameHost) return { state: "model_blocked", entryId: sameHost.id, familyId: sameHost.family, modelId: "", legacy: { host, model: m } };
  } catch {
    host = "";
  }
  return { state: "legacy_blocked", entryId: "", familyId: "", modelId: "", legacy: { host: host || "（无法识别的地址）", model: m } };
}
