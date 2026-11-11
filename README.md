# 蓝稿

蓝稿是开源项目，采用 MIT 许可证。主导人是 Leo Lee。本软件由 Leo Lee 与 Grok Bot 合作制作。

Copyright (c) 2026 Leo Lee

蓝稿是单机中文写作软件。打开窗口就是书桌，不需要注册或登录。作品、设置和模型密钥都保存在你自己的电脑上。蓝稿本身不提供模型，你填写自己的密钥，调用费用由对应的模型服务商收取。

## 别人可以怎么用

### 安装 Windows 版

安装包会放在 GitHub Releases：

<https://github.com/LeoLee0512/blue/releases>

目前还没有发布安装包。在维护者发布之前，请按下一节从源码构建。发布之后，下载 `langao-<版本>-setup.exe`（安装版）或 `langao-<版本>-portable.exe`（便携版），双击运行。安装版可以改安装目录；便携版解出后直接运行 `langao.exe`。窗口标题是「蓝稿」。不需要另外安装 Node.js，也不需要打开浏览器。

### 从源码构建

需要 Node.js 22.12 或更高版本，包括 Node.js 24。仓库里的 `engines` 已去掉「必须低于 23」的限制。

在中国大陆构建时，建议先让 Electron 走镜像，否则下载 Electron 二进制经常很慢或失败：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

Windows 上可以用：

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

然后：

```bash
git clone https://github.com/LeoLee0512/blue.git
cd blue
npm ci
npm run dist:win
```

`npm run dist:win` 在 Windows 上生成安装包和便携版 exe，放在 `release/`：

- `langao-<版本>-setup.exe`：安装程序
- `langao-<版本>-portable.exe`：便携程序

在 Linux 上可以用 `npm run dist:win:zip` 打出可在 Windows 解压后运行的压缩包（里面是 `langao.exe`）。安装程序需要 Windows，或在 Linux 上安装能运行 32 位程序的 Wine。GitHub Actions 的 Windows 工作流会打出 exe，但不会自动发布 Release。

只想在本机打开开发中的窗口，而不打包：

```bash
npm run desktop
```

这会先做生产构建，再用 Electron 打开，不会启动 Vite 开发服务器。改界面时可以用 `npm run dev`，浏览器访问 `http://127.0.0.1:8080`。开发数据写在项目里的 `.data/`，和安装版的数据目录不是同一个。

### 第一次使用

1. 打开蓝稿，直接进入书桌。
2. 打开左侧「模型连接」。
3. 选择一家服务商，在下拉里选模型，填入你自己的 API 密钥，保存。火山方舟只列出固定的模型 ID，不能手写别的地址。
4. 密钥会加密后写到本机。蓝稿不提供默认模型，也不代收模型费用。

目前可选的服务商（只使用已备案服务商的官方接口）：

- DeepSeek（深度求索）
- 阿里云百炼（千问）
- 火山方舟（豆包）
- 智谱
- Kimi（月之暗面）
- MiniMax
- 讯飞星火（填写控制台里的 APIPassword）
- 阶跃星辰

「关于」页有备案名称、备案号和当前可选模型数量。聚合平台只开放平台自有品牌下的指定模型。

### 数据在哪里，怎么备份

安装版由 Electron 把数据放在系统的应用数据目录下，文件夹名是「蓝稿」：

| 系统 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\蓝稿` |
| macOS | `~/Library/Application Support/蓝稿` |
| Linux | `~/.config/蓝稿` |

`npm run dev` 不写上面的目录，数据在项目里的 `.data/`。直接用 Node 启动生产服务、又没有设置 `LANGAO_DATA_DIR` 时，Linux 用 `$XDG_DATA_HOME/蓝稿`（默认 `~/.local/share/蓝稿`）。

里面主要有：

- `pglite/`：作品、大纲、正文、设置（嵌入式 Postgres）
- `install-secret`：这一次安装生成的加密密钥，用来解开模型 API 密钥

同一目录里还有窗口自己的缓存。备份时退出蓝稿，复制整个文件夹。恢复时放回原处。`pglite` 和 `install-secret` 必须一起在。只有数据库、没有 `install-secret` 时，作品还在，但已经保存的模型密钥解不开。不要把 `install-secret` 提交到仓库或发给别人。

`npm run dev` 的数据在项目目录 `.data/`，规则相同。

### MIT 许可证允许什么

许可证全文在仓库根目录的 `LICENSE`。简单说，在保留版权声明「Copyright (c) 2026 Leo Lee」和 MIT 许可声明的前提下，你可以：

- 使用这套软件
- 修改它
- 再分发原版或修改版，包括用于商业用途

软件按「原样」提供，没有担保。这是便于阅读的说明，不是律师意见；以 `LICENSE` 为准。

## 参与贡献

欢迎提 issue 和 pull request：

- <https://github.com/LeoLee0512/blue/issues>
- <https://github.com/LeoLee0512/blue/pulls>

请不要在 issue、提交或截图里放真实的模型密钥、`install-secret`、地址、电话或私人邮箱。

## 给维护者：怎么打一个发行包

工作流 `.github/workflows/windows-installer.yml` 会在手动触发，或推送 `v*` 标签时，在 Windows 上执行 `npm run dist:win`，并把 exe 上传为 Actions artifact。它不会创建 GitHub Release。

发布步骤：

1. 确认 `package.json` 里的 `version`。
2. 在装有 Node.js 22.12+（含 24）的 Windows 上执行上面的镜像变量和 `npm run dist:win`，或到 Actions 里手动运行 “Windows installer”。
3. 从 `release/` 或 Actions artifact 取出 setup 与 portable 两个 exe。
4. 在 GitHub 上新建一个 Release，把这两个文件附上去。不要把 `install-secret` 或任何人的数据目录打进安装包。

## 开发命令

```bash
npm test
npm run typecheck
npm run lint
npm run db:migrate   # 把 migrations/*.sql 应用到 LANGAO_DATA_DIR，默认是 .data
```

数据库迁移在应用启动时也会自动执行。

## English

Langao is an open-source, MIT-licensed desktop writing app. Leo Lee is the lead; it was made together with Grok Bot. Copyright (c) 2026 Leo Lee.

It is single-user and offline: no account, no sign-in. Works, settings, and model API keys stay on the local disk (`%APPDATA%\蓝稿` on Windows). Keys are encrypted with a per-install secret. Build a Windows installer with `npm run dist:win` (set `ELECTRON_MIRROR` and `ELECTRON_BUILDER_BINARIES_MIRROR` to the npmmirror URLs above when downloading Electron from mainland China). Node.js 22.12 or newer, including Node.js 24, is supported. GitHub Releases will host the `.exe` files later; this repository does not publish them by itself. The MIT license lets you use, modify, and redistribute the software if you keep the copyright and permission notices. Issues and pull requests are welcome.
