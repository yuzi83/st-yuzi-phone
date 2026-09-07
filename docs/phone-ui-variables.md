# 小手机 UI 变量

主界面与后续系统 App 的公共视觉变量清单。实现 UI 前先读本文和 [`../styles/phone-base/00-phone-tokens.css`](../styles/phone-base/00-phone-tokens.css)；Figma 只提供视觉参考，业务数据、路由和交互仍沿用现有模块。

视觉来源：Figma `02_设计画板` 的 `主界面`（`195:3524`），内屏基准为 `402 x 874`。

## 使用规则

1. 颜色、尺寸、间距、圆角、字体、阴影、透明度和动效值必须使用已有 `--yuzi-*` token；组件 CSS 和 HTML 模板不得新增散写视觉常量。
2. 先复用含义相同的公共 token；确实缺少时，在 [`00-phone-tokens.css`](../styles/phone-base/00-phone-tokens.css) 新增语义化 token，并同步更新本文。
3. 应用 ID、名称、图标、角标数字、路由和动作属于运行时数据，不得写成 CSS token 或 Figma 示例数据。
4. 用户设置应解析为运行时 CSS 变量；不得在组件中直接读取持久化对象或写入颜色值。
5. 只使用项目内登记的本地资源；不得提交 Figma 临时资源 URL、截图或生成的 React/Tailwind。
6. 小手机组件不得直接消费 SillyTavern 的 `--SmartTheme*`、`--ui-color-*` 或宿主页面颜色；宿主主题隔离只能回落到本文登记的小手机语义 token。
7. 所有**扩展自有** CSS 自定义属性必须以 `--yuzi-` 开头；按职责使用 `--yuzi-phone-*`、`--yuzi-theme-*`、`--yuzi-settings-*`、`--yuzi-variable-manager-*`、`--yuzi-theater-*`、`--yuzi-table-review-*` 或 `--yuzi-generic-template-*`，不得新增 `--phone-*`、`--vm-*`、`--tur-*`、`--calendar-*` 等通用前缀。
8. 通用表的正式运行时变量是 `--yuzi-generic-template-*` 与 `--yuzi-generic-template-resolved-*`。旧模板中的 `--gt*`、`--_gt-*` 和旧 style token key 会在进入运行时前兼容迁移；它们只属于历史输入，不得在新增样式、内置模板或文档示例中使用。

## 基础与外壳

| 类别 | token | 值 |
| --- | --- | --- |
| 外壳 | `--yuzi-phone-bg-shell` | `#121212` |
| 主界面底色 | `--yuzi-phone-bg-app` | `#000000` |
| 外壳 | `--yuzi-phone-shell-radius` / `--yuzi-phone-shadow-shell-drop` | `55px` / `0 20px 50px rgba(0, 0, 0, 0.6)` |
| 外壳基准尺寸 | `--yuzi-phone-frame-reference-width` / `--yuzi-phone-frame-reference-height` | `418px` / `890px` |
| 内屏基准尺寸 | `--yuzi-phone-screen-reference-width` / `--yuzi-phone-screen-reference-height` | `402px` / `874px` |
| 外壳结构 | `--yuzi-phone-frame-border-width` / `--yuzi-phone-frame-screen-inset` / `--yuzi-phone-screen-radius` | `6px` / `8px` / `47px` |
| 旧版外壳环 | `--yuzi-phone-bg-shell-bezel-inner` / `--yuzi-phone-bg-shell-bezel-outer` | `#3a3a3a` / `#1a1a1a` |
| 旧版外壳环厚度 | `--yuzi-phone-shell-bezel-inner-width` / `--yuzi-phone-shell-bezel-outer-width` | `4px` / `8px` |
| 灵动岛 | `--yuzi-phone-dynamic-island-width` / `--yuzi-phone-dynamic-island-height` / `--yuzi-phone-dynamic-island-radius` | `78px` / `24px` / pill |
| 状态栏 | `--yuzi-phone-status-safe-height` / `--yuzi-phone-status-visual-height` | `62px` / `54px` |
| 状态栏排版 | `--yuzi-phone-status-font-size` / `--yuzi-phone-status-line-height` / `--yuzi-phone-status-font-weight` | `17px` / `22px` / `590` |
| 状态栏间距 | `--yuzi-phone-status-inline-padding` / `--yuzi-phone-status-level-gap` | `24px` / `7px` |
| 全局 App 控件 | `--yuzi-phone-home-indicator-width` / `--yuzi-phone-home-indicator-height` / `--yuzi-phone-home-indicator-hit-height` / `--yuzi-phone-home-indicator-bottom` | `144px` / `5px` / `34px` / `8px` |
| 壳内临时层 | `--yuzi-phone-shell-temporary-layer-z-index` / `--yuzi-phone-home-indicator-z-index` | `20` / `21` |
| 共享裁剪层 | `--yuzi-phone-crop-overlay-padding` / `--yuzi-phone-crop-overlay-hidden-opacity` / `--yuzi-phone-crop-overlay-visible-opacity` / `--yuzi-phone-crop-transition-timing` | `14px` / `0` / `1` / `ease` |
| 裁剪弹窗尺寸 | `--yuzi-phone-crop-dialog-inline-size` / `--yuzi-phone-crop-dialog-compact-inline-size` / `--yuzi-phone-crop-dialog-max-width` / `--yuzi-phone-crop-dialog-max-height` / `--yuzi-phone-crop-dialog-gutter` | `92%` / `95%` / `380px` / `720px` / `28px` |
| 裁剪画布与选框 | `--yuzi-phone-crop-stage-min-height` / `--yuzi-phone-crop-stage-compact-min-height` / `--yuzi-phone-crop-image-max-height` / `--yuzi-phone-crop-box-overlay-shadow` | `260px` / `220px` / `320px` / `0 0 0 9999px 当前 QQ 遮罩` |
| 裁剪网格与手柄 | `--yuzi-phone-crop-grid-first-line-position` / `--yuzi-phone-crop-grid-second-line-position` / `--yuzi-phone-crop-handle-size` / `--yuzi-phone-crop-handle-compact-size` / `--yuzi-phone-crop-action-z-index` | `33.333%` / `66.666%` / `14px` / `18px` / `2` |
| 设置首页快捷选择 | `--yuzi-phone-settings-home-quick-select-min-width` / `--yuzi-phone-settings-home-quick-select-max-width` | `84px` / `104px` |
| 应用导航安全顶边距 | `--yuzi-phone-app-nav-top-padding` | `状态栏安全高度` |

