// Sam 2026-11-04：白名单单测（npm test 自动收录），转译后用 data: URL 导入，不落盘。
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const js = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/novel/model-whitelist.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const W = await import("data:text/javascript," + encodeURIComponent(js));
const ok = (b, m) => assert.equal(W.isWhitelisted(b, m), true, `${b} ${m}`);
const no = (b, m) => assert.equal(W.isWhitelisted(b, m), false, `${b} ${m}`);
test("模型个数由名单本身算出", () => {
  const counted = W.MODEL_WHITELIST.reduce((n, e) => n + e.models.length, 0);
  assert.equal(W.listedModelCount(), counted);
  assert.equal(W.PROVIDER_FAMILIES.length, 8);
  assert.ok(counted > 0);
});
test("名单内地址的几种写法都放行", () => {
  ok("https://api.deepseek.com", "deepseek-flash");
  ok("https://api.deepseek.com/", "deepseek-v4-pro");
  ok("https://api.deepseek.com/chat/completions", "deepseek-flash");
  ok("https://API.DeepSeek.com", "deepseek-flash");
  ok(" https://open.bigmodel.cn/api/paas/v4/ ", "glm-5.3");
});
test("主机名必须逐字相等", () => {
  no("https://evildeepseek.com", "deepseek-flash");
  no("https://api.deepseek.com.evil.com", "deepseek-flash");
  no("https://x.api.deepseek.com", "deepseek-flash");
});
test("只接受 https，且不许端口、账号、查询串、片段", () => {
  no("http://api.deepseek.com", "deepseek-flash");
  no("https://api.deepseek.com:8443", "deepseek-flash");
  no("https://u:p@api.deepseek.com", "deepseek-flash");
  no("https://api.deepseek.com/?a=1", "deepseek-flash");
  no("https://api.deepseek.com/#x", "deepseek-flash");
  no("not a url", "deepseek-flash");
});
test("地址与 model 绑定，model 逐字相等", () => {
  no("https://api.deepseek.com", "glm-5.3");
  no("https://api.deepseek.com", "DeepSeek-Flash");
  no("https://api.deepseek.com", "deepseek-v4-flash"); // 旧名，会被路由到别的模型
  ok("https://spark-api-open.xf-yun.com/x2", "spark-x");
  ok("https://spark-api-open.xf-yun.com/v2", "spark-x");
  no("https://spark-api-open.xf-yun.com/v1", "spark-x");
  no("https://spark-api-open.xf-yun.com/agent/v1", "spark-x");
});
test("不收的条目", () => {
  no("https://ark.cn-beijing.volces.com/api/v3", "doubao-seed-character-260628");
  no("https://ark.cn-beijing.volces.com/api/v3", "doubao-seed-evolving");
  no("https://ark.cn-beijing.volces.com/api/v3", "deepseek-v4-1-flash-261017");
  no("https://ark.cn-beijing.volces.com/api/coding/v3", "doubao-seed-2-1-pro-260915");
  no("https://coding.dashscope.aliyuncs.com/v1", "qwen3.8-max");
  no("https://ws1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", "qwen3.8-max");
  no("https://open.bigmodel.cn/api/coding/paas/v4", "glm-5.3");
  no("https://api.stepfun.com/step_plan/v1", "step-3.7-flash");
  no("https://qianfan.baidubce.com/v2", "ernie-5.1");
  no("https://api.moonshot.cn/v1", "kimi-k2.6");
  no("https://dashscope.aliyuncs.com/compatible-mode/v1", "kimi/kimi-k3");
});
