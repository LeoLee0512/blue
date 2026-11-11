/**
 * Client-facing errors are a fixed table. Unknown text, upstream bodies, and
 * internal exceptions collapse to one sentence and are not forwarded.
 */

export const GENERIC_CLIENT_ERROR = "没有完成";

export const CLIENT_CODE_TEXT = {
  KEY_TOO_LONG: "密钥太长了（超过 400 个字符），请检查是否复制多了。",
  PROVIDER_UNKNOWN: "请先选择服务商。",
  MODEL_UNKNOWN: "请选择这家服务商的一个模型。",
  KEY_REQUIRED: "请填写密钥。",
  KEY_REQUIRED_AFTER_SWITCH: "更换了服务商，需要重新填写密钥。",
  KEY_INVALID: "密钥无效或没有权限，请检查密钥是否属于这家服务商、是否已开通所选模型。",
  NOT_FOUND: "服务商没有找到这个模型，可能是账号尚未开通。",
  RATE_LIMITED: "请求太频繁或额度不足，请稍后再试，或到服务商控制台查看余额。",
  REDIRECT_BLOCKED: "服务商地址发生了跳转，为了保护密钥已拦截。",
  TIMEOUT: "15 秒内没有响应，请稍后再试。",
  NETWORK: "暂时连不上服务商，请检查网络后再试。",
  EMPTY_REPLY: "服务商有响应，但没有返回内容。",
  UPSTREAM_ERROR: "服务商返回了错误，请稍后再试。",
  NOT_CONFIGURED: "请先选择服务商和模型、填写密钥并保存。",
  NOT_LISTED: "这个接口地址和模型不在可用名单里，请在「连接」里改选名单内的服务商和模型。",
  KEY_UNREADABLE: "已保存的密钥读不出来，原来的记录还在。",
  KEY_BOX_UNAVAILABLE: "服务器还不能加密保存密钥。",
  KEY_LEGACY_UNAVAILABLE: "这是较早保存的密钥。还没有配置用来读取它的旧密钥，原来的记录还在。",
} as const;

export type ClientErrorCode = keyof typeof CLIENT_CODE_TEXT;

/** Shorter fixed lines for a writing call. Test-connection uses CLIENT_CODE_TEXT. */
export const UPSTREAM_CALL_TEXT: Record<string, string> = {
  KEY_INVALID: "密钥未被接受",
  NOT_FOUND: "模型地址没有找到",
  RATE_LIMITED: "模型服务暂时繁忙",
  REDIRECT_BLOCKED: "模型地址发生了跳转，已拦截",
  TIMEOUT: "模型没有连上",
  NETWORK: "模型没有连上",
  EMPTY_REPLY: "模型没有给出内容",
  UPSTREAM_ERROR: "模型没有完成回复",
};

const ALLOWED_MESSAGES = new Set<string>([
  GENERIC_CLIENT_ERROR,
  ...Object.values(CLIENT_CODE_TEXT),
  ...Object.values(UPSTREAM_CALL_TEXT),
  "参数无效",
  "找不到这部作品",
  "找不到这个节点",
  "找不到这一章",
  "找不到这个人物",
  "不知道这是作品还是喜欢的小说",
  "没有留下",
  "找不到这一页",
  "没有可以放上的文字",
  "架上没有这一页",
  "不知道这是诗还是手记",
  "蓝稿已全部免费，不再提供充值或订阅。",
  "大纲里已经有内容",
  "第二本书，要先坐下来。一杯咖啡，一个月。",
  "请写一个书名",
  "书名不能空",
  "人物需要一个名字",
  "人物没有保存",
  "联网检索暂未开放。",
  "再多写几个字",
  "草稿没有留下",
  "社区功能暂未开放。",
  "习作先留三首。再写，一杯就够。",
  "习作先留三则。再写，一杯就够。",
  "外接地址无效",
  "外接 API 只接受 https",
  "地址里不要写账号",
  "不能连接内网地址",
  "还没接上模型：请在「连接」里填写接口地址、模型名和密钥。",
  "先写一句你想做什么",
  "模型没有完成回复",
  "稿面刷新失败",
  "把你写过的交给蓝稿，是长夜里的事。",
  "文字太短，读不出文风",
  "模型没有写出档案",
  "还没有可以评的正文",
  "这一回听过了。下一回，大约一杯咖啡。",
  "这一回没有评成",
  "评书没有留下",
  "先写一行。",
  "这一行没有接上",
  "大纲节点需要在 1 到 48 个之间",
  "大纲节点编号重复或为空",
  "每个节点都要有标题",
  "有节点指向了不存在的上级",
  "上级节点需要排在子节点前面",
  "章节标题和正文都不能空",
  "链接无效或已过期，请重新申请。",
  "页面没有打开。请重新加载。",
  "没有读到文件",
]);

export function isClientErrorCode(code: string): code is ClientErrorCode {
  return Object.prototype.hasOwnProperty.call(CLIENT_CODE_TEXT, code);
}

export function sanitizeClientError(
  message: string,
  code?: string,
): { ok: false; error: string; code?: string } {
  const known = code && isClientErrorCode(code) ? code : undefined;
  if (ALLOWED_MESSAGES.has(message)) {
    return known ? { ok: false, error: message, code: known } : { ok: false, error: message };
  }
  if (known) return { ok: false, error: CLIENT_CODE_TEXT[known], code: known };
  return { ok: false, error: GENERIC_CLIENT_ERROR };
}

export function clientErrorFromThrown(error: unknown): { ok: false; error: string; code?: string } {
  const code =
    error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  const message = error instanceof Error ? error.message : "";
  return sanitizeClientError(message, code);
}

export function sanitizeClientResult<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const record = value as { ok?: unknown; error?: unknown; code?: unknown };
  if (record.ok !== false || typeof record.error !== "string") return value;
  const code = typeof record.code === "string" ? record.code : undefined;
  const mapped = sanitizeClientError(record.error, code);
  const next = { ...record, error: mapped.error, ...(mapped.code ? { code: mapped.code } : { code: undefined }) };
  delete (next as { detail?: unknown }).detail;
  return next as T;
}

export function upstreamCode(status: number): keyof typeof UPSTREAM_CALL_TEXT {
  if (status === 401 || status === 403) return "KEY_INVALID";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 300 && status < 400) return "REDIRECT_BLOCKED";
  return "UPSTREAM_ERROR";
}

/**
 * Map an HTTP failure without reading the body. `text` is part of the type so
 * callers can pass a Response, and this function must not call it.
 */
export function upstreamFailureFromResponse(res: {
  status: number;
  type?: string;
  text?: () => Promise<string>;
}): { ok: false; error: string; status: number; code: string } {
  const redirected = res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
  const code = redirected ? "REDIRECT_BLOCKED" : upstreamCode(res.status);
  return { ok: false, error: UPSTREAM_CALL_TEXT[code], status: res.status, code };
}

export const PAGE_ERROR_TEXT = "页面没有打开。请重新加载。";
