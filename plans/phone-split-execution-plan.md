# 玉子市场 × 玉子手机 彻底拆分执行方案

> 适用对象：
> - 现仓库：`st-tamako-market`
> - 新仓库：`st-yuzi-phone`
> - 对照基线：`2.8.5`
>
> 目标：两个扩展彻底无关联，任一单独安装可独立运行，且不引用对方。

---

## 0. 现状假设与拆分边界

### 0.1 现状假设

基于当前代码盘点，以下事实成立：

1. 市场与手机目前共仓：手机代码位于 `modules/phone/`，由市场入口 `index.js` 直接导入并初始化。
2. 手机与市场共享扩展配置命名空间：
   - 市场配置：`extensionSettings.TamakoMarket`
   - 手机配置也挂在其下：`extensionSettings.TamakoMarket.phone`
3. 手机 UI 容器与拖拽缩放逻辑在市场模块中：
   - `createPhoneContainer`、`initPhoneShellDrag`、`initPhoneShellResize`、`togglePhone` 位于 `modules/window.js`。
4. 设置面板耦合：`modules/settings-panel.js` 同时管理市场开关与手机开关。
5. 样式耦合：`style.css` 同时导入市场层与手机层样式。
6. 局部本地存储已使用手机前缀，但仍在市场仓内实现：
   - 例如 `tamako_phone_special_choices_v1`。

### 0.2 拆分边界

**保留在玉子市场（st-tamako-market）**
- 2.8.5 的市场能力：捕获、库存管理、主题编辑器、美化器（非手机专属）、窗口与按钮。
- 仅市场入口按钮和市场设置。

**迁移到玉子手机（st-yuzi-phone）**
- `modules/phone/` 全量功能（home、viewer、settings、fusion、beautify templates、phone-core）。
- 手机独立容器创建、拖拽、缩放、路由、通知。
- 手机专属样式层（`styles/01..05` + 00-core 内手机段落需要拆出）。

**不跨仓共享任何运行时代码**
- 不引入 git submodule、npm 包共享、运行时动态 import 对方路径。
- 若需要公共逻辑，复制并重命名到各自仓库（短期允许重复，长期再做通用库但不在本次范围）。

---

## 1. 目标架构定义

### 1.1 双扩展目标目录示例

#### A. `st-tamako-market`（拆分后）

```text
st-tamako-market/
├─ index.js
├─ manifest.json
├─ style.css
├─ modules/
│  ├─ beautifier.js
│  ├─ capture.js
│  ├─ constants.js
│  ├─ settings-panel.js
│  ├─ state.js
│  ├─ theme-editor.js
│  ├─ utils.js
│  └─ window.js
├─ styles/
│  └─ 00-core.css
└─ README.md
```

#### B. `st-yuzi-phone`（新仓库）

```text
st-yuzi-phone/
├─ index.js
├─ manifest.json
├─ style.css
├─ modules/
│  ├─ phone-core.js
│  ├─ phone-home.js
│  ├─ phone-table-viewer.js
│  ├─ phone-settings.js
│  ├─ phone-fusion.js
│  ├─ phone-beautify-templates.js
│  ├─ state.js
│  ├─ settings.js
│  ├─ storage.js
│  ├─ db-bridge.js
│  └─ dom.js
├─ styles/
│  ├─ 00-phone-shell.css
│  ├─ 01-phone-base.css
│  ├─ 02-phone-nav-detail.css
│  ├─ 03-phone-special-base.css
│  ├─ 04-phone-special-interactions.css
│  └─ 05-phone-generic-template.css
└─ README.md
```

### 1.2 命名空间与标识规范

| 维度 | 玉子市场 | 玉子手机 |
|---|---|---|
| extensionSettings key | `TamakoMarket` | `YuziPhone` |
| display_name | Tamako Market 玉子市场 | Yuzi Phone 玉子手机 |
| DOM 根 ID 前缀 | `tamako-market-*` | `yuzi-phone-*` |
| CSS 主前缀 | `.tamako-*` | `.yuzi-phone-*` |
| 事件 channel 前缀 | `tmk:*` | `yzp:*` |
| localStorage 前缀 | `tmk_*` | `yzp_*` |
| 仓库/发布线 | `st-tamako-market` | `st-yuzi-phone` |

