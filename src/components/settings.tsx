import { Cable, Palette } from "lucide-react";
import { useDesk } from "@/components/desk";
import { AppearanceSettings } from "@/components/home";
import { ConnectPane } from "@/components/panes";
import { PageHeader } from "@/components/ui";
import { SETTINGS_GROUPS } from "@/lib/write/settings-nav";
import { cn } from "@/lib/cn";

/** 同一个设置工作区，直接嵌入原有表单，不复制配置和密钥处理逻辑。 */
export function SettingsPane() {
  const desk = useDesk();
  const model = desk.pane === "connect";
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="设置" body="接入自己的模型，或把书桌调成习惯的模样。所有设置都在这里。" />
      <div className="grid items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="设置分组" className="grid grid-cols-2 gap-2 lg:sticky lg:top-6 lg:grid-cols-1">
          {SETTINGS_GROUPS.map((group) => {
            const active = desk.pane === group.pane;
            const Icon = group.pane === "connect" ? Cable : Palette;
            return (
              <button
                key={group.pane}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-controls="settings-content"
                onClick={() => desk.setPane(group.pane)}
                className={cn("rounded-xl border p-3 text-left transition-colors", active ? "border-accent/30 bg-accent-soft text-accent-ink" : "border-line bg-surface text-mist hover:bg-hover hover:text-ink")}
              >
                <span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 shrink-0" />{group.title}</span>
                <span className="mt-1.5 block text-[12px] leading-relaxed text-mist">{group.hint}</span>
              </button>
            );
          })}
          <p className="col-span-2 px-1 pt-1 text-[12px] leading-relaxed text-faint lg:col-span-1">外观自动保存；模型配置请点「保存」。切换分组前请先保存模型配置，未保存的输入不会保留。</p>
        </nav>
        <section id="settings-content" aria-label={model ? "模型与 API 设置" : "外观与排版设置"} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          {model ? <ConnectPane embedded /> : <AppearanceSettings />}
        </section>
      </div>
    </div>
  );
}
