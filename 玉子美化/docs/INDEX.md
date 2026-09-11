# 玉子美化文档索引

先判断正在处理的是表格事实源、可编辑源码项目、最终 Bundle，还是宿主中的 `mount(context)`。四者职责不同，不能互相冒充。

## 文档地图

| 分类 | 权威身份 | 文档 |
| --- | --- | --- |
| 独立制作工作台 | 三阶段逐表流程、命令和交付规则 | [项目 README](../README.md) · [Agent 规则](../AGENTS.md) · [制作 prompts](../prompts/INDEX.md) |
| 源码工程 | `project.json`、`workflow-state.json`、源码路径与发布门禁 | [源码工程格式](./bundle/source-project-format.md) |
| 表格 Markdown | 原始副本、逐表事实源、generated JSON 与无损往返 | [表格体系](./tables/README.md) · [Markdown 格式](./tables/markdown-source-format.md) |
| Bundle v2 | 宿主最终导入的美化预设格式 | [Bundle 格式 v2](./bundle/bundle-format-v2.md) |
| Runtime API v1 | 页面 JavaScript 的 `mount(context)` 合同 | [Runtime API v1](./runtime/runtime-api-v1.md) · [作者 `.d.ts`](./runtime/yuzi-beautify-runtime-v1.d.ts) |
| 小手机视觉参照 | 页面尺寸、标题栏、控制热区、图标与视觉变量的统一基准 | [小手机 UI 变量](./phone-ui-variables.md) |
| 五页源码参考 | 广场、论坛、直播、小日历、小日记的无宿主耦合参考 | [五页参考说明](./examples/five-page-sources.md) |
| shujuku 外部资料 | 建表、模板语法和外部数据库 API 原文镜像 | [外部资料索引](./external/shujuku/README.md) |

## 三种项目产物

- `tables/generated/tables.json`：完整 chatSheets 表格 JSON；
- `output/*.json`：`yuzi-beautify-preset` v2 美化 Bundle；
- `projects/<id>/`：含 Markdown、页面源码、`project.json` 和制作状态的可编辑源码。

三者独立交付。Bundle 不创建、修改、迁移或安装数据库表；外部数据库资料中的 API 也不是 Runtime API v1 的能力。

## Runtime 真宿主边界

Runtime v1 只提供当前单表冻结快照、订阅、包内资源解析和四个导航 action。它不提供跨表读取、数据库 CRUD、AI、世界书、手机内部事件、`AutoCardUpdaterAPI`、`TavernHelper` 或 `SillyTavern.getContext()`。

本地 preview 只代表“制作期模拟”。真实 SillyTavern 的 Blob ESM、CSP、路由、数据库、IndexedDB、主题叠加、滚动恢复、资源 Blob URL 和页面生命周期仍需独立人工验证。

## 推荐阅读顺序

1. 新项目先读 [README](../README.md) 和 [源码工程格式](./bundle/source-project-format.md)；
2. 导表或改表时读 [表格体系](./tables/README.md)；
3. 逐表设计前读 [Runtime API v1](./runtime/runtime-api-v1.md) 和 [小手机 UI 变量](./phone-ui-variables.md)，需要结构灵感时再看 [五页参考](./examples/five-page-sources.md)；
4. 发布前读 [Bundle 格式 v2](./bundle/bundle-format-v2.md)；
5. 只有处理 shujuku 建表或外部数据库 API 时，才查 [外部资料](./external/shujuku/README.md)。

酒馆/SillyTavern 资料也采用按需规则：只有用户明确要求酒馆接口、TavernHelper、SillyTavern、酒馆输入框或其他酒馆宿主能力时，才读取 `architecture-notes.md` 与 `sillytavern-api.txt`；普通美化不主动读取，也不主动使用宿主 DOM。用户明确提出后，可以按设计中记录的选择器和行为实现，并保留目标元素不存在时的降级处理。

## 宿主能力制作入口

- [先检查接口，再成组讨论；画框尺寸、提示词与可选补充](./runtime/authoring-workflow.md)
- [主题、字体、受控生图声明与调用](./runtime/host-capabilities.md)
- [配套类型](./runtime/host-capabilities.d.ts)

这些资料随制作包交付，普通用户不需要小手机源码。

- [弹窗制作：先选三个弹窗接口，只有插入正文可多表组合](./runtime/popup-authoring-workflow.md)
