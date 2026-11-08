import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SecretBoxError, compareAndSetStoredKey, isSealed, openSecret, sealSecret } from "./secret-box.server.ts";

const KEY = "test-key-encryption-secret";
const priorKey = process.env.KEY_ENCRYPTION_SECRET;
const priorAuth = process.env.BETTER_AUTH_SECRET;
const priorLegacy = process.env.KEY_ENCRYPTION_LEGACY_SECRET;

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
  if (priorLegacy === undefined) delete process.env.KEY_ENCRYPTION_LEGACY_SECRET;
  else process.env.KEY_ENCRYPTION_LEGACY_SECRET = priorLegacy;
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

  it("writes only with the dedicated key and reads old v1 from configured read-only keys", () => {
    delete process.env.KEY_ENCRYPTION_SECRET;
    process.env.BETTER_AUTH_SECRET = "login-signing-secret";
    delete process.env.KEY_ENCRYPTION_LEGACY_SECRET;
    assert.throws(() => sealSecret("sk-new", "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_BOX_UNAVAILABLE");
      assert.equal(error.message.includes("login-signing-secret"), false);
      return true;
    });

    const fromAuth = sealV1("sk-from-auth", "login-signing-secret");
    assert.equal(openSecret(fromAuth, "user-a"), "sk-from-auth");

    process.env.KEY_ENCRYPTION_SECRET = KEY;
    const fresh = sealSecret("sk-new", "user-a");
    assert.equal(fresh.startsWith("enc:v2:"), true);
    delete process.env.KEY_ENCRYPTION_SECRET;
    process.env.BETTER_AUTH_SECRET = KEY;
    assert.throws(() => openSecret(fresh, "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_BOX_UNAVAILABLE");
      return true;
    });

    process.env.KEY_ENCRYPTION_SECRET = KEY;
    const fromOldDev = sealV1("sk-historical", "synthetic-historical-material");
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.KEY_ENCRYPTION_LEGACY_SECRET;
    assert.throws(() => openSecret(fromOldDev, "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_LEGACY_UNAVAILABLE");
      assert.equal(error.message.includes("sk-historical"), false);
      return true;
    });
    process.env.KEY_ENCRYPTION_LEGACY_SECRET = "synthetic-historical-material";
    assert.equal(openSecret(fromOldDev, "user-a"), "sk-historical");

    const source = fs.readFileSync(path.join(import.meta.dirname, "secret-box.server.ts"), "utf8");
    assert.match(source, /BETTER_AUTH_SECRET/);
    assert.match(source, /KEY_ENCRYPTION_LEGACY_SECRET/);
  });

  it("does not call a broken v1 the same error as a missing legacy key", () => {
    process.env.KEY_ENCRYPTION_SECRET = KEY;
    process.env.BETTER_AUTH_SECRET = "login-signing-secret";
    delete process.env.KEY_ENCRYPTION_LEGACY_SECRET;
    assert.throws(() => openSecret("enc:v1:not-a-real-ciphertext", "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_UNREADABLE");
      return true;
    });
    const wrong = sealV1("sk-other", "some-other-old-secret");
    assert.throws(() => openSecret(wrong, "user-a"), (error: unknown) => {
      assert.ok(error instanceof SecretBoxError);
      assert.equal(error.code, "KEY_UNREADABLE");
      return true;
    });
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

    process.env.BETTER_AUTH_SECRET = "login-signing-secret";
    const legacy = sealV1("sk-from-auth", "login-signing-secret");
    let legacyWrites = 0;
    const skipped = await compareAndSetStoredKey(async () => {
      legacyWrites += 1;
      return true;
    }, "user-a", legacy);
    assert.equal(skipped, false);
    assert.equal(legacyWrites, 0);
    assert.equal(openSecret(legacy, "user-a"), "sk-from-auth");
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
