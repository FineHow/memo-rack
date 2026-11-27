# 晾一晾 macOS 本地原型

Apple Silicon 专用，Electron 45.5.0 + 原有 Next.js/React/TypeScript。Windows 工程继续在 `desktop/`，本工程没有替换它。当前用于本机体验和第一阶段验收，不是正式发行版。

## 启动

在项目根目录：

```sh
npm run mac:start
```

首次安装或修改源代码后：

```sh
npm ci
npm --prefix desktop-macos ci
npm run mac:build
npm run mac:start
```

Electron 的运行程序会在依赖安装或首次运行时从官方地址下载；已完成安装后，应用及本地抠图可离线使用。开发使用原生 arm64 Node。不要复制 Windows 的 node_modules。

## 生成和打开独立应用

```sh
npm run mac:package
open "desktop-macos/release/晾一晾-darwin-arm64/晾一晾.app"
```

打包命令自动构建，使用本机已经安装的 Electron 运行程序，不再次下载；app 内包含所有静态图片、模型、WASM 和许可。打包后的应用不需要 Node.js 或开发服务器。

该本地原型未做 Developer ID 正式签名、公证或 DMG；没有安装到 Applications 或配置开机启动。打包使用 `asarIntegrityDigest: false` 保留随 Electron 交付的 framework，避免本地重新签署 framework 的失败。正式发行时必须重新评估签名与完整性配置，不沿用这一项作为发行安全方案。

## 使用与数据

- 关闭看板会隐藏窗口，菜单栏仍有「晾一晾」图标。
- 挂件工具栏默认隐藏；鼠标移到杆、人物、便签或顶部工具栏区域时显示，移开后隐藏。移到杆上后往上移动即可使用工具栏和拖动手柄。
- 应用获得焦点后，`⌘+`（也支持不按 Shift 的 `⌘=`）放大便签架，`⌘-` 缩小，`⌘0` 恢复原始大小；每次调整 10%，最低 50%，上限为 200% 或当前屏幕可容纳的大小。也可使用顶部「视图」菜单。缩放会保存，重开仍保留；不会改变看板大小或注册占用其他应用的全局快捷键。
- 菜单栏可显示/隐藏挂件、打开看板/我的搭子、安静、退出及打开数据目录。
- 菜单栏「原型测试：10 秒后到期」会显式创建一张测试便签，用于测试持续追逐；完成或取消后仍可在历史中恢复。
- 只有一张任务时持续追逐；多个候选按已设提醒间隔轮转，始终只有一个追逐窗。
- 超时追逐采用带惯性的连续追赶：移动时有加速、转向缓冲与轻微倾身起伏，停下后逐步追近并缓停；原有镜像翻转保留。
- 开始处理/稍后会立即停止该任务当前追逐；若另有超时任务，可能立即切换到下一任务。
- 默认数据目录：`~/Library/Application Support/Clothesline-macOS`。
- 任务 `tasks-v2.json`、搭子 `companions-v2.json`、图片 `assets/`、位置与缩放 `widget-macos.json`；JSON 修改保留 `.bak`。Chromium 状态在子目录 `chromium/`。
- 退出后复制整个数据目录可以备份。不要在运行时编辑 JSON。本阶段没有跨平台导入向导，不会自动读取 Windows 或独立浏览器的数据。

## 验证

```sh
npm test
npm run typecheck
npm run lint
npm run mac:test
```

`mac:test` 启动真实 Electron，使用 `desktop-macos/test-results/<时间>/` 隔离数据，验证窗口、原界面表单、持久化、图片、Worker/WASM 推理、独立覆盖窗、弹飞/重拍/投篓、追逐及开始处理退出。它会创建测试窗口并结束自己启动的进程。

测试已打包的 `.app`：

```sh
CLOTHESLINE_TEST_APP="$PWD/desktop-macos/release/晾一晾-darwin-arm64/晾一晾.app/Contents/MacOS/晾一晾" npm run mac:test
```

自动指针事件不能证明真实鼠标的系统命中和跨应用焦点结果；请完成 [人工验收清单](../docs/MACOS_PROTOTYPE_ACCEPTANCE.md)。当前未验证多显示器、不同缩放、Spaces/Stage Manager 和长时间资源占用。

## 实现边界

- 原看板、图片编辑器、台词、数据规则及大部分动画复用；仅新增桌面视图与宿主桥接。
- `app://bundle/` 只读取包内文件及已校验的本地图片路径；renderer 不开放 Node，preload 只提供限定 IPC。
- 业务写入在主进程完成，所有窗口共享；后台提醒独立于看板是否显示。
- 动画覆盖窗与追逐窗不接收鼠标输入；挂件按实际按钮、纸张/角色、绳子和杆的区域切换穿透。透明图片内部按原图矩形命中，不是逐像素 alpha 命中。
- 本阶段未引入 AppKit helper；先由现有 Electron 路径提供可运行验证版，人工验收若发现不稳定，再针对具体证据补充。
- 当前 CSP 为兼容 Next 静态引导允许 inline 脚本样式，保留 webSecurity、contextIsolation 和 renderer sandbox。正式发行需要进一步收紧 CSP/hash 与权限。
- Windows 已存在的构建说明缺失及历史角色资源缺失只记录，未修复；Windows 原生回归需要在 Windows 环境进行。

详细变更和已测/未测状态见 [开发记录](../docs/MACOS_DEVELOPMENT_LOG.md)。
