/**
 * 用户模型 API Key 加密存储（AES-256-GCM）。
 * 只使用 KEY_ENCRYPTION_SECRET。不回退登录签名密钥，也不使用固定开发密钥。
 * enc:v1 是旧格式（无 AAD），仍可读取。enc:v2 绑定用户 id。
 * 坏密文抛出固定错误，调用方不得改写原记录。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const V1 = "enc:v1:";
const V2 = "enc:v2:";

export class SecretBoxError extends Error {
  readonly code: "KEY_UNREADABLE" | "KEY_BOX_UNAVAILABLE";
  constructor(code: "KEY_UNREADABLE" | "KEY_BOX_UNAVAILABLE") {
    super(code === "KEY_UNREADABLE" ? "已保存的密钥无法读取，原记录仍保留。" : "服务器还不能加密保存密钥。");
    this.name = "SecretBoxError";
    this.code = code;
  }
}

function encryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET?.trim();
  if (!secret) throw new SecretBoxError("KEY_BOX_UNAVAILABLE");
  return createHash("sha256").update(secret).digest();
}

function userAad(userId: string): Buffer {
  const id = userId.trim();
  if (!id) throw new SecretBoxError("KEY_UNREADABLE");
  return Buffer.from(`langao-user:${id}`, "utf8");
}

export function isSealed(value: string): boolean {
  return value.startsWith(V1) || value.startsWith(V2);
}

export function sealSecret(plain: string, userId: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(userAad(userId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return V2 + [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(":");
}

function parts(stored: string, prefix: string): { iv: Buffer; tag: Buffer; body: Buffer } | null {
  const pieces = stored.slice(prefix.length).split(":");
  if (pieces.length !== 3) return null;
  const [iv, tag, body] = pieces.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || body.length === 0) return null;
  return { iv, tag, body };
}

export function openSecret(stored: string, userId: string): string {
  if (!stored) return "";
  if (!isSealed(stored)) return stored;
  const prefix = stored.startsWith(V2) ? V2 : V1;
  const decoded = parts(stored, prefix);
  if (!decoded) throw new SecretBoxError("KEY_UNREADABLE");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), decoded.iv);
    if (prefix === V2) decipher.setAAD(userAad(userId));
    decipher.setAuthTag(decoded.tag);
    return Buffer.concat([decipher.update(decoded.body), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof SecretBoxError) throw error;
    throw new SecretBoxError("KEY_UNREADABLE");
  }
}

/**
 * Seal a legacy plaintext value and write it only when the stored value is
 * still that exact original. A concurrent save that changed the row loses
 * the race and is left untouched.
 */
export async function compareAndSetStoredKey(
  writeIfUnchanged: (sealed: string, original: string) => Promise<boolean>,
  userId: string,
  original: string,
): Promise<boolean> {
  if (!original || isSealed(original)) return false;
  const sealed = sealSecret(original, userId);
  return writeIfUnchanged(sealed, original);
}
