# 表格 Markdown 事实源格式

> 本文档说明 `tables/sources/**` 的表格 Markdown 事实源协议。运行时不读取这些文件；它们用于维护大型 chatSheets JSON，避免直接编辑长 JSON。

## 1. 事实源与生成物

当前小剧场表格的维护链路是：

```text
docs/reference/小剧场2.1.json  --首次拆分-->  tables/sources/小剧场2.1/*.md
tables/sources/小剧场2.1/*.md  --校验/合成-->  tables/generated/小剧场2.1.json
```

维护规则：

- `tables/sources/小剧场2.1/*.md` 是后续人工编辑的事实源。
- `tables/generated/小剧场2.1.json` 是合成产物。
- 第一阶段不自动覆盖 `docs/reference/小剧场2.1.json`。
- 不要手工编辑 generated JSON 后再期待变更保留；下一次 `tables:build` 会重新生成它。

## 2. 命令

首次或强制重新拆分：

```bash
node scripts/table-source.cjs split docs/reference/小剧场2.1.json tables/sources/小剧场2.1 --force
```

日常校验：

```bash
npm run tables:check
```

合成 JSON：

```bash
npm run tables:build
```

无损往返验证：

```bash
node scripts/table-source.cjs roundtrip docs/reference/小剧场2.1.json
```

注意：`npm run tables:split` 默认不带 `--force`。如果目标目录已有 `.md` 文件，它会失败并提示手动确认覆盖，避免把人工修改一键抹掉。

## 3. 文件布局

```text
tables/
  sources/
    小剧场2.1/
      00-mate.md
      01-消息记录表.md
      02-广场表.md
      ...
  generated/
    小剧场2.1.json
```

编号规则：

- `00-mate.md` 保存顶层 `mate`。
- 表文件编号等于 `orderNo + 1`。
- 文件名格式为 `{两位编号}-{中文表名}.md`。

## 4. mate 文件格式

```md
---
type: mate
---

# mate

## data

```json
{
  "type": "chatSheets",
  "version": 1
}
```
```

`## data` 中必须是 JSON 对象，且 `type` 必须为 `chatSheets`。

## 5. 单表文件格式

```md
---
type: sheet
uid: sheet_square_posts
name: 广场表
orderNo: 1
---

# 广场表

## sourceData.note

这里写表说明。

## sourceData.initNode

这里写初始化规则。

## sourceData.deleteNode

这里写删除规则。

## sourceData.updateNode

这里写更新规则。

## sourceData.insertNode

这里写插入规则。

## sourceData.ddl

```sql
CREATE TABLE square_posts (
  row_id INTEGER PRIMARY KEY
);
```

## content

```json
[
  ["row_id", "帖子ID"]
]
```

## updateConfig

```json
{
  "uiSentinel": -1
}
```

## exportConfig

```json
{
  "enabled": false
}
```
```

## 6. 可编辑字段

日常建议只编辑：

- `sourceData.note`
- `sourceData.initNode`
- `sourceData.deleteNode`
- `sourceData.updateNode`
- `sourceData.insertNode`
- `sourceData.ddl`
- `content`
- `updateConfig`
- `exportConfig`

不建议随意改：

- `uid`：合成 JSON 的顶层 key 使用它。改错会导致表身份变化。
- `name`：会影响文件名、显示名和校验。
- `orderNo`：会影响排序和文件编号。

如果确实要改 `uid/name/orderNo`，必须同步文件名和所有引用关系，再运行 `npm run tables:check`。

## 7. 为什么 content 用 JSON code block

`content` 不使用 Markdown 表格。原因很简单：Markdown 表格对换行、竖线、空单元格和复杂字符串很脆，转换规则会变成新的事故源。

JSON code block 虽然不如表格好看，但它能保证：

- 二维数组结构无损。
- 字符串转义规则明确。
- 合成脚本可直接解析。
- 后续有初始数据行时不会被 Markdown 表格语法误伤。

能稳定合成比看起来漂亮更重要。把维护工具做成展示工具，通常就是屎山入口。

## 8. 常见错误

### 8.1 文件编号与 orderNo 不一致

错误示例：

```text
03-广场表.md
orderNo: 1
```

`orderNo: 1` 对应文件编号应为 `02`。修正文件名或 `orderNo` 后重跑检查。

### 8.2 JSON code block 解析失败

检查：

- 代码块语言是否为 `json`。
- 是否有漏逗号、多余逗号、未闭合引号。
- 是否把注释写进 JSON。

### 8.3 缺少 section

每张表必须包含全部固定 section。不要删除空 section；即便某个字段暂时为空，也应保留标题和内容位置。

### 8.4 重复 uid 或 orderNo

`uid` 是表身份，`orderNo` 是排序身份。重复会导致合成覆盖或顺序漂移，脚本会直接失败。

### 8.5 文本段落里出现二级标题

解析器用 `## sectionName` 识别字段边界。不要在 `sourceData.note` 等文本段落里使用二级标题。如果需要层级标题，用普通文本或 `###`。
