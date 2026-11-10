/** Signup must carry an explicit adult-and-terms confirmation. Agreement pages are not linked. */

export const SIGNUP_CONFIRMATION_ERROR = "请确认已年满 18 周岁并同意《用户协议》《隐私政策》";
export const SIGNUP_PATH = "/sign-up/email";

export function signupConfirmationAccepted(value: unknown): boolean {
  return value === true;
}

/** True when this request is an email signup that did not confirm. */
export function signupBodyNeedsRejection(path: string | undefined, body: unknown): boolean {
  if (path !== SIGNUP_PATH) return false;
  if (!body || typeof body !== "object") return true;
  return !signupConfirmationAccepted((body as { adultConfirmed?: unknown }).adultConfirmed);
}