裁剪层唯一保留的 CSS 视觉字面量是 `@media (max-width: 520px)` 的查询阈值；CSS 媒体查询不能可靠消费自定义属性，其他裁剪视觉值一律经上表 token 读取。

字体统一使用运行时设置变量 `--yuzi-phone-font-family`；应用文字需同时考虑 `--yuzi-phone-readable-text-scale`。

状态栏的蜂窝、Wi-Fi 和电池图标分别使用项目内的 `assets/phone-status-signal.svg`、`assets/phone-status-wifi.svg` 和 `assets/phone-status-battery.svg`（Figma `195:3510`）；不得改回临时 URL 或手绘替代品。三个白色 SVG 通过 `--yuzi-phone-status-icon-filter` 切换黑白：非首页跟随全局主题，首页跟随 `homeAppLabelColorMode`，并与时间保持同色。

## 全局应用标题栏契约

标题栏的视觉基准来自 Figma `02_设计画板` 的“用户页 / 编辑资料”标题栏（`177:1532`）：内容高度 `54px`，左/右内边距分别为 `10px` / `12px`，方向图标为 `24px`，交互热区为 `32px` 方形。共享实现位于 [`navigation-ui.js`](../modules/phone-core/navigation-ui.js)，页面通过 `buildPhoneNavBar()`、`buildPhoneBackButton()`、`buildPhoneSwitchButton()` 与 `buildPhoneNavTitleSwitcher()` 生成字符串模板；QQ 的 DOM 构建路径使用同一模块的 `createPhoneNavIconElement()` 和相同公共 class。

| 角色 | token | 默认值 |
| --- | --- | --- |
| 状态栏安全区 | `--yuzi-phone-app-nav-top-padding` | `var(--yuzi-phone-status-safe-height)` |
| 标题栏内容高度 | `--yuzi-phone-nav-content-height` | `54px` |
| 左右内边距 | `--yuzi-phone-nav-padding-inline-start` / `--yuzi-phone-nav-padding-inline-end` | `10px` / `12px` |
| 控件热区与图标 | `--yuzi-phone-nav-control-size` / `--yuzi-phone-nav-icon-size` | `32px` / `24px` |
| 左右等宽槽 | `--yuzi-phone-nav-side-slot-width` | `clamp(44px, 15cqi, 60px)` |
| 标题组间距 | `--yuzi-phone-nav-title-gap` / `--yuzi-phone-nav-title-padding-inline` | `4px` / `4px` |
| 标题排版 | `--yuzi-phone-nav-title-font-size` / `--yuzi-phone-nav-title-line-height` / `--yuzi-phone-nav-title-font-weight` | `17px` / `24px` / `500` |
| 控件圆角 | `--yuzi-phone-nav-control-radius` | `var(--yuzi-phone-radius-sm)`；透明底，仅 hover/focus 显示反馈 |
| 前景角色 | `--yuzi-phone-nav-action-color` / `--yuzi-phone-nav-title-color` | 公共强调色 / 公共次级文字色 |
| 表面角色 | `--yuzi-phone-nav-background` / `--yuzi-phone-nav-border-color` | 公共浮层 / 公共弱边框 |
| 交互角色 | `--yuzi-phone-nav-control-hover-background` / `--yuzi-phone-nav-focus-ring-color` / `--yuzi-phone-nav-focus-ring-width` / `--yuzi-phone-nav-disabled-opacity` | 公共 hover 表面 / 公共强调色 / `2px` / `0.38` |
| 第二行操作区 | `--yuzi-phone-nav-secondary-actions-gap` / `--yuzi-phone-nav-secondary-actions-padding-inline` / `--yuzi-phone-nav-secondary-actions-padding-block-end` | `6px` / `10px` / `10px` |
| 第一行行内操作 | `--yuzi-phone-nav-inline-actions-side-slot-width` / `--yuzi-phone-nav-inline-actions-gap` / `--yuzi-phone-nav-inline-action-padding-inline` | `clamp(76px, 27cqi, 108px)` / `clamp(4px, 1.5cqi, 6px)` / `clamp(4px, 2cqi, 8px)` |

结构与维护规则：

