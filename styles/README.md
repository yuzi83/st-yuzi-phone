# styles 目录分层说明

## 顶层入口
- `../style.css`：总入口，只负责按层级串联样式，不直接承载具体视觉规则。

## 当前 active layers
- `00-phone-shell.css`：独立容器、toggle、拖拽/缩放外壳层
- `01-phone-base.css`：`styles/phone-base/` 现代基础层聚合入口
- `02-phone-nav-detail.css`：顶层通用导航 / 详情补层
- `03-phone-special-base.css`：三张专属表模板基础层
- `04-phone-special-interactions.css`：三张专属表交互补层
- `05-phone-generic-template.css`：通用表模板层

## phone-base 子目录
- 详见 `styles/phone-base/README.md`，集中说明 `phone-base` 子目录的现代分层。

### modern active
- `00-phone-tokens.css`
- `01-shell-system.css`
- `02-page-home.css`
- `05-update-fusion-feedback.css`
- `06-layout-nav-core.css`
- `07-settings-modern.css`
- `08-image-crop.css`
- `09-table-manage-detail.css`
- `10-scroll-generic-patches.css`
- `11-api-dialog-worldbook.css`

> 历史 legacy 文件（`03-table-legacy.css` / `04-settings-legacy.css`）已在 2026-04 完成清理，对应现代替代层分别为 `09-table-manage-detail.css` 与 `07-settings-modern.css`。

## 当前收口原则
1. 入口和层级语义保持稳定，不直接大范围改视觉规则。
2. 如需新增样式层级，统一从 `style.css` 与 `styles/01-phone-base.css` 两层入口扩展。
3. 历史回滚需求请通过版本控制取回旧文件，不再在仓库内常驻 legacy 副本。
