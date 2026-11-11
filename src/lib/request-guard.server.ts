import { getRequest } from "@tanstack/react-start/server";

/**
 * Reject scripted cross-site calls to the local server.
 *
 * The desktop window is same-origin with 127.0.0.1. A page in another browser
 * can still try to call that port, so scripted cross-site requests are refused.
 * Same-origin calls, non-browser calls, and top-level navigations are allowed.
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Throw `CrossSiteRequestError` for a scripted cross-site request. */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return;
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  const dest = h.get("sec-fetch-dest");
  const isTopLevelGet =
    h.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}
