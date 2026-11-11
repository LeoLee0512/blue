import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "蓝稿" },
      {
        name: "description",
        content: "蓝稿是免费的中文写作工具。你填写自己的模型密钥，用来写小说和整理大纲。",
      },
      { name: "theme-color", content: "#f4f7fb" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="zh-CN" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-paper font-sans text-ink">
        <PreviewHostBridge />
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
