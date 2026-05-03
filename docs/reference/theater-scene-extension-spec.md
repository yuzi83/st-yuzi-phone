# Theater Scene 扩展规范

本文档定义小剧场 scene 的接入契约。目标不是把“广场 / 论坛 / 直播”再硬编码一遍，而是让新增类似小剧场表时，只需要新增 scene module、scene 样式，并在注册表与样式入口登记。

## 1. 文件结构

新增一个小剧场入口时，按以下结构接入：

```text
modules/phone-theater/scenes/new-scene.js
styles/phone-theater/new-scene.css
```

然后登记：

- 在 [`modules/phone-theater/scenes/index.js`](../../modules/phone-theater/scenes/index.js) 导入并加入 `RAW_THEATER_SCENES`。
- 在 [`styles/phone-theater/index.css`](../../styles/phone-theater/index.css) 增加 `@import url('./new-scene.css');`。
- 如有新增约束，更新 [`scripts/check-theater-contract.cjs`](../../scripts/check-theater-contract.cjs)。

不要修改 [`modules/phone-theater/data.js`](../../modules/phone-theater/data.js)、[`modules/phone-theater/templates.js`](../../modules/phone-theater/templates.js)、[`modules/phone-theater/delete-service.js`](../../modules/phone-theater/delete-service.js)、[`modules/phone-theater/render.js`](../../modules/phone-theater/render.js) 或 [`modules/phone-theater/interactions.js`](../../modules/phone-theater/interactions.js) 来塞场景分支。那不是扩展，是重新制造硬编码债务。

## 2. Scene module 必填契约

每个 scene module 必须导出一个冻结对象，例如：

```js
export const newScene = Object.freeze({
    id: 'newScene',
    appKey: '__theater_new_scene',
    name: '新场景',
    iconText: '新',
    iconColors: ['#8E8E93', '#636366'],
    orderNo: 4,
    title: '新场景',
    subtitle: '展示说明',
    emptyText: '暂无内容',
    styleScope: 'new-scene',
    primaryTableRole: 'items',
    tables: Object.freeze({
        items: '新场景主表',
        details: '新场景附表',
    }),
    fieldSchema: Object.freeze({
        items: Object.freeze({ identity: '项目ID' }),
        details: Object.freeze({ parentRef: '关联项目ID' }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/new-scene.css',
        requiredClasses: ['phone-theater-new-scene-page'],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
    bindInteractions,
});
```

字段含义：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | scene 类型唯一标识，会生成 `theater:${id}` 路由。 |
| `appKey` | 是 | 首页虚拟 app key，必须全局唯一。 |
| `name` / `title` / `emptyText` | 是 | 首页、导航栏和空态显示文案。 |
| `iconText` / `iconColors` / `orderNo` | 是 | 首页入口图标与排序。 |
| `styleScope` | 是 | 页面根节点会输出 `data-theater-style-scope`，同时建议 CSS 使用 `data-theater-scene` 作用域。 |
| `primaryTableRole` | 是 | 决定 scene 是否可用的主表 role。主表缺失时不会生成虚拟入口。 |
| `tables` | 是 | role 到表名的映射。一个表名只能属于一个 scene。 |
| `fieldSchema` | 建议 | 描述身份字段、外键字段和业务字段，供文档与契约检查使用。 |
| `contract` | 建议 | 描述样式文件和关键 class，供契约脚本检查。 |
| `buildViewModel` | 是 | 从 resolved tables 构建渲染所需 content。 |
| `collectDeletableKeys` | 是 | 返回当前页面所有可删除实体的 typed delete key。 |
| `deleteEntities` | 是 | 执行主表删除与附表级联。 |
| `renderContent` | 是 | 返回 scene 内容 HTML。 |
| `bindInteractions` | 可选 | 场景专属交互，例如直播弹幕暂停。 |

## 3. 数据读取与 ViewModel

`buildViewModel(resolved, helpers)` 接收：

- `resolved.scene`：当前 scene definition。
- `resolved.tables`：按 `tables` role 解析出的表索引对象。
- `resolved.primaryTable`：主表。
- `helpers`：通用工具函数，包括字段读取、文本归一化、分号拆分、typed delete key 等。

推荐直接从 core helper 导入：

- [`getCellByHeader`](../../modules/phone-theater/core/table-index.js)
- [`mapTheaterRows`](../../modules/phone-theater/core/table-index.js)
- [`normalizeText`](../../modules/phone-theater/core/table-index.js)
- [`resolveRowIdentity`](../../modules/phone-theater/core/table-index.js)
- [`splitSemicolonText`](../../modules/phone-theater/core/table-index.js)
- [`buildTheaterDeleteKey`](../../modules/phone-theater/core/delete-key.js)

辅助表缺失时必须降级为空数组，不得抛错。主表缺失由核心入口处理。

## 4. 删除规则

删除规则必须满足：

1. 主表实体必须使用 typed delete key：`role:rowIndex:encodedIdentity`。
2. 主表删除必须同时匹配 `role`、`rowIndex`、`identity`。
3. 禁止使用裸自然键，例如只用 `帖子标题`、`直播间名` 或 `sidebar:${xxx}`。
4. 附表级联可以按数据模型已有外键字段删除，例如 `关联帖子ID`、`关联帖子标题`、`所属直播间名`。
5. 如果附表外键不是唯一字段，必须在 `fieldSchema` 或本文档中记录限制。

