/**
 * 用户模型 API Key 加密存储（AES-256-GCM）。2026-10-30 Sam 新增。
 * 密钥来自环境变量 KEY_ENCRYPTION_SECRET；未配置时退回 BETTER_AUTH_SECRET；
 * 两者都没有时：生产环境报错，开发环境用固定的开发密钥（仅限本地）。
 * 密文格式：enc:v1:<iv>:<tag>:<ciphertext>（base64url）。
 * 旧数据是明文：读取时原样返回，下次读取机密设置时自动改写为密文。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("缺少 KEY_ENCRYPTION_SECRET，无法加密存储 API Key");
    return createHash("sha256").update("langao-dev-only-key").digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function sealSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(":");
}

export function openSecret(stored: string): string {
  if (!stored || !isSealed(stored)) return stored ?? "";
  const [iv, tag, body] = stored.slice(PREFIX.length).split(":").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
