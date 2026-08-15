# QQ v2 在 Tauri Tavern(TT) 上无法生成回复的问题报告

> 面向玉子手机(st-yuzi-phone)作者的兼容性反馈，附带一份已在本机验证可用的临时修复方案及其已知局限。

## 一、环境与现象

| 项 | 值 |
|---|---|
| 宿主 | Tauri Tavern Client（TT，Rust 重写的 SillyTavern 桌面客户端） |
| WebView 源 | `http://tauri.localhost` |
| 插件 | st-yuzi-phone（玉子手机）`2.0.0`，QQ 模块 `modules/qq-v2` |
| 对照 | 原版 SillyTavern（浏览器）一切正常 |

**现象**：在 QQ 里发消息后，会话一直停在"运行中"状态（加载指示持续转），**永远不发网络请求**，等十几分钟也不会变成失败/重试状态。TT 日志里没有任何 `llm-api-*.json` 请求记录（即请求从未到达 TT 的 LLM 代理层），也不报错。

原版酒馆里同样的插件与预设完全正常，能正常生成回复。

## 二、根因

QQ 在**每次生成之前**都会做一次世界书 dry-run 扫描，调用宿主的 `context.getWorldInfoPrompt(...)`：

- 入口：`resolveQQV2WorldbookContext()`（`modules/qq-v2/prompt/worldbook-context.js`）
- 实际调用点：`modules/qq-v2/prompt/st-worldbook-context.js:90`

```js
await context.getWorldInfoPrompt(scanChat(people, history), maxContextOf(context), true);
```

该调用位于 QQ 请求管线的**发请求之前**（`backend.generate` → `fetch` 尚未执行）。在 TT 中，`getWorldInfoPrompt` 是 TT 重写前端通过 `getContext()` 模拟提供的函数，它：

1. **会永久挂起**（不 resolve 也不 reject），把整个 `executeManual` 卡死在等待世界书扫描这一步，导致 `fetch` 永远没机会执行——这解释了"无请求、无日志、无超时"。
2. 部分场景下会**抛 `TypeError: Cannot read properties of undefined (reading 'trigger')`**（用户手动停止后从 TT 日志 `ERROR frontend:` 中观察到）。`trigger` 是世界书"触发词"相关字段，指向 TT 世界书模拟在读某个 undefined 的条目字段。

辅助因素：插件的错误处理把失败吞进内部状态，UI 只在消息旁显示一个极小的 ↻ 重试按钮、不展示错误文本，部分路径（`isCurrentEntry` 过期）直接静默 return，所以从用户视角"什么都不发生、也不报错"。

## 三、修复方案（本机已应用并验证可用）

核心思路：**世界书扫描失败/挂起不应阻塞聊天**，同时给 TT 提供一条可用的世界书读取通路。

### 3.1 超时 + 直读回退（`modules/qq-v2/prompt/worldbook-context.js`）

- 对宿主 dry-run 加 **5 秒超时**（`withTimeout`）。
- 新增 `directScan()` 回退：用宿主的 `getCharWorldbookNames('current')` 拿到当前角色绑定的世界书，再用 `getWorldbook(name)` 直接读出条目，自行做触发词匹配。
- 用 `Promise.any([hostScan, directScanPromise])` 竞速：
  - 原版酒馆：`getWorldInfoPrompt` 毫秒级完成 → 高保真扫描胜出，行为不变。
  - TT：`getWorldInfoPrompt` 挂起/抛错 → 约 **800ms 后**直读扫描胜出，世界书内容照常注入。
- `directScan` 兼容两种条目格式：
  - 经典 SillyTavern：`key` / `keysecondary`（逗号分隔）
  - TT：`strategy.keys` / `strategy.type`（`constant` 蓝灯 / `selective` 绿灯）

关键代码：

