// Sam 2026-11-04：resolveConnection / modelOptions 单测（Mia 设计稿 §3.2 L0~L5），转译后用 data: URL 导入，不落盘。
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const js = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/novel/model-whitelist.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const W = await import("data:text/javascript," + encodeURIComponent(js));
const st = (b, m, k = true) => W.resolveConnection(b, m, k);
test("L0/L5：没有地址 = 未配置（只有密钥也一样）", () => {
  assert.equal(st("", "", false).state, "unconfigured");
  assert.equal(st("", "", true).state, "unconfigured");
  assert.equal(st("  ", "deepseek-flash", true).state, "unconfigured");
});
test("L2：主机名和模型都精确匹配 = 可用；没密钥 = needs_key", () => {
  assert.deepEqual(st("https://api.deepseek.com/", "deepseek-flash"), { state: "ok", entryId: "deepseek", familyId: "deepseek", modelId: "deepseek-flash", legacy: null });
  assert.equal(st("https://api.deepseek.com", "deepseek-flash", false).state, "needs_key");
  assert.equal(st("https://spark-api-open.xf-yun.com/x2", "spark-x").entryId, "xfyun-x2");
});
test("L3：主机名对、模型不在列表 = model_blocked，只回主机名", () => {
  for (const m of ["", "DeepSeek-Flash", " deepseek-x ", "deepseek-chat"]) {
    const v = st("https://api.deepseek.com/v1", m); assert.equal(v.state, "model_blocked", m); assert.equal(v.familyId, "deepseek"); assert.equal(v.legacy.host, "api.deepseek.com");
  }
});
test("L1：名单外 / http / 端口 / 账号 / 乱码 = legacy_blocked，不泄露路径和账号", () => {
  for (const b of ["https://evildeepseek.com", "http://api.deepseek.com", "https://api.deepseek.com:8443", "https://u:p@api.deepseek.com/x", "not a url", "https://127.0.0.1/v1"]) {
    const v = st(b, "deepseek-flash"); assert.equal(v.state, "legacy_blocked", b);
    assert.doesNotMatch(JSON.stringify(v), /u:p|8443|\/x"/);
  }
});
test("8 家服务商，每家都有备案号和模型；讯飞的模型来自 3 条 entry", () => {
  assert.equal(W.PROVIDER_FAMILIES.length, 8);
  for (const f of W.PROVIDER_FAMILIES) { assert.ok(f.filings.length && f.filings.every((x) => x.no && !/待|占位|TODO|[<{]/.test(x.no + x.name)), f.id); assert.ok(W.modelOptions(f.id).length, f.id); }
  assert.equal(W.PROVIDER_FAMILIES.reduce((n, f) => n + W.modelOptions(f.id).length, 0), 41);
  const x = W.modelOptions("xfyun"); assert.equal(new Set(x.map((o) => o.value)).size, x.length); assert.ok(x.some((o) => o.value === "xfyun-x15|spark-x"));
  for (const e of W.MODEL_WHITELIST) assert.ok(W.PROVIDER_FAMILIES.some((f) => f.id === e.family), e.id);
});
