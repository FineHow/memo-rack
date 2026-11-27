# macOS 第一阶段开发记录

日期：2026-11-25。分支：`codex/macos-prototype`。目标为 Apple Silicon 本地原型；不包含正式签名公证、Intel、自动更新、云同步及商店发行。

## 模块 1：独立工程与桥接（已完成）

- 已完成：创建独立开发分支；新增 desktop-macos 工程、共享桥接类型、本机 JSON/图片仓库、单一提醒队列设计。
- 已实际测试：分支创建成功；工程已安装依赖，Next 静态导出、主进程和 preload 构建成功；后续模块记录完整运行验证。
- 待实现：本模块无；窗口和原型验证在以下模块完成。
- 已知问题：原 Windows 说明文件、七套历史角色素材缺失，暂记，不作为本阶段阻塞。
- 文件：`desktop-macos/`、`lib/desktop-bridge.ts`、本文。
- 与 Windows 区别：将允许开始处理/稍后立即终止追逐；隐藏仍调度；同一时间仅一个追逐，积压任务轮转。尚待实际验证。

## 模块 2：原生窗口、数据与模型（已通过自动验证）

- 已完成：独立看板、透明挂架、独立动画覆盖窗、不激活追逐窗、菜单栏入口；静态 app 协议、受限 IPC、原子 JSON/备份、哈希图片；原网页模式及 Windows HTTP 入口继续保留。
- 已实际测试：四个 Electron 窗口实际启动；原看板表单保存到本地 JSON 并同步挂件；图片上传、哈希落盘、读取成功；本地 Worker、WASM、模型可加载，实际执行抠图推理成功。
- 待实现/验收：真实鼠标对底层应用的穿透、其他应用焦点保持、触控板和多屏；打包后的独立应用复测。
- 已知问题：尚未用真正多显示器验证；Electron getBackgroundColor 返回 RGB，不能用该值的 alpha 证明窗口透明，透明效果需要截图及桌面实测。
- 文件：`desktop-macos/src/{main,preload,core}.ts`、`desktop-macos/scripts/`、`app/widget/`、`app/overlay/`、`components/desktop-*.tsx/css`、`lib/desktop-bridge.ts`、`lib/use-desktop-status.ts`、两个 store、`package.json`、`.gitignore`、ESLint 配置。
- 与 Windows 区别：看板在应用内窗口；本机 IPC 取代随机端口 HTTP；Mac 数据目录独立为 `~/Library/Application Support/Clothesline-macOS`，不会读取或覆盖 Windows 数据。

## 模块 3：跨窗口动作与提醒（自动验证通过，真机鼠标验收待完成）

- 已完成：复用原挂架、人物、纸张、绳子、台词和弹飞公式；人物长拉/弹飞由独立透明覆盖窗绘制；纸张也接入该覆盖层；追逐与挂架窗口分离。
- 已实际测试：真实 Electron renderer 的指针处理触发长拉，另一原生窗口绘制，出现 soaring 状态并返回原挂钩；后台追逐窗持续存在；开始处理立刻关闭追逐。原有 22 项规则测试及类型检查通过。
- 待实际测试：纸张跨窗投篓、重拍、真实操作下的局部穿透与跨应用不抢焦点、多个显示器。
- 已知问题：现阶段自动指针测试通过不代表真实鼠标/触控板已经验收；缺失历史角色仍未补齐。
- 文件：`components/clothesline.tsx`（抽取共享 MemoFace）、`components/companion-rack.tsx`（共享 RigDrawing、原生覆盖层）、新增 desktop 组件及宿主。
- 与 Windows 区别：开始处理/稍后立即停当前任务追逐；隐藏挂架仍保留主进程调度；持久追逐在有其他候选时按提醒间隔轮转，同一时间仅一个追逐窗。独立任务的暂缓/完成不会阻塞其他任务。
- 自动证据：`desktop-macos/test-results/1795598471083/result.json`（首轮检查）及对应 `board.png`、`widget.png`。测试使用隔离数据，不污染实际应用记录。


## 模块 4：独立应用包与第一阶段交付（已构建并启动，等待人工验收）

