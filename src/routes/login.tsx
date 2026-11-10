import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { authClient, authEnabled } from "@/lib/auth/client";
import { explainAuthError } from "@/lib/auth/login-error";
import { SIGNUP_CONFIRMATION_ERROR } from "@/lib/auth/signup-confirmation";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button, fieldClass } from "@/components/ui";

export const Route = createFileRoute("/login")({ component: Login });

const PREVIEW_BEARER_KEY = "grok-auth.bearer-token";

function rememberSession(token: string | null | undefined) {
  if (!token) return;
  try {
    window.sessionStorage.setItem(PREVIEW_BEARER_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  // 2026-10-30 Sam：新增「忘记密码」「重置密码」两种模式；邮件里的重置链接带 ?token=
  const resetToken =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("token");
  const [mode, setMode] = useState<"in" | "up" | "forgot" | "reset">(resetToken ? "reset" : "in");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  if (isPending) {
    return (
      <main className="min-h-dvh bg-paper">
        <div className="h-0.5 bg-accent" />
        <p className="px-6 py-5 font-serif text-2xl">蓝稿</p>
        <p className="px-6 text-sm text-mist">正在确认登录…</p>
      </main>
    );
  }
  if (user) return <Navigate to="/" />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPending(true);
    try {
      if (mode === "forgot") {
        const sent = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: "/login",
        });
        if (sent.error) setError(explainAuthError(sent.error.message));
        // 不论邮箱是否注册都给同样的提示，避免暴露哪些邮箱注册过
        else setNotice("如果这个邮箱注册过，重置链接已经发出，请查收。");
        setPending(false);
        return;
      }
      if (mode === "reset") {
        const done = await authClient.resetPassword({
          newPassword: password,
          token: resetToken ?? "",
        });
        if (done.error) setError(explainAuthError(done.error.message));
        else {
          setNotice("密码已重置，请用新密码登录。");
          setMode("in");
          setPassword("");
        }
        setPending(false);
        return;
      }
      if (mode === "up" && !adultConfirmed) {
        setError(SIGNUP_CONFIRMATION_ERROR);
        setPending(false);
        return;
      }
      const result =
        mode === "up"
          ? await authClient.signUp.email({
              email: email.trim(),
              password,
              name: name.trim() || email.trim(),
              ...{ adultConfirmed: true },
            })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(explainAuthError(result.error.message));
        setPending(false);
        return;
      }
      if (mode === "up" || !result.data?.token) {
        // 必须先验证邮箱；已注册与未注册的邮箱返回同样的提示
        setNotice("验证邮件已发到你的邮箱，点链接完成验证后就能登录。");
        setPending(false);
        return;
      }
      rememberSession(result.data?.token);
      window.location.assign("/");
    } catch (err) {
      setError(explainAuthError(err));
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-paper lg:grid lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r border-line px-12 py-10 lg:flex">
        <p className="font-serif text-3xl">蓝稿</p>
        <div className="max-w-md">
          <p className="font-serif text-4xl leading-tight text-ink">
            把那句话放在桌上。其余的，可以慢慢来。
          </p>
          <p className="mt-6 text-sm leading-relaxed text-mist">
            小说、诗，还有课业上舍不得丢的句子。
          </p>
        </div>
        <p className="text-sm text-faint">一张安静的书桌</p>
      </section>
      <section className="flex min-h-dvh flex-col justify-center px-5 py-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <h1 className="font-serif text-4xl">蓝稿</h1>
            <p className="mt-3 font-serif text-sm leading-relaxed text-mist">把那句话放在桌上。</p>
          </div>
          <div>
            <div className="mb-6 flex gap-6">
              <button
                type="button"
                className={`min-h-11 text-sm ${mode === "in" ? "text-ink underline underline-offset-4" : "text-faint"}`}
                onClick={() => setMode("in")}
              >
                登录
              </button>
              <button
                type="button"
                className={`min-h-11 text-sm ${mode === "up" ? "text-ink underline underline-offset-4" : "text-faint"}`}
                onClick={() => setMode("up")}
              >
                注册
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              {mode === "up" ? (
                <input
                  className={fieldClass}
                  placeholder="怎么称呼你"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                />
              ) : null}
              {mode !== "reset" ? (
                <input
                  className={fieldClass}
                  type="email"
                  required
                  placeholder="邮箱"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              ) : null}
              {mode !== "forgot" ? (
                <input
                  className={fieldClass}
                  type="password"
                  required
                  minLength={8}
                  placeholder={mode === "reset" ? "新密码，至少 8 位" : "密码，至少 8 位"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                />
              ) : null}
              {mode === "up" ? (
                <label className="flex items-start gap-2 text-sm leading-relaxed text-mist">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={adultConfirmed}
                    onChange={(event) => setAdultConfirmed(event.target.checked)}
                    required
                  />
                  <span>我已年满 18 周岁，并同意《用户协议》《隐私政策》</span>
                </label>
              ) : null}
              {error ? <p className="text-sm text-ink">{error}</p> : null}
              {notice ? <p className="text-sm text-mist">{notice}</p> : null}
              <Button type="submit" className="w-full" disabled={pending || !authEnabled || (mode === "up" && !adultConfirmed)}>
                {pending
                  ? "请稍等"
                  : mode === "up"
                    ? "创建账户"
                    : mode === "forgot"
                      ? "发送重置链接"
                      : mode === "reset"
                        ? "设置新密码"
                        : "进入书桌"}
              </Button>
            </form>
            {mode === "in" ? (
              <button
                type="button"
                className="mt-2 min-h-11 text-sm text-faint underline-offset-4 hover:underline"
                onClick={() => setMode("forgot")}
              >
                忘记密码
              </button>
            ) : null}
            {/* 2026-11-01：第三方登录按钮已下线（原代码见 login.tsx.bak_20261101_sam_a1）。 */}
            {authEnabled ? null : <p className="mt-4 text-sm text-mist">登录暂未开放。</p>}
            <p className="mt-4 text-sm leading-relaxed text-faint">原来用 X 登录的用户，请注册邮箱账户。</p>
          </div>
          <p className="mt-4 text-center text-sm leading-relaxed text-faint">
            大纲、正文和密钥只属于你的账户。点「注册」就能进书桌。
          </p>
          <p className="mt-3 text-center text-sm">
            <Link to="/about" className="text-mist underline-offset-4 hover:underline">关于蓝稿 · 模型备案信息</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
