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

## legacy archive
- `03-table-legacy.css`：旧表格卡片层，默认不加载；现代替代层为 `09-table-manage-detail.css`
- `04-settings-legacy.css`：旧设置页层，默认不加载；现代替代层为 `07-settings-modern.css`

## Phase B 目标 legacy 目录
- 未来目标归档目录：`styles/legacy/phone-base/`
- 在真正迁移前，legacy 文件继续保留在当前目录，避免破坏历史文档锚点、脚本检查与人工检索路径。
- 详见 `../legacy/phone-base/README.md` 中的目标归档约定。

## 当前策略
1. legacy 文件只保留历史参考 / 回滚比对价值，不再作为默认入口的一部分。
2. 顶层入口与聚合入口继续保持 `style.css`、`styles/01-phone-base.css` 两层契约稳定。
3. 若后续迁移到独立 `legacy/` 目录，应先保留文件名映射与归档说明，再处理物理移动。
4. 原路径桥接说明移除前，必须先完成一轮护栏与文档回归验证。
