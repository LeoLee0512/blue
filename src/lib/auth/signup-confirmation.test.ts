import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signupBodyNeedsRejection, signupConfirmationAccepted } from "./signup-confirmation.ts";

describe("signup age confirmation", () => {
  it("rejects signup without the confirmation", () => {
    assert.equal(signupConfirmationAccepted(undefined), false);
    assert.equal(signupConfirmationAccepted(false), false);
    assert.equal(signupConfirmationAccepted("true"), false);
    assert.equal(signupBodyNeedsRejection("/sign-up/email", { email: "a@example.com", password: "secretsecret" }), true);
    assert.equal(signupBodyNeedsRejection("/sign-up/email", { adultConfirmed: false }), true);
    assert.equal(signupBodyNeedsRejection("/sign-up/email", null), true);
  });

  it("accepts signup with the confirmation", () => {
    assert.equal(signupConfirmationAccepted(true), true);
    assert.equal(
      signupBodyNeedsRejection("/sign-up/email", {
        email: "a@example.com",
        password: "secretsecret",
        adultConfirmed: true,
      }),
      false,
    );
  });

  it("does not treat other paths as signup", () => {
    assert.equal(signupBodyNeedsRejection("/sign-in/email", {}), false);
    assert.equal(signupBodyNeedsRejection(undefined, {}), false);
  });
});
