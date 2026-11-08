// 2026-11-03 Sam（s6 H1，Jim fk 复核修订）：服务端函数返回「账号已注销 / 未登录」时，前端立即退出登录并回到登录页。
// 只看结构化错误：顶层 error（抛出的 Error，message 为 Unauthorized / ACCOUNT_GONE）、
// result.error 字段的值等于 ACCOUNT_GONE，或 HTTP 401。不在整个响应体里搜字符串，避免用户正文误触发。
import { signOut } from "./client";

const GONE = new Set(["ACCOUNT_GONE", "Unauthorized"]);
type Node = { t?: number; s?: unknown; p?: { k?: string[]; v?: Node[] } };

function field(node: Node | undefined, key: string): Node | undefined {
  const k = node?.p?.k;
  const i = Array.isArray(k) ? k.indexOf(key) : -1;
  return i >= 0 ? node?.p?.v?.[i] : undefined;
}

export function isGoneResponse(status: number, text: string): boolean {
  if (status === 401) return true;
  let root: Node;
  try {
    root = JSON.parse(text) as Node;
  } catch {
    return false;
  }
  const thrown = field(root, "error") as { s?: { message?: { s?: unknown } } } | undefined;
  if (typeof thrown?.s?.message?.s === "string" && GONE.has(thrown.s.message.s)) return true;
  const resultError = field(field(root, "result"), "error");
  return resultError?.t === 1 && resultError.s === "ACCOUNT_GONE";
}

let installed = false;
let leaving = false;

// Jim fk2/fk3 复核：signOut 失败时硬跳转可能循环（会话有效但 serverFn 一直 Unauthorized）。
// 只在 signOut 失败、准备硬跳转时记标记；60 秒内再次失败就不跳，改为底部提示条（带「退出登录」按钮）。
// sessionStorage 不可用时无法跨刷新防循环，所以直接显示提示条、不跳转。
const LOOP_KEY = "lg_account_gone_at";
const LOOP_MS = 60_000;
const NOTICE_ID = "account-gone-notice";

function storage(): Storage | null {
  try {
    const s = window.sessionStorage;
    const probe = "__lg_probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function hideNotice(): void {
  document.getElementById(NOTICE_ID)?.remove();
}

function showNotice(): void {
  if (document.getElementById(NOTICE_ID)) return;
  const el = document.createElement("div");
  el.id = NOTICE_ID;
  el.setAttribute("role", "alert");
  el.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:12px;align-items:center;padding:8px 16px;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;border-radius:6px;font-size:14px";
  const text = document.createElement("span");
  text.textContent = "登录状态已失效，请退出后重新登录。";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "退出登录";
  btn.onclick = () => {
    btn.disabled = true;
    signOut("/login").catch(() => {
      btn.disabled = false;
      text.textContent = "退出失败，请清除本站 Cookie 后重新打开。";
    });
  };
  el.appendChild(text);
  el.appendChild(btn);
  document.body.appendChild(el);
}

async function leave(): Promise<void> {
  if (leaving || document.getElementById(NOTICE_ID)) return;
  leaving = true;
  try {
    await signOut("/login");
    return;
  } catch {
    /* 落到下面的硬跳转 / 提示条 */
  }
  const s = storage();
  const at = Number(s?.getItem(LOOP_KEY) || 0);
  if (!s || (at > 0 && Date.now() - at < LOOP_MS)) {
    leaving = false;
    showNotice();
    return;
  }
  s.setItem(LOOP_KEY, String(Date.now()));
  window.location.assign("/login");
}

export function installAccountGoneGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
    if (!leaving && url.includes("/_serverFn/")) {
      res
        .clone()
        .text()
        .then((text) => {
          if (isGoneResponse(res.status, text)) void leave();
          else if (res.ok) hideNotice(); // 状态恢复后提示条自动消失
        })
        .catch(() => {});
    }
    return res;
  };
}
