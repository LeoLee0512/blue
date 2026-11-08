// Sam fk4：账号失效守卫单测（npm test 自动收录）。把 TS 转译到独立临时目录，./client 换成桩；源文件只读。
// ACCOUNT_GONE 样本为 Jim 抓取的真实响应（fixtures/real_account_gone_sample.txt）。
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const ts = createRequire(path.join(root, "package.json"))("typescript");
// 不落盘：桩和转译结果都用 data: URL 导入，不在 /tmp 留目录，也就不需要清理（删除）。
const stubSrc = `export async function signOut(){ globalThis.__signOuts=(globalThis.__signOuts||0)+1; if (globalThis.__signOutFail) throw new Error("x"); }`;
const stubUrl = "data:text/javascript," + encodeURIComponent(stubSrc);
const js = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/auth/account-gone.client.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "\.\/client"/, `from "${stubUrl}"`);
const unauth = '{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":2,"s":1},{"t":25,"i":1,"s":{"message":{"t":1,"s":"Unauthorized"}},"c":"$TSR/Error"},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
const goneFixture = path.join(here, "fixtures/real_account_gone_sample.txt");
const gone = fs.existsSync(goneFixture) ? fs.readFileSync(goneFixture, "utf8").trim() : "";
const okBody = '{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":10,"i":1,"p":{"k":["ok","text"],"v":[{"t":2,"s":2},{"t":1,"s":"他写下 ACCOUNT_GONE 和 Unauthorized"}]},"o":0},{"t":2,"s":1},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
let n = 0; const load = () => import("data:text/javascript," + encodeURIComponent(`${js}\n//${n++}`));
const { isGoneResponse } = await load();
test("Unauthorized 抛错 → 失效", () => assert.equal(isGoneResponse(200, unauth), true));
test("真实 ACCOUNT_GONE 样本 → 失效", { skip: gone ? false : "未覆盖：真实抓取样本不在排密导入中，未补造该文件" }, () => assert.equal(isGoneResponse(200, gone), true));
test("合成 ACCOUNT_GONE 响应 → 失效", () => assert.equal(isGoneResponse(200, unauth.replace('"Unauthorized"', '"ACCOUNT_GONE"')), true));
test("HTTP 401 → 失效", () => assert.equal(isGoneResponse(401, ""), true));
test("正文出现这两个词 → 不失效", () => assert.equal(isGoneResponse(200, okBody), false));
test("非 JSON → 不失效", () => assert.equal(isGoneResponse(200, "<html>"), false));

function page({ store, noStorage, body, counters }) {
  const els = new Map();
  globalThis.window = {
    sessionStorage: noStorage ? { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() {} }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    location: { assign: () => counters.assigns++ },
    fetch: async () => new Response(body(), { status: 200 }),
  };
  globalThis.document = {
    getElementById: (id) => els.get(id) ?? null,
    createElement: () => { const e = { style: {}, kids: [], setAttribute() {}, appendChild(k) { e.kids.push(k); }, remove() { els.delete(e.id); } }; return e; },
    body: { appendChild: (e) => { els.set(e.id, e); counters.notices++; } },
  };
  return els;
}
async function hit() { await window.fetch("/_serverFn/abc"); await new Promise((r) => setTimeout(r, 20)); }

test("signOut 失败：跨 3 次加载只跳 1 次，之后显示提示条", async () => {
  globalThis.__signOutFail = true; const store = new Map(); const c = { assigns: 0, notices: 0 };
  for (let i = 0; i < 3; i++) { page({ store, body: () => unauth, counters: c }); (await load()).installAccountGoneGuard(); await hit(); }
  assert.deepEqual(c, { assigns: 1, notices: 2 });
});
test("sessionStorage 不可用：不跳转，直接提示条", async () => {
  globalThis.__signOutFail = true; const c = { assigns: 0, notices: 0 };
  for (let i = 0; i < 3; i++) { page({ noStorage: true, body: () => unauth, counters: c }); (await load()).installAccountGoneGuard(); await hit(); }
  assert.deepEqual(c, { assigns: 0, notices: 3 });
});
test("signOut 成功不写标记：之后再失效仍正常登出", async () => {
  globalThis.__signOutFail = false; globalThis.__signOuts = 0; const store = new Map(); const c = { assigns: 0, notices: 0 };
  for (let i = 0; i < 2; i++) { page({ store, body: () => unauth, counters: c }); (await load()).installAccountGoneGuard(); await hit(); }
  assert.equal(store.size, 0); assert.equal(globalThis.__signOuts, 2); assert.equal(c.notices, 0);
});
test("状态恢复后提示条自动消失", async () => {
  globalThis.__signOutFail = true; let cur = unauth; const c = { assigns: 0, notices: 0 };
  const els = page({ noStorage: true, body: () => cur, counters: c }); (await load()).installAccountGoneGuard();
  await hit(); assert.equal(els.size, 1);
  cur = okBody; await hit(); assert.equal(els.size, 0);
});

test("提示条显示期间不重复调用 signOut", async () => {
  globalThis.__signOutFail = true; globalThis.__signOuts = 0; const c = { assigns: 0, notices: 0 };
  page({ noStorage: true, body: () => unauth, counters: c }); (await load()).installAccountGoneGuard();
  await hit(); await hit(); await hit();
  assert.equal(globalThis.__signOuts, 1); assert.equal(c.notices, 1);
});
test("提示条的「退出登录」按钮：失败改提示、成功调用 signOut", async () => {
  globalThis.__signOutFail = true; globalThis.__signOuts = 0; const c = { assigns: 0, notices: 0 };
  const els = page({ noStorage: true, body: () => unauth, counters: c }); (await load()).installAccountGoneGuard();
  await hit();
  const [text, btn] = els.get("account-gone-notice").kids;
  assert.equal(btn.textContent, "退出登录");
  btn.onclick(); await new Promise((r) => setTimeout(r, 10));
  assert.equal(globalThis.__signOuts, 2); assert.equal(btn.disabled, false); assert.match(text.textContent, /清除本站 Cookie/);
  globalThis.__signOutFail = false; btn.onclick(); await new Promise((r) => setTimeout(r, 10));
  assert.equal(globalThis.__signOuts, 3); assert.equal(btn.disabled, true);
});
