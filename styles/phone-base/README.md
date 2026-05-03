# phone-base 子目录说明

## modern active
- `00-phone-tokens.css`：设计 token 与变量层
- `01-shell-system.css`：phone shell 系统基础样式
- `02-page-home.css`：主页与基础页面壳层
- `05-update-fusion-feedback.css`：融合/反馈相关现代补层
- `06-layout-nav-core.css`：布局与导航核心层
- `07-settings-modern.css`：现代设置页样式主层
- `08-image-crop.css`：图片裁剪相关现代样式
- `09-table-manage-detail.css`：现代表格管理 / 详情主层
- `10-scroll-generic-patches.css`：滚动与 generic patch 层
- `11-api-dialog-worldbook.css`：API / worldbook 对话框补层

## 历史 legacy 清理
- 旧 `03-table-legacy.css`、`04-settings-legacy.css` 已于 2026-04 物理删除，对应现代替代层分别为 `09-table-manage-detail.css`、`07-settings-modern.css`。
- 历史回滚请通过版本控制取回旧文件，不再在仓库内常驻 legacy 副本。

## 当前策略
1. modern 层是默认入口的唯一组成部分，新增层级统一接入 `01-phone-base.css`。
2. 顶层入口 `style.css` 与聚合入口 `styles/01-phone-base.css` 的契约保持稳定，由 `scripts/check-style-entry-contract.cjs` 静态护栏。
