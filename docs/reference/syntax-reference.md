# 模板变量与条件表达式 — 完整语法参考

> 本文档涵盖提示词系统支持的**全部**模板变量、条件表达式和 `<if>` 标签语法。每一条规则都对应真实代码行为，示例全部使用本项目真实内置表名与真实列名。
>
> 为了让示例结果可核验，[**第〇节**](#零示例数据集本文所有示例共用的初始快照) 预先约定了一组"初始快照"，**下文所有 `→ 执行结果` 都基于这组数据计算**。你可以自己心算/手算验证。

---

## 导读：两种运行模式的能力差异

语法能否生效取决于当前运行模式。**在看每一节前先对照这张表**：

| 语法 | 原生（DSL）模式 | SQLite 模式 |
|------|:---------------:|:-----------:|
| `<random>` / `$random:` | ✅ | ✅ |
| `<calc>` / `$calc:` | ✅ | ✅ |
| `<max>` / `$max:` / `<min>` / `$min:` | ✅ | ✅ |
| `<if seed="...">` | ✅ | ✅ |
| `<if cell="...">` | ✅ | ✅ |
| `<if cond="...">`（非 db:/sql:/v: 前缀部分） | ✅ | ✅ |
| `{[db.表名.方法链]}` | ❌ | ✅ |
| `{[db.expr/rand/calc/max/min(...)]}` | ❌ | ✅ |
| `{[sql "SELECT..."]}` | ❌ | ✅ |
| `{[... as 变量名]}` / `$v:变量名` | ❌ | ✅ |
| `<if db="...">` / `<if sql="...">` | ❌ | ✅ |
| `<if cond="db:... | sql:... | v:...">` 中的对应前缀 | ❌ | ✅ |

> ⚠️ 在原生模式下书写仅 SQLite 支持的语法，标签会**原样保留**在文本中发给 AI，不会报错也不会替换。

---

## 使用场景 A：前端 JS 代码如何直接读写表格数据

> **本节解答**：我要在自己的前端脚本（Quick Reply、酒馆扩展、自定义 `<script>`、控制台调试……）里**取得某张表某一行某一列的值**，或**改掉某个单元格**，该调什么？
>
> 答：插件把所有外部可用的方法统一挂到全局对象 **`window.AutoCardUpdaterAPI`** 上（代码位置：[api-registry.ts](../src/presentation/bootstrap/api-registry.ts)）。所有前端代码都从这一个入口出发。

> 💡 **中英文名称双向支持（v120 修复后）**：四个 CRUD 方法（`updateCell / updateRow / insertRow / deleteRow`）现在**同时接受中文显示名和英文物理名**，而且可以混用。底层通过 `NameMapper`（从 DDL 注释构建的双向映射表）自动翻译。例如下面四种写法等价：
>
> ```js
> API.updateCell('背包物品表', 1, '数量', 99);       // 纯中文
> API.updateCell('inventory',   1, 'quantity', 99); // 纯英文
> API.updateCell('背包物品表', 1, 'quantity', 99); // 表中文 + 列英文
> API.updateCell('inventory',   1, '数量', 99);     // 表英文 + 列中文
> ```
>
> - **SQLite 模式下**：无论你传什么形态，内部都会翻译成英文物理名再拼 SQL（否则 SQLite 引擎认不出中文表名，必然报错）。
> - **原生模式下**：NameMapper 未构建时 `resolve*` 原样返回，此时**只认中文**（因为 `content[0]` 表头就是中文）——如果切回过 SQLite 模式让 mapper 建过表，原生模式也能识别英文。
> - **你不需要关心当前是哪种模式**，统一用你习惯的名字即可。本节剩余的示例都用中文，方便阅读。

### 零、先学会：在 DevTools 里验证 API 可用

```js
// 打开 F12 → 控制台，直接贴：
console.log(Object.keys(window.AutoCardUpdaterAPI).sort());
```

如果能列出 40+ 个方法名，说明插件已就绪。否则请等页面加载完（或检查插件是否启用）。

### 一、读取表格数据

#### 1.1 拿整个数据库快照（全部表 + 所有行）

```js
const all = window.AutoCardUpdaterAPI.exportTableAsJson();
// 结构：{ mate: {...}, sheet_xxx: { name, content, ... }, sheet_yyy: {...}, ... }
```

- `sheet_xxx` 是内部 key，不要拿它当表名用；**真正的表名是 `sheet.name`**
- `sheet.content` 是一个二维数组：`content[0]` = 表头行（首列通常是 `row_id`），`content[1..]` = 数据行

#### 1.2 按表名取一张表

插件**没有单独暴露 `getSheet(name)`**，你得自己封一个。下面这个版本**同时兼容中文名和英文名**（跟 CRUD API 的行为一致）：

```js
function getSheetByName(tableName) {
  const all = window.AutoCardUpdaterAPI.exportTableAsJson();
  // 路径 1：按中文显示名匹配
  for (const key in all) {
    if (!key.startsWith('sheet_')) continue;          // 跳过 mate
    if (all[key].name === tableName) return all[key];
  }
  // 路径 2：按 DDL 英文表名匹配（兜底，支持用户传英文）
  for (const key in all) {
    if (!key.startsWith('sheet_')) continue;
    const ddl = all[key].sourceData?.ddl || '';
    const m = ddl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    if (m && m[1] === tableName) return all[key];
  }
  return null;
}

const bag = getSheetByName('背包物品表');
// 或者：const bag = getSheetByName('inventory');
console.log(bag.content);  // 二维数组
```

> 💡 `content[0]`（表头）存的是**中文列名**，不管当前是不是 SQLite 模式。下面的 `getCellByHeader` 按中文列名匹配 headers；如果你想传英文列名读单元格，见 §1.3 末尾的增强版。

#### 1.3 按"行号 + 列名"读单元格

```js
function getCellByHeader(tableName, rowIndex, colName) {
  const sheet = getSheetByName(tableName);
  if (!sheet) return null;
  const headers = sheet.content[0];
  const colIdx = headers.indexOf(colName);
  if (colIdx === -1) return null;
  return sheet.content[rowIndex]?.[colIdx] ?? null;
}

// 示例：拿「背包物品表」第 2 行的「数量」列
const qty = getCellByHeader('背包物品表', 2, '数量');
```

> ⚠️ 注意：`rowIndex = 0` 是**表头**，第一条数据行是 `rowIndex = 1`。

**增强版（同时接受英文列名）**——利用 DDL 注释做一次翻译：

```js
function getCellByHeaderEx(tableName, rowIndex, colName) {
  const sheet = getSheetByName(tableName);
  if (!sheet) return null;
  const headers = sheet.content[0];

  // 先按中文名直接找
  let colIdx = headers.indexOf(colName);

  // 找不到时，尝试把英文列名通过 DDL 注释翻译成中文
  if (colIdx === -1) {
    const ddl = sheet.sourceData?.ddl || '';
    // 匹配形如 `quantity TEXT NOT NULL, -- 数量`
    const re = new RegExp('^\\s*' + colName + '\\s+.*?--\\s*(.+?)\\s*,?\\s*$', 'im');
    const m = ddl.match(re);
    if (m) colIdx = headers.indexOf(m[1].trim());
  }
  if (colIdx === -1) return null;
  return sheet.content[rowIndex]?.[colIdx] ?? null;
}

// 两种写法都能工作：
getCellByHeaderEx('背包物品表', 2, '数量');
getCellByHeaderEx('inventory', 2, 'quantity');
```

#### 1.4 按"物品名称"查找行（类似 `WHERE name = ?`）

```js
function findRowByColumn(tableName, colName, value) {
  const sheet = getSheetByName(tableName);
  if (!sheet) return -1;
  const headers = sheet.content[0];
  const colIdx = headers.indexOf(colName);
  if (colIdx === -1) return -1;
  for (let i = 1; i < sheet.content.length; i++) {
    if (String(sheet.content[i][colIdx]) === String(value)) return i;
  }
  return -1;
}

const rowIdx = findRowByColumn('背包物品表', '名称', '铁剑');
if (rowIdx !== -1) {
  const qty = getCellByHeader('背包物品表', rowIdx, '数量');
  console.log(`铁剑还有 ${qty} 把`);
}
```

### 二、写入表格数据（四个核心方法）

这四个方法**由 `AutoCardUpdaterAPI` 直接暴露**，不用自己封装：

| 方法 | 签名 | 说明 |
|-----|------|-----|
| `updateCell` | `(tableName, rowIndex, colIdentifier, value) => Promise<boolean>` | 改一个单元格；`colIdentifier` 可以是列名字符串（中文/英文都行）或列索引数字 |
| `updateRow` | `(tableName, rowIndex, data) => Promise<boolean>` | 改整行；`data` 是 `{ 列名: 值, ... }`，key 可以是中文列名、英文列名，或两者混用 |
| `insertRow` | `(tableName, data) => Promise<number>` | 插一行；返回新行 rowIndex，失败返回 -1 |
| `deleteRow` | `(tableName, rowIndex) => Promise<boolean>` | 删一行 |

> ⚡ 所有方法的 `tableName` 参数和 `data` key 都经过 **`NameMapper` 双向翻译**：你传中文就按中文查 sheet，传英文就反查对应的中文 sheet；SQLite 分支会把你传入的名字统一翻译成 DDL 里的英文物理名再拼 SQL。`row_id`（自增主键）无论你用 `'row_id'` 还是中文"行号"变体，`insertRow` 都会跳过。

**完整示例**：铁剑用掉 1 把

```js
const API = window.AutoCardUpdaterAPI;

async function useIronSword() {
  const rowIdx = findRowByColumn('背包物品表', '名称', '铁剑');
  if (rowIdx === -1) {
    console.warn('背包里没铁剑');
    return;
  }
  const cur = Number(getCellByHeader('背包物品表', rowIdx, '数量')) || 0;
  if (cur <= 0) {
    console.warn('铁剑数量已经是 0');
    return;
  }
  const ok = await API.updateCell('背包物品表', rowIdx, '数量', cur - 1);
  console.log(ok ? '已扣减' : '失败');
}
useIronSword();

// 同一业务用英文名也能写（等价效果）：
await API.updateCell('inventory', rowIdx, 'quantity', cur - 1);

// 中英混用也 OK：
await API.updateRow('背包物品表', rowIdx, { quantity: cur - 1, 描述: '已使用过一次' });
```

> 💡 这四个方法**同时兼容原生 / SQLite 两种存储模式**——内部会自动判断并走对应路径（原生模式改 JSON 数组，SQLite 模式拼 `UPDATE/INSERT/DELETE` SQL 并执行）。你不需要关心当前是哪种模式。

### 三、监听表格变化（回调）

```js
// 每次任何表格被更新（填表、手动编辑、外部 updateCell 等）都会回调
window.AutoCardUpdaterAPI.registerTableUpdateCallback(() => {
  console.log('[我的脚本] 检测到表格变化，重新渲染 UI...');
  // 这里做你自己的事，比如刷新某个卡片组件
});

// 不用时记得注销
// window.AutoCardUpdaterAPI.unregisterTableUpdateCallback(myFn);
```

还有 `registerTableFillStartCallback`（填表开始时触发）可用。

### 四、主动触发填表 / 更新

```js
// 相当于点了"手动填表"按钮
await window.AutoCardUpdaterAPI.triggerUpdate();

// 等价 UI 调用
await window.AutoCardUpdaterAPI.manualUpdate();

// 刷新合并数据 + 同步世界书
await window.AutoCardUpdaterAPI.refreshDataAndWorldbook();
```

### 五、AutoCardUpdaterAPI 方法速查表

按领域分组列出全部对外方法（共约 50 个）：

#### 核心数据（core-data）
- `exportTableAsJson()` — 返回当前完整数据库对象
- `importTableAsJson(jsonString)` — 覆盖式导入（字符串形式的 JSON）
- `triggerUpdate()` — 外部触发增量填表

#### 表格 CRUD（table-crud，**最常用**）
- `updateCell(tableName, rowIndex, colIdentifier, value)`
- `updateRow(tableName, rowIndex, data)`
- `insertRow(tableName, data)` → 返回新 rowIndex
- `deleteRow(tableName, rowIndex)`

#### 表格锁（table-lock）
- `getTableLockState(sheetKey)` / `setTableLockState(sheetKey, lockState, {merge})`
- `clearTableLocks(sheetKey)`
- `lockTableRow/Col/Cell(sheetKey, idx, locked?)`
- `toggleTableRow/Col/CellLock(sheetKey, ...)`
- `getSpecialIndexLockEnabled/setSpecialIndexLockEnabled(sheetKey, enabled)`

#### 回调（callback）
- `registerTableUpdateCallback(fn)` / `unregisterTableUpdateCallback(fn)`
- `registerTableFillStartCallback(fn)`
- `_notifyTableUpdate()` / `_notifyTableFillStart()`（内部用）

#### 设置与配置（settings-config）
- `openVisualizer()` / `openSettings()` / `manualUpdate()`
- `getUpdateConfigParams()` / `setUpdateConfigParams(params)`
- `getManualSelectedTables()` / `setManualSelectedTables(keys)` / `clearManualSelectedTables()`
- `getApiPresets()` / `getTableApiPreset()` / `setTableApiPreset(name)`
- `getPlotApiPreset()` / `setPlotApiPreset(name)`
- `saveApiPreset(preset)` / `loadApiPreset(name)` / `deleteApiPreset(name)`

#### 模板预设（template-preset）
- `getTemplatePresetNames()` / `switchTemplatePreset(name, opts)`
- `injectTemplatePresetToCurrentChat(name)`
- `importTemplateFromData(data, opts)`
- `getTableTemplate()`

#### 剧情推进预设（plot-preset）
- `getPlotPresets()` / `getCurrentPlotPreset()` / `getPlotPresetNames()`
- `switchPlotPreset(name)`
- `injectPlotPresetToCurrentChat(name)`
- `getPlotPresetDetails(name)`

#### 数据管理（data-admin）
- `importTemplate/exportTemplate/resetTemplate(options)`
- `resetAllDefaults()` / `exportJsonData()`
- `importCombinedSettings()` / `exportCombinedSettings()`
- `overrideWithTemplate()`
- `importTxtAndSplit()` / `injectImportedSelected/Standard/Summary/Full()` / `deleteImportedEntries()` / `clearImportedEntries(clearAll)` / `clearImportCache(clearAll)`
- `mergeSummaryNow()`

#### 世界书与 AI 调用（worldbook-ai）
- `syncWorldbookEntries({createIfNeeded})` / `refreshDataAndWorldbook()`
- `reoptimizeMessage(messageIndex)` / `cancelContentOptimization(reason)`
- `deleteInjectedEntries()`
- `setOutlineEntryEnabled(enabled)` / `setZeroTkOccupyMode(enabled)`
- `callAI(messages, options)`（直接调用当前填表 API，绕过填表流程）
- `getStoryContext(maxTurns)`

### 六、典型使用模式

**模式 A**：**Quick Reply 里根据表格数据动态发消息**（这是最常见的前端用法）

```js
// 在 Quick Reply 脚本里
const hp = /* 用上面的 getCellByHeader 取 */ getCellByHeader('状态栏', 1, 'HP');
if (Number(hp) < 20) {
  // 直接发一条消息给 AI
  sendUserMessage(`*（HP 只剩 ${hp}，必须立刻找药）*`);
}
```

**模式 B**：**自己写个悬浮面板实时显示某表的值**

```js
function renderPanel() {
  const qty = getCellByHeader('背包物品表', 1, '数量');
  document.getElementById('my-panel').textContent = `铁剑：${qty}`;
}
window.AutoCardUpdaterAPI.registerTableUpdateCallback(renderPanel);
renderPanel();  // 初次渲染
```

**模式 C**：**外部脚本批量修数据（比如存档还原）**

```js
const API = window.AutoCardUpdaterAPI;
await API.updateRow('状态栏', 1, { HP: 100, MP: 50, 位置: '初始村庄' });
await API.insertRow('背包物品表', { 名称: '新手剑', 数量: 1, 类型: '武器' });
```

### 七、你可能会问的陷阱

1. **"我怎么直接跑 SQL 查询？"** — `AutoCardUpdaterAPI` **没有**暴露 `query(sql)` 这样的方法。想做条件查询，要么：(a) 自己用上面的 `findRowByColumn` 遍历；(b) 在 AI 提示词里用 `{[sql "SELECT..."]}`（见下一节"使用场景 B"）。
2. **"rowIndex 从 0 还是 1 开始？"** — 0 是表头，数据从 1 开始。`updateRow/deleteRow` 的入参也必须 ≥ 1。
3. **"写完没刷新 UI？"** — 四个 CRUD 方法内部已经调了 `_notifyTableUpdate` 和 `refreshMergedDataAndNotifyWithUI_ACU`，正常会刷新。如果你自己直接 `exportTableAsJson` 拿到对象后本地改它的 `content` 数组，插件**察觉不到**，必须走 `updateCell/updateRow`。
4. **"数据隔离标签切换后，我之前的 rowIndex 还能用吗？"** — 不能。隔离切换后表格内容可能整体换了，rowIndex 不稳定。最佳做法是：**每次操作前先用 `findRowByColumn` 根据业务字段（如名称）重新定位**。
5. **"我传英文表名/列名为什么有时候不认？"** — 只有一种场景：**纯原生模式 + 从未进入过 SQLite 模式**。这种情况下 `NameMapper` 从未构建，所有英文名都没被注册。解决办法：(a) 给表配上 DDL（带中文注释），在 SQLite 模式下加载过一次，mapper 就建好了；(b) 或者就用中文名——原生模式下中文永远可用。
6. **"列名既有英文又可能被大小写混淆吗？"** — `NameMapper` 在 `translateSql` 里做**长名称优先的字符串替换**，列名大小写敏感（因为 DDL 里的英文名就是小写）。传入的英文列名必须和 DDL 里一字不差（比如 DDL 写 `quantity` 就要传 `quantity`，传 `Quantity` 会当成未知列原样保留，然后在 SQL 执行时报错）。

---

## 使用场景 B：模板变量语法写在前端哪里、何时被解析

> **本节解答**：我在哪个文本框里写 `<random>` / `<calc>` / `{[db...]}` / `<if>`？什么时机这些标签会被真正替换成值？
>
> ⚠️ **场景 A 和场景 B 的区别**：场景 A 是**你自己的 JS 代码主动调用** `window.AutoCardUpdaterAPI` 读写数据；场景 B 是**你把语法写进某个提示词文本框**，系统在发给 AI 之前自动做字符串替换。这两个是完全独立的两件事——A 发生在你的脚本里，B 发生在发送给 LLM 的消息管线里。

### 5 条提示词解析入口

| # | 你在哪里写 | 什么时候被解析 | 代码位置（给你追踪用） |
|:-:|-----------|--------------|-----------------|
| **① 酒馆预设提示词**（System/Assistant/User 各段） | 正式对 AI 发聊天补全请求时（通常是你发送消息后） | `handleChatCompletionReady_ACU`（监听酒馆 `CHAT_COMPLETION_SETTINGS_READY` 事件） |
| **② 填表预设提示词**（`charCardPrompt`，主弹窗内编辑） | 点击"手动填表"或触发自动填表时 | `callCustomOpenAI_ACU`（`prompt-api-call.ts`） |
| **③ 正文优化提示词段落**（正文优化页编辑） | 触发"正文优化"时 | `content-optimization.ts` |
| **④ 剧情推进世界书 + 最终系统指令**（剧情推进页） | 触发"剧情推进"时 | `plot-task-engine.ts` |
| **⑤ 剧情推进任务的提示词内容**（剧情推进页→任务编辑器） | 执行某个剧情任务时 | `plot-tag-utils.ts`（`renderPlotTaskContentWithIsolatedVariables_ACU`） |

### 每个入口的总开关在哪

| 入口 | 总开关位置 | 设置字段 |
|------|-----------|---------|
| ① 酒馆预设 / ② 填表 的 `<if>` 部分 | **主弹窗 → 状态页 → 勾选框「启用条件模板功能（<if>条件判断）」** | `settings_ACU.promptTemplateSettings.enabled` |
| ③ 正文优化 | **正文优化页 → 勾选框「启用功能」** | `settings_ACU.optimization.enabled` |
| ④/⑤ 剧情推进 | **剧情推进页 → 启用剧情推进** | `settings_ACU.plotSettings.enabled` |

> 💡 `<random>` / `<calc>` / `{[db...]}` / `{[sql...]}` 这些**值替换类**标签不受"条件模板"开关影响——只要所在入口本身被触发，它们就会被解析。只有 `<if>` 标签需要额外打开"条件模板功能"开关。

### 各入口能用到的语法差异

**这张表非常关键**——同样是"入口"，支持的语法不完全一样：

| 入口 | `<random>` / `$random:` | `<calc>`/`<max>`/`<min>` | `{[db/sql...]}` / `$v:` | `<if>` 系列 |
|------|:---:|:---:|:---:|:---:|
| ① 酒馆预设 | ✅ | ✅ | ✅（需 SQLite 模式） | ✅（需开条件模板开关） |
| ② 填表预设 | ✅ | ❌ **填表入口不跑 `<calc>/<max>/<min>`** | ✅（需 SQLite 模式） | ✅（需开条件模板开关） |
| ③ 正文优化 | ✅ | ✅ | ✅（需 SQLite 模式） | ✅ |
| ④ 剧情推进-世界书/最终指令 | ✅ | ❌（同填表入口，只跑 random + db/sql） | ✅（需 SQLite 模式） | ❌ |
| ⑤ 剧情推进-任务内容 | ✅ | ✅ | ✅（需 SQLite 模式） | ✅ |

> ⚠️ **填表入口（入口 ②）的特殊坑**：代码里只调用了 `parseRandomTags` 和 `replaceDbSqlVariables`，**完全跳过了 `parseCalcTags / parseMaxTags / parseMinTags`**。所以你在填表 `charCardPrompt` 里写 `<calc id="x" expr="..." />` 不会生效，只能靠 `{[db.expr("...")]}` 或 `{[db.calc("$v:...")]}` 做算术。入口 ④ 同理。

### 怎么验证"我写的标签被正确解析了"

1. **打开浏览器 DevTools 控制台** → 观察日志前缀：
   - 入口 ①：`[提示词模板]`
   - 入口 ②：`[填表]`
   - 入口 ③：`[正文优化]`
   - 入口 ④/⑤：`[剧情推进]`
2. **最终发给 AI 的消息**可以在酒馆对应日志里看到完整的替换后结果（例如 `Final messages array being sent to API:`）。
3. **调试模式**：把 `settings_ACU.promptTemplateSettings.debugMode` 设为 `true` 可以获得更详细的解析日志。

### 小结

- 你要做的只是**找到对应前端文本框，把语法原样写进去**——不需要调用任何函数、不需要自己触发解析
- **同一段模板变量写在不同入口会跑不同的子集**（特别注意 `<calc>` 在入口 ②/④ 不生效）
- **变量是"消息级"的**：每条消息走完整流水线后 random/calc/max/min/db-sql 变量全部清空，消息之间不共享

---

## 目录

- [使用场景 A：前端 JS 代码如何直接读写表格数据](#使用场景-a前端-js-代码如何直接读写表格数据)
- [使用场景 B：模板变量语法写在前端哪里、何时被解析](#使用场景-b模板变量语法写在前端哪里何时被解析)
0. [示例数据集（本文所有示例共用的初始快照）](#零示例数据集本文所有示例共用的初始快照)
1. [变量定义标签](#一变量定义标签)
2. [值替换变量（SQLite 模式）](#二值替换变量仅-sqlite-模式)
3. [`<if>` 条件标签](#三if-条件标签)
4. [变量引用语法汇总](#四变量引用语法汇总)
5. [完整处理顺序](#五完整处理顺序pipeline)
6. [真实内置表速查（写示例时直接套用）](#六真实内置表速查写示例时直接套用)
7. [踩坑清单](#七踩坑清单)

---

## 〇、示例数据集（本文所有示例共用的初始快照）

下面这组数据是我们为了演示而约定的**初始快照**。后文所有示例的「→ 执行结果」都假定数据库是下面这个状态，且最新一条 AI 回复正文是指定那段话。

### 当前最新 AI 回复正文（用于 `<if seed>`）

```
主角在雪原上与黑暗教团的巡逻队展开了战斗，艾莉用冰咒压制了敌方领头，本则在侧翼掩护。
```

### 最新一条推进数据 `$6`（plotContent）

```
主角触发了战斗事件，目前位于北境·雪原。
```

### 背包物品表

| row_id | 物品名称 | 数量 | 描述/效果 | 类别 |
|:------:|---------|:----:|----------|------|
| 1 | 铁剑 | 3 | 锋利的铁制长剑 | 武器 |
| 2 | 治疗药水 | 10 | 恢复30点生命 | 消耗品 |
| 3 | 钢盾 | 1 | 厚重的钢制盾牌 | 武器 |
| 4 | 大药水 | 2 | 恢复80点生命 | 消耗品 |

### 重要角色表

| row_id | 姓名 | 性别/年龄 | 一句话介绍 | 外貌特征 | 持有的重要物品 | 是否离场 | 过往经历 |
|:------:|-----|----------|-----------|---------|--------------|:-------:|---------|
| 1 | 艾莉 | 女/19 | 冷静的冰系法师 | 银发碧眼 | 铁剑;治疗药水 | 否 | 与主角在迷雾森林结识 |
| 2 | 本  | 男/30 | 刚直的战士 | 棕发虎背 | 钢盾 | 否 | *（null）* |
| 3 | 敌方首领 | 男/50 | 黑暗教团领主 | 银鬓刀疤 | *（null）* | 是 | 三年前曾重创主角父亲 |

### 主角信息表（单行）

| row_id | 人物名称 | 性别/年龄 | 外貌特征 | 职业/身份 | 过往经历 | 性格特点 |
|:------:|---------|----------|---------|----------|---------|---------|
| 1 | 冈部 | 男/25 | 黑发银眸 | 流浪剑士 | 年少时曾亲历家乡沦陷 | 冷静谨慎 |

### 主角技能表

| row_id | 技能名称 | 技能类型 | 等级/阶段 | 效果描述 |
|:------:|---------|---------|:--------:|----------|
| 1 | 剑术 | 主动 | 3 | 基础剑招，造成 1.2 倍物理伤害 |
| 2 | 闪避 | 被动 | 2 | 有 15% 几率完全闪避近战攻击 |

### 全局数据表（单行）

| row_id | 主角当前所在地点 | 当前时间 | 上轮场景时间 | 经过的时间 |
|:------:|----------------|---------|-------------|-----------|
| 1 | 北境·雪原 | 2024-03-15 14:30 | 2024-03-15 13:30 | 约1小时 |

### 纪要表

| row_id | 时间跨度 | 地点 | 纪要 | 概览 | 编码索引 |
|:------:|---------|-----|------|------|---------|
| 1 | 2024-03-01 起 | 迷雾森林 | 与艾莉相遇并一同走出迷雾森林 | 结识艾莉 | AM0001 |
| 2 | 2024-03-10 起 | 北境·雪原 | 遭遇巡逻队，与本会合 | 会合本 | AM0002 |

（任务与事件表、选项表为空，不影响下文示例）

> 💡 **如何使用这组快照**：下文每出现一个可执行示例，都会在下方写一行 `→ 执行结果：...`。这些结果就是在上述快照下跑出来的。自己的项目数据不同时，把这些数字套用到你自己的数据上即可。

---

## 一、变量定义标签

### 1. `<random>` — 随机整数

```html
<!-- 形式 A：直接替换为随机数 -->
<random min="1" max="100" />

<!-- 形式 B：生成并存入变量（标签本身被移除） -->
<random id="dice" min="1" max="6" />
```

**参数**：

| 参数 | 必选 | 约束 |
|------|:----:|------|
| `min` | ✅ | 非负整数（正则只接受 `\d+`，**不支持负数和小数**） |
| `max` | ✅ | 非负整数 |
| `id` | ❌ | 变量名，必须 `[a-zA-Z_][a-zA-Z0-9_]*`，**不能用中文** |

**行为细节**：
- `min > max` 时自动交换
- 闭区间 `[min, max]`，两端都可取到
- 结果总是整数（内部用 `Math.floor`）
- 变量在**每次提示词处理时清零**，不跨消息保留

**引用语法**：`$random:变量名`

**示例**：
```html
<random id="attack_roll" min="1" max="20" />
<random id="dmg" min="5" max="15" />

主角掷出了 $random:attack_roll 点命中，造成 $random:dmg 点伤害。
本次行动另有 <random min="1" max="100" />% 的概率触发暴击。
```

→ **执行结果**（随机，举一次具体的例子，`attack_roll=14`、`dmg=9`、行内 random=37）：
```
主角掷出了 14 点命中，造成 9 点伤害。
本次行动另有 37% 的概率触发暴击。
```

> 注：每次处理都会重新掷，每条消息都是全新值。

---

### 2. `<calc>` — 四则运算

```html
<calc id="double_sword" expr="cell:背包物品表/铁剑/数量 * 2" />
```

**参数**：

| 参数 | 必选 | 说明 |
|------|:----:|------|
| `id` | ✅ | 变量名（纯英文数字下划线） |
| `expr` | ✅ | 算术表达式，**只接受白名单字符集**：`0-9 + - * / % ( ) .` 和空格 |

**表达式可引用的值**（会被替换为数字，失败替换为 `NaN` 导致整体失败）：

| 引用形式 | 含义 |
|---------|------|
| `42`、`3.14`、`-5` | 字面量 |
| `cell:表名/行标识/列名` | 单元格值（见 [cell 引用规则](#32-if-cell表达式) ） |
| `$random:变量名` | 随机数变量 |
| `$calc:变量名` | 已定义的计算变量 |
| `$max:变量名` / `$min:变量名` | 最大/最小值变量 |

**行为细节**：
- 支持 `+ - * / %`（取模）和括号分组
- **结果强制 `Math.floor` 向下取整**（哪怕 expr 是 `1/2` 也返回 `0`）
- 除数为零 → 解析失败，变量未被定义
- 表达式里任何一处变量找不到 → 整条失败

**引用语法**：`$calc:变量名`

**示例 1**：
```html
<calc id="double_sword" expr="cell:背包物品表/铁剑/数量 * 2" />
<calc id="dmg_score" expr="(cell:背包物品表/铁剑/数量 + cell:背包物品表/钢盾/数量) * cell:主角技能表/剑术/等级/阶段" />

双持铁剑模拟总攻击次数：$calc:double_sword 次。
当前武器 × 剑术阶段得分：$calc:dmg_score。
```

→ **执行结果**（快照中：铁剑=3、钢盾=1、剑术等级/阶段=3，`Math.floor` 后）：
```
双持铁剑模拟总攻击次数：6 次。
当前武器 × 剑术阶段得分：12。
```

**示例 2（向下取整陷阱）**：
```html
<calc id="half" expr="cell:背包物品表/治疗药水/数量 / 3" />

半分后每组药水数量：$calc:half。
```

→ **执行结果**（治疗药水=10，`10/3=3.333...` → `Math.floor` → `3`）：
```
半分后每组药水数量：3。
```

---

### 3. `<max>` / `<min>` — 最大值/最小值

```html
<max id="top_cnt" values="cell:背包物品表/铁剑/数量, cell:背包物品表/治疗药水/数量, cell:背包物品表/钢盾/数量" />
<min id="low_cnt" values="cell:背包物品表/铁剑/数量, cell:背包物品表/钢盾/数量, 5" />
```

**参数**：

| 参数 | 必选 | 说明 |
|------|:----:|------|
| `id` | ✅ | 变量名 |
| `values` | ✅ | 逗号分隔的表达式列表；**每个元素**允许的形式和 `<calc>` 里可引用的值完全一致（字面量、cell:、$random:、$calc:、$max:、$min:） |

**行为细节**：
- 任一元素解析失败，整条失败，变量未被定义
- `values` 里的每一项必须是**单个值**，**不能写 `1+2`** 这种表达式（元素级不跑算术运算）
- 空列表会失败

**引用语法**：`$max:变量名` / `$min:变量名`

**示例**：
```html
<max id="top_cnt" values="cell:背包物品表/铁剑/数量, cell:背包物品表/治疗药水/数量, cell:背包物品表/钢盾/数量" />
<min id="low_cnt" values="cell:背包物品表/铁剑/数量, cell:背包物品表/钢盾/数量, 5" />

库存最多的物品数量：$max:top_cnt。
库存最少且不超过 5 的基线数：$min:low_cnt。
```

→ **推导步骤**：

| 标签 | values 展开（从快照读数） | 取 max/min |
|-----|--------------------------|----------|
| `<max id="top_cnt">` | `cell:背包物品表/铁剑/数量` → **3**<br>`cell:背包物品表/治疗药水/数量` → **10**<br>`cell:背包物品表/钢盾/数量` → **1** | `max(3, 10, 1) = 10` → `top_cnt = 10` |
| `<min id="low_cnt">` | `cell:背包物品表/铁剑/数量` → **3**<br>`cell:背包物品表/钢盾/数量` → **1**<br>`5`（字面量） → **5** | `min(3, 1, 5) = 1` → `low_cnt = 1` |

> ℹ️ 带 `id` 的变量定义标签**执行后标签本身被替换为空字符串**（整行都没了），所以下方最终渲染结果只剩两行引用句。

→ **最终渲染结果**：
```
库存最多的物品数量：10。
库存最少且不超过 5 的基线数：1。
```

---

## 二、值替换变量（仅 SQLite 模式）

> 以下全部语法**只在 SQLite 模式生效**，原生模式下标签会原样保留。原因：它们都走 SQLite 引擎的 `executeQuery()`，原生模式下没有这个引擎。

### 2.1 ORM 查询：`{[db.表名.方法链]}`

```
你身上有 {[db.背包物品表.where('物品名称', '铁剑').get('数量')]} 把铁剑。
```

→ **执行结果**：
```
你身上有 3 把铁剑。
```

底层实现是一个 `Proxy`：`db.背包物品表` 返回一个 `TableQueryBuilder`，后续所有方法是链式调用，最后由**终结方法**决定输出形式。

#### 2.1.1 查询构建方法（返回 `TableQueryBuilder`，可继续链式）

| 方法 | SQL 等价 | 示例 |
|------|---------|------|
| `.where('列', '值')` | `列 = '值'` | `.where('姓名', '艾莉')` |
| `.where('列', '>', 数值)` | `列 > 数值`（`>` `>=` `<` `<=` `!=` `=`） | `.where('数量', '>', 2)` |
| `.where('列', null)` | `列 IS NULL` | `.where('过往经历', null)` |
| `.where('列', '!=', null)` | `列 IS NOT NULL` | `.where('过往经历', '!=', null)` |
| `.orWhere('列', '值')` | 把当前 AND 组封存为一个 OR 分支，开新的 AND 组 | 见下方 OR 示例 |
| `.whereIn('列', [值...])` | `列 IN (...)`（空数组 → 永假） | `.whereIn('类别', ['武器','消耗品'])` |
| `.whereNotIn('列', [值...])` | `列 NOT IN (...)`（空数组 → 不加条件） | `.whereNotIn('姓名', ['敌方首领'])` |
| `.whereBetween('列', 最小, 最大)` | `列 BETWEEN ... AND ...`（内部自动排序） | `.whereBetween('数量', 1, 5)` |
| `.whereNull('列')` | `列 IS NULL` | `.whereNull('持有的重要物品')` |
| `.whereNotNull('列')` | `列 IS NOT NULL` | `.whereNotNull('过往经历')` |
| `.whereLike('列', '模式')` | `列 LIKE '模式'`（`%` 任意字符，`_` 单字符） | `.whereLike('物品名称', '%药水%')` |
| `.groupBy('列')` | `GROUP BY 列` | `.groupBy('类别')` |
| `.having('表达式')` | `HAVING 表达式`（配合 `groupBy`） | `.having('COUNT(*) > 1')` |
| `.distinct()` | `SELECT DISTINCT` | `.distinct().list('类别')` |
| `.orderBy('列', 'ASC')` | `ORDER BY 列 ASC`（或 `'DESC'`） | `.orderBy('数量', 'DESC')` |
| `.limit(数量)` | `LIMIT n` | `.limit(5)` |
| `.offset(数量)` | `OFFSET n`（需配合 `limit`，内部若无 `limit` 会补 `LIMIT -1`） | `.limit(10).offset(20)` |

#### 2.1.2 终结方法（返回具体值，结束链式）

| 方法 | 返回类型 | 说明 |
|------|---------|------|
| `.get('列')` | `string \| number \| null` | 第一行指定列的值 |
| `.first()` | `Record<string,any> \| null` | 第一行所有列组成的对象 |
| `.list('列')` | `Array<string\|number>` | 某列所有行的值 |
| `.all()` | `Array<Record<string,any>>` | 所有行所有列 |
| `.count()` | `number` | `COUNT(*)` |
| `.sum('列')` / `.avg('列')` / `.max('列')` / `.min('列')` | `number` | 聚合函数 |
| `.exists()` | `boolean` | 是否存在至少一行 |
| `.value('SQL表达式')` | `string \| number \| null` | 在当前 WHERE 上下文里跑自定义 `SELECT <表达式>`，见下方示例 |
| `.toSQL()` | `string` | 生成的 SQL（调试用） |

#### 2.1.3 常见链式示例（每个都附执行结果）

**等值 + 比较组合（AND 语义）**：
```
{[db.重要角色表.where('是否离场', '否').where('姓名', '艾莉').get('过往经历')]}
```
→ **执行结果**：`与主角在迷雾森林结识`

---

**OR 语义**：
```
{[db.重要角色表.where('姓名', '艾莉').orWhere('姓名', '本').list('姓名')]}
```
→ **推导**：生成 SQL 类似 `SELECT 姓名 FROM 重要角色表 WHERE (姓名='艾莉') OR (姓名='本')`。快照里两条都命中 → 返回 `['艾莉', '本']` → N 行 × 1 列按 `, ` 拼接。

→ **最终渲染结果**：`艾莉, 本`

> `orWhere` 的作用是**把当前累积的 AND 组封装成一个 OR 分支**，然后开始新的 AND 组。

---

**IN / NOT IN / BETWEEN**：
```
铁剑/钢盾库存合计：{[db.背包物品表.whereIn('物品名称', ['铁剑','钢盾']).sum('数量')]}
不算消耗品的物品：{[db.背包物品表.whereNotIn('类别', ['消耗品']).list('物品名称')]}
数量在 3–10 之间的物品：{[db.背包物品表.whereBetween('数量', 3, 10).list('物品名称')]}
```
→ **执行结果**：
```
铁剑/钢盾库存合计：4
不算消耗品的物品：铁剑, 钢盾
数量在 3–10 之间的物品：铁剑, 治疗药水
```

> 推导：铁剑3 + 钢盾1 = 4；不是"消耗品"的是铁剑(武器)、钢盾(武器)；SQLite 的 `BETWEEN a AND b` 是**闭区间**，所以数量 ∈ [3, 10] 命中铁剑(3) 和 治疗药水(10)。

---

**LIKE**：
```
含"药水"字样的物品种类数：{[db.背包物品表.whereLike('物品名称', '%药水%').count()]}
```
→ **执行结果**：`含"药水"字样的物品种类数：2`（治疗药水、大药水）

---

**NULL / NOT NULL**：
```
没有过往经历记录的角色数：{[db.重要角色表.whereNull('过往经历').count()]}
有过往经历记录的角色名：{[db.重要角色表.whereNotNull('过往经历').list('姓名')]}
```
→ **执行结果**：
```
没有过往经历记录的角色数：1
有过往经历记录的角色名：艾莉, 敌方首领
```
（快照里只有"本"的过往经历是 null）

---

**分组聚合**：
```
{[db.背包物品表.groupBy('类别').having('COUNT(*) > 1').all()]}
```
→ **执行结果**（2 行 × M 列，按 `列名: 值, ...` 格式换行输出）：
```
类别: 武器, COUNT(*): 2
类别: 消耗品, COUNT(*): 2
```

> 数据集里：武器类 2 种（铁剑、钢盾），消耗品类 2 种（治疗药水、大药水），两组都 `COUNT(*) > 1`。

---

**去重**：
```
{[db.重要角色表.distinct().list('是否离场')]}
```
→ **推导**：快照 3 行重要角色的 `是否离场` 列值分别是 `否`（艾莉）、`否`（本）、`是`（敌方首领）。`distinct` 去重后只剩 2 个不同值 → 按 `, ` 拼接。

→ **最终渲染结果**：`否, 是`

---

**分页**：
```
{[db.纪要表.orderBy('编码索引', 'DESC').limit(1).offset(0).all()]}
```
→ **执行结果**（1 行 × M 列）：
```
row_id: 2, 时间跨度: 2024-03-10 起, 地点: 北境·雪原, 纪要: 遭遇巡逻队，与本会合, 概览: 会合本, 编码索引: AM0002
```

---

**`.value()` 自定义 SELECT 表达式**：
```
武器类物品的总"数量×2"：{[db.背包物品表.where('类别', '武器').value('SUM(数量) * 2')]}
所有物品数量总和 × 100：{[db.背包物品表.value('COUNT(*) * 100')]}
```
→ **执行结果**（武器类：铁剑3+钢盾1=4，×2=8；总记录数 4 行，×100=400）：
```
武器类物品的总"数量×2"：8
所有物品数量总和 × 100：400
```

#### 2.1.4 中英文名的自由混用

- 中文表名、中文列名会通过 **NameMapper**（由 DDL 注释自动构建）翻译为英文名
- `db.背包物品表` 和 `db.inventory` 等价
- `.where('物品名称', ...)` 和 `.where('item_name', ...)` 等价
- 长名称优先替换，字符串字面量被占位符保护，**不会误伤 `where('姓名','背包物品表里的神秘道具')` 这种字符串值**

示例：
```
{[db.inventory.where('item_name', '铁剑').get('quantity')]}
```
→ **执行结果**：`3`（和中文版等价）

---

### 2.2 ORM 静态方法：`db.expr / db.rand / db.calc / db.max / db.min`

这五个不是表的方法，是 `db` 对象上的特殊静态方法，**不能再跟 `.where()` 等链式调用**。

#### `db.expr("SQL表达式")` — 执行任意 SQL 表达式

底层把参数包成 `SELECT <expression>` 发给 SQLite 引擎，**只接受可以被 `SELECT` 求值的表达式**，不能写 UPDATE/INSERT/DELETE。

```
{[db.expr("3 + 5 * 2")]}
铁剑数量 × 2：{[db.expr("(SELECT 数量 FROM 背包物品表 WHERE 物品名称='铁剑') * 2")]}
铁剑 + 钢盾 × 2：{[db.expr("(SELECT 数量 FROM 背包物品表 WHERE 物品名称='铁剑') + (SELECT 数量 FROM 背包物品表 WHERE 物品名称='钢盾') * 2") as total]}
总值：$v:total
```
→ **推导步骤**：

| 原文 | SQLite 执行 `SELECT <expr>` 拿到的值 | 文本替换结果 |
|------|-----------------------------------|-----------|
| `{[db.expr("3 + 5 * 2")]}` | `3 + 5*2 = 13` | 整行替换为 `13` |
| `{[db.expr("(SELECT 数量 FROM 背包物品表 WHERE 物品名称='铁剑') * 2")]}` | 子查询返回铁剑数量 **3**，× 2 = `6` | 替换为 `6` |
| `{[db.expr("...") as total]}` | `3 + 1*2 = 5`（铁剑 + 钢盾 × 2） | 标签整体替换为**空字符串**，`total=5` 存进变量 |
| `$v:total` | 读变量 | 替换为 `5` |

→ **最终渲染结果**：
```
13
铁剑数量 × 2：6
铁剑 + 钢盾 × 2：
总值：5
```

> 💡 第三行只剩 `铁剑 + 钢盾 × 2：` 后面跟着空字符串（因为 `as` 把整个标签消掉了），所以看起来像是冒号后面什么都没有。

- 支持子查询、算术、聚合函数、`CASE WHEN` 等
- 中文表名/列名自动翻译
- 支持 `as 变量名`（见 [2.4 变量存储](#24-变量存储asvxxx)）

#### `db.rand(min, max)` — 生成随机整数

```
{[db.rand(1, 6)]}
{[db.rand(1, 100) as luck_roll]}
本次幸运值：$v:luck_roll
```
→ **执行结果**（随机，举一次：rand(1,6)=4、rand(1,100)=67）：
```
4

本次幸运值：67
```

- 底层是 `SELECT ABS(RANDOM()) % (max-min+1) + min`
- 闭区间 `[min, max]`，`min > max` 时自动交换
- 参数必须是**数字**，不能传 `$v:xxx`（传入前要先被外层解析为数字）

#### `db.calc("算术表达式")` — 引用 `$v:` 变量做算术

```
{[db.背包物品表.where('物品名称','铁剑').get('数量') as sword_cnt]}
{[db.背包物品表.where('物品名称','钢盾').get('数量') as shield_cnt]}
{[db.calc("$v:sword_cnt + $v:shield_cnt * 2") as combat_score]}

你的综合战力评分：$v:combat_score
```
→ **执行结果**（sword_cnt=3，shield_cnt=1，3 + 1*2 = 5）：
```
你的综合战力评分：5
```

- 先把 `$v:变量名` 替换为实际值，再交给 SQLite 的 `SELECT` 执行
- 任一 `$v:` 变量不存在 → 替换为 `NULL` → 整条失败返回 `null`
- 结果通过 `Number()` 强制转数字，无法转换时返回 `null`

#### `db.max(值1, 值2, ...)` / `db.min(值1, 值2, ...)`

```
{[db.max(3, 7, 1)]}
{[db.背包物品表.where('物品名称','铁剑').get('数量') as a]}
{[db.背包物品表.where('物品名称','治疗药水').get('数量') as b]}
{[db.max($v:a, $v:b) as highest]}
{[db.min($v:a, $v:b) as lowest]}
两者较大：$v:highest；较小：$v:lowest
```
→ **执行结果**（a=3、b=10）：
```
7

两者较大：10；较小：3
```

- 任意数量参数
- `$v:变量名` 在 ORM 表达式执行前被替换为实际值
- 参数支持数组展平：`db.max([1,2,3])` 等价于 `db.max(1,2,3)`
- 非数值参数会被过滤掉，全都过滤掉时返回 `null`

---

### 2.3 原生 SQL：`{[sql "SELECT ..."]}`

```
背包物品总数：{[sql "SELECT SUM(数量) FROM 背包物品表"]}
所有未离场的角色姓名：{[sql "SELECT 姓名 FROM 重要角色表 WHERE 是否离场='否'"]}
```
→ **执行结果**（3+10+1+2=16；未离场：艾莉、本）：
```
背包物品总数：16
所有未离场的角色姓名：艾莉, 本
```

**能做什么**：
- 执行任意 SQLite 可识别的 `SELECT` 语句（含子查询、JOIN、CASE WHEN、窗口函数、CTE 等）
- 中文表名/列名自动翻译
- 字符串用单引号包裹，单引号内的 `'` 要写成 `''`

**不能做什么**：
- ❌ **不能执行 `UPDATE` / `INSERT` / `DELETE` / `CREATE` 等变更语句** —— 底层走的是 `executeQuery()` 只读路径，这类语句会被引擎拒绝或返回空结果

**返回格式规则**（按查询结果自动判定）：

| 结果规模 | 返回文本形式 |
|---------|-------------|
| 0 行 | 空字符串 `''` |
| 1 行 × 1 列 | 直接返回那个值（如 `42`） |
| N 行 × 1 列 | 值用 `, ` 拼接（如 `艾莉, 本, 卡尔`） |
| N 行 × M 列 | 每行 `列名: 值, 列名: 值` 格式，行间换行 |

**JOIN 示例**（`{[sql ...]}` 真正强大的地方）：
```
{[sql "SELECT a.姓名, b.物品名称 FROM 重要角色表 a JOIN 背包物品表 b ON INSTR(a.持有的重要物品, b.物品名称) > 0 ORDER BY a.姓名, b.物品名称"]}
```
→ **执行结果**（艾莉持有"铁剑;治疗药水"；本持有"钢盾"）：
```
姓名: 艾莉, 物品名称: 治疗药水
姓名: 艾莉, 物品名称: 铁剑
姓名: 本, 物品名称: 钢盾
```

---

**CASE 分类查询**：
```
{[sql "SELECT 姓名, CASE WHEN CAST(SUBSTR(性别/年龄, INSTR(性别/年龄,'/')+1) AS INTEGER) > 40 THEN '长辈' WHEN CAST(SUBSTR(性别/年龄, INSTR(性别/年龄,'/')+1) AS INTEGER) > 20 THEN '成年' ELSE '少年' END AS 年龄段 FROM 重要角色表"]}
```
→ **执行结果**（艾莉 19→少年、本 30→成年、敌方首领 50→长辈）：
```
姓名: 艾莉, 年龄段: 少年
姓名: 本, 年龄段: 成年
姓名: 敌方首领, 年龄段: 长辈
```

> 注：列名"性别/年龄"带 `/`，作为标识符使用时 SQLite 会报错。实际工程中要用反引号/中括号包裹，或改用英文列名 `gender_age`。本示例仅用于演示 CASE 语义，生产中建议改写成：`{[sql "SELECT 姓名, CASE WHEN CAST(SUBSTR(gender_age, INSTR(gender_age,'/')+1) AS INTEGER) > 40 THEN '长辈' ... FROM 重要角色表"]}`。

---

**多列分组**：
```
{[sql "SELECT 是否离场, COUNT(*) AS 人数 FROM 重要角色表 GROUP BY 是否离场"]}
```
→ **执行结果**：
```
是否离场: 否, 人数: 2
是否离场: 是, 人数: 1
```

---

### 2.4 变量存储：`... as <变量名>`

任何 `{[db...]}` 或 `{[sql...]}` 都可以在结束方括号前加 `as 变量名`，**把结果存入变量，同时标签被替换为空字符串**：

```
{[db.背包物品表.where('物品名称','铁剑').get('数量') as sword_cnt]}
{[sql "SELECT COUNT(*) FROM 重要角色表 WHERE 是否离场='否'" as alive_cnt]}
你有 $v:sword_cnt 把铁剑，场上还有 $v:alive_cnt 位同伴。
```
→ **执行结果**（sword_cnt=3、alive_cnt=2）：
```
你有 3 把铁剑，场上还有 2 位同伴。
```

**规则**：
- 变量名只能 `[a-zA-Z_][a-zA-Z0-9_]*`（纯英文数字下划线，**不能中文**）
- 存储时会尝试 `Number()` 转换：能转数字就存数字，不能转就存字符串
- 变量**作用域是单条消息**：每次 `replaceDbSqlVariables` 调用开始时会清空所有变量（`clearDbSqlVariables()`）

**可以在后续 `{[db...]}` 表达式里引用**（执行前会被内联替换为字面量）：
```
{[db.calc("$v:sword_cnt * 10 + $v:alive_cnt") as power]}
总战力：$v:power
```
→ **执行结果**（3*10 + 2 = 32）：
```
总战力：32
```

---

### 2.5 `{[db...]}` 的括号嵌套规则

`{[db...]}` 的内容解析**不用正则**，而是用括号深度跟踪：

- `[` `]` 计方括号深度（起始深度为 1）
- `(` `)` 计小括号深度（只用来跳过里面的 `]`）
- 单引号 `'` 和双引号 `"` 内部的括号和引号都被保护
- 遇到 `bracketDepth === 0` 且下一个字符是 `}` 时，认为结束

**这意味着**：
```
{[db.背包物品表.whereIn('物品名称', ['铁剑', '钢盾', '[SP]神器']).count()]}
```
→ **执行结果**：`2`

（`[SP]神器` 在快照里不存在；命中的只有铁剑和钢盾。嵌套 `[ ]` 没有破坏外层标签解析。）

---

## 三、`<if>` 条件标签

### 3.0 总体结构

```html
<if 类型="表达式">条件成立时的内容</if>
<if 类型="表达式">条件成立时的内容<else>条件不成立时的内容</if>
```

**规则**：
- **类型**只允许 5 种：`seed` / `cell` / `cond` / `db` / `sql`（大小写不敏感，底层正则 `/i`）
- `<else>` 至多一个，取 `indexOf('<else>')` 的第一个
- **支持嵌套**，默认最大深度 10 层（可在 `promptTemplateSettings.maxNestingDepth` 调）
- 选中的分支内容会**先替换 `$v:`，再递归解析内部的嵌套 `<if>`**
- 类型名拼错（如 `<if IF="...">`）不会被识别，标签原样保留

**嵌套示例**：
```html
<if seed="战斗">
  <if cell="背包物品表/铁剑/数量 > 2">
    主角装备充足，状态良好。
  <else>
    铁剑库存告急，小心应对。
  </if>
</if>
```
→ **推导步骤**：
1. 外层 `<if seed="战斗">`：AI 回复正文 `主角在雪原上与黑暗教团的巡逻队展开了战斗...` 包含「战斗」→ **true**，进入内层
2. 内层 `<if cell="背包物品表/铁剑/数量 > 2">`：从快照读到铁剑数量 = **3**，`3 > 2` → **true**，取 if 分支

→ **最终渲染结果**：
```
主角装备充足，状态良好。
```

---

### 3.1 `<if seed="...">` — 关键词匹配

在**最新一条 AI 回复正文** + **推进数据（plotContent，即 `$6`）** 拼起来的文本里搜索关键词。

**表达式语法**：

| 语法 | 含义 | 示例 |
|------|------|------|
| `关键词` | 简单包含 | `<if seed="战斗">` |
| `A,B` | OR（任一命中即 true） | `<if seed="战斗,打架">` |
| `A&B` | AND（全部命中才 true） | `<if seed="战斗&主角">` |
| `!关键词` | 不包含才为 true | `<if seed="!魔法">` |
| `(A&B),C` | 括号分组 | `<if seed="(战斗&主角),感情">` |

**实现细节**：
- **大小写不敏感**（`toLowerCase()` 后比较）
- 匹配是**子串**匹配（`String.includes`）：`战斗` 会命中 "主角战斗到底"
- `!` 必须作为单个关键词的前缀，不能作为整体取反（`!(A,B)` 这种在 seed 表达式里**不支持**，需要用 `cond` 前缀）
- 检索文本 = `最新AI回复正文 + '\n' + 推进数据`

**示例**：
```html
<if seed="战斗,打架&!和解">[触发战斗事件]</if>
<if seed="(告白&夜晚),(牵手&海边)">[浪漫场景]<else>[普通场景]</if>
```

→ **执行结果**（AI 回复含"战斗"但没"打架&和解"这种组合；没有"告白"也没有"牵手"）：
```
[触发战斗事件]
[普通场景]
```

> 解析：
> - `战斗,打架&!和解` = `战斗 OR (打架 AND !和解)`。"战斗" 命中即整体为真。
> - `(告白&夜晚),(牵手&海边)` 两个分组都不满足 → else 分支。

---

### 3.2 `<if cell="表达式">`

比较表格单元格的值。

**表达式格式**：`<单元格引用> <运算符> <比较值>`

**运算符**：`>` `<` `>=` `<=` `==` `!=`。**全角运算符自动转半角**：`＞→>`、`＜→<`、`＝→==`、`≥→>=`、`≤/≦→<=`、`≠→!=`。

**单元格引用的真实匹配规则**（旧文档写错过，以这里为准）：

#### 三段式 `表名/行标识/列名`

优先走 `getCellValue_ACU(tableName, rowName, colName)`：
1. 按 `tableName` 精确匹配表
2. 按 `colName` 在**表头**里精确匹配列
3. 按 `rowName` 在**每一行的任意单元格**里精确匹配（**不是**只匹配首列）
4. 若失败，再尝试把 `rowName` 和 `colName` 互换（兼容用户写反顺序）

**示例**：
```html
<if cell="背包物品表/铁剑/数量 >= 3">铁剑库存充足。<else>铁剑库存不足。</if>
<if cell="重要角色表/艾莉/是否离场 == 否">艾莉在场。</if>
```
→ **执行结果**（铁剑数量=3、艾莉是否离场=否）：
```
铁剑库存充足。
艾莉在场。
```

---

#### 两段式 `表名/名字`

**比三段式更特殊**，要分清是行还是列：
1. 先看**首列**是否有单元格内容 = `名字`。如果有，把这一行的所有**非首列**单元格拿去和比较值做比较，**任一命中即 true**
2. 再看**表头**是否有 `名字` 这一列。如果有，把这一列的所有**数据行**单元格拿去和比较值比较，**任一命中即 true**
3. 两种都没找到：当 `!=` 时返回 `true`，其他运算符返回 `false`

**示例**：
```html
<!-- 匹配"数量"列，查整列是否有单元格 > 5 -->
<if cell="背包物品表/数量 > 5">存在库存超过 5 的物品。</if>

<!-- 匹配首列"row_id"列，数据行首列是数字 1/2/3/4，没有"铁剑"这个行标识；
     也不会匹配"物品名称"列（因为表头找"铁剑"找不到） → 走 fallback，!=ture/其他false -->
<if cell="背包物品表/铁剑 == 3">找到数量为 3 的铁剑。<else>没匹配到。</if>
```
→ **执行结果**：
```
存在库存超过 5 的物品。
没匹配到。
```

> 解析：
> - 第一个：数量列有 10 和 3，其中 10 > 5 → true
> - 第二个：`背包物品表/铁剑` 两段式中，首列 `row_id` 的值是 `1/2/3/4`，没有"铁剑"；表头里也没有"铁剑"这个列名。两者都找不到 → fallback 对 `==` 返回 false → 走 else。
> - **这就是两段式的坑**：你以为"铁剑"是行名，但首列是 `row_id` 不是"物品名称"。要严格匹配请用三段式 `背包物品表/铁剑/数量 == 3`。

---

**数值 vs 字符串比较**：
- 比较值能 `parseFloat` 成数字，且单元格值是数字类型 → 数值比较
- 否则 → 字符串比较（字典序）

---

### 3.3 `<if db="...">` — ORM 条件（仅 SQLite 模式）

内部用 `new Function('db', 'return ' + 表达式)` 直接让 JS 引擎跑你的链式调用。

```html
<!-- 表达式本身含比较运算符：直接返回布尔值 -->
<if db="db.背包物品表.count() > 2">物品超过 2 种。</if>
<if db="db.重要角色表.where('是否离场','否').count() >= 3">至少 3 位同伴在场。<else>在场同伴不足 3 位。</if>

<!-- 表达式返回单值：做 truthy 判断 -->
<if db="db.背包物品表.where('物品名称','铁剑').exists()">有铁剑。</if>

<!-- 省略 db. 前缀也可以 -->
<if db="背包物品表.count() > 0">有物品。</if>
```
→ **执行结果**（背包 4 种 > 2；未离场 2 人 < 3；铁剑存在；背包有物品）：
```
物品超过 2 种。
在场同伴不足 3 位。
有铁剑。
有物品。
```

**truthy 判断规则**（无比较运算符时使用）：
- `null` / `undefined` / `''` / `'false'` / `'0'` / `0` → false
- 其他 → true

---

### 3.4 `<if sql="...">` — 原生 SQL 条件（仅 SQLite 模式）

```html
<if sql="SELECT 1 FROM 背包物品表 WHERE 物品名称='铁剑'">有铁剑。</if>
<if sql="SELECT COUNT(*) FROM 重要角色表 WHERE 是否离场='否'">存在未离场的角色。</if>
<if sql="SELECT EXISTS(SELECT 1 FROM 背包物品表 WHERE 数量 > 5)">有库存超过 5 的物品。</if>
```
→ **执行结果**：
```
有铁剑。
存在未离场的角色。
有库存超过 5 的物品。
```

**判断规则**：对结果集的**第一行第一列**做 truthy 判断（规则同上）。无结果 → false。

---

### 3.5 `<if cond="...">` — 统一条件表达式（最强）

支持**所有前缀**和**完整的逻辑组合**。

#### 可用前缀

| 前缀 | 等价于 | 仅 SQLite 模式 |
|------|-------|:-------------:|
| `seed:<关键词表达式>` | `<if seed="...">`（但**被嵌入到 cond 里后 `&`/`,` 会冲突**，所以建议子表达式里不要再用 `,`/`&`，改用括号或拆分） | - |
| `cell:<单元格表达式>` | `<if cell="...">` | - |
| `random:<变量名> 运算 值` | 和 `$random:` 做数值比较 | - |
| `random:min-max 运算 值` | **内联随机数**：即用即生，用完就丢 | - |
| `calc:<变量名> 运算 值` | 数值比较 | - |
| `max:<变量名> 运算 值` | 数值比较 | - |
| `min:<变量名> 运算 值` | 数值比较 | - |
| `db:<ORM 表达式>` | `<if db="...">` | ✅ |
| `sql:<SQL 语句>` | `<if sql="...">` | ✅ |
| `v:<变量名>` | `$v:变量名` 的比较 / truthy | ✅ |
| *（无前缀）* | 当关键词处理，等价于 `seed:` | - |

#### 逻辑运算符和优先级

| 运算符 | 含义 | 优先级 |
|--------|------|:------:|
| `()` | 括号分组 | 最高 |
| `!` | 取反（一元前缀） | 高 |
| `&` | AND | 中 |
| `,` | OR | 最低 |

> **实现细节**：是手写的**递归下降解析器**，`parseOrExpr → parseAndExpr → parsePrimary`。括号会正确改变优先级。

#### 示例

**AND / OR / NOT**：
```html
<if cond="seed:战斗 & cell:背包物品表/铁剑/数量 > 2">战斗中且铁剑充足。</if>
<if cond="seed:魔法, seed:战斗">使用了魔法或正在战斗。</if>
<if cond="!seed:死亡">主角未死亡。</if>
<if cond="!db:背包物品表.where('物品名称','铁剑').exists()">没有铁剑。<else>有铁剑。</if>
```
→ **执行结果**（AI 回复含"战斗"、铁剑=3>2；AI 回复无"魔法"但有"战斗"；AI 回复无"死亡"；铁剑存在）：
```
战斗中且铁剑充足。
使用了魔法或正在战斗。
主角未死亡。
有铁剑。
```

---

**括号分组改变优先级**：
```html
<if cond="(seed:战斗 & cell:背包物品表/铁剑/数量 > 2), seed:逃跑">
  战斗且铁剑充足 或 正在逃跑
<else>
  既不战斗充足也没逃跑
</if>
```
→ **执行结果**（前半命中）：
```
战斗且铁剑充足 或 正在逃跑
```

---

**内联随机数（免去定义 `<random>`）**：
```html
<if cond="random:1-100 > 80">触发了 20% 概率的事件。<else>未触发稀有事件。</if>
```
→ **执行结果**（随机，举一次：掷到 65 ≤ 80）：
```
未触发稀有事件。
```

---

**跨语法混用**（SQLite 模式）：
```html
<if cond="db:背包物品表.count() > 2 & random:1-100 > 0">物品超过 2 种。</if>
{[db.背包物品表.where('物品名称','铁剑').get('数量') as sc]}
{[db.重要角色表.where('是否离场','否').count() as ac]}
<if cond="v:sc > 0 & v:ac >= 2">有铁剑且至少 2 位同伴在场。</if>
```
→ **执行结果**（背包 4 种>2、随机>0 永真；sc=3>0、ac=2≥2）：
```
物品超过 2 种。

有铁剑且至少 2 位同伴在场。
```

---

**`v:` 的 truthy 用法**（不带运算符时）：
```html
{[db.背包物品表.where('物品名称','铁剑').get('数量') as sc]}
<if cond="v:sc">铁剑数量非 0/空。<else>没有铁剑。</if>
```
→ **执行结果**（sc=3 truthy）：
```
铁剑数量非 0/空。
```

> ⚠️ `cond` 中的子表达式**不要在自身内部再带** `,` 或 `&`（那些会被当成外层逻辑运算符切割）。如果 seed 的关键词本身就要用 `,`/`&`，请拆到独立 `<if seed>` 里。

---

## 四、变量引用语法汇总

| 语法 | 含义 | 使用位置 |
|------|------|---------|
| `$random:<id>` | 读取 `<random id="">` 存的随机数 | 正文、`<calc expr>`、`<max/min values>`、`cond` 里的 `calc:/max:/min:` 引用 |
| `$calc:<id>` | 读取 `<calc id="">` 的结果 | 同上 |
| `$max:<id>` / `$min:<id>` | 读取 `<max>/<min>` 的结果 | 同上 |
| `$v:<变量名>` | 读取 `{[... as X]}` 存的值 | 正文、`<if cond="v:...">`、`{[db.calc("...")]}` 内部、`{[db.max/min($v:...)]}` 内部 |
| `{[db.表名.方法链]}` | ORM 查询替换 | 正文 |
| `{[db.expr/rand/calc/max/min(...)]}` | ORM 静态方法替换 | 正文 |
| `{[sql "SELECT..."]}` | 原生 SQL 查询替换 | 正文 |
| `{[... as 变量名]}` | 任何 db/sql 都可加 `as X` 存为变量，标签替换为空 | 正文 |

---

## 五、完整处理顺序（Pipeline）

**这是理解所有语法的关键**。每条提示词消息按下面顺序跑一遍：

```
1.  parseRandomTags_ACU         解析 <random>，无 id 的替换成数字，有 id 的存变量并抹掉标签
2.  replaceRandomVariables_ACU  替换文本中的 $random:xxx
3.  parseCalcTags_ACU           解析 <calc>，求值并存变量
4.  parseMaxTags_ACU            解析 <max>
5.  parseMinTags_ACU            解析 <min>
6.  replaceCalcVariables_ACU    替换 $calc:xxx
7.  replaceMaxVariables_ACU     替换 $max:xxx
8.  replaceMinVariables_ACU     替换 $min:xxx
9.  replaceDbSqlVariables       ──（仅 SQLite 模式，否则跳过）──
       9a. replaceDbExpressions    替换 {[db...]} 和 {[db... as X]}
       9b. replaceSqlExpressions   替换 {[sql "..."]} 和 {[sql "..." as X]}
       9c. replaceVarReferences    替换剩余的 $v:xxx
10. parseIfBlockRecursive_ACU   解析 <if>，选中分支后对分支内容先替换 $v:，再递归解析嵌套 <if>
```

**重要推论**：

- **`<calc expr="$v:xxx + 1" />` 不生效**：因为第 3 步 `parseCalcTags` 在第 9 步 `$v:` 替换**之前**就跑了，此时 `$v:` 还没替换成值，进 `evaluateCalcExpression` 会被当成非法字符拒绝。想用 `$v:` 做算术，请改用 `{[db.calc("$v:... + 1") as y]}`。
- **`<if cond="calc:dice > 3">` 要求 `<calc id="dice">` 写在 `<if>` 之前**（否则 calcVariables 里还没这个 id）。
- **每条消息变量都是独立的**：`_dbSqlVars` 在 `replaceDbSqlVariables` 入口处 `clearDbSqlVariables()` 清空；`randomVariables/calcVariables/maxVariables/minVariables` 在各自 `parseXxxTags` 入口处清空。消息与消息之间**不共享**变量。

---

## 六、真实内置表速查（写示例时直接套用）

> ⚠️ 示例里不要用 "角色属性表"、"事件表"、"地点表"、"装备表" 这种**不存在的表名**。也不要用 "主角信息表/主角/生命值" 这种**不存在的列**。下面是 8 张真实内置表的**完整列清单**：

| 中文表名 | 英文表名 | 全部列（中文） | 业务主键 |
|---------|---------|--------------|---------|
| 全局数据表 | `global_state` | 主角当前所在地点、当前时间、上轮场景时间、经过的时间 | `row_id = 1`（单行） |
| 主角信息表 | `protagonist_info` | 人物名称、性别/年龄、外貌特征、职业/身份、过往经历、性格特点 | `row_id = 1`（单行） |
| 主角技能表 | `protagonist_skills` | 技能名称、技能类型、等级/阶段、效果描述 | 技能名称 UNIQUE |
| 重要角色表 | `important_characters` | 姓名、性别/年龄、一句话介绍、外貌特征、持有的重要物品、是否离场、过往经历 | 姓名 UNIQUE |
| 背包物品表 | `inventory` | 物品名称、数量、描述/效果、类别 | 物品名称 UNIQUE |
| 任务与事件表 | `quests_events` | 任务名称、任务类型、发布者、详细描述、当前进度、任务时限、奖励、惩罚 | 任务名称 UNIQUE |
| 纪要表 | `chronicle` | 时间跨度、地点、纪要、概览、编码索引 | 编码索引 UNIQUE |
| 选项表 | `options` | 选项一、选项二、选项三、选项四 | `row_id = 1`（单行） |

> 💡 **注意**：主角信息表**没有**"生命值/攻击力/防御力"这种数值列；重要角色表**没有**"防御力"列。要用数值计算，请用背包物品表的"数量"、主角技能表的"等级/阶段"，或者自己建自定义表。

---

## 七、踩坑清单

### 坑 1：在原生模式里写 `{[db...]}` 或 `{[sql...]}`

**表现**：标签原样留在提示词里发给 AI，变成一串诡异的文本。
**原因**：`replaceDbSqlVariables` 开头 `if (!isSqliteMode()) return content`，完全跳过。
**解法**：切换到 SQLite 模式，或改用 `cell:` 引用。

### 坑 2：`<calc>` 结果不是预期的小数

**表现**：`<calc id="x" expr="10/3" />` 得到 `3` 而不是 `3.333...`。
**原因**：所有 calc 结果都 `Math.floor`。
**解法**：要小数就用 `{[db.expr("10.0/3.0")]}`，SQLite 不做向下取整。
→ **对照**：`<calc expr="10/3" />` → `3`；`{[db.expr("10.0/3.0")]}` → `3.3333333333333335`。

### 坑 3：`<random min="-5" max="5" />` 无效

**表现**：标签原样保留。
**原因**：正则 `/min\s*=\s*"(\d+)"/` 只接受非负整数字面量。
**解法**：用 `{[db.expr("ABS(RANDOM()) % 11 - 5")]}`，得到 `[-5, 5]` 区间的随机整数。

### 坑 4：`{[sql "UPDATE ..."]}` 没效果

**原因**：`{[sql ...]}` 只走 `executeQuery()`（只读），SQLite 的 UPDATE/INSERT/DELETE 要走 `executeMutation()`。模板变量系统**故意不允许变更**，变更只能由 AI 通过 `<tableEdit>` 触发。
**解法**：把变更写进 `<tableEdit>`，模板变量只用来读取。

### 坑 5：变量名写成中文

**表现**：`{[db.背包物品表.count() as 物品数]}` 不生效。
**原因**：`as` 后面正则限定 `[a-zA-Z_][a-zA-Z0-9_]*`。`$v:` / `$random:` / `$calc:` / `$max:` / `$min:` 同样。
**解法**：变量名用英文。

### 坑 6：`<if cond="seed:A,B & cell:...">` 被错误切割

**表现**：`,` 和 `&` 被外层解析器当成运算符，seed 表达式被拆成 `seed:A` 和 `B`，后者没前缀被当关键词。
**原因**：cond 的词法切分不理解 seed 子表达式里的 `,`/`&` 是"seed 内部"的。
**解法**：拆成两个 `<if seed>`，或把 seed 子表达式改写成只含一个关键词的形式，复杂逻辑放到外层 cond 上：
```html
<!-- 错 -->
<if cond="seed:A,B & cell:xxx/yyy > 10">...</if>

<!-- 对：把 seed 的 OR 用 cond 的 , 表达 -->
<if cond="(seed:A, seed:B) & cell:xxx/yyy > 10">...</if>
```

### 坑 7：两段式 cell 引用行为反直觉

**表现**：`<if cell="背包物品表/铁剑 == 3">` 看起来像"铁剑这一行中数量是否为 3"，实际结果却是 false。
**原因**：两段式只在**首列**或**表头**里找"铁剑"。背包物品表首列是 `row_id`（值是 1/2/3/4），表头是 `物品名称/数量/...`，两者都找不到"铁剑"。
**解法**：用三段式 `<if cell="背包物品表/铁剑/数量 == 3">`。

### 坑 8：DDL 注释缺失 → 中文名翻译失败

**表现**：SQLite 模式下 `{[db.自定义表.where('中文列', '值').get('另一列')]}` 报错或返回空。
**原因**：NameMapper 是从 DDL 注释（`-- 中文列名`）构建的。缺少注释的列，中文→英文映射就没建立。
**解法**：建表时**每列都写中文注释**，详见《自定义表建表指南》。

### 坑 9：`$v:xxx` 在 `<calc expr>` 里用

**表现**：整个 `<calc>` 解析失败，变量未定义。
**原因**：`<calc>` 在处理顺序第 3 步，`$v:` 在第 9c 步才替换。顺序不对。
**解法**：
- 方案 A：用 `{[db.calc("$v:xxx + 1") as y]}` 代替
- 方案 B：把要用的值先通过 `<calc>` 或 `cell:` 路径拿到，别跨系统混用

---

## 附：最小可运行演示（SQLite 模式）

```html
<!-- 1. 生成一次随机数 -->
<random id="luck" min="1" max="100" />

<!-- 2. 读取当前铁剑数，存为 $v:sword -->
{[db.背包物品表.where('物品名称', '铁剑').get('数量') as sword]}

<!-- 3. 条件判断 -->
<if cond="v:sword > 0 & random:luck > 50">
  [提示 AI] 可触发"铁剑突刺"特技（当前铁剑数：$v:sword，幸运：$random:luck）
<else>
  <if cond="random:luck > 80">
    [提示 AI] 触发罕见的空手反击动画。
  <else>
    [提示 AI] 本轮无特殊触发，按常规战斗推进。
  </if>
</if>

<!-- 4. 可选：塞入统计信息 -->
[战场统计] 未离场同伴：{[db.重要角色表.where('是否离场','否').count()]} 位；
背包总物品：{[sql "SELECT SUM(数量) FROM 背包物品表"]} 件。
```

→ **执行结果**（举一次具体的 luck=72 > 50 的情况；sword=3；未离场 2 位；总物品 16 件）：
```
  [提示 AI] 可触发"铁剑突刺"特技（当前铁剑数：3，幸运：72）


[战场统计] 未离场同伴：2 位；
背包总物品：16 件。
```

> luck 换一次就可能走到 else 分支。三分支的实际命中结果：
> - `luck > 50` → 第一条提示
> - `30 < luck ≤ 50` 且 sword > 0 → 进第二个分支，再看是否 `luck > 80`，否则"本轮无特殊触发"  
>   实际 `luck ≤ 50` 时第一个外层条件 `v:sword > 0 & random:luck > 50` 为 false，走外层 else 的嵌套 if
> - `luck > 80` 命中「空手反击」
> - 其他 → 「本轮无特殊触发」