### 1.3 运行原则

1. 两扩展可共装但互不依赖。
2. 单装市场：无手机入口、无手机样式、无手机存储读写。
3. 单装手机：不依赖 `TamakoMarket` 任意对象/DOM/CSS。
4. 双装时：UI、事件、存储互不污染。

---

## 2. 分阶段实施步骤

## 阶段 P0：冻结与基线锁定

1. 在 `st-tamako-market` 打 Tag：`pre-split-v3.0.0`（或当前HEAD）。
2. 确认 `2.8.5` 目录可作为功能回退对照（仅市场范围）。
3. 建立拆分分支：
   - 市场仓：`split/phone-extraction`
   - 手机仓：`bootstrap/from-tamako`

**退出标准**：两仓均有可追溯起点与回退锚点。

---

## 阶段 P1：先在手机仓落地可运行最小闭环

> 原则：先让 `st-yuzi-phone` 独立跑起来，再从市场仓移除，避免双仓同时不可用。

1. 初始化 `st-yuzi-phone/manifest.json`、`index.js`、`style.css`。
2. 从市场仓复制 `modules/phone/*` 到手机仓 `modules/`（去掉 phone 子目录层级，后续重命名）。
3. 新建手机仓基础模块：
   - `modules/settings.js`：统一 `getPhoneSettings/savePhoneSetting` 到 `extensionSettings.YuziPhone`
   - `modules/state.js`：运行态状态
   - `modules/dom.js`：容器创建、按钮创建、挂载/卸载
   - `modules/storage.js`：localStorage key 常量与读写
   - `modules/db-bridge.js`：AutoCardUpdaterAPI 桥接（从 phone-core 抽离）
4. 手机入口在自身完成：
   - 创建手机按钮
   - 创建手机容器
   - 路由首页渲染
   - 设置页可打开
5. 样式拆分：先复制市场仓 `styles/01..05` 与手机相关 `00-core` 片段到手机仓。

**退出标准**：仅安装 `st-yuzi-phone` 时，手机可打开、可路由、可保存设置。

---

## 阶段 P2：手机内部去市场耦合

1. 替换所有 `TamakoMarket` 访问：
   - `ctx.extensionSettings.TamakoMarket.phone` -> `ctx.extensionSettings.YuziPhone`
2. 替换硬编码文案与元信息：
   - exporter/author 字段从 `TamakoMarket` 改为 `YuziPhone`
3. 替换文件命名前缀：
   - 导出文件名 `tamako_phone_*` -> `yuzi_phone_*`
4. 替换 CSS/DOM 前缀：
   - `.phone-*` 建议保留为组件层
   - 容器根必须新增 `.yuzi-phone-root` 作用域，避免外溢
5. 将拖拽/缩放初始化从市场 `window.js` 脱钩到手机仓 `dom.js`/`phone-core.js`。

**退出标准**：手机仓中不存在 `TamakoMarket` 字符串，不 import 市场仓路径。

---

## 阶段 P3：市场仓移除手机能力并回归纯市场

1. `index.js` 删除手机导入与初始化：
   - 删除 `PHONE_ICONS` import
   - 删除 `createPhoneContainer/createPhoneToggleButton/togglePhone` 链路
   - 删除 `phoneEnabled` 状态设置
2. `modules/state.js` 删除 `phoneEnabled` 及 setter。
3. `modules/constants.js` 删除 `phone*` 默认设置与手机消息项。
4. `modules/window.js` 删除所有手机容器、手机拖拽缩放、手机toggle相关函数。
5. `modules/settings-panel.js` 删除手机开关、打开手机、重置手机按钮等 UI 与逻辑。
6. `style.css` 移除手机样式 import，仅保留市场样式。
7. `styles/00-core.css` 删除手机容器和缩放句柄样式段。
8. 删除 `modules/phone/` 目录。

**退出标准**：市场仓运行不报错，且无任何手机入口、样式、设置、存储写入。

---

