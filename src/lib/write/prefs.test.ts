import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, noFlashScript, parsePrefs, prefsToRoot, resolveDark } from "./prefs.ts";

describe("外观偏好", () => {
  it("坏数据回落到默认", () => {
    assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs("not json"), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs("[1,2]"), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs({ mode: "neon", palette: "x", font: 3 }), DEFAULT_PREFS);
  });
  it("数值按范围和步长收拢", () => {
    const p = parsePrefs(JSON.stringify({ size: 99, leading: 1.83, width: 10, indent: false, palette: "muzi", mode: "dark", font: "kai" }));
    assert.equal(p.size, 26);
    assert.equal(p.leading, 1.8);
    assert.equal(p.width, 26);
    assert.equal(p.indent, false);
    assert.equal(p.palette, "muzi");
    assert.equal(p.font, "kai");
  });
  it("跟随系统时看系统明暗", () => {
    assert.equal(resolveDark("system", true), true);
    assert.equal(resolveDark("system", false), false);
    assert.equal(resolveDark("light", true), false);
    assert.equal(resolveDark("dark", false), true);
  });
  it("变量和内联脚本", () => {
    const root = prefsToRoot({ ...DEFAULT_PREFS, size: 20, indent: false }, false);
    assert.equal(root.vars["--editor-size"], "20px");
    assert.equal(root.vars["--editor-indent"], "0");
    assert.match(root.vars["--editor-font"], /Noto Serif SC/);
    const script = noFlashScript();
    assert.match(script, /langao-prefs-v2/);
    assert.doesNotThrow(() => new Function(script));
  });
});
