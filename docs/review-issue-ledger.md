# 审查问题台账

> 本文档记录深挖审查阶段发现的问题、修复状态、验证方式与回退提示。它是当前工程结构优化事实的台账，不替代 [`architecture-guide.md`](./architecture-guide.md)。

## 当前工程结构优化状态

- 1.4.0 已完成 P0/P1/P2 工程结构收敛：入口层、Bootstrap 层、Phone Core、Table Viewer、Settings App、Beautify 模板、小剧场 Theater 与发布链路均进入可检查边界。
- 1.4.2 已完成 P1 架构审计自动化收口：loader singleton guard、Settings flush/panel cleanup、Fusion Object URL、MVU readiness、批量删除 partial failure、详情页外部更新一致性、release/dist 与 table source contract 均有代码或脚本护栏；Phase 7 人工宿主验证尚未在本台账记录为完成。
- 发布前必须执行 [`npm run check:ci`](../package.json:12)，当前目标是 contract 检查基线为 0 个新增失败。
- [`dist/yuzi-phone.bundle.js`](../dist/yuzi-phone.bundle.js) 与 [`dist/yuzi-phone.bundle.css`](../dist/yuzi-phone.bundle.css) 是 manifest 实际加载入口，发布时必须随仓库提交。

## 已归档工程结构修复

- `2026-05-01_1958_P0工程结构边界修复.md`：P0 级边界修复归档，覆盖宿主 context、数据库 API、设置 schema 与核心事实源收敛。
- `2026-05-01_2336_P1工程结构优化收尾.md`：P1 级生命周期、存储边界、设置渲染与结构收尾归档。

## 维护规则

- 本台账只记录已经落地、会影响后续维护判断的事实；未实施计划进入 [`plans/`](../plans)。
- 不重写下方历史问题条目的当时验证结果；如果后续实现发生变化，应追加新记录说明新的验证方式和风险边界。
- 新增 contract 脚本时，必须同步说明它守护的模块边界、失败后影响范围与推荐修复入口。

## 当前验证入口

- [`npm run lint`](../package.json:9)：静态 lint。
- [`npm run check`](../package.json:11)：普通 contract 检查。
- [`npm run check:ci`](../package.json:12)：CI 基线检查，发布前必须通过。
- [`npm run tables:check`](../package.json:15)：校验 [`tables/sources/`](../tables/sources) 与 [`tables/generated/`](../tables/generated) 的 source contract 和新鲜度。
- [`npm run tables:build`](../package.json:16)：从表源 Markdown 重新生成 generated JSON；修改表源后必须提交相应 generated 产物。
- [`npm run build`](../package.json:8)：生成 [`dist/`](../dist) 发布产物。

## 1.4.2 P1 审计收口记录

- **生命周期与加载互斥**：`index.js` 已使用 `window.__YUZI_PHONE_INSTANCE__` singleton guard 与旧实例痕迹检测收口扩展/脚本版互斥，`scripts/check-script-loader-contract.cjs` 负责守护脚本 loader 契约。
- **设置链路**：`modules/settings/persistence.js` 通过 `flushPhoneSettingsSave()` 清理本扩展的 debounce/maxWait/pending ctx 并触发宿主 `saveSettingsDebounced()` 请求；该行为不等价于同步落盘。`modules/settings-panel.js` 通过 `createPhoneSettingsPanel()` / `destroyPhoneSettingsPanel()` 清理面板与 listener。
- **Fusion 资源释放**：`modules/phone-fusion/runtime.js` 通过 `revokeFusionDownloadUrl()`、`setFusionDownloadUrl()` 与 `cleanupFusionPageResources()` 清理 Object URL；空合并路径先 `clearFusionResult()` 再渲染空结果。
- **变量读取 readiness**：`modules/variable-manager/variable-api.js` 的异步楼层变量读取包含 MVU bounded wait，并通过 meta 字段区分 `waitedMvu`、`mvuInitiallyAvailable`、`mvuAvailableAfterWait` 与 `source`。
- **数据契约与 UI 消费**：批量删除结果包含 `attemptedRowIndexes`、`failedRowIndexes`、`unattemptedRowIndexes`、`notDeletedRowIndexes`，UI 应使用未删除集合保留选择并反馈 partial failure；详情页保存与外部表更新通过 pending/suppress 同步链路保持一致。
- **发布与表源边界**：`dist/` 是 manifest 实际加载产物，必须随发布提交；正式表源为 `tables/sources/小剧场2.1` 与 `tables/sources/纪要`，`tables/sources/恋爱特化参考` 是参考源。版本、release 链路与表源边界分别由 `scripts/check-extension-version-contract.cjs`、`scripts/check-release-chain-contract.cjs`、`scripts/check-table-sources-contract.cjs` 守护。
