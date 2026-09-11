# 玉子美化源码工程格式

> 本文保留基础页面合同；主题、字体、受控生图与新版声明请同时读取 [宿主能力合同](../runtime/host-capabilities.md)。不要依据旧版“无 AI”条目否定已公开的生图动作，也不要把打包版本当成页面 context.apiVersion。

`project.json` 是制作工具的输入，不是宿主可直接导入的 Bundle。制作工具读取真实表文件和项目内源码，将本地模块依赖打包、CSS import 内联后生成 [`Bundle v2`](./bundle-format-v2.md)。

## 1. 完整结构

```json
{
  "tablesFile": "tables/generated/tables.json",
  "manifest": {
    "id": "example-square",
    "name": "广场美化",
    "version": "1.0.0",
    "author": "Example",
    "items": [
      {
        "id": "square",
        "name": "广场表",
        "target": {
          "tableName": "广场表",
          "fields": ["帖子ID", "帖子标题"]
        },
        "entry": {
          "html": "page.html",
          "css": "styles/page.css",
          "mount": "page.js"
        },
        "assets": ["assets/avatar.png"]
      }
    ]
  },
  "files": {
    "page.html": "src/page.html",
    "styles/page.css": "src/styles/page.css",
    "page.js": "src/page.js",
    "styles/card.css": "src/styles/card.css",
    "assets/avatar.png": "src/assets/avatar.png"
  },
  "mimeTypes": {
    "page.html": "text/html",
    "styles/page.css": "text/css",
    "styles/card.css": "text/css",
    "page.js": "text/javascript",
    "assets/avatar.png": "image/png"
  },
  "encodings": {
    "assets/avatar.png": "base64"
  }
}
```

支持的顶层字段是 `tablesFile`、`manifest`、`files`、`mimeTypes`、`encodings`。

## 2. 表格三件套与 `tablesFile`

正式导入只接受顶层含 `mate.type === "chatSheets"` 且至少有一张 `sheet_*` 表的完整 shujuku 模板。导入后，项目同时保存：

```text
tables/
├─ original/imported.json   # 未修改的原始导入字节
├─ source/                  # 逐表 Markdown 人工事实源
└─ generated/tables.json    # 从 Markdown 重建的完整 chatSheets
```

`project.json.tablesFile` 必须指向项目内的 `tables/generated/*.json`，标准脚手架固定使用 `tables/generated/tables.json`。它仅用于：

- 检查目标表是否存在；
- 检查 `target.fields` 是否真实存在；
- 防止示例绿灯掩盖用户项目与真实表不匹配。

它不会自动进入最终 Bundle，除非作者也把它显式列入 `files`。

`project:import-tables` 会逐字节复制原始 JSON、无损拆分 Markdown，并立即由 Markdown 重建 generated JSON；三者第一次导入时必须深度等价。未知顶层字段、未知 sheet 字段和未知 `sourceData` 字段会进入 Markdown 保留区并在重建时恢复。

AI 协作入口收到有效完整表格时，应直接在 dry-run 后创建项目并调用 `project:import-tables`，不先要求用户说明拆分方案。拆分后的 `tables/source/*.md` 是用户与 AI 共同修改表结构的入口；修改完成后由 AI 重建 generated JSON、刷新项目状态并交付新的表格产物。

`inspect-tables` 作为只读兼容检查器还能识别直接 sheet、`{ "chatSheets": { ... } }` 与 `{ "sheets": { ... } }` 等历史形状；这不代表这些形状可以绕过正式导入合同。

表结构修改必须先向用户说明对字段合同、现有 item 与数据的影响并取得确认，再编辑 Markdown、重建 generated JSON。保留表的字段变化会使对应制作状态失效；删除某张 Markdown 后，该表在 refresh 时直接从 generated 与制作队列移除。`skip-table` 只用于保留表格但不制作美化。原始导入副本永远不随结构修改而改写。表模板 JSON 与美化 Bundle 是两个独立交付物；Bundle 不创建、修改或迁移数据库表。

## 3. `manifest`

源码 `manifest` 使用与最终 Bundle 相同的作者字段：`id/name/version/author/items`。空白草稿允许 `items: []`；发布检查要求：

- `manifest.id` 非空；
- 至少一个 item；
- item ID 非空且唯一；
- 每个 item 有非空 `target.tableName` 和至少一个字段；
- 每个 item 有 `entry.mount`；
- 所有 entry 和 assets 都能在 `files` 中解析；
- 每个 item 至少匹配真实表文件中的一张表。

最终 Bundle 的详细合同见 [`bundle-format-v2.md`](./bundle-format-v2.md)。

## 4. `workflow-state.json`

每个源码项目都在 `project.json` 同级保存机器可读的 `workflow-state.json`。它记录：

- 原始 JSON、Markdown 目录、generated JSON 的项目内路径与哈希；
- 默认覆盖全部导入表的队列及当前表；
- 每表的 `pending / in-progress / completed / skipped / invalidated` 状态；
- 表名、表头、结构哈希、绑定 item 和字段合同；
- 每表制作期模拟的 `not-run / passed / skipped / failed` 状态与说明；
- 用户对完成、跳过和未模拟项汇总的最终确认及摘要哈希。

