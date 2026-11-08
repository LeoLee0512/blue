/**
 * 用户模型 API Key 加密存储（AES-256-GCM）。
 *
 * 新写入只用 KEY_ENCRYPTION_SECRET，格式 enc:v2，AAD 为用户 id。
 * enc:v1 是旧格式（无 AAD），按下面顺序只读尝试，成功即返回，不改写：
 *   1. KEY_ENCRYPTION_SECRET（专用密钥；旧 v1 若就是用它封的）
 *   2. BETTER_AUTH_SECRET（登录签名密钥，只读旧密文，绝不用于新写入）
 *   3. KEY_ENCRYPTION_LEGACY_SECRET（运维显式配置的历史只读密钥）
 * 不内置、不传播任何硬编码开发密钥。历史开发密钥若仍要读，由运维把该值放进
 * KEY_ENCRYPTION_LEGACY_SECRET，不要写进仓库。
 *
 * 结构损坏的密文是 KEY_UNREADABLE。
 * v1 结构完好、专用密钥解不开、且没有配置任何只读旧密钥，是 KEY_LEGACY_UNAVAILABLE。
 * 已配置的只读旧密钥也解不开，才是 KEY_UNREADABLE。两者不要混用。
 * 坏密文和缺密钥都不改写原记录。不在这里迁移或轮换生产数据。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const V1 = "enc:v1:";
const V2 = "enc:v2:";

const TEXT = {
  KEY_UNREADABLE: "已保存的密钥无法读取，原记录仍保留。",
  KEY_BOX_UNAVAILABLE: "服务器还不能加密保存密钥。",
  KEY_LEGACY_UNAVAILABLE: "旧格式密钥还不能读取：未配置只读旧密钥。原记录仍保留。",
} as const;

export class SecretBoxError extends Error {
  readonly code: keyof typeof TEXT;
  constructor(code: keyof typeof TEXT) {
    super(TEXT[code]);
    this.name = "SecretBoxError";
    this.code = code;
  }
}

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function digest(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function dedicatedKey(): Buffer {
  const secret = trimEnv("KEY_ENCRYPTION_SECRET");
  if (!secret) throw new SecretBoxError("KEY_BOX_UNAVAILABLE");
  return digest(secret);
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
  const cipher = createCipheriv("aes-256-gcm", dedicatedKey(), iv);
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

function decrypt(decoded: { iv: Buffer; tag: Buffer; body: Buffer }, key: Buffer, aad?: Buffer): string | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, decoded.iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(decoded.tag);
    return Buffer.concat([decipher.update(decoded.body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Read-only key material for enc:v1. The first entry is not a legacy source. */
function v1ReadSecrets(): { secret: string; legacy: boolean }[] {
  const dedicated = trimEnv("KEY_ENCRYPTION_SECRET");
  const auth = trimEnv("BETTER_AUTH_SECRET");
  const legacy = trimEnv("KEY_ENCRYPTION_LEGACY_SECRET");
  const list: { secret: string; legacy: boolean }[] = [];
  const seen = new Set<string>();
  const push = (secret: string | undefined, isLegacy: boolean) => {
    if (!secret || seen.has(secret)) return;
    seen.add(secret);
    list.push({ secret, legacy: isLegacy });
  };
  push(dedicated, false);
  push(auth, true);
  push(legacy, true);
  return list;
}

export function openSecret(stored: string, userId: string): string {
  if (!stored) return "";
  if (!isSealed(stored)) return stored;
  const prefix = stored.startsWith(V2) ? V2 : V1;
  const decoded = parts(stored, prefix);
  if (!decoded) throw new SecretBoxError("KEY_UNREADABLE");
  if (prefix === V2) {
    const plain = decrypt(decoded, dedicatedKey(), userAad(userId));
    if (plain === null) throw new SecretBoxError("KEY_UNREADABLE");
    return plain;
  }
  const candidates = v1ReadSecrets();
  if (candidates.length === 0) throw new SecretBoxError("KEY_LEGACY_UNAVAILABLE");
  let triedLegacy = false;
  for (const candidate of candidates) {
    if (candidate.legacy) triedLegacy = true;
    const plain = decrypt(decoded, digest(candidate.secret));
    if (plain !== null) return plain;
  }
  if (!triedLegacy) throw new SecretBoxError("KEY_LEGACY_UNAVAILABLE");
  throw new SecretBoxError("KEY_UNREADABLE");
}

/**
 * Seal a legacy plaintext value and write it only when the stored value is
 * still that exact original. A concurrent save that changed the row loses
 * the race and is left untouched. The new value is always enc:v2.
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
