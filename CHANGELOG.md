# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- 收敛 P0/P1/P2 工程结构边界：运行模式、宿主 context、数据库 API、设置 schema、生命周期资源、存储事实源、文档边界与发布链路均进入可验证规则。
- 重做外观字体库的四个内置字体入口，移除 `宋体阅读`、`手写便签` 等书面型/手写型旧选项，新增内置 `寒蝉圆体`；保存旧内置字体 ID 的用户设置会按 schema 归一化回退到 `系统清晰`。
- 发布门禁补齐 `npm run check:ci`，当前普通 contract 检查与 CI contract 基线检查都要求全量通过，历史失败基线清零。
- 文档入口和架构说明链接收敛到真实文件路径，稳定事实保留在 `docs/`，演进计划保留在 `plans/`。

### Added

- P2 文档与发布链路 contract 检查，覆盖文档入口、架构相对链接、manifest dist 入口、dist 提交规则和发布命令顺序。

## [1.4.2] - 2026-05-17

### Added

- 新增小日历表，用更轻量的日程/日期视图承接 ccb 之后的空档互动，不再让小手机只剩翻旧表。
- 纪要表新增“与今天的关系”字段，用明确时间关系约束前天、大前天、半个月前、十年前等记录，降低 AI 统一误判成“昨天”的概率。

### Changed

- 重新设计聊天与直播美化界面，强化消息阅读、直播内容浏览和场景氛围的一致性。
- 优化填表提示词，让表格写入说明更贴近当前字段结构，减少无效填充和时间字段理解偏差。

## [1.4.1] - 2026-05-08

### Added

- 新增外观资源包导入/导出能力，当前版本只打包当前背景与当前自定义图标；图标导入先全局按资源 `name` 精准匹配当前图标位名称，剩余图标再按名称相似度从高到低匹配，仍未匹配的图标按剩余图标位顺序补位，`slotKey` 不再参与导入分配，多余图标直接丢弃，并保留容量检查和失败回滚。
- 新增字体库入口，支持内置字体、用户导入字体、字体预览、删除与小手机作用域 `@font-face` 注入。
- 新增设置页悬浮窗开关，并补齐 QR / Slash toggle 在悬浮按钮隐藏时仍可开关手机的链路。
- 新增当前自定义图标清理入口，可列出并逐个删除 `appIcons` 中不再对应当前图标位的隐藏旧图标；`appearanceResourcePool` 保留为 legacy compatibility 字段，不再参与外观包导入导出。
- 新增消息记录表 AI 调用终止能力，避免生成过程卡死或误触后无法收束。

### Changed

- 表格新增、保存、删除链路统一收口到数据库 API / 行级 CRUD 路径，避免整表覆盖式保存造成并发覆盖和状态污染。
- 消息记录表归档流程改为本地临时状态与批量归档协作，降低回复落表时的闪烁、消失和逐条重排。
- 优化输入与列表局部刷新策略，减少整页重渲染和焦点干扰，改善打字和搜索流畅度。
- 高清壁纸上传与显示链路调整为优先保留清晰度，并移除主页 overlay 模糊滤镜。
- 小剧场和通用表删除反馈改为结构化结果，区分删除成功、刷新失败和视图同步失败。

### Fixed

- 修复隐藏旧图标仍计入自定义图标总占用、且无法通过可见图标列表删除的问题。
- 修复资源包导入、字体操作后外观页回到顶部的问题，改为保留滚动位置。
- 修复顶部更新提示弹窗遮挡视线并误触跳转的问题，默认禁用该弹窗。
- 修复悬浮按钮隐藏时仅靠 CSS 覆盖导致按钮仍占状态或 QR toggle 行为不一致的问题。

## [1.4.0] - 2026-04-25

### Added

- esbuild 单 bundle 打包：`dist/yuzi-phone.bundle.js`、`dist/yuzi-phone.bundle.css`。
- `npm run build` 与 `npm run build:watch` 构建命令。
- bundle 模式下 route module preload 自动跳过逻辑。
- contract 静态检查脚手架：`scripts/run-contract-checks.cjs` 与 43 个 `scripts/check-*.cjs` 检查脚本。
- 打包说明文档 `BUILD.md`。

### Changed

- `manifest.json` 入口切换为 `dist/yuzi-phone.bundle.js` 与 `dist/yuzi-phone.bundle.css`。
- `manifest.json`、`index.js` 文件头 `@version`、`EXTENSION_VERSION` 同步到 `1.4.0`。
- list-page 渲染改为 row-key DOM diff，降低列表刷新时的整段 DOM 重建成本。
- timing 工具支持 runtime scope 资源托管，减少 debounce / throttle 残留风险。
- phone home、settings、table viewer、fusion 等入口按模块职责收敛。

### Fixed

- 修复 list-page DOM diff 在节点移动时可能触发的 `NotFoundError`。
- 修复 bundle 模式下 modulepreload 对已打包模块的无意义预热。

### Removed

- 删除零引用 façade：`modules/phone-beautify-templates.js`、`modules/phone-core.js`。
- 删除根级 façade：`modules/integration.js`、`modules/window.js`、`modules/storage-manager.js`。
- 删除旧入口：`modules/phone-table-viewer.js`、`modules/phone-fusion.js`。
- 删除 `modules/virtual-scroll.js` 死代码。
- 删除 `styles/legacy/` 遗留样式目录。
- 将根目录开发参考资料归档到 `docs/` 与 `.analysis-archive/`。

## [1.3.0] - earlier

- Pre-roadmap baseline. See git history for details.
