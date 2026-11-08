import { createFileRoute, Link } from "@tanstack/react-router";
import { PROVIDER_FAMILIES } from "@/lib/novel/model-whitelist";

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
          {/* AB-04【文案待律师定】：先上屏 */}
          <p className="text-mist">蓝稿由个人运营者Leo Lee对外提供服务。详细规则见《用户协议》与《隐私政策》。</p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">产品简介</h2>
          <p>蓝稿是一款面向国内用户的 AI 写作辅助工具。蓝稿本身不提供模型，也没有默认模型。你需要在「模型连接」里选择名单中的服务商，并填入你自己的密钥；模型调用费用由该服务商按用量向你收取。</p>
          <p>蓝稿免费使用，不收取软件费，也没有套餐或充值。</p>
          {/* AB-13【文案待律师定】 */}
          <p className="text-mist">账号、作品等业务数据存放在中华人民共和国境内的服务器上。你选择模型服务商后，写作内容会经蓝稿服务器发送给该服务商；具体规则见《隐私政策》。</p>
          <p>未满 18 周岁禁止使用本服务。</p>
          {/* AB-15【文案待律师定】 */}
          <p className="text-mist">本站内容可能由 AI 辅助生成。写作时你选用的具体服务商与模型，以「模型连接」中的设置为准。</p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">模型服务商备案信息</h2>
          {/* AB-21【文案待律师定】 */}
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
          {/* AB-22【文案待律师定】 */}
          <p className="text-mist">以上信息来自国家网信办公布的备案名单，由蓝稿人工核对，核对日期见表。仅供参考，不构成对该服务商服务的任何保证。备案名单会不定期更新，蓝稿会在名单更新后复核。如发现信息有误，请通过日后公布的联系方式告知。</p>
          <p className="text-faint">名单信息核对日期：2026-11-03。当前开放 {PROVIDER_FAMILIES.length} 家服务商、合计 41 个可选模型。聚合平台（阿里云百炼、火山方舟）仅开放平台自有品牌下的指定模型；百度千帆暂缓收录。</p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">联系我们</h2>
          <p>联系方式日后公布。</p>
          {/* AB-32【文案待律师定】 */}
          <p className="text-mist">投诉、举报或对备案信息有疑问，请发邮件至上述地址。我们会尽快回复。</p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed">
          <h2 className="font-serif text-xl">版权与开源</h2>
          <p>Copyright (c) 2026 Leo Lee</p>
          <p className="text-mist">许可证：MIT。版权声明：Copyright (c) 2026 Leo Lee。许可证全文见仓库中的 LICENSE。</p>
        </section>

        <footer className="space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-faint">
          <p>未满 18 周岁禁止使用。</p>
          <p>《用户协议》《隐私政策》（正式文本版本与生效日期待填）</p>
          {/* AB-52～54：号码未办妥，不编造，整行不渲染号码 */}
          <p>ICP / 公安 / 生成式人工智能相关登记编号筹备中。</p>
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
