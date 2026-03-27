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
- 详见 `styles/phone-base/README.md`，用于固定 `phone-base` 子目录的 modern / legacy 归档策略。
- 当前 legacy 文件仍保留在 `styles/phone-base/` 原路径，后续目标归档目录为 `styles/legacy/phone-base/`。

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

### legacy archive
- `03-table-legacy.css`
- `04-settings-legacy.css`

这两个 legacy 文件已经停止默认加载，仅保留历史参考 / 回滚比对用途，并在文件头部固定归档语义。

## 目标 legacy 目录约定
- `styles/legacy/README.md`：legacy 顶层归档目录说明
- `styles/legacy/phone-base/README.md`：`phone-base` legacy 目标归档说明

## 当前收口原则
1. 先整理入口和层级语义，不直接大范围改视觉规则。
2. legacy 文件在导入关系完全收敛前不物理删除。
3. 若未来继续做目录迁移，应优先保持 `style.css` 与 `styles/01-phone-base.css` 的入口契约稳定。
4. 真正迁移 legacy 文件时，应先保留原路径桥接说明，再逐步把历史引用转向 `styles/legacy/phone-base/`。
