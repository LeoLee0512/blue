import { createFileRoute, Link } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Workspace } from "@/components/workspace";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (user) return <Workspace />;
  return (
    <main className="min-h-dvh bg-paper">
      <div className="h-0.5 bg-accent" />
      <p className="px-6 py-5 font-serif text-2xl">蓝稿</p>
      <p className="px-6 text-sm text-mist">{isPending ? "正在打开书桌…" : "还没有登录。"}</p>
      {isPending ? null : (
        <div className="px-6">
          <Link to="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent">
            进入登录
          </Link>
          <RedirectToSignIn />
        </div>
      )}
    </main>
  );
}
