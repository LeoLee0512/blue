import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <main className="min-h-dvh bg-paper">
      <div className="h-0.5 bg-accent" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed sm:px-6">
        <p className="border border-line bg-accent-soft px-4 py-3 text-ink">本文是草稿，尚未经过法律审查，不能当作已经生效的正式文本。</p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-3xl">用户协议</h1>
          <Link to="/login" className="text-mist underline-offset-4 hover:underline">
            返回登录
          </Link>
        </div>
        <p>运营者：Leo Lee。联系方式：【待填写】。通信地址：【待填写】。</p>
        <p>生效日期：【待填写】。</p>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">服务是什么</h2>
          <p>蓝稿是写作工具。你可以用它写小说、整理大纲、记手记和诗。蓝稿不向你提供模型，也不代你向模型服务商付费。</p>
          <p>蓝稿免费使用，没有套餐，没有积分，也没有充值。</p>
          <p>未满 18 周岁不得注册或使用。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">你自己的模型密钥</h2>
          <p>你在「模型连接」里只能选择蓝稿列出的、已在国家网信办备案名单中的服务商，并填入你自己的密钥。模型调用费用由该服务商按用量向你收取。</p>
          <p>密钥在服务器上加密保存，并与你的账号绑定。页面只显示密钥末尾，不回显全文。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">你的内容</h2>
          <p>你写下的小说、大纲、手记和诗由你保留权利。你选用模型时，相关文字会经蓝稿发给该服务商，以便生成回复。</p>
          <p>生成结果可能不准确。你需要自己判断能不能使用。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">账号与删除</h2>
          <p>注册使用邮箱和密码。你注销账号时，蓝稿会删除该账号在业务表中的记录，并删除登录账号；随账号保存的会话会一并删除。删除后不能恢复。</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-serif text-xl">开源</h2>
          <p>本软件以 MIT 许可证提供。Copyright (c) 2026 Leo Lee。许可证全文见仓库中的 LICENSE。</p>
        </section>
        <p>
          另见 <Link to="/privacy" className="underline-offset-4 hover:underline">《隐私政策》</Link>。
        </p>
      </div>
    </main>
  );
}