1. `.phone-nav-bar` 固定使用 `.phone-nav-leading`、`.phone-nav-center`、`.phone-nav-trailing` 三槽结构；左右槽等宽，中槽为 `minmax(0, 1fr)`。某侧没有动作时仍保留空槽，不能靠绝对定位或不对称 padding 假装标题居中。Theater 编辑/删除等短操作组合使用 `.has-inline-actions` 与 `.phone-nav-inline-actions` 留在第一行 trailing 槽；只有 Generic 批量删除这类确需整行的宽操作才使用 `.has-secondary-actions` 与 `.phone-nav-secondary-actions`。
2. 返回、上一项和下一项都是 icon-only button。按钮内部只放共享 SVG，禁止显示“返回”文字或字符箭头；可访问名称必须通过 `aria-label` 提供。返回图标使用 Figma chevron 路径 `M16 19L8 12L16 5`，不得在页面内复制或替换 glyph。装饰性 `svg` / `img` 必须使用 `pointer-events: none`，由完整的 `32px` button 热区承接点击。
3. `.phone-nav-title-switcher` 按内容宽度紧凑居中，上一项与下一项按钮紧贴标题；其最大宽度不得超过中槽。`.phone-nav-title` 必须保持 `min-width: 0`、`overflow: hidden`、`text-overflow: ellipsis` 与 `white-space: nowrap`；标题过长时只省略文字，不得挤走左右按钮。
4. `.phone-screen` 是名为 `yuzi-phone-screen` 的 inline-size container。标题栏及其页面操作区必须根据手机容器使用 `cqi` 或 `@container yuzi-phone-screen` 响应，禁止用浏览器 viewport 的 `@media (max-width: ...)` 判断手机标题栏宽度。
5. 页面只允许覆写 `--yuzi-phone-nav-background`、`--yuzi-phone-nav-border-color`、`--yuzi-phone-nav-action-color`、`--yuzi-phone-nav-title-color`、`--yuzi-phone-nav-control-hover-background` 等主题角色；不得重新硬编码标题栏高度、三列宽度、图标尺寸、热区、字体、padding 或省略规则。
6. 当前消费者包括 Settings、Generic Table 列表与详情、Theater、小手机变量 App、Fusion、Table Update Review 审核 App、Content Presets 和 QQ 二级页/聊天页。新增 App 也必须从同一共享模块接入，不能新建平行标题栏。

## 原生表单与宿主主题隔离

小手机已提供完整的原生表单语义变量。新 App 的文本输入、数字输入、搜索框、`textarea`、`select` 和 `option` 必须消费这些变量；`checkbox`、`radio`、`range`、`file`、`hidden` 等非文本控件不套用文本表单表面。

| 角色 | token | 用途 |
| --- | --- | --- |
| 表面与正文 | `--yuzi-phone-form-surface` / `--yuzi-phone-form-text` | 输入框、文本域、下拉框和下拉选项 |
| 边框与占位 | `--yuzi-phone-form-border` / `--yuzi-phone-form-placeholder` | 普通边框与 `::placeholder` |
| 禁用态 | `--yuzi-phone-form-disabled-surface` / `--yuzi-phone-form-disabled-text` / `--yuzi-phone-form-disabled-opacity` | 禁用控件的表面、文字和透明度 |
| 焦点 | `--yuzi-phone-form-focus-ring` / `--yuzi-phone-form-focus-ring-width` / `--yuzi-phone-form-focus-ring-offset` | 键盘焦点环 |
| 原生控件主题 | `--yuzi-phone-native-control-color-scheme` | 浏览器原生下拉箭头、滚动条和系统控件的浅深模式 |

SillyTavern 主题可能用 `!important` 强制改写原生控件。此时只允许在小手机外壳隔离层使用同样的 `!important` 取回控制权，并同时设置 `color`、`-webkit-text-fill-color`、`background-color` 和 `border-color`；组件页面仍然只引用上述 token，不复制颜色。`select option` 与 `::placeholder` 必须单独覆盖，否则关闭的下拉框正常、展开后的选项或占位文字仍可能不可读。

使用原生 `checkbox` 的页面必须复用外壳隔离规则：显式恢复 `appearance` / `-webkit-appearance: checkbox`、设置 `color-scheme` 与对应 Yuzi `accent-color`，并保留 `:focus-visible` 焦点环。不要把这条规则施加到已经自绘轨道的开关。

## 底栏与 Home 区域契约

App 页面存在固定底栏时，在底栏根节点声明 `data-phone-bottom-bar`。外壳会自动识别当前活动页中可见的底栏，将 Home Indicator 停靠到其下方，并把底栏计算后的背景复制给独立 Home 区域；没有底栏的页面继续使用悬浮 Home Indicator。App 不得判断自己的路由，也不得硬编码 Home Indicator 留白。

底栏背景必须能够脱离页面内容独立绘制。不要只依赖半透明背景、`backdrop-filter` 或底层渐变，因为这些效果复制到独立 Home 区域后没有相同的背后内容，会显出外壳灰色。需要玻璃感时，底栏仍应提供近乎不透明的最终表面，例如变量 App 使用 `--yuzi-variable-manager-surface-strong`；模糊只作为附加效果。

## 玻璃材质

主屏继续沿用 Figma 的 Dock 尺寸、圆角和状态卡网格；仅材质恢复为旧 UI 的两套透明玻璃。二者共用细边框，但透明度和模糊强度不同。

