import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dataDir, dataDirFrom, installSecretPath, pgliteDir } from "./data-dir.mjs";
import { ensureInstallKey } from "./install-key.mjs";

test("windows data lives under %APPDATA%/蓝稿", () => {
  assert.equal(
    dataDirFrom({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "win32", "C:\\Users\\me"),
    "C:\\Users\\me\\AppData\\Roaming\\蓝稿",
  );
});

test("explicit LANGAO_DATA_DIR wins", () => {
  const prev = process.env.LANGAO_DATA_DIR;
  process.env.LANGAO_DATA_DIR = "/tmp/langao-data";
  try {
    assert.equal(dataDir(), "/tmp/langao-data");
    assert.equal(pgliteDir(), path.join("/tmp/langao-data", "pglite"));
    assert.equal(installSecretPath(), path.join("/tmp/langao-data", "install-secret"));
  } finally {
    if (prev === undefined) delete process.env.LANGAO_DATA_DIR;
    else process.env.LANGAO_DATA_DIR = prev;
  }
});

test("install secret is generated once per directory and is not a placeholder", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "langao-key-"));
  const prevDir = process.env.LANGAO_DATA_DIR;
  const prevKey = process.env.KEY_ENCRYPTION_SECRET;
  delete process.env.KEY_ENCRYPTION_SECRET;
  process.env.LANGAO_DATA_DIR = dir;
  try {
    const first = ensureInstallKey({ force: true });
    const second = ensureInstallKey({ force: true });
    assert.equal(first, second);
    assert.ok(first.length >= 32);
    assert.equal(first.includes("replace-with"), false);
    const stored = readFileSync(path.join(dir, "install-secret"), "utf8").trim();
    assert.equal(stored, first);
    if (process.platform !== "win32") {
      chmodSync(path.join(dir, "install-secret"), 0o600);
      assert.equal(statSync(path.join(dir, "install-secret")).mode & 0o777, 0o600);
    }
    const source = readFileSync(new URL("./install-key.mjs", import.meta.url), "utf8");
    assert.equal(source.includes(first), false);
  } finally {
    if (prevDir === undefined) delete process.env.LANGAO_DATA_DIR;
    else process.env.LANGAO_DATA_DIR = prevDir;
    if (prevKey === undefined) delete process.env.KEY_ENCRYPTION_SECRET;
    else process.env.KEY_ENCRYPTION_SECRET = prevKey;
    rmSync(dir, { recursive: true, force: true });
  }
});
