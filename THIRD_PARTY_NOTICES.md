# 第三方声明

本仓库自带的字体文件来自 Fontsource 打包的 SIL Open Font License 1.1 字体，不从 Google Fonts 的在线样式表加载。

| 字体 | 文件 | 许可证 |
| --- | --- | --- |
| Source Sans 3（latin 400、500、400 italic） | `public/fonts/source-sans-3-*.woff2` | `public/fonts/licenses/OFL-SourceSans3.txt` |
| Noto Serif SC（简体中文 400、600） | `public/fonts/noto-serif-sc-chinese-simplified-*.woff2` | `public/fonts/licenses/OFL-NotoSerifSC.txt` |

npm 依赖列在 `package.json` 与 `package-lock.json`，不随干净发布目录复制 `node_modules`。模型服务商白名单仍是 `src/lib/novel/model-whitelist.ts`，本声明不改那份名单。

干净发布目录由 `scripts/make-publish-dir.mjs` 按 `PUBLISH_ALLOWLIST.txt` 生成，排除 compliance、备份、凭据、依赖和 `public/__grok` 平台安装产物。