## 阶段 P4：双仓并行兼容发布

1. 手机仓发布 `v1.0.0`（独立首发）。
2. 市场仓发布 `v3.1.0`（移除手机的破坏性小版本或主版本，见版本建议）。
3. 市场仓 README 增加迁移说明：
   - 手机功能已迁出至 `st-yuzi-phone`
   - 升级后需单独安装手机扩展
4. 手机仓 README 增加来源说明与迁移指南。

**退出标准**：用户按文档操作可完成无痛迁移，双仓各自可独立安装运行。

---

## 3. 文件与模块迁移映射

## 3.1 市场仓 -> 手机仓迁移映射表

| 源文件 | 目标文件 | 动作 | 备注 |
|---|---|---|---|
| `modules/phone/phone-core.js` | `modules/phone-core.js` | 迁移+重构 | 拆出 db/settings/dom 依赖 |
| `modules/phone/phone-home.js` | `modules/phone-home.js` | 迁移 | 调整 imports |
| `modules/phone/phone-table-viewer.js` | `modules/phone-table-viewer.js` | 迁移 | storage key 前缀替换 |
| `modules/phone/phone-settings.js` | `modules/phone-settings.js` | 迁移 | 所有 settings API 改到 YuziPhone |
| `modules/phone/phone-fusion.js` | `modules/phone-fusion.js` | 迁移 | UI 前缀校正 |
| `modules/phone/phone-beautify-templates.js` | `modules/phone-beautify-templates.js` | 迁移 | exporter/author/key 全部替换 |
| `styles/01-phone-base.css` | `styles/01-phone-base.css` | 迁移 | 增加根作用域 |
| `styles/02-phone-nav-detail.css` | `styles/02-phone-nav-detail.css` | 迁移 | 增加根作用域 |
| `styles/03-phone-special-base.css` | `styles/03-phone-special-base.css` | 迁移 | 增加根作用域 |
| `styles/04-phone-special-interactions.css` | `styles/04-phone-special-interactions.css` | 迁移 | 增加根作用域 |
| `styles/05-phone-generic-template.css` | `styles/05-phone-generic-template.css` | 迁移 | 增加根作用域 |
| `styles/00-core.css` 手机段 | `styles/00-phone-shell.css` | 抽取 | `.tamako-phone-*` -> `.yuzi-phone-*` |

## 3.2 市场仓移除映射

| 文件 | 移除项 |
|---|---|
| `index.js` | 手机按钮创建、手机容器创建、手机启用状态、销毁手机DOM |
| `modules/state.js` | `phoneEnabled` 相关状态与方法 |
| `modules/constants.js` | `phoneEnabled`、`phoneToggleX/Y`、`phoneUpdate/phoneSettings` |
| `modules/window.js` | `createPhoneContainer`、`initPhoneShellDrag`、`initPhoneShellResize`、`togglePhone`、`resetPhoneTogglePosition` |
| `modules/settings-panel.js` | 手机启用开关、打开手机按钮、重置手机按钮 |
| `style.css` | 手机相关 import 行 |
| `styles/00-core.css` | `.tamako-phone-standalone` 与 `.tamako-phone-resize*` 规则 |
| `modules/phone/*` | 全目录删除 |

---

## 4. 接口与事件改造策略

## 4.1 API桥接策略

手机仅保留对 `AutoCardUpdaterAPI` 的依赖，不依赖市场任何中间层。

建议分层：
1. `db-bridge.js`：仅封装 `exportTableAsJson/importTableAsJson/getTableLockState...`
2. `phone-core.js`：路由、页面生命周期
3. `phone-settings.js`：只调用 bridge，不直接访问全局 API

## 4.2 事件通道策略

- 统一事件前缀：`yzp:*`
- 禁止复用 `tmk:*` 或通用无前缀事件名。
- 如需 window 级事件：
  - `window.dispatchEvent(new CustomEvent('yzp:route_changed', ...))`
  - 监听器在卸载时统一解除。

## 4.3 DOM 作用域策略

