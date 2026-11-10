import { createFileRoute, Link } from "@tanstack/react-router";
import { listedModelCount, PROVIDER_FAMILIES } from "@/lib/novel/model-whitelist";

export const Route = createFileRoute("/about")({ component: About });

// 2026-11-08 Sam：公开「关于」页。文案照 plan/mia_关于页文案_v1.md；表数据只读 PROVIDER_FAMILIES，不另写一份。
function About() {
  return (
    <main className="min-h-dvh bg-paper">
      <div className="h-0.5 bg-accent" />
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-3xl">关于蓝稿</h1>
          <Link to="/login" className="text-sm text-mist underline-offset-4 hover:underline">
            返回登录
          </Link>
        </div>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">主导人与制作说明</h2>
          <p>主导人：Leo Lee</p>
          <p>本软件由主导人使用 Grok Bot 合作制作。</p>
          <p className="text-mist">
            蓝稿由个人运营者 Leo Lee 对外提供服务。详细规则见
            <Link to="/terms" className="underline-offset-4 hover:underline">《用户协议》</Link>
            与
            <Link to="/privacy" className="underline-offset-4 hover:underline">《隐私政策》</Link>
            。
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">产品简介</h2>
          <p>蓝稿是一款面向国内用户的 AI 写作辅助工具。蓝稿本身不提供模型，也没有默认模型。你需要在「模型连接」里选择名单中的服务商，并填入你自己的密钥；模型调用费用由该服务商按用量向你收取。</p>
          <p>蓝稿免费使用，不收取软件费，也没有套餐或充值。</p>
          <p className="text-mist">账号和作品保存在中华人民共和国境内。你选好模型服务商后，写作内容会发给该服务商。说明见<Link to="/privacy" className="underline-offset-4 hover:underline">《隐私政策》</Link>。</p>
          <p>未满 18 周岁禁止使用本服务。</p>
          <p className="text-mist">本站内容可能由 AI 辅助生成。写作时你选用的具体服务商与模型，以「模型连接」中的设置为准。</p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">模型服务商备案信息</h2>
          <p className="text-mist">蓝稿自己不提供模型。你在「模型连接」里选择的服务商由其自行提供模型服务。下表列出蓝稿目前支持的服务商，以及它们在国家网信办公布的备案名单中的备案名称和备案号。核对日期见表。</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">服务商</th>
                  <th className="py-2 pr-3 font-medium">备案名称</th>
                  <th className="py-2 pr-3 font-medium">备案号</th>
                  <th className="py-2 font-medium">核对日期</th>
                </tr>
              </thead>
              <tbody>
                {PROVIDER_FAMILIES.flatMap((f) =>
                  f.filings.map((row) => (
                    <tr key={`${f.id}-${row.no}`} className="border-b border-line/60">
                      <td className="py-2 pr-3 align-top">{f.displayName}</td>
                      <td className="py-2 pr-3 align-top">{row.name}</td>
                      <td className="py-2 pr-3 align-top font-mono text-xs sm:text-sm">{row.no}</td>
                      <td className="py-2 align-top">{f.filingsCheckedAt}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p className="text-mist">以上信息来自国家网信办公布的备案名单，由蓝稿人工核对，核对日期见表。仅供参考，不构成对该服务商服务的任何保证。备案名单会更新。如发现信息有误，请使用联系方式：【待填写】。</p>
          <p className="text-faint">名单信息核对日期：2026-11-03。当前开放 {PROVIDER_FAMILIES.length} 家服务商、合计 {listedModelCount()} 个可选模型。聚合平台（阿里云百炼、火山方舟）仅开放平台自有品牌下的指定模型；百度千帆暂缓收录。</p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">联系我们</h2>
          <p>联系方式：【待填写】。</p>
          <p className="text-mist">投诉、举报或对备案信息有疑问，请使用上面的联系方式。</p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">版权与开源</h2>
          <p>Copyright (c) 2026 Leo Lee</p>
          <p className="text-mist">许可证：MIT。版权声明：Copyright (c) 2026 Leo Lee。许可证全文见仓库中的 LICENSE。</p>
        </section>

        <footer className="space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-faint">
          <p>未满 18 周岁禁止使用。</p>
          <p>
            <Link to="/terms" className="underline-offset-4 hover:underline">《用户协议》</Link>
            {" · "}
            <Link to="/privacy" className="underline-offset-4 hover:underline">《隐私政策》</Link>
          </p>
          <p>ICP、公安与生成式人工智能登记编号：【待填写】。</p>
          <p>
            <Link to="/login" className="underline-offset-4 hover:underline">
              返回登录
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
