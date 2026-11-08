import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SecretBoxError, compareAndSetStoredKey, isSealed, openSecret, sealSecret } from "./secret-box.server.ts";

const KEY = "test-key-encryption-secret";
const priorKey = process.env.KEY_ENCRYPTION_SECRET;
const priorAuth = process.env.BETTER_AUTH_SECRET;

function sealV1(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `enc:v1:${[iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(":")}`;
}

afterEach(() => {
  if (priorKey === undefined) delete process.env.KEY_ENCRYPTION_SECRET;
  else process.env.KEY_ENCRYPTION_SECRET = priorKey;
  if (priorAuth === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = priorAuth;
});

describe("secret box", () => {
  it("seals with a user AAD and does not open for another user", () => {
    process.env.KEY_ENCRYPTION_SECRET = KEY;
    delete process.env.BETTER_AUTH_SECRET;
    const stored = sealSecret("sk-user-key", "user-a");
    assert.equal(stored.startsWith("enc:v2:"), true);
    assert.equal(stored.includes("sk-user-key"), false);
    assert.equal(openSecret(stored, "user-a"), "sk-user-key");
    assert.throws(() => openSecret(stored, "user-b"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_UNREADABLE");
      assert.equal(error.message, "已保存的密钥无法读取，原记录仍保留。");
      assert.equal(error.message.includes("authenticate"), false);
      assert.equal(error.message.includes("sk-user-key"), false);
      return true;
    });
  });

  it("still reads enc:v1 written without AAD", () => {
    process.env.KEY_ENCRYPTION_SECRET = KEY;
    const legacy = sealV1("sk-legacy", KEY);
    assert.equal(isSealed(legacy), true);
    assert.equal(openSecret(legacy, "anyone"), "sk-legacy");
  });

  it("returns plaintext unchanged and rejects a broken ciphertext without echoing it", () => {
    process.env.KEY_ENCRYPTION_SECRET = KEY;
    assert.equal(openSecret("sk-plain", "user-a"), "sk-plain");
    assert.equal(isSealed("sk-plain"), false);
    const broken = "enc:v2:not-a-real-ciphertext";
    assert.throws(() => openSecret(broken, "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.message.includes(broken), false);
      assert.equal(error.message.includes("bad decrypt"), false);
      return true;
    });
  });

  it("does not fall back to the login secret or a hardcoded dev key", () => {
    delete process.env.KEY_ENCRYPTION_SECRET;
    process.env.BETTER_AUTH_SECRET = "login-signing-secret";
    assert.throws(() => sealSecret("sk-new", "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_BOX_UNAVAILABLE");
      assert.equal(error.message.includes("langao-dev"), false);
      assert.equal(error.message.includes("login-signing-secret"), false);
      return true;
    });
    const devSealed = sealV1("sk-dev", "langao-dev-only-key");
    process.env.KEY_ENCRYPTION_SECRET = KEY;
    assert.throws(() => openSecret(devSealed, "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_UNREADABLE");
      assert.equal(String(error).includes("sk-dev"), false);
      return true;
    });
    const source = fs.readFileSync(path.join(import.meta.dirname, "secret-box.server.ts"), "utf8");
    assert.equal(source.includes("BETTER_AUTH_SECRET"), false);
    assert.equal(source.includes("langao-dev-only-key"), false);
  });

  it("compare-and-swaps plaintext and does not overwrite a newer value", async () => {
    process.env.KEY_ENCRYPTION_SECRET = KEY;
    let stored = "sk-plain";
    const writes: string[] = [];
    const migrated = await compareAndSetStoredKey(async (sealed, original) => {
      writes.push(original);
      if (stored !== original) return false;
      stored = sealed;
      return true;
    }, "user-a", "sk-plain");
    assert.equal(migrated, true);
    assert.equal(stored.startsWith("enc:v2:"), true);
    assert.equal(openSecret(stored, "user-a"), "sk-plain");

    const lost = await compareAndSetStoredKey(async (_sealed, original) => {
      return stored === original;
    }, "user-a", "sk-plain");
    assert.equal(lost, false);
    assert.equal(openSecret(stored, "user-a"), "sk-plain");
    assert.deepEqual(writes, ["sk-plain"]);
  });

  it("does not write when the encryption key is missing", async () => {
    delete process.env.KEY_ENCRYPTION_SECRET;
    let called = false;
    await assert.rejects(
      compareAndSetStoredKey(async () => {
        called = true;
        return true;
      }, "user-a", "sk-plain"),
      (error: unknown) => error instanceof SecretBoxError && error.code === "KEY_BOX_UNAVAILABLE",
    );
    assert.equal(called, false);
  });
});
