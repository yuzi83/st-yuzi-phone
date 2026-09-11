# 玉子美化 Runtime API v1

> 本文保留基础页面合同；主题、字体、受控生图与新版声明请同时读取 [宿主能力合同](./host-capabilities.md)。不要依据旧版“无 AI”条目否定已公开的生图动作，也不要把打包版本当成页面 context.apiVersion。

本文档是玉子美化预设作者的运行时接口合同。它描述兼容宿主在激活一个 `yuzi-beautify-preset` Bundle 时提供的能力，不描述数据库插件、酒馆助手或 SillyTavern 原生扩展 API。

配套类型声明见 [`yuzi-beautify-runtime-v1.d.ts`](./yuzi-beautify-runtime-v1.d.ts)。

## 1. 版本与入口

Runtime API 版本固定为 `1`。每个预设项必须用 `entry.mount` 指向一个 JavaScript 文本文件，最终 Bundle 中必须存在以下显式 ESM 导出之一：

```js
export function mount(context) {}
```

```js
export async function mount(context) {}
```

不接受 `entry.js`、`scriptMode`、`export const mount = ...`、默认导出或只做 re-export 的入口。

`mount(context)` 可以返回：

- `undefined` 或其他非函数值：没有作者清理函数；
- 同步清理函数；
- 解析为上述两类值的 Promise。

推荐返回幂等的同步清理函数。宿主会调用它，但不会等待清理函数返回的 Promise。

## 2. `context` 总览

`context` 自身经过 `Object.freeze`，包含以下只读成员：

| 成员 | 类型 | 用途 |
| --- | --- | --- |
| `apiVersion` | `1` | 运行时 API 版本 |
| `root` | `HTMLElement` | 当前预设实例唯一的页面根节点 |
| `signal` | `AbortSignal` | 页面失效或实例销毁信号 |
| `getState()` | `() => State` | 读取当前单表冻结快照 |
| `subscribe(listener)` | `() => unsubscribe` | 订阅后续快照 |
| `resolveAsset(path)` | `(path: string) => string` | 把 Bundle 包路径解析为实例期 Blob URL |
| `presetAssets` | `PresetAssetsApi` | 读取、保存或删除当前预设的用户图片 |
| `actions` | `Actions` | 四个受控宿主导航动作 |

预设页面默认在 `context.root` 内建立。用户明确要求的宿主 DOM 交互可以作为当前 item 的额外宿主依赖访问 `root` 外的指定选择器，但不得把这些选择器、类名或内部路由结构当成 Runtime v1 的通用能力。

## 3. 冻结状态快照

`context.getState()` 返回：

```js
{
  version: 0,
  sheetKey: "sheet_square",
  tableName: "广场表",
  headers: ["row_id", "帖子标题"],
  rows: [[1, "示例帖子"]],
  route: "table-special:sheet_square",
  canPrevious: true,
  canNext: false
}
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `version` | 当前实例内的单调版本号；初始通常为 `0`，接受一次表更新后递增 |
| `sheetKey` | 当前表的宿主内部键；仅用于识别，不构成跨表访问能力 |
| `tableName` | 当前表显示名 |
| `headers` | 表头；空表头会被规范为 `列1`、`列2` 等 |
| `rows` | 不含表头的数据行，只保留数组行 |
| `route` | 创建此页面快照时的宿主路由字符串；不要解析其内部格式 |
| `canPrevious` | 当前是否存在可导航的上一张表 |
| `canNext` | 当前是否存在可导航的下一张表 |

快照在交给作者前会复制并递归 `Object.freeze`。对象本身、`headers`、`rows`、每一行以及单元格内可遍历对象都不可修改。不要向快照写值、排序原数组或把它当作持久化存储；需要派生数据时创建自己的副本。

## 4. `subscribe(listener)`

订阅不会立即补发当前状态。标准用法是先调用一次 `getState()`，再订阅后续更新：

```js
const render = state => {
  // 只读使用 state
};

