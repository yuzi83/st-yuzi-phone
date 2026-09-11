# 玉子美化独立制作工作台

玉子美化用于制作 `yuzi-beautify-preset` 美化 Bundle。基础页面使用 format v2 / Runtime API v1；已声明的主题、字体、生图或展示能力由工具按 format v3 / apiVersion 2 打包，公开调用见 `docs/runtime/host-capabilities.md`。编号由工具处理，不向用户增加版本调查或审批。整个目录可以单独复制、安装依赖、创建项目、导表、检查、预览、打包和回读；源码、依赖和工具不读取玉子手机或父项目文件。

最终兼容宿主可以加载 Bundle，但制作工具与宿主是两层系统。页面只读取当前已存在的表；弹窗按声明匹配目标表，不创建、修改、迁移或安装数据库表。

## AI 协作方式

AI 是带用户走完整流程的引导者，不替用户决定表结构、视觉方向、跳过、模拟或发布。默认用户没有编程基础：先用大白话说明结果和影响，必要术语在第一次出现时解释。每完成一个用户可见阶段、每到一个确认点，AI 都要主动建议下一步、解释为什么以及不同选择的影响；命令执行、文件检查和表格合成由 AI 完成。

## 标准流程

### 1. 收到表格后自动建项、拆分、全表盘点

在 AI 协作流程中，只要用户给出的文件通过完整 `chatSheets` 校验，就直接自动派生项目 ID/显示名，按 dry-run → 创建草稿 → dry-run → 正式导入的顺序执行。不要先要求用户说明如何拆表；逐表 Markdown 本身就是后续最方便的编辑入口。下面是对应的底层命令：

```powershell
npm run project:new -- --projects-dir projects --id my-preset --name "我的美化预设"
npm run project:import-tables -- --project projects/my-preset/project.json --input input/chatSheets.json
npm run project:status -- --project projects/my-preset/project.json --json
npm run project:check -- --project projects/my-preset/project.json
```

正式导入只接受 `mate.type === "chatSheets"` 的完整模板。项目会同时保存：

- `tables/original/imported.json`：未修改的原始字节副本；
- `tables/source/*.md`：逐表 Markdown 人工事实源；
- `tables/generated/tables.json`：由 Markdown 重建的完整 chatSheets；
- `workflow-state.json`：全部表的制作队列、当前表、字段合同、预览状态和最终确认。

导入后，所有表默认进入队列。不能因为用户只提到某一张表就替其他表做跳过决定。

拆分完成后再让用户选择下一步：直接开始当前表美化、先讨论具体表/美化方向，或先手改 `tables/source/*.md`。用户或 AI 完成 Markdown 修改后，由 AI 运行 build、refresh 和草稿检查，重新合成 `tables/generated/tables.json`；用户无需直接编辑 generated JSON。

### 2. 严格逐表制作

一次只处理 `workflow-state.json#currentTable` 指向的当前表。用户看到的流程只有：讨论确认 → 一次制作完成 → 询问是否打开制作期模拟 → 当前表结果确认。字段合同和页面设计都在讨论中确认；源码实现、登记 item（把页面与当前表绑定）和一次草稿检查由 AI 在制作时连续完成，不逐步打断用户。只有发生错误、需要覆盖或需要用户决定时才单独说明。

需求和设计不是走过场。AI 每轮集中询问一组相关问题，并为每个问题给出推荐答案和影响；能从文件查到的事实由 AI 自己核对。当前表的 `notes/interview-<sheetKey>.md` 只按发生顺序保存用户与 AI 的访谈原话，不做摘要、分类或状态推断，避免任务压缩或恢复后遗忘真实要求。设计总结后，AI 会询问用户是否还有补充，只有用户明确同意开始制作才会编辑页面源码。每页设计还必须读取 [`docs/phone-ui-variables.md`](./docs/phone-ui-variables.md)，用其中的手机尺寸、标题栏和图标规则保持全局一致；该文档只作视觉参照，不允许玉子美化跨项目调用小手机源码。