示例：

```js
function deleteEntities(context) {
    const { tables, selectedSet, filterTableRows, buildDeleteTargets, hasDeleteTarget } = context;
    const itemTargets = buildDeleteTargets(selectedSet, 'item');
    const deletedItemIds = new Set();

    const itemDeletion = filterTableRows(tables.items, (row, rowIndex) => {
        const itemId = resolveRowIdentity(tables.items, row, '项目ID', 'item_', rowIndex);
        const matched = hasDeleteTarget(itemTargets, rowIndex, itemId);
        if (matched) deletedItemIds.add(itemId);
        return matched;
    });

    let removed = itemDeletion.removed;
    removed += filterTableRows(tables.details, (row) => {
        const itemRef = normalizeText(getCellByHeader(tables.details, row, '关联项目ID'));
        return deletedItemIds.has(itemRef);
    }).removed;

    return { removed };
}
```

### 4.1 当前内置 scene 的特殊限制

- [`modules/phone-theater/scenes/forum.js`](../../modules/phone-theater/scenes/forum.js) 的侧栏没有外键，使用 `分区/版面名|栏目类型|栏目标题|时间文本|状态标签` 组合 identity，并仍叠加 `rowIndex` 精确匹配。
- [`modules/phone-theater/scenes/live.js`](../../modules/phone-theater/scenes/live.js) 的弹幕附表只有 `所属直播间名` 外键。主表删除仍按 typed delete key 精确匹配；附表级联只能按直播间名清理。这是当前表结构限制，不要把它误写成“全链路唯一”。

## 5. 渲染规则

`renderContent(viewModel, uiState, renderKit)` 只负责 scene 内容区，不要渲染导航栏、删除管理条或页面根节点。

核心 shell 由 [`modules/phone-theater/templates.js`](../../modules/phone-theater/templates.js) 负责，提供：

- 返回按钮。
- 删除 / 完成按钮。
- 全选、取消选择、删除已选管理条。
- 页面根节点 `data-theater-scene` 与 `data-theater-style-scope`。

scene 内容中的用户数据必须使用转义函数：

- 文本节点使用 `escapeHtml`。
- 属性值使用 `escapeHtmlAttr`。

不要把用户内容直接拼进 HTML。能显示不等于安全，属性注入这类低级错误不该再出现。

## 6. 交互规则

通用删除态由 [`modules/phone-theater/interactions.js`](../../modules/phone-theater/interactions.js) 统一处理。

scene 专属交互放在 `bindInteractions(container, context)`：

- 不要在核心交互层写 scene 专属 selector。
- 重渲染后 DOM 会替换，绑定在元素上的监听会自然释放。
- 如果同一 DOM 可能重复调用 hook，必须使用 dataset 或等价机制防重复绑定。

[`modules/phone-theater/scenes/live.js`](../../modules/phone-theater/scenes/live.js) 的弹幕暂停就是参考实现。

## 7. 样式规则

样式文件结构：

```text
styles/06-phone-theater.css              兼容入口，只 import index
styles/phone-theater/index.css           scene style registry
styles/phone-theater/00-core.css         核心 shell 与通用控件
styles/phone-theater/square.css          广场样式
styles/phone-theater/forum.css           论坛样式
styles/phone-theater/live.css            直播样式
```

新增 scene 时：

1. 新增 `styles/phone-theater/new-scene.css`。
2. 在 `styles/phone-theater/index.css` 添加 import。
3. CSS 选择器必须以 `.phone-theater-page[data-theater-scene="newScene"]` 或更窄作用域开头。
4. 不要把 scene 专属样式写入 `00-core.css`。
5. `00-core.css` 不允许引用内置 scene 的容器类，例如 `.phone-theater-square-post`、`.phone-theater-forum-note-card`、`.phone-theater-live-room`。删除态这类通用能力必须依赖 `[data-theater-delete-key]` 等跨 scene 协议属性。

## 8. 契约检查

修改后至少运行：

```bash
node scripts/check-theater-contract.cjs
npm run lint --silent
npm run build --silent
```

契约脚本必须覆盖：

- scene module 文件存在。
- registry 中 id / appKey / tableName 唯一。
- 三个内置 scene 仍注册。
- 样式 index 按 core → square → forum → live 顺序引入。
- 核心 data/templates/delete-service/render/interactions 不出现 `sceneId === 'square'` 这类分支。
- typed delete key 没有回退。
- 禁止裸 `startsWith('sidebar:')`。
- 本文档存在并包含删除规则。

## 9. 新增 scene 最短清单

- [ ] 新增 `modules/phone-theater/scenes/new-scene.js`。
- [ ] 实现 metadata、`tables`、`primaryTableRole`、`fieldSchema`。
- [ ] 实现 `buildViewModel`，缺辅助表时降级为空。
- [ ] 实现 `collectDeletableKeys`，只返回 typed delete key。
- [ ] 实现 `deleteEntities`，主表精确删除，附表按明确外键级联。
- [ ] 实现 `renderContent`，全部用户内容正确转义。
- [ ] 如有专属交互，实现 `bindInteractions`，确保幂等。
- [ ] 新增 `styles/phone-theater/new-scene.css` 并登记 import。
- [ ] 在 `modules/phone-theater/scenes/index.js` 注册 scene。
- [ ] 更新契约脚本并运行验证。
