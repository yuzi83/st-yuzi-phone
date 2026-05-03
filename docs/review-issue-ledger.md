# 审查问题台账

> 本文档记录深挖审查阶段发现的问题、修复状态、验证方式与回退提示。它是当前工程结构优化事实的台账，不替代 [`architecture-guide.md`](./architecture-guide.md)。

## 当前工程结构优化状态

- 1.4.0 已完成 P0/P1/P2 工程结构收敛：入口层、Bootstrap 层、Phone Core、Table Viewer、Settings App、Beautify 模板、小剧场 Theater 与发布链路均进入可检查边界。
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
- [`npm run build`](../package.json:7)：生成 [`dist/`](../dist) 发布产物。