酒馆接口资料按需读取：只有用户明确提出要使用酒馆、SillyTavern、TavernHelper、酒馆输入框或其他酒馆宿主能力时，才读取 [`docs/architecture-notes.md`](./docs/architecture-notes.md) 和 [`docs/sillytavern-api.txt`](./docs/sillytavern-api.txt)。没有明确需求时不读取，也不主动使用宿主 DOM；用户明确提出后，可以按设计中记录的选择器和行为实现。

每张表还必须完整展示 Runtime v1 的四个导航选择：返回上一层、上一张表、下一张表和编辑当前表。AI 可以推荐，但不能先替用户删掉某个接口；相关问答原样保留在当前表访谈对话中。

页面源码默认集中在一个 `mount.js` 中，HTML、CSS、SVG 和交互都写在这个文件里；确有拆分必要或用户明确要求时再增加其他文件。内部登记时，`--field` 按实际使用字段重复传入：

```powershell
npm run project:add-item -- --project projects/my-preset/project.json --table sheet_square --id square --mount pages/square/mount.js --field 发帖账号名 --field 帖子正文 --preview-status not-run
npm run project:check -- --project projects/my-preset/project.json
```

普通页面只执行这一次登记和一次当前项目草稿检查，不运行全仓 `npm run verify`，也不在登记前重复 dry-run。

每表实现后都要询问用户是否运行模拟面板：

```powershell
npm run preview -- projects/my-preset/project.json --table sheet_square
```

预览可以跳过，但要如实记录。模拟完成或跳过后，可用同一 item 加 `--replace --preview-status passed|failed|skipped --preview-notes <说明>` 更新状态。`not-run` 表示尚未模拟，最终汇总不得隐去。

用户选择预览后，AI 会在页面出现后自动向当前内存 Mock 表新增一行完整测试内容，检查页面实时更新和主要交互，再执行一次清理/卸载、重新挂载以及生命周期日志和浏览器控制台核对。整套动作连续完成，不要求用户代为操作；测试行只存在于预览进程内存，全部无误后才记录为 `passed`。

整张表不制作时，必须由用户明确决定并给出原因：

```powershell
npm run project:skip-table -- --project projects/my-preset/project.json --table sheet_forum --reason "用户明确不制作论坛页"
```

恢复制作使用 `--resume`。不允许批量越过逐表需求、设计、模拟选择和结果确认。

若需修改表结构，AI 必须先说明对字段合同、现有 item、generated JSON 和数据兼容性的影响，并取得用户确认；随后只编辑 `tables/source/*.md`，重建 generated，再刷新制作状态：

```powershell
npm run tables:cli -- build projects/my-preset/tables/source projects/my-preset/tables/generated/tables.json
npm run project:status -- --project projects/my-preset/project.json --refresh
```

字段发生变化的保留表会变为 `invalidated`，必须重新逐表确认。删除某张 Markdown 后，该表会从重新生成的表格 JSON 和制作队列中直接移除；这和“保留表格但不做美化”的 `project:skip-table` 是两件事。原始导入副本不得修改。

日常删表或改字段只跑当前项目的 source check、build、refresh 和草稿检查，不需要运行全仓 `npm run verify`。完整 verify 留给工具代码、流程合同或发布相关改动。

`project:status --refresh --dry-run` 展示并检查“刷新后将得到的状态”，预检通过时返回 `ok: true` 且不写文件；真正存在的格式、路径或源码错误仍会照常报告。

### 3. 汇总确认、发布与交付

全部表进入 `completed` 或 `skipped` 后，先向用户展示完成项、跳过项、`not-run/skipped/failed` 模拟项。用户明确确认当前汇总后，才能依次执行：