```js
async function dryRun(runDryRun, request, source) {
    const directScanPromise = (async () => {
        await sleep(DIRECT_SCAN_DELAY_MS);          // 800ms
        return directScan(request.people, request.history);
    })();
    if (typeof runDryRun !== 'function') return directScanPromise;
    try {
        const hostScan = withTimeout(runDryRun({ ... }), DRY_RUN_TIMEOUT_MS); // 5s
        const result = await Promise.any([hostScan, directScanPromise]);
        return asEntries(result).map(e => normalizeEntry(e, source)).filter(Boolean);
    } catch (error) {
        return [];
    }
}
```

### 3.2 失败原因可见化（`modules/qq-v2/ui/app.js` + `styles/phone-base/12-qq-app.css`）

请求失败时，在 ↻ 重试按钮下方直接展示 `request.error` 文本，避免"无报错"的静默吞错。

## 四、现有方案的已知问题与局限

### 4.1 直读扫描的保真度不足（最主要）

`directScan` 只实现了**基础蓝灯/绿灯关键字子串匹配**，未实现 ST 世界书的以下语义：

- 概率 `probability` / `useProbability`
- 递归 `recursion`（`prevent_incoming` / `prevent_outgoing` / `delay_until`）
- 黏性 `sticky`、冷却 `cooldown`、延迟 `delay`
- 向量化 `strategy.type === 'vectorized'`
- 次要关键字逻辑 `keys_secondary`（`and_any` / `and_all` / `not_all` / `not_any`）
- 扫描深度 `scan_depth`
- 插入位置/深度排序的精确还原（`position.type` / `order`）

即：**关键字触发的简单条目和常量条目能正常命中，复杂条目会丢失或行为不一致。**

### 4.2 世界书来源不完整

`directScan` 只读**角色卡绑定**的世界书（`getCharWorldbookNames`）。未覆盖：

- 全局世界书 `getGlobalWorldbookNames`
- 聊天文件绑定世界书 `getChatWorldbookName`

（TT 的 API 文档中这三种都存在，`sillytavern-api.txt` 有定义。）

### 4.3 每次生成的固定延迟

TT 上由于宿主扫描永远不返回，每次生成都要等到 800ms 竞速超时后才用直读结果。聊胜于无，但并非零成本。

### 4.4 其余小问题

- **RegExp 触发词**：`String(RegExp)` 会得到 `/pattern/flags`，无法与文本正确子串匹配。
- 大小写不敏感匹配未做词边界/局部化处理，与 ST 原生匹配有细微差异。
- 挂起的 `getWorldInfoPrompt` 会让 `st-worldbook-context.js` 里的串行队列 `pending` 永久卡住，`capture` 事件监听会逐条泄漏（虽然不影响直读回退的出词，但属于资源泄漏）。

## 五、给作者的建议

1. **插件侧**（建议采纳）：将"世界书扫描"从"阻塞请求的硬依赖"改为"带超时 + 回退的非阻塞步骤"，即本文第三节的做法——无论宿主世界书接口好坏，聊天都不应卡死。
2. **插件侧（可选增强）**：把 TT 已文档化的 `getWorldbook` / `getCharWorldbookNames` / `getGlobalWorldbookNames` 等作为**一等公民数据源**（而非仅回退），并补全 4.1/4.2 中缺失的匹配语义，可显著提升 TT 上的世界书还原度。

## 六、相关文件清单

- `modules/qq-v2/prompt/st-worldbook-context.js` — 唯一调用 `getWorldInfoPrompt` 处
- `modules/qq-v2/prompt/worldbook-context.js` — 超时 + 直读回退（本次修改）
- `modules/qq-v2/application/production-runtime.js` — 组装 gateway、注入 `runDryRun`
- `modules/qq-v2/host/adapter.js` — `readRawContext()`
- `modules/integration/context-bridge.js` — 解析 `getContext()`（`getWorldInfoPrompt` 来源）
- `modules/integration/tavern-helper-bridge.js` — `getCharWorldbookNames` / `getWorldbook`（回退数据源）
- `modules/qq-v2/ui/app.js`、`styles/phone-base/12-qq-app.css` — 失败原因可见化
