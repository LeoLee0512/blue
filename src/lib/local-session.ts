import { createMiddleware } from "@tanstack/react-start";
import { LOCAL_USER_ID } from "@/lib/local-user";

/**
 * Every server function runs as the single local user. There is no session.
 */
export const localUserMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { assertSameSiteRequest } = await import("./request-guard.server");
  assertSameSiteRequest();
  return next({ context: { userId: LOCAL_USER_ID } });
});