```powershell
npm run project:status -- --project projects/my-preset/project.json --confirm
npm run project:check -- --project projects/my-preset/project.json --release
node tools/pack-preset.mjs projects/my-preset/project.json output/my-preset.json
node tools/readback-preset.mjs projects/my-preset/project.json output/my-preset.json
```

`pack` 默认拒绝覆盖已有 Bundle；只有用户明确允许时才使用 `--overwrite`。发布检查、打包和回读不得提前到逐表循环中。

## 三份独立交付

1. 表格 JSON：`projects/<id>/tables/generated/tables.json`；
2. 美化 Bundle：`output/<id>.json`；
3. 可编辑源码：整个 `projects/<id>/` 项目目录。

表格 JSON 与 Bundle 互不替代。Bundle 中不带建表、写表或迁移逻辑；源码项目保留 Markdown、页面源文件和制作记录，方便继续修改。

## 命令索引

| 命令 | 用途 |
| --- | --- |
| `npm run project:new` | 创建可为空的源码草稿；支持 `--dry-run` |
| `npm run project:import-tables` | 正式导入 chatSheets、保存原始副本、拆分 Markdown、建立全表队列 |
| `npm run project:add-item` | 为当前表登记或显式替换唯一 item，并记录字段合同和模拟状态 |
| `npm run project:skip-table` | 记录用户明确跳过；`--resume` 恢复制作 |
| `npm run project:status` | 查看/刷新状态；最终用 `--confirm` 写入当前汇总确认 |
| `npm run project:check` | 默认草稿检查；`--release` 执行发布门禁 |
| `npm run preview` | 启动仅监听 `127.0.0.1` 的制作期模拟面板 |
| `npm run tables:cli -- split/check/build/roundtrip ...` | 拆分、检查、合成和往返表格 Markdown |
| `npm run tables:check` | 只读检查内置表格事实源与 committed generated freshness |
| `npm run tables:test` | 运行表格格式、保真与往返测试 |
| `npm run workflow:check` | 校验三阶段、逐表循环、命令和交付合同 |
| `npm run verify` | 运行项目独立的完整自动化门禁 |

所有写命令默认拒绝覆盖。`--dry-run` 用于建项、导入、删除或迁移、覆盖和发布等风险动作；常规 item 登记和状态记录不重复预演。参数详情以对应 `tools/project-*.mjs` 的交互提示和 [`源码工程格式`](./docs/bundle/source-project-format.md) 为准。

## 实时 Mock 制作台

用 `npm run preview -- projects/<id>/project.json` 启动制作期面板。它先从当前 generated chatSheets 建立一份仅在 preview Node 进程内存中的 Mock 表副本；你可以改表头、单元格、行和列，数值会立即通过 Runtime API v1 推送到 iframe，停止 preview 后这些修改自动丢弃。

- 保存项目源码、`project.json` 或 generated 表后，面板会防抖重构建内存 Bundle，并在成功时重新挂载当前页面；当前表的 Mock 工作副本会保留。
- 某次源码构建失败时，面板继续显示上一份成功 Bundle，只报告本次制作期错误；修复源码后下一次成功构建会恢复。
- 连续源码重构建按 session revision 追赶，不会因为上一轮拉取尚未结束而丢掉后一轮成功 Bundle。
- Mock 保存使用版本号防止并发覆盖：若另一个预览面板先提交，当前面板会保留本地草稿、读取最新版本，并要求你明确再次点击“应用到内存”。
- 真实基线仅改变 rows 时不会被当成字段结构变更；真实 tableName 或 headers 改变时，已编辑 Mock 会明确提示结构分叉，用户可重置当前 Mock 或继续重新编辑。
- Mock 不是 shujuku/SPV 或 SillyTavern 数据库。预览不会写 `tables/original/imported.json`、Markdown、generated JSON、`project.json`、`workflow-state.json`、Bundle 或任何玉子手机数据。

## 文档入口