- 已完成：生成 `desktop-macos/release/晾一晾-darwin-arm64/晾一晾.app`，复用原图标生成 macOS icns；应用内封装静态前端、图片、音效、Worker、WASM、模型与许可；提供重复启动、构建、打包及测试命令。
- 已实际测试：**最终打包的 `.app` 本身**完成全部 15 项桌面自动检查（不仅是开发宿主）；实际执行模型推理、图片保存、原表单保存、人物跨窗长拉/弹飞返回、重拍、纸张跨窗投篓完成、隐藏后持续追逐、开始处理停追逐。追逐出现时没有切换原有 Electron 窗口焦点；外部应用焦点仍待人工验证。
- 基础验证：原 22 项单元测试全部通过；类型检查通过；lint 为 0 错误、12 条原有 img 使用建议；git diff --check 通过。`desktop/`、根锁文件及三份核心业务规则未修改。Windows 原生运行未在本机验证。
- 启动验证：通过 macOS 实际打开最终 `.app`，观察到原看板 `app://bundle/`、默认小猫、已保存状态和菜单栏；曾实际关闭看板，再通过挂件「看板」恢复。最终版本已重新启动并留在运行状态，默认没有自动添加测试便签。
- 未实际通过的系统验收：局部穿透到底层应用、真实鼠标/触控板跨窗释放、外部应用连续输入不失焦、多屏/Spaces/Stage Manager。桌面控制工具能够操作按钮，但在仅剩 panel 挂件时坐标拖动返回 `noWindowsAvailable`；此工具限制不能证明应用的真实鼠标行为通过或失败，需按人工清单验收。
- 本地包边界：未做 Developer ID 正式签名、公证或 DMG。为了本地打包保留随 Electron 交付的 framework，使用 `asarIntegrityDigest: false`，正式发行须重审；本阶段不安装到 Applications、不配置开机启动、不引入 AppKit helper。
- 已知问题/待实现：原型工具栏常显；完整外观缩放、顶部悬绳、多屏实测、原生系统行为边缘及性能长期采样待后续；旧角色素材和 Windows 原有说明文件缺失仍记录未修。没有宣称全部 F01–F48 已跨平台验收。
- 行为区别：只针对 macOS 宿主应用已授权的三项调整（开始处理/稍后立即停、隐藏继续调度、单一队列轮转）；Windows 实现不改。挂件图片按原有矩形区域命中，不做逐像素 alpha 命中。宿主在没有追逐时停止高频鼠标采样。
- 最终测试证据：`desktop-macos/test-results/1795599367248/result.json`、同目录 `board.png`、`widget.png`、`app/diagnostics.json`；这些为自动生成、Git 忽略的本机证据。基础检查未编造 Windows 结果。
- 新增说明：`desktop-macos/README.md`、`docs/MACOS_PROTOTYPE_ACCEPTANCE.md`。共享适配额外涉及 `components/workbench.tsx` 的 macOS 提示和 `lib/use-desktop-status.ts`。

### 新增与修改文件总表

| 类别 | 文件 |
| --- | --- |
| 独立工程 | `desktop-macos/package.json`、`desktop-macos/package-lock.json`、`desktop-macos/README.md` |
| 宿主 | `desktop-macos/src/main.ts`、`preload.ts`、`core.ts` |
| 构建与测试 | `desktop-macos/scripts/build.mjs`、`start.mjs`、`package.mjs`、`test.mjs` |
| 静态视图 | `app/widget/page.tsx`、`app/overlay/page.tsx` |
| 桌面组件 | `components/desktop-widget.tsx`、`desktop-overlay.tsx`、`desktop-surfaces.css` |
| 最小共享适配 | `lib/desktop-bridge.ts`、`use-desktop-status.ts`、`laundry-store.ts`、`companion-store.ts`；`components/clothesline.tsx`、`companion-rack.tsx`、`workbench.tsx` |
| 命令与忽略 | `package.json` 追加 mac 命令、`.gitignore` 和 `eslint.config.mjs` 排除生成文件 |
| 记录 | 本文、`docs/MACOS_PROTOTYPE_ACCEPTANCE.md`；前一阶段 `docs/MACOS_MIGRATION_PLAN.md` 保留 |

### 重复启动

项目根目录运行 `npm run mac:start`。修改代码后先 `npm run mac:build`；要重新生成独立应用执行 `npm run mac:package`，然后打开新 `.app`。重建前先从菜单栏退出旧应用，避免打开的仍是旧进程。

第一阶段的可运行工程与测试交付完成；重点系统交互等待用户按人工清单验收。**本次没有进入第二阶段完整业务迁移。**

## 首轮体验修正：缩放、悬停工具栏与居中（2026-11-25）

