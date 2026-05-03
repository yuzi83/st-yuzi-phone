# docs/

玉子手机扩展的开发参考文档目录。运行时不需要这里的任何文件——这些都是给开发者维护扩展时用的资料。

## 入口

- [`architecture-guide.md`](./architecture-guide.md) — 玉子手机当前稳定架构事实、模块边界、调用链与新增功能检查清单。
- [`review-issue-ledger.md`](./review-issue-ledger.md) — 深挖审查阶段的问题、风险、修复记录、验证方式与回退方式台账。
- [`../BUILD.md`](../BUILD.md) — 构建、检查、发布与 `dist/` 提交规则。
- [`reference/`](./reference) — SillyTavern 宿主、数据库 API、模板语法和数据样本参考资料。

## reference/ 子目录

| 文件 | 性质 | 用途 |
|---|---|---|
| [`reference/API_DOCUMENTATION.md`](./reference/API_DOCUMENTATION.md) | 神·数据库 shujuku 外部 API 文档 | 对照 `window.AutoCardUpdaterAPI` 的表格、世界书、锁、AI 调用和预设 API 契约 |
| [`reference/sillytavern-api.txt`](./reference/sillytavern-api.txt) | SillyTavern 宿主接口速查 | 调用 SillyTavern `getContext` / `getRequestHeaders` / `extension_settings` 等 API 时查阅 |
| [`reference/architecture-notes.md`](./reference/architecture-notes.md) | SillyTavern 项目架构详细说明 | 排查路由、事件总线、消息流相关问题时查阅 |
| [`reference/syntax-reference.md`](./reference/syntax-reference.md) | 模板变量与条件表达式语法参考 | 编写或调试数据库模板变量、条件表达式和 `<if>` 标签时查阅 |
| [`reference/自定义表建表指南.md`](./reference/自定义表建表指南.md) | 自定义表结构参考 | 设计或解释用户自定义表结构时查阅 |
| [`reference/theater-scene-extension-spec.md`](./reference/theater-scene-extension-spec.md) | 小剧场 scene 扩展规范 | 新增 theater scene 时查阅 scene contract、删除规则和样式入口 |
| [`reference/merged-template-sample.json`](./reference/merged-template-sample.json) | 美化模板合并样本 | 阅读 [`modules/phone-beautify-templates/`](../modules/phone-beautify-templates) 时对照参考 |
| [`reference/小剧场2.0.json`](./reference/小剧场2.0.json) | 小剧场参考数据 | 对照 theater 内置场景表结构和示例数据 |

## 与 plans/ 的关系

- [`docs/`](.)：稳定事实参考——**当前代码怎么工作**、**宿主和数据库 API 怎么调用**、**新增功能必须遵守什么边界**。
- [`plans/`](../plans)：演进规划——**接下来怎么改**、**为什么这么改**、**哪些事项尚未落地**。

每次新增或修订稳定事实参考类文档放入 [`docs/`](.)；每次新增重构或优化方案放入 [`plans/`](../plans)。未实施的计划不写入 [`architecture-guide.md`](./architecture-guide.md)，已实施且会影响后续维护的稳定结论必须同步进入 [`architecture-guide.md`](./architecture-guide.md) 或对应 [`reference/`](./reference) 文档。
