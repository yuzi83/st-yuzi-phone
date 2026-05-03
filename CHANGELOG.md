# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- 收敛 P0/P1/P2 工程结构边界：运行模式、宿主 context、数据库 API、设置 schema、生命周期资源、存储事实源、文档边界与发布链路均进入可验证规则。
- 发布门禁补齐 `npm run check:ci`，当前普通 contract 检查与 CI contract 基线检查都要求全量通过，历史失败基线清零。
- 文档入口和架构说明链接收敛到真实文件路径，稳定事实保留在 `docs/`，演进计划保留在 `plans/`。

### Added

- P2 文档与发布链路 contract 检查，覆盖文档入口、架构相对链接、manifest dist 入口、dist 提交规则和发布命令顺序。

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
