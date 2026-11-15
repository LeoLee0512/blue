import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Windows 打包不因 Git 标签隐式发布，也不需要 GitHub 发布令牌", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["dist:win", "dist:win:zip"]) {
    assert.match(pkg.scripts[name], /electron-builder --win/);
    assert.match(pkg.scripts[name], /--publish never(?:\s|$)/);
  }
});
