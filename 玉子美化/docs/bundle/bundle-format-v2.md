# 玉子美化 Bundle 格式 v2

> 本文保留基础页面合同；主题、字体、受控生图与新版声明请同时读取 [宿主能力合同](../runtime/host-capabilities.md)。不要依据旧版“无 AI”条目否定已公开的生图动作，也不要把打包版本当成页面 context.apiVersion。

本文档描述可被兼容宿主导入的最终 JSON Bundle。源码工程 `project.json` 不是 Bundle；其格式见 [`source-project-format.md`](./source-project-format.md)。运行时代码接口见 [`Runtime API v1`](../runtime/runtime-api-v1.md)。

## 1. 固定标识

```json
{
  "format": "yuzi-beautify-preset",
  "formatVersion": 2,
  "apiVersion": 1,
  "manifest": {},
  "files": {}
}
```

`.yuzi-beautify.json` 是推荐导出文件名，不是协议强制后缀。宿主按 JSON 内容合同识别格式。

顶层只允许 `format`、`formatVersion`、`apiVersion`、`manifest`、`files` 五个字段。

## 2. 完整示例

```json
{
  "format": "yuzi-beautify-preset",
  "formatVersion": 2,
  "apiVersion": 1,
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
          "fields": ["帖子ID", "帖子标题", "帖子正文"]
        },
        "entry": {
          "html": "pages/square/page.html",
          "css": "pages/square/page.css",
          "mount": "pages/square/page.js"
        },
        "assets": ["assets/avatar.png"]
      }
    ]
  },
  "files": {
    "pages/square/page.html": {
      "mimeType": "text/html",
      "encoding": "text",
      "content": "<main class=\"example-square\"></main>"
    },
    "pages/square/page.css": {
      "mimeType": "text/css",
      "encoding": "text",
      "content": ".example-square { color: #222; }"
    },
    "pages/square/page.js": {
      "mimeType": "text/javascript",
      "encoding": "text",
      "content": "export function mount(context) { context.root.textContent = context.getState().tableName; }"
    },
    "assets/avatar.png": {
      "mimeType": "image/png",
      "encoding": "base64",
      "content": "iVBORw0KGgo..."
    }
  }
}
```

## 3. `manifest`

`manifest` 只允许：

| 字段 | 要求 |
| --- | --- |
| `id` | 严格制作合同要求非空；用作预设稳定身份 |
| `name` | 可选字符串；显示名 |
| `version` | 可选字符串；作者维护的版本文本 |
| `author` | 可选字符串 |
| `items` | 至少一个预设项 |

每个 item 只允许：

| 字段 | 要求 |
| --- | --- |
| `id` | 非空且在同一 Bundle 内唯一 |
| `name` | 可选显示名 |
| `target` | 必填，目标表合同 |
| `entry` | 必填，页面入口 |
| `assets` | 可选包路径数组；不能重复，且每个路径必须存在于 `files` |

不接受 legacy `entry.js` 或 `scriptMode`。

## 4. `target` 与表匹配

```json
{
  "tableName": "广场表",
  "fields": ["帖子ID", "帖子标题"]
}
```

匹配规则：

1. 表名和字段名先做 Unicode NFKC 规范化并去除首尾空白；
2. `tableName` 必须与真实表名精确相等；
3. `fields` 至少包含一个非空字段，NFKC 后不得重复；
4. 声明字段必须全部存在于真实表；
5. 字段顺序无关，真实表可以有额外字段；
6. 每个 item 只面向一张表，一个 Bundle 可以包含多个 item。

`sheetKey` 不参与作者匹配合同。消息记录表也按相同的表名和字段规则匹配。

## 5. `entry`

```json
{
  "html": "page.html",
  "css": "page.css",
  "mount": "page.js"
}
```

- `mount` 必填，必须指向 `text/javascript` 或 `application/javascript` 的 `text` 文件；
- mount 文本必须显式导出 `export function mount(context)` 或 async 形式；
- `html` 可选，必须指向 `text/html` 的 `text` 文件；
- `css` 可选，必须指向 `text/css` 的 `text` 文件；
- 三个入口路径都必须存在于 `files`。

宿主先载入 HTML，再把 CSS 放入当前根节点，最后导入并调用 mount。HTML/CSS 不自动提供安全净化或样式作用域。

## 6. `files`

`files` 是“包路径 → 文件记录”的对象。每个文件记录只允许：

```json
{
  "mimeType": "image/png",
  "encoding": "base64",
  "content": "..."
}
```

- `mimeType`：非空 MIME 字符串；
- `encoding`：`text` 或 `base64`；
- `content`：字符串；
- `base64` 必须是规范 Base64，包含正确 padding，不允许空白或 URL-safe 变体；
- 文本入口必须使用 `text` 编码。

## 7. 包路径

合法示例：

```text
page.js
pages/square/page.css
assets/avatar.png
```

包路径必须：

- 是无首尾空白的非空字符串；
- 使用 `/`，不能使用反斜杠；
- 不能是绝对路径、Windows 盘符路径或带 URI scheme 的地址；
- 不能含 `?`、`#`、控制字符；
- 不能含空段、`.`、`..`，也不能有连续 `/`。

这些规则同时适用于 `files` 键、entry 和 assets。

## 8. 最终 Bundle 的资源与脚本边界

| 能力 | 最终 Bundle / Runtime v1 |
| --- | --- |
| HTML `src/href/poster/srcset` 包内相对引用 | 支持，宿主改写为 Blob URL |
| CSS `url()` 包内相对引用 | 支持，宿主改写为 Blob URL |
| 脚本 `context.resolveAsset(path)` | 支持 |
| JavaScript module imports | 不支持；制作端必须先打成单一 ESM mount 模块 |
| CSS `@import` | 不支持；制作端必须先内联本地 import |
| `import.meta.url` | 不支持 |
| JavaScript 相对 `fetch` | 不支持 |
| 外部 SVG 文档引用 | 不属于受支持合同 |

不要把源码工程的打包能力误认为最终 Runtime 能力。

## 9. 导入信任边界

Bundle 验证会检查形状、路径、入口、编码和表匹配，但它不是恶意代码检测器。预设 JavaScript 在宿主同源页面执行，HTML/CSS 也可能影响页面；只导入可信来源的 Bundle。
