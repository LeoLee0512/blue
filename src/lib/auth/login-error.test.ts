import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { explainAuthError } from "./login-error.ts";

describe("explainAuthError", () => {
  it("maps known auth failures and hides upstream or internal text", () => {
    assert.equal(explainAuthError("Invalid email or password"), "邮箱或密码不对。");
    assert.equal(explainAuthError(new Error("Email not verified")), "邮箱还没验证。我们刚又发了一封验证邮件，请查收。");
    const leaked = explainAuthError("SMTP 535 authentication failed sk-live password hash $2b$ at /home/app/mailer.js:40");
    assert.equal(leaked, "没有登录成功");
    assert.equal(leaked.includes("sk-live"), false);
    assert.equal(leaked.includes("mailer.js"), false);
    assert.equal(leaked.includes("$2b$"), false);
  });
});
