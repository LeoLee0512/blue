import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CLIENT_CODE_TEXT,
  GENERIC_CLIENT_ERROR,
  PAGE_ERROR_TEXT,
  UPSTREAM_CALL_TEXT,
  clientErrorFromThrown,
  sanitizeClientError,
  sanitizeClientResult,
  upstreamFailureFromResponse,
} from "./client-error.ts";

const LEAK = "sk-live-SECRET 上游正文 /internal/secret.ts:12 TypeError: Cannot read properties";

describe("client error mapping", () => {
  it("drops upstream bodies and internal exceptions", () => {
    const thrown = clientErrorFromThrown(new Error(`模型返回 500：${LEAK}\n    at Object.<anonymous> (/workspace/src/lib/novel/engine.server.ts:1:1)`));
    assert.equal(thrown.error, GENERIC_CLIENT_ERROR);
    assert.equal(thrown.code, undefined);
    assert.equal(JSON.stringify(thrown).includes("sk-live"), false);
    assert.equal(JSON.stringify(thrown).includes("secret.ts"), false);
    assert.equal(JSON.stringify(thrown).includes("TypeError"), false);

    const han = clientErrorFromThrown(new Error("上游说：内部令牌 sk-abc 堆栈在服务器"));
    assert.equal(han.error, GENERIC_CLIENT_ERROR);
    assert.equal(JSON.stringify(han).includes("sk-abc"), false);
  });

  it("uses the code table even when the message is poisoned", () => {
    const mapped = sanitizeClientError(`密钥无效：${LEAK}`, "KEY_INVALID");
    assert.equal(mapped.error, CLIENT_CODE_TEXT.KEY_INVALID);
    assert.equal(mapped.code, "KEY_INVALID");
    assert.equal(JSON.stringify(mapped).includes("sk-live"), false);
  });

  it("keeps an exact allowlisted sentence and drops unknown database codes", () => {
    assert.equal(sanitizeClientError("请写一个书名").error, "请写一个书名");
    const pg = clientErrorFromThrown(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }));
    assert.equal(pg.error, GENERIC_CLIENT_ERROR);
    assert.equal(pg.code, undefined);
    assert.equal(JSON.stringify(pg).includes("23505"), false);
    assert.equal(JSON.stringify(pg).includes("duplicate"), false);
  });

  it("does not read an upstream body", async () => {
    let read = false;
    const failure = upstreamFailureFromResponse({
      status: 502,
      text: async () => {
        read = true;
        return LEAK;
      },
    });
    assert.equal(read, false);
    assert.equal(failure.error, UPSTREAM_CALL_TEXT.UPSTREAM_ERROR);
    assert.equal(failure.code, "UPSTREAM_ERROR");
    assert.equal(JSON.stringify(failure).includes("sk-live"), false);
    const redirect = upstreamFailureFromResponse({ status: 302, type: "basic", text: async () => LEAK });
    assert.equal(redirect.code, "REDIRECT_BLOCKED");
    assert.equal(redirect.error.includes("302"), false);
  });

  it("sanitizes a returned error object and leaves success untouched", () => {
    const bad = sanitizeClientResult({ ok: false as const, error: LEAK, code: "ECONNRESET", extra: 1 });
    assert.equal(bad.error, GENERIC_CLIENT_ERROR);
    assert.equal(bad.code, undefined);
    assert.equal(JSON.stringify(bad).includes("sk-live"), false);
    const ok = sanitizeClientResult({ ok: true as const, text: LEAK });
    assert.equal(ok.text, LEAK);
  });

  it("postChat does not read the upstream body", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "engine.server.ts"), "utf8");
    const start = src.indexOf("async function postChat");
    const end = src.indexOf("function deepseekHost");
    const fn = src.slice(start, end);
    assert.equal(fn.includes("res.text("), false);
    assert.equal(fn.includes("upstreamFailureFromResponse"), true);
    assert.equal(fn.includes("${text}"), false);
  });

  it("page error text is fixed", () => {
    assert.equal(PAGE_ERROR_TEXT.includes("TypeError"), false);
    assert.match(PAGE_ERROR_TEXT, /重新加载/);
  });
});