- 手机根容器固定：`#yuzi-phone-root`。
- 所有查询使用 root scoped query，禁止 `document.querySelector('.phone-*')` 全局命中。
- 动态 style 注入均加 scope 前缀，例如 `.yuzi-phone-root .phone-special-*`。

---

## 5. 数据与配置迁移方案

## 5.1 extensionSettings 迁移

### 现状
- 旧位置：`extensionSettings.TamakoMarket.phone`

### 新位置
- 新位置：`extensionSettings.YuziPhone`

### 一次性迁移逻辑

在 `st-yuzi-phone/index.js` 首次初始化时执行：

1. 读取 `ctx.extensionSettings.TamakoMarket?.phone`
2. 若 `ctx.extensionSettings.YuziPhone` 为空且旧值存在：
   - 深拷贝写入新 key
   - 写入迁移标记 `ctx.extensionSettings.YuziPhone.__migratedFromTamako = true`
3. 不回写旧值（由市场新版本自然不再使用）
4. `saveSettingsDebounced`

## 5.2 localStorage 键迁移

### 已见旧键
- `tamako_phone_special_choices_v1`

### 新键
- `yzp_special_choices_v1`

### 迁移策略

- 读取新键，不存在时尝试读旧键并迁移到新键。
- 迁移后保留旧键一版周期，再在下个大版本清理。

## 5.3 模板包元数据迁移

- `author/exporter: TamakoMarket` -> `YuziPhone`
- 格式版本不强升，仅在 metadata 增加：
  - `sourceExtension: 'YuziPhone'`
  - `sourceVersion: '1.x.x'`

---

## 6. 玉子市场侧移除清单（执行核对）

- [ ] `index.js` 无手机 import / init / destroy
- [ ] `modules/window.js` 无 `tamako-phone-*` 字样
- [ ] `modules/settings-panel.js` 无手机设置项
- [ ] `modules/state.js` 无 `phoneEnabled`
- [ ] `modules/constants.js` 无 phone 默认配置字段
- [ ] `style.css` 无手机样式 import
- [ ] `styles/00-core.css` 无手机容器样式
- [ ] 删除 `modules/phone/` 目录
- [ ] README 删除手机功能描述并增加迁移指引

---

## 7. st-yuzi-phone 初始化与落库方案

## 7.1 启动流程

1. `DOMContentLoaded` -> `bootPhoneExtension()`
2. `ensureSettingsNamespace('YuziPhone')`
3. `runLegacyMigration()`（从 TamakoMarket.phone 迁移）
4. `createPhoneToggle()` + `createPhoneContainer()`
5. `initPhoneCore()`
6. `registerCleanupHooks()`

## 7.2 卸载与清理

- 统一 `destroy()`：
  - 清理 event listeners
  - 清理 timers/intervals
  - 清理动态插入 DOM
  - 清理未释放 URL.createObjectURL

## 7.3 数据落库原则

- 仅写 `extensionSettings.YuziPhone`
- 仅写 `yzp_*` localStorage
- 严禁读写 `TamakoMarket` 命名空间

---

## 8. 兼容性处理与破坏性变更说明

## 8.1 兼容策略

1. 首版手机扩展内置迁移器：自动搬运旧 phone 设置。
2. 市场扩展升级后不再识别 phone 设置，不报错不中断。
3. 双装场景下允许旧数据存在，但仅手机扩展消费。

## 8.2 破坏性变更（需公告）

1. 市场升级后不再提供手机功能入口。
2. 用户必须额外安装 `st-yuzi-phone` 才可继续使用手机能力。
3. CSS class 与 DOM id 更名后，第三方自定义 CSS 可能失效（需迁移指引）。

---

## 9. CI/CD 与发布计划

## 9.1 仓库级流水线建议

### 市场仓
- 检查项：
  - 禁止引入 `modules/phone/`
  - 禁止出现 `tamako-phone` 关键词
  - manifest/version 与 README 同步

### 手机仓
- 检查项：
  - 禁止出现 `TamakoMarket` 关键词（白名单: 迁移器提示文案）
  - 禁止 import 市场仓路径
  - 必须存在 `destroy()` 导出

## 9.2 发布节奏建议