| 部位 | token | 值 |
| --- | --- | --- |
| 共享边框 | `--yuzi-phone-home-glass-border-width` / `--yuzi-phone-home-glass-border-color` | `1px` / `rgba(255, 255, 255, 0.15)` |
| Dock 背景与模糊 | `--yuzi-phone-home-dock-glass-background` / `--yuzi-phone-home-dock-glass-blur` | `rgba(255, 255, 255, 0.2)` / `30px` |
| Dock 阴影 | `--yuzi-phone-shadow-medium` | `0 10px 30px rgba(0, 0, 0, 0.2)` |
| 状态卡背景与模糊 | `--yuzi-phone-home-status-glass-background` / `--yuzi-phone-home-status-glass-blur` / `--yuzi-phone-home-status-glass-saturation` | `rgba(255, 255, 255, 0.08)` / `20px` / `1.6` |
| 状态卡阴影 | `--yuzi-phone-home-status-glass-shadow` | 外部柔影与内高光 |

玻璃始终使用 `backdrop-filter`；不要增加遮罩伪元素或混合模式。需要调整外观时，只改本节 token。

## 主屏

| 类别 | token | 值 |
| --- | --- | --- |
| 网格 | `--yuzi-phone-home-grid-columns` / `--yuzi-phone-home-grid-block-size` | `4` / `642px` |
| 网格间距 | `--yuzi-phone-home-grid-padding-inline` / `--yuzi-phone-home-grid-padding-top` | `26px` / `28.666px` |
| 网格间隙 | `--yuzi-phone-home-grid-column-gap` / `--yuzi-phone-home-grid-row-gap` | `20.667px` / `17.333px` |
| 首排角标留白 | `--yuzi-phone-home-grid-first-row-badge-clearance` | `6px`（仅剧情状态卡存在时） |
| 默认壁纸 | `--yuzi-phone-home-wallpaper-image` | 项目内 `assets/phone-home-wallpaper-light.jpg`（Figma `195:2718`） |
| 应用槽 | `--yuzi-phone-home-app-slot-width` / `--yuzi-phone-home-app-slot-height` | `72px` / `83px` |
| 应用图标 | `--yuzi-phone-home-app-icon-size` / `--yuzi-phone-home-app-icon-radius` | `64px` / 默认 `14px` |
| 应用名称 | `--yuzi-phone-home-app-label-gap` / `--yuzi-phone-home-app-label-size` / `--yuzi-phone-home-app-label-weight` | `5px` / `12px` / `510` |
| 深色背景上的应用名称 | `--yuzi-phone-home-app-label-color-on-dark` / `--yuzi-phone-home-app-label-shadow-on-dark` | 白色 / `0 2px 25px #000` |
| 浅色背景上的应用名称 | `--yuzi-phone-home-app-label-color-on-light` / `--yuzi-phone-home-app-label-shadow-on-light` | `rgba(20, 24, 28, 0.92)` / `0 1px 3px rgba(255, 255, 255, 0.45)` |
| 当前应用名称 | `--yuzi-phone-home-app-label-color` / `--yuzi-phone-home-app-label-shadow` | 默认指向深色背景组；由白色/黑色外观设置切换 |
| 应用入场 | `--yuzi-phone-home-app-enter-duration` / `--yuzi-phone-home-app-enter-easing` / `--yuzi-phone-home-app-enter-start-scale` | `0.3s` / `ease` / `0.7` |
| 交互与角标 | `--yuzi-phone-home-app-press-scale` / `--yuzi-phone-home-badge-bg` / `--yuzi-phone-home-badge-fg` | `0.85` / `#ff383c` / 白色 |
| QQ 既有图标 | `--yuzi-phone-home-qq-icon-start` / `--yuzi-phone-home-qq-icon-end` | `#1F9CFF` / `#0069D9` |
| 剧情状态卡布局 | `--yuzi-phone-home-status-offset` / `--yuzi-phone-home-status-inline-padding` / `--yuzi-phone-home-status-gap` | `12px` / 与网格对齐 / `12px` |
| 剧情状态卡 | `--yuzi-phone-home-status-card-min-height` / `--yuzi-phone-home-status-card-padding-block` / `--yuzi-phone-home-status-card-padding-inline` / `--yuzi-phone-home-status-card-radius` | `76px` / `12px` / `14px` / `18px` |

应用网格只消费现有 `buildHomeScreenViewModel()` 数据。Figma 中的示例 App 仅定义槽位外观，不能写入生产列表。QQ 主屏图标保持既有运行时图标来源，允许 `appIcons.__qq__` 覆盖；不得新增 Figma QQ 图标资源。

## Dock

| token | 值 |
| --- | --- |
| `--yuzi-phone-home-dock-height` | `140px` |
| `--yuzi-phone-home-dock-padding-top` / `--yuzi-phone-home-dock-padding-inline` / `--yuzi-phone-home-dock-padding-bottom` | `20px` / `17px` / `17px` |
| `--yuzi-phone-home-dock-columns` / `--yuzi-phone-home-dock-icon-size` | `4` / `64px` |
| `--yuzi-phone-home-dock-label-display` | `none` |
| `--yuzi-phone-home-dock-material-width` / `--yuzi-phone-home-dock-material-height` / `--yuzi-phone-home-dock-material-radius` | `368px` / `103px` / `38px` |
| `--yuzi-phone-home-dock-material-padding-block` / `--yuzi-phone-home-dock-material-padding-inline` | `19px` / `19px` |
| `--yuzi-phone-home-dock-material-icon-layout` | `space-between` |

