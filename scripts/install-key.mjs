/**
 * Per-install key for model API secrets. Generated on first use, stored only
 * in the data directory, never hard-coded and never logged.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { installSecretPath } from "./data-dir.mjs";

const MIN_LENGTH = 32;

export function runningUnderNodeTest() {
  return Boolean(process.env.NODE_TEST_CONTEXT) || process.execArgv.includes("--test");
}

/**
 * @param {{ force?: boolean }} [options]
 * @returns {string}
 */
export function ensureInstallKey(options = {}) {
  const existing = process.env.KEY_ENCRYPTION_SECRET?.trim();
  if (existing) return existing;
  if (!options.force && runningUnderNodeTest()) return "";
  const file = installSecretPath();
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) {
    writeFileSync(file, `${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      // Windows may reject the Unix mode. The file is still only in the user profile.
    }
  }
  const secret = readFileSync(file, "utf8").trim();
  if (secret.length < MIN_LENGTH) {
    throw new Error("[key] 本机安装密钥不可用。请退出蓝稿后检查数据目录里的 install-secret。");
  }
  process.env.KEY_ENCRYPTION_SECRET = secret;
  return secret;
}
