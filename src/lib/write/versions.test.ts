import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asVersionKind, pruneVersions, shouldAutoSnapshot, type VersionMeta } from "./versions.ts";

describe("版本策略", () => {
  const t0 = Date.parse("2026-11-14T00:00:00Z");
  it("首次非空正文存一版", () => {
    assert.equal(shouldAutoSnapshot(null, "开头", t0), true);
    assert.equal(shouldAutoSnapshot(null, "   ", t0), false);
  });
  it("没变不存，超过十分钟存，大改立即存", () => {
    const last = { createdAt: new Date(t0).toISOString(), body: "原文" };
    assert.equal(shouldAutoSnapshot(last, "原文", t0 + 3600_000), false);
    assert.equal(shouldAutoSnapshot(last, "原文加一", t0 + 60_000), false);
    assert.equal(shouldAutoSnapshot(last, "原文加一", t0 + 11 * 60_000), true);
    assert.equal(shouldAutoSnapshot(last, "原文" + "字".repeat(600), t0 + 60_000), true);
  });
  it("未知类型按自动处理", () => {
    assert.equal(asVersionKind("manual"), "manual");
    assert.equal(asVersionKind("weird"), "auto");
  });
  it("先删最旧的自动版本，手动版本保留", () => {
    const list: VersionMeta[] = [];
    for (let i = 0; i < 10; i += 1) list.push({ id: `a${i}`, kind: "auto", createdAt: new Date(t0 + i * 1000).toISOString() });
    list.push({ id: "m0", kind: "manual", createdAt: new Date(t0 - 1000).toISOString() });
    const drop = pruneVersions(list, 3, 100);
    assert.deepEqual(drop.sort(), ["a0", "a1", "a2", "a3", "a4", "a5", "a6"]);
  });
  it("总数超限时最后才删手动版本", () => {
    const list: VersionMeta[] = [
      { id: "m1", kind: "manual", createdAt: new Date(t0).toISOString() },
      { id: "m2", kind: "manual", createdAt: new Date(t0 + 1).toISOString() },
      { id: "a1", kind: "auto", createdAt: new Date(t0 + 2).toISOString() },
    ];
    assert.deepEqual(pruneVersions(list, 10, 2), ["a1"]);
    assert.deepEqual(pruneVersions(list, 10, 1).sort(), ["a1", "m1"]);
  });
});