Dock 仍消费现有四个运行时入口；隐藏可视标签不等于删除名称或无障碍名称。

## 已确认边界

- 不实现 Figma 搜索胶囊，也不保留无效占位按钮。
- 剧情时间、天气、日程状态卡保留在应用图标上方，使用本文登记的旧版玻璃材质。
- 主屏删除白色 Home Indicator；它不属于新的全局视觉规范。
- QQ 图标不使用 Figma 资源，保持现有本地来源。
- 当前阶段不做浏览器验证；融合实现完成后由用户手动验证。

## QQ Figma 应用

QQ 前端只消费 `--yuzi-qq-*` 语义变量，不在组件样式中写入颜色、尺寸、间距、圆角、阴影、层级或动效常量。变量按以下职责分组，浅色默认值与 `[data-yuzi-phone-theme="dark"]` 下的深色覆盖一一对应：

| 变量组 | 覆盖内容 |
| --- | --- |
| `--yuzi-qq-light-*` / `--yuzi-qq-dark-*` | 页面、卡片、输入区、弹窗、头像、图标、遮罩与气泡的主题原值 |
| `--yuzi-qq-surface` / `--yuzi-qq-elevated` / `--yuzi-qq-deep-page` / `--yuzi-qq-subtle` / `--yuzi-qq-control` / `--yuzi-qq-input` | 当前全局白天或夜间主题下的层级表面；`deep-page` 用于编辑资料与二级设置的深层页面背景 |
| `--yuzi-qq-text` / `--yuzi-qq-muted` / `--yuzi-qq-icon` / `--yuzi-qq-line` | 正文、次要文字、图标和分隔线 |
| `--yuzi-qq-bubble-self` / `--yuzi-qq-bubble-other` / `--yuzi-qq-danger` | 私聊消息气泡与危险操作状态 |
| `--yuzi-qq-header-*` / `--yuzi-qq-nav-height` / `--yuzi-qq-nav-*` / `--yuzi-qq-page-padding` / `--yuzi-qq-max-content-width` | 四栏根页、二级页和全宽单列响应式布局；`max-content-width` 为兼容别名，最终值为 `100%` |
| `--yuzi-qq-row-*` / `--yuzi-qq-message-*` | 会话、联系人、人物资料和消息行密度 |
| `--yuzi-qq-accent` / `--yuzi-qq-on-accent` | 当前用户头像：品牌蓝底与反色文字，只用于根身份头等“当前用户”身份 |
| `--yuzi-qq-avatar-surface` / `--yuzi-qq-avatar-ink` | 人物占位头像：浅色为 `#f2f3f5 / #cacaca`，用于会话、联系人、聊天对方和人物资料；不得与当前用户头像共用 |
| `--yuzi-qq-composer-*` / `--yuzi-qq-tool-*` / `--yuzi-qq-emoji-*` | 输入区、五类叙事工具、加号装饰入口和底部表情面板 |
| `--yuzi-qq-dialog-surface` / `--yuzi-qq-dialog-*` / `--yuzi-qq-overlay*` / `--yuzi-qq-jump-*` | 统一删除好友、删除会话、添加联系人、工具和跳转气泡 |
| `--yuzi-qq-swipe-*` / `--yuzi-qq-transition` / `--yuzi-qq-disabled-opacity` | 左滑删除、无障碍焦点、低动态和禁用状态 |

QQ 的 `消息 / 联系人 / 助手 / 设置` 是固定根栏；`助手` 保持空白，群聊相关内容不进入当前运行时。QQ 不拥有主题切换入口，主题只由小手机“设置 -> 界面外观”提供。

QQ 响应式与可访问性也只经变量文档约束：`--yuzi-qq-readable-text-scale` 继承 `--yuzi-phone-readable-text-scale`，`--yuzi-qq-reduced-transition` 是低动态下的即时动效 token。`200-400px` 的超窄手机壳保留四栏和输入工具的横向可滚动访问；`800-1200px` 宽屏仍保持全宽单列，不把 QQ 锁在 `402px` 窄栏，也不拉成多列。`超窄`、基准和宽屏均不得靠组件内散写字号、颜色或尺寸补救。


## QQ Figma 02 实测映射（生产权威）

QQ 的视觉权威是 Figma 文件“玉子手机”的 02_设计画板。变量值由节点实测，不从截图、临时 URL 或示例数据取得；状态栏和 Home Indicator 由小手机外壳渲染，QQ 不复制它们。