render(context.getState());
const unsubscribe = context.subscribe((state, meta) => {
  render(state);
  console.debug(meta.reason);
});
```

监听器参数：

- `state`：新的递归冻结快照；
- `meta.reason`：`"table-data"` 或 `"navigation-state"`。当前正式宿主在表数据刷新时发布 `table-data`；`navigation-state` 是 Runtime 控制器保留的原因值。

返回的 `unsubscribe()` 可重复调用。实例销毁后，订阅自动失效；传入非函数或在已销毁上下文中订阅会得到空操作退订函数。某个监听器抛错不会阻止其他监听器，但宿主也不会把该异常回传给作者。

## 5. `resolveAsset(path)`

`resolveAsset()` 接受最终 Bundle `files` 中的精确规范化包路径，返回在当前实例存活期间有效的 Blob URL：

```js
const avatarUrl = context.resolveAsset("assets/avatar.png");
image.src = avatarUrl;
```

规则：

- 参数使用 `/` 分隔的包内相对路径，例如 `assets/avatar.png`；
- 不要把 `?query` 或 `#fragment` 放进传给 `resolveAsset()` 的路径；需要时在返回 URL 后自行追加；
- 路径不存在时同步抛出 `Error`；
- 同一路径在同一实例内复用同一个 Blob URL；
- 实例销毁时宿主会撤销全部 URL，禁止跨实例缓存；
- 入口 HTML 的 `src`、`href`、`poster`、`srcset` 和入口 CSS 的 `url()` 会由宿主按各自入口路径自动改写；脚本中动态设置资源时使用 `resolveAsset()`。

## 6. `presetAssets`

`presetAssets` 是 Runtime v1 的必需能力，用资源槽保存当前预设的用户图片。页面不需要知道文件名、目录或宿主存储实现：

```js
const currentUrl = await context.presetAssets.getUrl('protagonist-avatar');
const savedUrl = await context.presetAssets.save('protagonist-avatar', imageBlob);
await context.presetAssets.delete('protagonist-avatar');
```

接口定义：

```ts
interface PresetAssetsApi {
  getUrl(slot: string): Promise<string | null>;
  save(slot: string, image: Blob): Promise<string>;
  delete(slot: string): Promise<void>;
}
```

规则：

- `slot` 是当前预设内由页面自行约定的非空字符串；同一个槽只保存一张图片；
- `getUrl()` 在槽为空时返回 `null`，存在图片时返回当前页面实例可用的 Blob URL；
- `save()` 接受 `Blob`，替换同槽旧图片并返回新 Blob URL；Runtime v1 不额外规定图片格式、尺寸或槽名格式；
- `delete()` 删除同槽图片；槽不存在时也正常完成；
- 替换、删除或页面实例销毁后，旧 URL 会失效；不得把 Blob URL 写入表格或跨页面实例缓存；
- 页面失效后调用这些方法会以普通 `Error` 拒绝 Promise；
- 制作期预览只把图片保存在当前预览 Runtime 的内存中，不写入项目源码、表格或 Bundle。

`presetAssets` 只提供当前预设自己的图片槽，不开放宿主数据库、文件路径或任意文件读写。

## 7. `actions`

四个动作均返回 `Promise<ActionResult>`：

```js
const result = await context.actions.nextTable();
if (!result.ok) {
  console.warn(result.status, result.message);
}
```

| 动作 | 用途 |
| --- | --- |
| `back()` | 请求返回宿主上一层页面 |
| `previousTable()` | 请求导航到表目录中的上一张表 |
| `nextTable()` | 请求导航到表目录中的下一张表 |
| `editCurrentTable()` | 请求打开当前表的宿主通用编辑页 |

动作结果的公共字段：

```js
{
  ok: true,
  action: "nextTable",
  status: "navigated",
  fromRoute: "table-special:sheet_square",
  targetRoute: "table-special:sheet_forum"
}
```

| `status` | `ok` | 含义 |
| --- | --- | --- |
| `navigated` | `true` | 宿主已接受导航请求；通常附带 `targetRoute` |
| `stale` | `false` | 当前实例已不是活动页面，动作被拒绝 |
| `unavailable` | `false` | 当前方向没有目标或宿主无法执行该动作 |
| `failed` | `false` | 动作执行抛错；附带 `errorCode` 和 `message` |

当前 `failed` 结果使用 `errorCode: "navigation_failed"`。作者应按 `ok/status` 分支，不要只依赖错误文本。`targetRoute` 是诊断信息，不是供预设自行导航或解析的稳定路由协议。

同一种动作在前一次尚未完成时再次调用，会复用同一个进行中的 Promise。动作只负责导航，不授予数据库写权限。

## 8. 生命周期、10 秒期限与 Abort

一次正常实例依次经历：

1. 宿主建立 `root`、初始冻结快照、资源运行时和动作对象；
2. 通过 Blob URL 导入最终 ESM mount 文件；
3. 调用并等待 `mount(context)`；
4. 激活表更新订阅；
5. 路由离开、页面被替换、预设失效或同表新实例创建时销毁。