- [统一文档索引](./docs/INDEX.md)
- [源码工程格式](./docs/bundle/source-project-format.md)
- [表格 Markdown 体系](./docs/tables/README.md)
- [Runtime API v1](./docs/runtime/runtime-api-v1.md)
- [五页源码参考](./docs/examples/five-page-sources.md)

## 验证边界

本地 `preview` 只能称为“制作期模拟”。即使 `npm run verify` 全部通过，也不能声称已经验证真实 SillyTavern 的 Blob ESM、CSP、路由、数据库、IndexedDB、主题叠加、滚动恢复、资源 Blob URL 或页面生命周期；这些继续作为独立人工宿主验收项。

## 宿主能力交接与生图讨论

普通制作不要求小手机源码。涉及字体、主题、生图等能力时，先读取 `docs/runtime/authoring-workflow.md`、`docs/runtime/host-capabilities.md` 和类型/示例，核对接口与模拟覆盖，再讨论效果。缺资料属于工具维护问题，不要求普通用户提供源码、不猜接口。

生图访谈必须先说明画框显示宽高、比例和窄屏变化，区分显示尺寸与出图分辨率；展示“表格字段＋构图要求”的完整拼接提示词，并集中询问用户要不要补充自己的提示词内容。只有确认后的构图与补充才能写入 `promptSuffix`。

制作期模拟永远只使用测试图片和内存数据，不调用真实生图、不读取密钥、不消耗额度，不提供切换真实生图的入口。用户明确要求最后统一模拟时，每表先记 `not-run`，不重复追问、不虚报通过；不省略逐表需求与结果确认。

## 弹窗制作分支（先选接口）

涉及弹窗时先读取 `docs/runtime/popup-authoring-workflow.md`。明确告诉用户“小手机有三个弹窗接口”：**弹幕**、**弹窗／浮窗**、**弹窗／插入正文**，先问做哪一个；不用“这份展示”代替“弹窗”。弹幕和弹窗／浮窗只能单表；只有弹窗／插入正文可以多表组合，选定它以后才问单表还是组合。已明确的选择不重复询问。内容、排版、交互在接口及来源确定之后再讨论。

弹窗访谈只确认接口、来源表、使用字段、内容排版、分页和用户可见交互。当前显示哪一行、是否最新、哪条记录触发以及宿主如何筛选数据，属于小手机运行时提供当前快照/事件的职责，不属于玉子美化决定。除非用户明确要求历史记录列表或行选择器，否则不得提出这些问题。

整页美化仍逐表；弹窗一次制作一个，正文组合弹窗的多个来源表共同组成一个制作单元，不拆散、不批量越过确认。使用 `project:add-display` 登记，不覆盖来源表的已有页面；模拟延后与真实状态记录规则不变。

图片能力必须单独确认：制作弹窗／插入正文时，必须主动问“要不要加生图按钮？”，并说明可以只共用页面图片而不加按钮；不得把某个用户选择不加变成通用默认。弹幕和弹窗／浮窗不支持点击生图，应说明限制，不提供不可用选项。图片标识也必须问：用户选择稳定标识字段，AI 检查真实值的空值、重复与稳定性；即使只有一行也不能省略，不擅自选 row_id、姓名、提示词或行位置。已明确的决定不重复问。标识确认是图片归属，不是弹窗显示记录筛选。

正文弹窗滚动由 AI 默认正确处理，不增加用户调查：弹窗／插入正文是酒馆正文的一部分，默认允许滚动传递给外层；确需内部滚动时，到达边缘或内容不足以滚动时仍应允许外层正文滚动。不得照搬手机整页的滚动隔离，默认不要设置 overscroll-behavior: contain/none 或拦截 wheel/touchmove；优先原生 CSS，不加滚轮转发补丁或兼容开关。只有用户明确要求锁定内部滚动时才讨论例外。本规则是制作提醒，不新增专门的模拟检查步骤或开工确认问题；已有模拟选择与如实记录规则不变。