| Figma 节点 | 实际画面与节点 | 生产 selector | token 组 |
| --- | --- | --- | --- |
| 96:225 | QQ 浅色总区 | .yuzi-qq-app、.yuzi-qq-list-sheet、.yuzi-qq-nav | --yuzi-qq-light-page、--yuzi-qq-light-list-surface、--yuzi-qq-light-tab-surface |
| 233:430 | QQ 深色总区 | [data-yuzi-phone-theme="dark"] 下相同 selector | --yuzi-qq-dark-page、--yuzi-qq-dark-list-surface、--yuzi-qq-dark-tab-surface |
| 195:3310 / 233:466 | 浅深消息根页；头部 195:3402 / 233:558，滚动区 195:3334 / 233:490，Tab 195:3311 / 233:467 | .yuzi-qq-identity-header、.yuzi-qq-list-sheet、.yuzi-qq-nav | --yuzi-qq-root-*、--yuzi-qq-list-*、--yuzi-qq-nav-* |
| 131:2570 / 276:957 | 浅深联系人根页 | .yuzi-qq-contact-list-sheet、.yuzi-qq-contact-utility、.yuzi-qq-contact-row | 连续列表 role token |
| 130:2095 / 233:732 | 浅深私聊；聊天头 130:2096 / 233:735，滚动区 130:2110 / 233:746，输入区 130:2211 / 233:792 | .yuzi-qq-chat-header、.yuzi-qq-message-*、.yuzi-qq-composer | --yuzi-qq-chat-*、--yuzi-qq-composer-*、--yuzi-qq-tool-* |
| 177:1383 / 233:1072 | 浅深人物资料；内容 y226，底部操作栏 y791 | .yuzi-qq-profile-sheet、.yuzi-qq-profile-row、.yuzi-qq-profile-action-bar | --yuzi-qq-profile-* |
| 177:1529 / 233:1118 | 浅深编辑资料 | .yuzi-qq-profile-editor-sheet、.yuzi-qq-field | --yuzi-qq-editor-group-* |
| 177:1804 / 233:1167 | 昵称单字段编辑 | .yuzi-qq-field、.yuzi-qq-dialog-form | 编辑资料与对话框 role token |
| 177:1183 / 233:1201 | 浅深添加菜单 | .yuzi-qq-message-add-menu、.yuzi-qq-message-add-menu-item | --yuzi-qq-dialog-menu-*、--yuzi-qq-dialog-surface |
| 130:2411 / 233:1222 | 浅深新消息跳转气泡 | .yuzi-qq-jump-bubble | --yuzi-qq-jump-* |
| 131:2415 / 233:1226 | 浅深未读跳转 chip | 后续 QQ 未读 chip selector | --yuzi-qq-unread-chip-* |
| 279:4682 / 276:1218 | 浅深设置一级页 | .yuzi-qq-settings-view、.yuzi-qq-settings-sheet、.yuzi-qq-settings-list | --yuzi-qq-settings-root-*、--yuzi-qq-settings-group-* |
| 279:4753、279:4926 / 278:1533、279:5019 | 设置二级页的昼夜外观参考 | 小手机设置外观页；QQ 仅消费主题 | --yuzi-qq-settings-detail-* 与全局 dark 覆盖 |
| 407:641 | 删除好友弹窗参考 | .yuzi-qq-overlay、.yuzi-qq-dialog | --yuzi-qq-dialog-* |
| 407:1786 | 左滑删除参考 | .yuzi-qq-swipe-row、.yuzi-qq-swipe-delete | --yuzi-qq-swipe-* |

Figma 原始底栏顺序不直接复用。生产 QQ 固定为 消息、联系人、助手、设置：使用同一图标加标签的竖排几何，但助手为空白，联系人视觉入口与搜索不执行未定义业务，动态与群聊链路不进入当前运行时。

头像必须按身份角色选 token，而不是按“都是圆形头像”合并规则：当前用户头像使用 `--yuzi-qq-accent / --yuzi-qq-on-accent`；没有真实图片的人物占位头像使用 `--yuzi-qq-avatar-surface / --yuzi-qq-avatar-ink`。真实头像图片覆盖这两组占位色，但不能让按钮的通用 `color: inherit` 重置压过头像文字角色。

### 色板原值

| 角色 | 浅色 role token / 值 | 深色 role token / 值 |
| --- | --- | --- |
| 页面 | --yuzi-qq-light-page: #f2f3f5 | --yuzi-qq-dark-page: #212325 |
| 表面与连续列表 | --yuzi-qq-light-surface: #ffffff；--yuzi-qq-light-list-surface: #ffffff | --yuzi-qq-dark-surface: #212325；--yuzi-qq-dark-list-surface: #1a1c1e |
| Tab | --yuzi-qq-light-tab-surface: #f2f3f5 | --yuzi-qq-dark-tab-surface: #2c2d2e |
| 正文、次要、弱化 | #171a1d / #7a828c / #a8adb4 | #f0f0f4 / #909094 / #5f6061 |
| 图标 | #3b4047 | #c6c6ca |
| 当前用户头像 | 品牌蓝 #0099ff / 白字 | 品牌蓝 #0066cc / 白字 |
| 人物占位头像 | #f2f3f5 / #cacaca | #2c2d2e / #c6c6ca |
| 品牌与在线 | #0099ff / #15d173 | #0066cc / #34c759 |
| 分隔线、搜索 | #e5e5e5 / #f8f8f8 | #3a3c3e / #2c2e2f |
| 聊天头、输入区 | #eeefef / #f8f8f8 | #1a1b1c / #1a1b1c |
| 深层聊天面 | #f2f3f5 | #0f1113 / #242628 / 未读 #3c3e3f |
| 设置页、分组、描边 | #f1f2f6 / #feffff / #e8e7e8 | #000000 / #1c1c1e / #38383b |

### 结构与排版原值

