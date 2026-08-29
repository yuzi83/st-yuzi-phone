# styles 目录分层说明

## 顶层入口
- `../style.css`：总入口，只负责按层级串联样式，不直接承载具体视觉规则。

## 当前 active layers
- `00-phone-shell.css`：独立容器、toggle、拖拽/缩放外壳层
- `01-phone-base.css`：`styles/phone-base/` 现代基础层聚合入口
- `02-phone-nav-detail.css`：顶层通用导航 / 详情补层
- `05-phone-generic-template.css`：通用表模板层
- `06-phone-theater.css`：Theater 小剧场场景层
- `12-variable-manager.css`：变量管理层
- `13-content-presets.css`：美化预设运行 shell 与工坊补层
- `14-table-content-replacement.css`：表格内容词汇替换设置层
- `15-image-generation.css`：图片生成设置层
- `16-fullscreen-overlay.css`：全屏浮层运行时与设置页聚合层；必须位于现有 active layers 最后

## fullscreen-overlay 子目录
- `fullscreen-overlay/00-runtime.css`：宿主 `body` 下 Yuzi 全屏透明层与滚动弹幕动画
- `fullscreen-overlay/01-settings.css`：小手机“弹幕设置”页面；复用设置页主题变量和控件表面，不扩大宿主选择器

聚合顺序固定为 `00-runtime.css` → `01-settings.css`。运行时根节点、自定义属性与动画名称使用 `yuzi-phone-fullscreen-overlay-*` 命名空间；设置页只在 `.phone-fullscreen-overlay-settings-page` 作用域内补充布局，并继续消费共享 `--yuzi-settings-*` 颜色变量，避免 SillyTavern 深色主题把下拉框或输入框渲染成不可读的同色前景/背景。

## phone-base 子目录
- 详见 `styles/phone-base/README.md`，集中说明 `phone-base` 子目录的现代分层。

### modern active
- `00-phone-tokens.css`
- `00-theme-modes.css`
- `01-shell-system.css`
- `02-page-home.css`
- `05-update-fusion-feedback.css`
- `06-layout-nav-core.css`
- `07-settings-modern.css`
- `08-image-crop.css`
- `09-table-manage-detail.css`
- `12-table-update-review.css`
- `10-scroll-generic-patches.css`
- `11-api-dialog-worldbook.css`：世界书工作台对话框与条目控件

> 历史 legacy 文件（`03-table-legacy.css` / `04-settings-legacy.css`）已在 2026-04 完成清理，对应现代替代层分别为 `09-table-manage-detail.css` 与 `07-settings-modern.css`。

## 当前收口原则
1. 入口和层级语义保持稳定，不直接大范围改视觉规则。
2. 如需新增样式层级，统一从 `style.css` 增加有编号的聚合入口；属于 phone-base 的规则再同步扩展 `styles/01-phone-base.css`。
3. `styles/01-phone-base.css` 当前显式聚合 `styles/phone-base/00-theme-modes.css`，主题模式变量层必须在本索引和 `styles/phone-base/README.md` 同步登记。
4. 历史回滚需求请通过版本控制取回旧文件，不再在仓库内常驻 legacy 副本。
