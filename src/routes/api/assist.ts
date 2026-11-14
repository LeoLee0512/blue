import { createFileRoute } from "@tanstack/react-router";
import { LOCAL_USER_ID } from "@/lib/local-user";

/** 只接受本窗口（同源）发起的请求；其他网页脚本跨站调用一律拒绝。 */
function sameSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

function fail(error: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

export const Route = createFileRoute("/api/assist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameSite(request)) return fail("Forbidden", 403);
        const { sanitizeClientError } = await import("@/lib/novel/client-error");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return fail("参数无效", 400);
        }
        try {
          const { parseAssistRequest, startAssist } = await import("@/lib/novel/assist.server");
          const input = parseAssistRequest(body);
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          const { ensureLocalUser } = await import("@/lib/local-user.server");
          await ensureLocalUser(sql, LOCAL_USER_ID);
          const started = await startAssist(sql, LOCAL_USER_ID, input, request.signal);
          if (!started.ok) return fail(sanitizeClientError(started.error).error, started.status);
          return new Response(started.stream, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
          });
        } catch (error) {
          const { clientErrorFromThrown } = await import("@/lib/novel/client-error");
          return fail(clientErrorFromThrown(error).error, 400);
        }
      },
    },
  },
});