- 范围：仅处理用户首轮反馈的三项体验问题，没有进入第二阶段。
- 已完成：新增 `⌘+` / `⌘=` 放大、`⌘-` 缩小、`⌘0` 恢复及「视图」菜单；每步 10%，下限 50%，上限 200% 且受当前屏幕可用大小约束；位置与缩放一起保存。缩放同步调整窗口、人物/纸张及独立动画层，看板保持原大小。
- 已完成：工具栏默认透明且不接收点击；移到实际挂件或顶部工具栏区域显示，杆到工具栏之间可连续移入，移出隐藏。指针捕获后在窗口外松手也会收起；缩放快捷键不会让工具栏常驻。复用已有局部穿透指针事件，没有注册全局缩放快捷键。
- 已完成：移除 macOS 专用左对齐覆盖，恢复原看板的居中布局。此前靠左原因是 `.desktop-surface .orbit-world` 的 `justify-content: flex-start`，不是用户照片或搭子设置。
- 额外修正：macOS 可能把独立动画窗的实际顶部约束在菜单栏下方，改用该窗实际内容原点转换坐标，避免拖出窗口时垂直跳位；缩放后的桌面范围也换算为相同坐标单位。
- 已实际测试：开发宿主和最终打包 `.app` 的 19 项 Electron 自动检查均通过，包括原生按键输入、缩放保存及退出重开恢复、工具栏初始隐藏/移入显示/移出隐藏、无待办角色居中，以及 90% 缩放下的跨窗位置对齐、弹飞返回、重拍、投篓、提醒与本地模型加载。最终包还验证了缩放按键不让工具栏常显、在窗口外松手后隐藏；类型检查和 `git diff --check` 通过，lint 无错误（12 条原有 img 建议）。
- 开发测试证据：`desktop-macos/test-results/1795614361655/result.json` 及截图。测试使用隔离数据，不修改用户任务或照片。
- 最终应用包测试证据：`desktop-macos/test-results/1795614546800/result.json`、`widget-idle.png`、`widget-toolbar.png`、`widget.png`、`board.png` 及 `app/diagnostics.json`。打包文件仍为 `desktop-macos/release/晾一晾-darwin-arm64/晾一晾.app`。
- 启动结果：旧应用已退出，更新后的 `.app` 已实际打开，观察到原看板、现有用户搭子与新增「视图」菜单；应用留在运行状态供继续体验。
- 修改文件：`desktop-macos/src/main.ts`、`desktop-macos/scripts/test.mjs`、`components/desktop-widget.tsx`、`components/desktop-surfaces.css`、`desktop-macos/README.md`、本记录及人工验收清单。
- 与 Windows 原版区别：上述快捷键、缩放保存和工具栏显示逻辑仅作用于 macOS 宿主；Windows 工程与共享业务规则没有因本轮反馈变动。
- 待人工验收/已知问题：真实鼠标与触控板、底层应用穿透、外部应用焦点、多屏仍按清单复核；按键需先让本应用获得焦点。顶部悬绳、历史缺失素材等原记录问题仍保留。模块 4 中「工具栏常显/完整外观缩放待实现」的记录由本节更新。

## 追逐手感调整：连续追赶与惯性（2026-11-25）

- 已完成：原先每 32ms 直接把窗口定位在鼠标旁，改为约 60Hz 连续追赶，采用阻尼弹簧、加速度/速度限制与转向惯性；停下后平稳收敛。靠近边缘时有换侧滞后区，换侧也沿连续轨迹移动；同一显示器不再瞬移贴靠。
- 已完成：保留原有镜像翻转；仅在 macOS 追逐角色外层加轻微倾身与移动起伏，运动幅度随实际速度减小，静止后归零。气泡保持平稳，角色不重新设计。窗口不移动时不重复设置位置，姿态不变时不重复向视图发送消息。
- 已完成：没有追逐、开始处理/稍后、安静、系统睡眠/锁屏时清理运动状态与定时器；仍使用不接收焦点、鼠标穿透的原追逐窗。提醒时间、持续追逐、队列轮转与 Windows 业务规则未变。
- 已实际测试（开发宿主）：20 项桌面自动检查通过，新增真实 Electron 窗口的逐帧位置采样，验证鼠标目标跳变后角色逐步追赶、最终到达且焦点不变；原有镜像与新增步态同时存在。原有缩放、工具栏、人物/便签动作与本地模型测试仍通过。
- 已实际测试（运动计算）：3 组独立检查验证加速与收敛、反向先刹车、边缘换侧连续、负坐标和延迟帧下的位置与速度有界；这些模拟检查不代替真实多屏验收。
- 开发证据：`desktop-macos/test-results/1795615673851/result.json`、`pursuit-samples.json`。
- 最终 `.app`：已重新打包并通过 20 项桌面检查及 3 组运动计算检查。证据为 `desktop-macos/test-results/1795615769131/result.json`、`pursuit-samples.json`；类型检查和 `git diff --check` 通过，lint 无错误（12 条原有 img 建议）。
- 启动结果：已退出旧进程并打开更新后的 `.app`，观察到用户原有任务和搭子正常保留；应用留在运行状态，可通过菜单栏 10 秒测试项体验新追逐。
- 新增文件：`desktop-macos/src/pursuit.ts`、`desktop-macos/scripts/test-pursuit.mjs`。修改文件：宿主 `main.ts`、`preload.ts`、构建与测试脚本、`lib/desktop-bridge.ts`、`components/desktop-overlay.tsx`、`desktop-surfaces.css`、README、开发记录及人工验收清单。
- 与原版区别：只调整 macOS 的追逐运动和附加步态；Windows 工程不变。跨显示器时在目标显示器重新建立追逐位置，避免角色缓慢穿过不可见的屏幕间隙；实际多显示器、外部应用焦点与跟随手感待人工复核。
- 待实现/验收：本轮无其他业务模块待接入；继续等待用户主观手感反馈，不进入第二阶段开发。