跳过一张表必须是用户明确决定，并记录原因。非跳过表必须各自唯一绑定一个 item；修改 generated 表结构后，受影响的已完成状态和最终确认会失效。只有队列中所有表都已完成或已跳过，并且用户确认最新汇总，发布检查才通过。

`workflow-state.json` 是制作记录，不进入最终 Bundle。对应结构由 [`workflow-state.schema.json`](../../schemas/workflow-state.schema.json) 校验。

## 5. `files`：包路径与源码路径

```json
{
  "page.js": "src/page.js",
  "assets/avatar.png": "src/assets/avatar.png"
}
```

左侧是最终 Bundle 包路径，右侧是相对于 `project.json` 所在目录的源码路径。二者都必须留在项目目录内。

路径防护包括：

- 拒绝绝对路径、盘符路径、URI、反斜杠和 `..` 越界；
- 对真实路径做 containment 检查；
- 拒绝通过软链接跳出项目目录；
- 只读取普通文件。

`entry.mount` 本身必须列在 `files`。mount 源码通过相对 import 引用的本地 JavaScript 依赖会由打包器递归发现，不要求逐个列入 `files`；CSS `@import` 的本地 CSS 文件和最终需要保留的资源则必须列入 `files`。

## 6. `mimeTypes` 与 `encodings`

`mimeTypes` 和 `encodings` 的键使用 `files` 左侧的包路径。

- 未声明 MIME 时默认为 `application/octet-stream`；
- mount 构建结果会规范为 `text/javascript`；
- HTML entry 必须声明 `text/html`；
- CSS entry 与被本地 `@import` 的文件必须声明 `text/css`；
- encoding 省略时默认为 `text`；
- encoding 只允许 `text` 或 `base64`；
- `text` 源文件必须是有效 UTF-8；
- `base64` 表示制作端读取二进制源文件，并在 Bundle 中写入规范 Base64，不是要求源码文件本身保存 Base64 文本。

## 7. JavaScript 制作期打包

源码可以使用项目内相对 JavaScript import：

```js
import { renderRows } from "./lib/render.js";

export function mount(context) {
  renderRows(context.root, context.getState());
}
```

制作工具使用浏览器目标 ES2022，将依赖打成单一 ESM 文件，并规范为显式的 `export function mount(context)` 或 async 形式。

约束：

- import 必须是项目内相对路径；
- 依赖文件只支持 `.js`、`.mjs`、`.cjs`；
- 裸模块、远程模块、绝对模块和越界依赖均拒绝；
- 禁止依赖 `import.meta.url`；
- 禁止 JavaScript 相对 `fetch`；资源使用 `context.resolveAsset()`；
- 最终 Bundle 中不能残留 module import。

## 8. CSS 制作期内联

源码 CSS 可以在顶层使用项目内相对 `@import`：

```css
@import "./card.css";
```

制作工具会递归内联本地 import，支持 `layer`、`supports()` 和媒体条件，并把被导入 CSS 中的相对 `url()` 重新基准到入口 CSS。循环 import 会失败。

外部 CSS import 不属于支持合同；最终 Bundle 的 CSS 不应残留 `@import`。远程、绝对、`data:`、`blob:` 和仅 fragment 的 `url()` 引用保持原文，包内资源应列入 `files/assets`。

CSS 不会自动作用域隔离。每个页面必须用独有根 class 收窄所有选择器。

## 9. 逐表制作、发布与回读

标准项目先由独立 CLI 创建并导表：

```bash
node tools/project-new.mjs --projects-dir projects --id example --name 示例项目
node tools/project-import-tables.mjs --project projects/example/project.json --input input/chatSheets.json
node tools/project-status.mjs --project projects/example/project.json --json
```

随后按队列逐表完成需求、字段映射、设计和源码；每张表使用 `project:add-item` 登记完成，或在用户明确决定后用 `project:skip-table` 记录跳过。制作期模拟由 `preview` 提供，可以跳过，但必须如实记录。

全部表完成或跳过后，先展示汇总；用户确认后运行：

```bash
node tools/project-status.mjs --project projects/example/project.json --confirm
node tools/project-check.mjs --project projects/example/project.json --mode release
node tools/pack-preset.mjs projects/example/project.json output/example.json
node tools/readback-preset.mjs projects/example/project.json output/example.json
```

`pack` 会：

1. 读取并规范真实表；
2. 解析全部项目内文件；
3. 打包 mount JavaScript；
4. 内联本地 CSS import 并重基准资源；
5. 按代码单元排序最终 `files`；
6. 用严格 Bundle 与真实表合同验证；
7. 输出两空格缩进、末尾换行的确定性 JSON。

`pack` 默认拒绝覆盖已有 Bundle；只有用户明确同意时才使用覆盖参数。`readback` 用 source/project 与输出 Bundle 对账。只改 Markdown、页面源码和项目合同，再重建对应生成物；不要直接修改 `output/*.json` 或 `tables/original/imported.json`。

制作期通过只能证明源码、打包、静态合同和回读一致；Blob ESM、CSP、宿主路由、资源 Blob URL 与页面生命周期仍需在真实兼容宿主中验证。
