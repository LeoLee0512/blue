// Sam 2026-11-08：关于页用的公开备案视图与连接页同源；不落盘转译。
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const js = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/novel/model-whitelist.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const W = await import("data:text/javascript," + encodeURIComponent(js));
const about = fs.readFileSync(path.join(root, "src/routes/about.tsx"), "utf8");
test("关于页只读 PROVIDER_FAMILIES，必写两句在，不含密钥和 compliance 路径", () => {
  assert.match(about, /PROVIDER_FAMILIES/);
  assert.match(about, /f\.filings\.map/);
  assert.doesNotMatch(about, /api_key|sk-|compliance\/|BETTER_AUTH|riskNote/i);
  assert.match(about, /主导人：Leo Lee/);
  assert.match(about, /本软件由主导人使用 Grok Bot 合作制作/);
  assert.match(about, /Copyright \(c\) 2026 Leo Lee/);
  assert.equal(about.includes(String.fromCharCode(0x674e, 0x4f73, 0x660a)), false);
  assert.equal(about.includes(String.fromCharCode(0x5317, 0x4eac, 0x5e02, 0x5927, 0x5174, 0x533a)), false);
  assert.equal(about.includes(["620", "026", "600"].join("")), false);
  assert.doesNotMatch(about, /存放在中华人民共和国境内的服务器上/);
  assert.match(about, /保存在中华人民共和国境内/);
  assert.doesNotMatch(about, /不把它写成已经完成的事实/);
  assert.match(about, /to="\/terms"/);
  assert.match(about, /to="\/privacy"/);
  assert.match(about, /listedModelCount\(\)/);
  assert.doesNotMatch(about, /41 个可选模型/);
  assert.doesNotMatch(about, /备案单位|entity/);
});
test("公开视图 8 家备案号可公示（无占位符）", () => {
  assert.equal(W.PROVIDER_FAMILIES.length, 8);
  for (const f of W.PROVIDER_FAMILIES) {
    assert.ok(f.filings.length, f.id);
    for (const row of f.filings) assert.ok(row.name && row.no && !/[<{]|待核实|TODO|占位/.test(row.name + row.no), f.id);
  }
});
