import { sanitizeClientError } from "../novel/client-error.ts";

/** Map a sign-in failure onto a fixed sentence. Unknown text is not shown. */
export function explainAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/pop-up blocked/i.test(message)) return "登录窗口被拦住了。请允许弹出窗口，或直接用邮箱进入。";
  if (/invalid origin/i.test(message)) return "这个页面暂时不能登录，请回到本机页面再试。";
  if (/invalid email or password|invalid credentials/i.test(message)) return "邮箱或密码不对。";
  if (/email not verified/i.test(message)) return "邮箱还没验证。我们刚又发了一封验证邮件，请查收。";
  if (/invalid token|expired/i.test(message)) return "链接无效或已过期，请重新申请。";
  return sanitizeClientError(message).error === message ? message : "没有登录成功";
}