模块导入和 `mount(context)` 调用各自有默认 **10 秒**期限，不是二者合计 10 秒。作者不能修改这个期限。

`context.signal` 在实例销毁时中止，也可能在导入或挂载阶段提前中止。作者应把它传给自己创建的可取消任务，并在清理函数中移除 DOM 监听器、定时器、观察器和订阅。

销毁顺序的作者可见部分是：停止后续状态发布 → `signal.abort()` → 调用作者 disposer → 移除宿主资源和根节点。作者 disposer 至多调用一次，异常会被宿主隔离。

如果 `mount()` 的 Promise 在超时或 Abort 之后才解析，并返回一个函数，宿主仍会把这个晚到的 disposer 立即调用一次，避免迟到资源泄漏。

## 9. 错误行为

| 场景 | 宿主行为 |
| --- | --- |
| Bundle 或入口合同无效 | 拒绝导入或激活该项 |
| 模块缺少有效 `mount(context)` | 挂载失败 |
| 模块导入、mount 抛错/拒绝/超时 | 销毁未提交实例，并回退到宿主原始表页面 |
| `resolveAsset()` 路径不存在 | 向作者代码同步抛错 |
| `presetAssets` 参数无效或页面已失效 | Promise 以普通 `Error` 拒绝 |
| subscribe 监听器抛错 | 隔离该异常，继续通知其他监听器 |
| disposer 抛错 | 隔离异常并继续宿主清理 |
| action 内部失败 | Promise 正常解析为 `status: "failed"` 的结果 |

Runtime v1 没有作者错误事件、日志接口或重试接口。作者应在自己的页面内提供必要的降级 UI，并避免把异常当作控制流。

## 10. 安全与隔离边界

玉子美化预设不是安全沙箱：

- JavaScript 在宿主页面同源环境执行；只导入可信来源的 Bundle；
- HTML 和表格数据不会替作者自动做业务级转义；使用 `textContent`，或在写入 `innerHTML` 前完整转义；
- CSS 不会自动加作用域，也不在 Shadow DOM 中；所有选择器都应收窄到预设自己的根 class；
- 不使用 `eval`、`new Function` 或 `iframe`。Runtime v1 本身不保证宿主 DOM 结构；但用户明确要求且当前 item 已记录宿主依赖时，可以按指定选择器访问宿主 DOM，并必须处理元素不存在、页面尚未加载和宿主改版等降级情况；这类页面不能把宿主 DOM 当作所有 Runtime 宿主都提供的通用能力。
- 最终 mount 模块不支持 module imports、`import.meta.url` 或 JavaScript 相对 `fetch`；
- 最终 CSS 不支持 `@import`；制作项目中的本地 `@import` 必须在打包阶段内联。

## 11. 明确不提供的能力

Runtime API v1 **不提供**：

- 读取当前表之外的其他表；
- 数据库增删改查、SQL、写表或删除行；
- AI 生成、代理预设、消息发送；
- 世界书读写；
- 玉子手机内部对象、内部事件、路由函数或生命周期回调；
- `window.AutoCardUpdaterAPI`；
- `window.TavernHelper`；
- `SillyTavern.getContext()`。

这些对象属于不同生态。预设若直接调用它们，就引入了 Runtime v1 合同之外的额外依赖，不能再宣称仅依赖玉子美化 API。

## 12. 完整最小模板

```js
export function mount(context) {
  const { root, signal } = context;
  let disposed = false;

  const title = document.createElement("h1");
  const list = document.createElement("ul");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "下一张";
  root.replaceChildren(title, list, next);

  const render = state => {
    if (disposed) return;
    title.textContent = state.tableName;
    list.replaceChildren(...state.rows.map(row => {
      const item = document.createElement("li");
      item.textContent = row.map(value => String(value ?? "")).join(" · ");
      return item;
    }));
    next.disabled = !state.canNext;
  };

  const onNext = async () => {
    const result = await context.actions.nextTable();
    if (!result.ok && result.status === "failed") {
      console.error(result.errorCode, result.message);
    }
  };

  next.addEventListener("click", onNext);
  const unsubscribe = context.subscribe(render);
  render(context.getState());

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    next.removeEventListener("click", onNext);
    unsubscribe();
    signal.removeEventListener("abort", dispose);
  };

  signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
```