1. 先发手机仓 `v1.0.0`
2. 再发市场仓“移除手机版”
3. 最后补文档与迁移FAQ

## 9.3 版本线建议

- `st-yuzi-phone`: 从 `1.0.0` 起独立语义化版本
- `st-tamako-market`:
  - 若视为重大功能移除，建议 `4.0.0`
  - 若按“能力拆分且有替代扩展”处理，可 `3.1.0`，但需在 release note 明确破坏性变更

---

## 10. 测试与验收标准

## 10.1 单仓独立测试

### 市场单装
- [ ] 按钮/窗口/捕获/主题/美化器正常
- [ ] 控制台无手机相关报错
- [ ] 设置面板无手机项

### 手机单装
- [ ] 手机按钮出现并可打开
- [ ] 首页/表格页/设置页/缝合页可用
- [ ] 数据库桥接可读写
- [ ] 配置保存到 `YuziPhone`

## 10.2 双仓共装测试

- [ ] 按钮互不覆盖、层级正确
- [ ] 样式互不污染
- [ ] 事件不串台
- [ ] 卸载任一扩展不影响另一方

## 10.3 迁移测试

- [ ] 有旧 `TamakoMarket.phone` 数据时，手机扩展首次启动自动迁移成功
- [ ] 有旧 `tamako_phone_*` localStorage 时迁移成功
- [ ] 迁移后功能一致

---

## 11. 风险与回滚预案

## 11.1 主要风险

1. 手机仓漏掉市场依赖导致单装失败
2. 市场删手机后残留引用导致启动异常
3. 双装时 CSS 冲突
4. 数据迁移误写/丢失

## 11.2 回滚策略

1. 发布前保留 `pre-split` tag
2. 任一仓异常可立即回滚到前一 release
3. 迁移器采用“复制不删除”策略，避免不可逆
4. 保留一版兼容窗口：旧 key 不删，仅停用

---

## 12. 提交节奏建议（可直接按此切 commit）

### 手机仓（st-yuzi-phone）
1. `feat(phone): bootstrap standalone extension skeleton`
2. `feat(phone): migrate core modules from tamako-market`
3. `refactor(phone): decouple settings namespace to YuziPhone`
4. `refactor(phone): extract db-bridge and storage modules`
5. `style(phone): isolate css scope with yuzi-phone root`
6. `feat(phone): add legacy migration from TamakoMarket.phone`
7. `docs(phone): add install and migration guide`

### 市场仓（st-tamako-market）
1. `refactor(market): remove phone runtime initialization`
2. `refactor(market): remove phone settings and state`
3. `style(market): drop phone css imports and rules`
4. `chore(market): delete modules/phone directory`
5. `docs(market): announce phone extension split`

---

## 13. 关键改造点（代码级检查清单）

1. **字符串清查**
   - 市场仓：不得出现 `tamako-phone`、`phoneEnabled`、`modules/phone`
   - 手机仓：不得出现 `extensionSettings.TamakoMarket`（迁移器除外）

2. **入口清查**
   - 两仓各自 `index.js` 必须自举完整，不依赖对方调用

3. **存储清查**
   - 手机仓仅 `YuziPhone` + `yzp_*`
   - 市场仓仅读写 `TamakoMarket` 非 phone 字段

4. **样式清查**
   - 手机样式必须以 `.yuzi-phone-root` 起始作用域

5. **销毁清查**
   - 两仓均具备独立 `destroy()`，且互不触达对方 DOM

---

## 14. 实施后验收结论模板

执行完成后，应能给出如下结论：

- `st-tamako-market`：恢复为纯市场扩展，功能对齐 2.8.5 + 后续市场增强，不含手机能力。
- `st-yuzi-phone`：手机能力完整独立，配置与数据自管，可单装运行。
- 双仓共装：无代码引用关系、无配置耦合、无样式污染、无事件冲突。

---

## 15. 下一步执行建议

按本方案进入代码实施时，推荐顺序：

1. 先在 `st-yuzi-phone` 完成 P1 + P2 并本地验证单装。
2. 再在 `st-tamako-market` 执行 P3 清理。
3. 最后做 P4 发布、文档与迁移公告。