| 结构 | 变量 | 实测值 |
| --- | --- | --- |
| QQ 内屏 | --yuzi-qq-screen-width / --yuzi-qq-screen-height / --yuzi-qq-page-radius | 402px / 874px / 47px |
| 外壳保留区 | --yuzi-qq-status-height；Home Indicator 不在 QQ 内渲染 | 62px；外壳负责 |
| 根身份头 | --yuzi-qq-root-header-height / --yuzi-qq-root-header-padding-inline / --yuzi-qq-root-header-gap | 58px / 16px / 12px |
| 根头像、状态、操作 | --yuzi-qq-root-identity-avatar-size / --yuzi-qq-root-status-dot-size / --yuzi-qq-root-action-size | 38px / 12px / 28px |
| 根标题与状态文本 | --yuzi-qq-root-title-size / --yuzi-qq-root-title-line-height；--yuzi-qq-root-status-size / --yuzi-qq-root-status-line-height | 17/24；11/15，均遵从可读文字比例 |
| Tab | --yuzi-qq-tabbar-height / --yuzi-qq-nav-item-width / --yuzi-qq-tab-content-height / --yuzi-qq-nav-icon-size / --yuzi-qq-nav-item-gap | 83px / 82px / 49px / 26px / 1px |
| 搜索带 | --yuzi-qq-list-search-sheet-height / --yuzi-qq-search-height / --yuzi-qq-search-radius | 60px / 36px / 12px |
| 会话行 | --yuzi-qq-conversation-row-height / --yuzi-qq-conversation-row-padding-inline / --yuzi-qq-conversation-avatar-size / --yuzi-qq-conversation-row-gap | 76px / 16px / 52px / 12px |
| 会话文字 | --yuzi-qq-row-title-size / --yuzi-qq-row-preview-size / --yuzi-qq-caption-size | 16/23 / 13/19 / 11/15 |
| 私聊顶部 | --yuzi-qq-status-height + --yuzi-qq-detail-top-gap + --yuzi-qq-chat-header-height | 62px + 8px + 54px |
| 私聊消息 | --yuzi-qq-chat-avatar-size / --yuzi-qq-message-gap / --yuzi-qq-chat-bubble-max-width / --yuzi-qq-chat-bubble-content-max-width | 40px / 8px / 278px / 254px |
| 气泡 | --yuzi-qq-bubble-padding-block / --yuzi-qq-bubble-padding-inline / --yuzi-qq-bubble-radius | 9px / 12px / 12px |
| 输入区 | --yuzi-qq-composer-height / --yuzi-qq-composer-padding-block-start / --yuzi-qq-composer-padding-inline / --yuzi-qq-composer-input-height | 122px / 8px / 12px / 40px |
| 六工具 | --yuzi-qq-tool-size / --yuzi-qq-tool-icon-size / --yuzi-qq-tool-interval | 24px / 24px / 40px 节距；窄壳横向滚动，不换行 |
| 表情覆盖层 | --yuzi-qq-private-emoji-panel-height / --yuzi-qq-private-emoji-panel-padding-block / --yuzi-qq-private-emoji-column-min | 基准高度 320px；覆盖消息区，不改变输入区与消息流的布局高度；列数由最小轨道自动从五列收缩到四列、三列 |
| 消息多选栏 | --yuzi-qq-message-selection-action-size / --yuzi-qq-message-selection-icon-size / --yuzi-qq-message-selection-injection-padding-inline | 36px / 18px / 12px |
| 跳转气泡 | --yuzi-qq-jump-width / --yuzi-qq-jump-height / --yuzi-qq-jump-icon-size / --yuzi-qq-jump-radius | 114px / 34px / 18px / 左侧胶囊 |
| 人物资料 | --yuzi-qq-profile-sheet-start / --yuzi-qq-profile-row-height / --yuzi-qq-profile-avatar-size | 226px / 102px / 68px |
| 人物操作栏 | --yuzi-qq-profile-action-bar-height / --yuzi-qq-profile-action-padding-top / --yuzi-qq-profile-action-padding-inline / --yuzi-qq-profile-action-gap / --yuzi-qq-profile-action-radius | 83px / 4px / 16px / 8px / 8px |
| 编辑资料 | --yuzi-qq-editor-group-radius / --yuzi-qq-editor-group-padding-block / --yuzi-qq-editor-group-padding-inline / --yuzi-qq-form-group-gap | 14px / 13px / 16px / 10px |
| 添加菜单 | --yuzi-qq-dialog-menu-width / --yuzi-qq-dialog-menu-height / --yuzi-qq-dialog-menu-radius / --yuzi-qq-dialog-menu-padding | 168px / 142px / 14px / 16px |
| 设置一级 | --yuzi-qq-settings-root-group-radius / --yuzi-qq-settings-root-group-padding-* | 27px / 12px 24px 12px 12px |
| 设置二级 | --yuzi-qq-settings-detail-card-radius / --yuzi-qq-settings-detail-card-padding-* | 27px / 24px 12px |

组件 CSS 只可引用当前 role token。Figma 的删除好友与左滑参考图只定义结构和视觉，不作为生产图片嵌入。主题只由小手机 设置 -> 界面外观 改写全局 data-yuzi-phone-theme；QQ 不建立自己的主题开关。

### Figma 02 补充生产映射

`--yuzi-qq-legacy-light-surface` 只是旧版兼容别名，表示 Figma 的页面背景 `#f2f3f5`，不再作为生产内容表面使用。生产内容表面统一使用 `--yuzi-qq-light-surface` 与 `--yuzi-qq-light-content-surface`（浅色 `#ffffff`）；深色对应 `--yuzi-qq-dark-surface` 与 `--yuzi-qq-dark-content-surface`（`#212325`）。连续列表使用 `--yuzi-qq-list-surface`，浮层/输入白面使用 `--yuzi-qq-content-surface`，二者不得回退为页面背景。

