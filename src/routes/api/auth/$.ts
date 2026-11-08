import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

// better-auth 1.7 把回调路径从 /api/auth/oauth2/callback/:id 改成 /api/auth/callback/:id。
// 旧路径转发到新路径，兼容已登记旧回调地址的登录代理（2026-10-30 Sam）。
const LEGACY_CALLBACK = "/api/auth/oauth2/callback/";

// 2026-11-01：第三方登录已下线，相关入口服务端一律 404（Sam）。
const DISABLED_PREFIXES = ["/api/auth/callback/", "/api/auth/oauth2/", "/api/auth/sign-in/social", "/api/auth/sign-in/oauth2", "/api/auth/link-social"];

function forward(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (DISABLED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  }
  if (url.pathname.startsWith(LEGACY_CALLBACK)) {
    url.pathname = "/api/auth/callback/" + url.pathname.slice(LEGACY_CALLBACK.length);
    return auth.handler(new Request(url, request));
  }
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => forward(request),
      POST: ({ request }) => forward(request),
    },
  },
});
