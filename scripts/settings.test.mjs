import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
// Execute the actual component's event handlers without a browser, network, or real credentials.
function load(name, imports = {}) {
  const code = ts.transpileModule(source(name), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (id) => Object.hasOwn(imports, id) ? imports[id] : id === "react/jsx-runtime" ? require(id) : {},
    fetch: () => { throw new Error("Network forbidden in settings tests"); },
  }, { filename: name });
  return exports;
}
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
const whitelist = load("src/lib/novel/model-whitelist.ts");
const nav = load("src/lib/write/settings-nav.ts");
const cn = (...parts) => parts.filter(Boolean).join(" ");

test("设置兼容旧入口，主导航只保留一个带文字的设置入口", () => {
  assert.equal(nav.isSettingsPane("connect"), true);
  assert.equal(nav.isSettingsPane("settings"), true);
  assert.equal(nav.isSettingsPane("library"), false);
  assert.deepEqual(Array.from(nav.SETTINGS_GROUPS, (g) => g.pane), ["connect", "settings"]);
  const shell = source("src/components/shell.tsx");
  const rail = shell.slice(shell.indexOf("const RAIL"), shell.indexOf("const SIDE_TABS"));
  assert.doesNotMatch(rail, /id: "(?:connect|settings)"/);
  assert.match(shell, /aria-label="设置"/);
  assert.match(shell, /isSettingsPane\(pane\).*<SettingsPane/);
  assert.doesNotMatch(shell, /切换到浅色|切换到深色/);
});

test("设置分组直接嵌入现有表单，并导航到对应 pane", () => {
  for (const pane of ["connect", "settings"]) {
    const calls = [];
    const { SettingsPane } = load("src/components/settings.tsx", {
      "@/components/desk": { useDesk: () => ({ pane, setPane: (value) => calls.push(value) }) },
      "@/components/home": { AppearanceSettings: "appearance-form" },
      "@/components/panes": { ConnectPane: "connection-form" },
      "@/components/ui": { PageHeader: "header" },
      "@/lib/write/settings-nav": nav,
      "@/lib/cn": { cn },
    });
    const nodes = elements(SettingsPane());
    const form = nodes.find((n) => n.type === (pane === "connect" ? "connection-form" : "appearance-form"));
    assert.ok(form);
    if (pane === "connect") assert.equal(form.props.embedded, true);
    const buttons = nodes.filter((n) => n.type === "button");
    assert.equal(buttons.length, 2);
    assert.equal(buttons.filter((n) => n.props["aria-current"] === "page").length, 1);
    buttons.forEach((n) => n.props.onClick());
    assert.deepEqual(calls, ["connect", "settings"]);
  }
});

function connectionHarness(saved = {}) {
  let cursor = 0;
  const states = [];
  const calls = [];
  const desk = {
    busy: false,
    account: { settings: saved },
    saveLink: async (input) => { calls.push(["save", input]); return { ok: true }; },
    testLink: async () => { calls.push(["test"]); return { ok: true }; },
  };
  const { ConnectPane } = load("src/components/panes.tsx", {
    react: {
      useState: (initial) => {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], (value) => { states[i] = value; }];
      },
      useEffect: () => {},
    },
    "@/components/desk": { useDesk: () => desk },
    "@/components/ui": { Button: "button", Field: "field" },
    "@/lib/novel/model-whitelist": whitelist,
    "@/lib/cn": { cn },
  });
  const render = () => { cursor = 0; return ConnectPane({ embedded: true }); };
  const select = (index, value) => elements(render()).filter((n) => n.type === "select")[index].props.onChange({ target: { value } });
  const key = (value) => elements(render()).find((n) => n.type === "input" && n.props.type === "password").props.onChange({ target: { value } });
  const button = (label) => elements(render()).find((n) => n.type === "button" && n.props.children === label);
  const submit = () => render().props.onSubmit({ preventDefault() {} });
  return { calls, select, key, button, submit, render };
}

test("API 表单先校验服务商、模型和密钥；保存不会测试模型", async () => {
  const h = connectionHarness();
  assert.equal(h.button("保存").props.disabled, true);
  h.select(0, "deepseek");
  assert.equal(h.button("保存").props.disabled, true);
  h.select(1, whitelist.modelOptions("deepseek")[0].value);
  assert.equal(h.button("保存").props.disabled, true);
  h.key("test-only-not-a-real-key");
  assert.equal(h.button("保存").props.disabled, false);
  h.submit();
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], "save");
  assert.equal(h.calls[0][1].keyAction, "set");
  assert.equal(h.calls[0][1].apiKey, "test-only-not-a-real-key");
  assert.equal(h.calls[0][1].providerId, "deepseek");
});

test("API 表单沿用同服务商密钥，更换服务商必须重填；显式测试仍先保存", async () => {
  const option = whitelist.modelOptions("deepseek")[0];
  const h = connectionHarness({
    hasKey: true, keyMask: "••••test", connection: { state: "ok", familyId: "deepseek", entryId: option.entryId, modelId: option.model },
  });
  assert.equal(h.button("保存").props.disabled, false);
  const input = elements(h.render()).find((n) => n.type === "input");
  assert.equal(input.props.value, "");
  h.submit();
  await Promise.resolve();
  assert.equal(h.calls[0][1].keyAction, "keep");
  assert.equal(h.calls[0][1].apiKey, "");
  h.select(0, "xfyun");
  h.select(1, whitelist.modelOptions("xfyun")[0].value);
  assert.equal(h.button("保存").props.disabled, true);
  h.key("test-only-new-key");
  h.button("保存并测试").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls.map((c) => c[0]), ["save", "save", "test"]);
  assert.equal(h.calls[1][1].keyAction, "set");
});

test("实际偏好写入本地存储，重新加载与首屏脚本恢复字号、行距和主题", () => {
  const values = new Map();
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const prefs = load("src/lib/write/prefs.ts");
  const root = () => ({ dataset: {}, classList: { toggle: (name, value) => { applied[name] = value; } }, style: { setProperty: (key, value) => { applied[key] = value; } } });
  const applied = {};
  const document = { documentElement: root() };
  const window = { localStorage: storage, matchMedia: () => ({ matches: false }) };
  // Supply only the native-like storage and root APIs that this hook uses.
  function reload() {
    const code = ts.transpileModule(source("src/components/use-prefs.ts"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, window, document, require: (id) => id === "react" ? {
      useEffect: () => {}, useSyncExternalStore: (_subscribe, read) => read(),
    } : prefs });
    return exports;
  }
  const first = reload();
  first.setPrefs({ mode: "dark", palette: "zhuqing", font: "kai", size: 23, leading: 2.2, width: 40, indent: false, typewriter: true });
  const stored = JSON.parse(storage.getItem(prefs.PREFS_KEY));
  assert.equal(stored.size, 23);
  assert.equal(stored.leading, 2.2);
  const restored = reload().usePrefs();
  assert.equal(restored.size, 23);
  assert.equal(restored.font, "kai");
  assert.equal(restored.typewriter, true);
  assert.equal(restored.indent, false);
  vm.runInNewContext(prefs.noFlashScript(), { localStorage: storage, window, document });
  const expected = prefs.prefsToRoot(stored, false);
  assert.equal(applied.dark, true);
  assert.equal(document.documentElement.dataset.palette, "zhuqing");
  for (const [key, value] of Object.entries(expected.vars)) assert.equal(applied[key], value);
});