聊天工具栏只使用 `--yuzi-qq-tool-size`、`--yuzi-qq-tool-icon-size` 和 `--yuzi-qq-tool-interval`：图标为 `24px`，相邻工具节距为 `40px`。`--yuzi-qq-tool-interval` 只允许由 `.yuzi-qq-tool-bar` 消费；状态、Tab、搜索、表单和气泡分别使用自己的语义间距 token。资料编辑分组固定使用 `--yuzi-qq-editor-group-radius`（`14px`），设置一级分组与设置二级卡片分别使用 `--yuzi-qq-settings-root-group-radius` 和 `--yuzi-qq-settings-detail-card-radius`（均为 `27px`），三者不得互相替换。

| Figma 02 节点 | 成对皮肤/区域 | QQ 生产 selector | 生产 token 组 |
| --- | --- | --- | --- |
| `96:225 / 233:430` | QQ 浅色与深色总区 | `.yuzi-qq-app` | `--yuzi-qq-*-page`、`--yuzi-qq-*-surface`、`--yuzi-qq-*-content-surface` |
| `195:3310 / 233:466` | 消息根页 | `.yuzi-qq-message-root-view`、`.yuzi-qq-message-root-sheet` | `--yuzi-qq-page`、`--yuzi-qq-list-surface` |
| `195:3402 / 233:558` | 消息身份头；浅色当前用户头像 `195:3406` | `.yuzi-qq-identity-header`、`.yuzi-qq-identity-avatar` | `--yuzi-qq-root-*`、`--yuzi-qq-accent`、`--yuzi-qq-on-accent` |
| `195:3334 / 233:490` | 消息滚动区、搜索与浅色会话头像 `195:3342 / 195:3343` | `.yuzi-qq-list-sheet`、`.yuzi-qq-search`、`.yuzi-qq-avatar` | `--yuzi-qq-list-*`、`--yuzi-qq-avatar-surface`、`--yuzi-qq-avatar-ink` |
| `195:3311 / 233:467` | 四栏底部导航 | `.yuzi-qq-nav`、`.yuzi-qq-nav-item` | `--yuzi-qq-nav-*`、`--yuzi-qq-nav-item-gap` |
| `131:2570 / 276:957` | 联系人页 | `.yuzi-qq-contact-root-view`、`.yuzi-qq-contact-root-sheet` | `--yuzi-qq-list-surface`、`--yuzi-qq-conversation-*` |
| `130:2095 / 233:732` | 私聊页 | `.yuzi-qq-private-chat-view` | `--yuzi-qq-chat-*`、`--yuzi-qq-page` |
| `130:2096 / 233:735` | 私聊顶部固定区 | `.yuzi-qq-chat-header` | `--yuzi-qq-chat-header-*`、`--yuzi-qq-chat-top-surface` |
| `130:2110 / 233:746` | 私聊消息流与气泡 | `.yuzi-qq-message-stream`、`.yuzi-qq-message-bubble` | `--yuzi-qq-message-*`、`--yuzi-qq-bubble-*` |
| `130:2211 / 233:792` | 私聊输入区与六工具 | `.yuzi-qq-composer`、`.yuzi-qq-tool-bar` | `--yuzi-qq-composer-*`、`--yuzi-qq-tool-interval` |
| `177:1383 / 233:1072` | 用户页 | `.yuzi-qq-profile-page`、`.yuzi-qq-profile-sheet` | `--yuzi-qq-profile-*`、`--yuzi-qq-list-surface` |
| `177:1529 / 233:1118` | 编辑资料 | `.yuzi-qq-profile-editor-view`、`.yuzi-qq-profile-editor-sheet` | `--yuzi-qq-editor-group-*`、`--yuzi-qq-form-group-gap` |
| `177:1804 / 233:1167` | 昵称字段视觉映射（当前产品未单设昵称路由） | `.yuzi-qq-profile-editor-form`、`.yuzi-qq-field` | `--yuzi-qq-editor-group-*`、`--yuzi-qq-input` |
| `177:1183 / 233:1201` | 添加菜单 | `.yuzi-qq-message-add-menu`、`.yuzi-qq-message-add-menu-item` | 外围 `--yuzi-qq-dialog-surface`；行背景透明；尺寸使用 `--yuzi-qq-dialog-menu-*` |
| `130:2411 / 233:1222` | 跳至最新消息气泡 | `.yuzi-qq-private-chat-jump-bubble`、`.yuzi-qq-jump-bubble` | `--yuzi-qq-jump-*` |
| `131:2415 / 233:1226` | 未读数量 chip | `.yuzi-qq-badge` | `--yuzi-qq-unread`、`--yuzi-qq-badge-padding-inline` |
| `279:4682 / 276:1218` | 设置一级 | `.yuzi-qq-settings-root-view`、`.yuzi-qq-settings-root-sheet` | `--yuzi-qq-settings-root-*` |
| `279:4753 / 278:1533` | 设置外观二级 | `.yuzi-qq-settings-detail-view`、`.yuzi-qq-settings-detail-sheet` | `--yuzi-qq-settings-detail-*` |
| `279:4926 / 279:5019` | 设置选择与上传弹层 | `.yuzi-qq-dialog`、`.yuzi-qq-overlay` | `--yuzi-qq-dialog-*`、`--yuzi-qq-overlay` |
| `407:641 / 407:1786` | 删除好友与左滑删除参考 | `.yuzi-qq-dialog`、`.yuzi-qq-swipe-row` | 仅映射结构和 role token，不作为生产图片嵌入 |
