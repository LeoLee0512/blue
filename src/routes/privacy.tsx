import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <main className="min-h-dvh bg-paper">
      <div className="h-0.5 bg-accent" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed sm:px-6">
        <p className="border border-line bg-accent-soft px-4 py-3 text-ink">本文是草稿，尚未经过法律审查，不能当作已经生效的正式文本。</p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-3xl">隐私政策</h1>
          <Link to="/login" className="text-mist underline-offset-4 hover:underline">
            返回登录
          </Link>
        </div>
        <p>运营者：Leo Lee。联系方式：【待填写】。通信地址：【待填写】。</p>
        <p>生效日期：【待填写】。</p>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">我们保存什么</h2>
          <p>为了让你登录和继续写作，蓝稿保存邮箱、密码的验证结果、你的作品（书、大纲、章节、人物、手记、诗、文风档案）以及你填入的模型密钥。</p>
          <p>账号、作品和加密后的模型密钥存放在中华人民共和国境内。具体托管服务商与机房：【待填写】。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">模型密钥</h2>
          <p>密钥按用户加密保存，和你的账号绑定。蓝稿不把密钥当作可以公开的资料，页面也不回显全文。</p>
          <p>你选择的服务商只来自蓝稿列出的、已备案的服务商。写作内容会发给你选中的那一家，由该服务商按其自己的规则处理。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">我们不做什么</h2>
          <p>蓝稿不收费，不保存支付信息，也没有积分或充值记录要交给你。</p>
          <p>未满 18 周岁不得使用。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">登录状态</h2>
          <p>登录后，浏览器会保存本站的会话 cookie，用来确认是你本人。退出登录或注销账号后，该会话不再有效。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">删除</h2>
          <p>你注销账号时，蓝稿会删除该账号名下带有用户标识的业务数据，并删除登录账号本身。依赖该账号的登录会话会随之删除。删除是一次性的，不能恢复。</p>
        </section>
        <p>
          另见 <Link to="/terms" className="underline-offset-4 hover:underline">《用户协议》</Link>。
        </p>
      </div>
    </main>
  );
}
