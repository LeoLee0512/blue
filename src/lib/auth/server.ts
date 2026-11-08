/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * Email and password are the only sign-in method. There is no shared preview
 * OAuth client, no Google/X broker login, and no platform-header auto login.
 *
 * `src/lib/auth/preview.ts` is intentionally absent. It held a shared client
 * secret and is not restored or guessed. Deployments set `BETTER_AUTH_URL`,
 * `BETTER_AUTH_SECRET`, and optionally `DATABASE_URL`. Email accounts live in
 * this app's own database. Google, X, and `x-grok-identity` do not sign anyone in.
 *   - Off (`VITE_AUTH_ENABLED=false`): `requireUserId` resolves a dev user only
 *     when no database is configured, and throws fail-closed once `DATABASE_URL`
 *     is set (see `verify.server.ts`). Production refuses to start in that mode.
 *
 * NEVER import this from client code — it pulls in `pg` and server-only Better
 * Auth internals. The client uses `@/lib/auth/client`;
 * components read the user via `@/lib/auth/use-current-user`; server functions get
 * a verified id via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { sendMail } from "./mailer.server";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Local session signing secret. It is random per process and is not a shared
 * OAuth secret. Production must set BETTER_AUTH_SECRET; this fallback is only
 * for a machine with no database credentials checked in.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __langaoEphemeralAuthSecret__?: string;
};
function ephemeralAuthSecret(): string {
  globalAuthRef.__langaoEphemeralAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__langaoEphemeralAuthSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Explicit off-switch. "false" disables email sign-in and is refused in production.
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

/** True when email/password sign-in is the enforced path. Not tied to any OAuth client. */
export const authConfigured = !authDisabled && emailAndPasswordEnabled;

// Public origin. Deployments set BETTER_AUTH_URL. Without it, only loopback is
// trusted — the omitted preview-host allowlist is not guessed back into the app.
const explicitBaseURL = env("BETTER_AUTH_URL");
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? {
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : [...LOCAL_DEV_ORIGINS];

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (preview) via a Kysely dialect — so Better Auth persists to the
// SAME DB as app data, including email/password users. Both use the Better Auth
// schema from `migrations/auth/0001_auth.sql`, copied into `migrations/` when
// the app turns sign-in on.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name. */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

function sessionSecret(): string {
  const configured = env("BETTER_AUTH_SECRET");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("[auth] 生产环境缺少 BETTER_AUTH_SECRET，拒绝启动。");
  }
  return ephemeralAuthSecret();
}

export const auth = betterAuth({
  baseURL,
  secret: sessionSecret(),
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // See `trustedOrigins` construction above — must cover live preview hosts AND
  // local loopback variants, or clients get "Invalid origin".
  trustedOrigins,

  // No Google, X, or platform-header identity is linked onto an email account.
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: false,
      trustedProviders: [],
      // X's synthetic email is never "verified", so don't gate linking on the
      // local user's email-verified state.
      // 安全修复（2026-10-30 Sam）：本地邮箱未验证时不允许第三方登录按邮箱自动合并，
      // 防止「先用别人邮箱注册、等对方第三方登录后接管账号」。
      requireLocalEmailVerified: true,
    },
  },

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the "loading"
  // window and reduces auth flicker. See the `auth` skill for the full
  // flicker-prevention guidance (gate on `isPending`; SSR the session).
  // 2026-11-03 Sam（s6 H1）：关闭 cookieCache。原来会话在 Cookie 里缓存 5 分钟，注销后旧 Cookie 仍可读到会话；
  // 现在每次都查库，会话行随 "user" 级联删除后立即失效。
  // session: { cookieCache: { enabled: true, maxAge: 300 } },
  session: { cookieCache: { enabled: false } },

  // 2026-10-30 Sam：限流计数存数据库（表见 migrations/0012_rate_limit.sql），
  // 多实例部署时共享，重启不清零。生产环境默认开启，沿用 Better Auth 的默认阈值
  // （登录/注册等敏感接口 10 秒内 3 次）。
  rateLimit: { enabled: process.env.NODE_ENV === "production", storage: "database" },

  // Local email/password — toggled only via `./email-password` (not a plugin).
  // 2026-10-30 Sam：必须验证邮箱才能登录（同时让重复注册返回与新注册相同的结果，
  // 不暴露邮箱是否已注册），并开启找回密码。
  ...(emailAndPasswordEnabled
    ? {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
          revokeSessionsOnPasswordReset: true,
          sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
            await sendMail(user.email, "蓝稿：重置密码", `点击下面的链接重置密码（1 小时内有效）：\n${url}\n\n如果不是你本人操作，请忽略这封邮件。`);
          },
        },
        emailVerification: {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
            await sendMail(user.email, "蓝稿：验证你的邮箱", `点击下面的链接完成邮箱验证：\n${url}\n\n如果不是你本人注册，请忽略这封邮件。`);
          },
        },
      }
    : {}),

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling `*.grok.me` app cannot "toss" a
  // `Domain=.grok.me` session cookie onto this app. `__Host-` requires Secure +
  // Path=/ + no Domain; Better Auth otherwise uses `__Secure-` (which permits
  // Domain), so we drop its auto prefix (`useSecureCookies: false`) and set
  // Secure + the names ourselves. (Browsers allow Secure cookies on
  // `http://localhost`, so local dev still works.)
  advanced: {
    // 2026-10-30 Sam：只信任反向代理覆盖写入的 x-real-ip，不读客户端可伪造的 x-forwarded-for，
    // 防止伪造 IP 绕过限流。部署时反向代理必须设置 x-real-ip（Vercel 与常见 nginx 配置都会）。
    ipAddress: { ipAddressHeaders: [process.env.AUTH_IP_HEADER ?? "x-real-ip"] },
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  plugins: [
    // x-grok-identity is not registered. Bearer only forwards a session token
    // this app already issued; it does not accept a shared preview credential.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

// Re-exported for convenience; the array lives in the dependency-free
// `providers.ts` so the client can import it too.
export { GROK_PROVIDERS } from "./providers";
