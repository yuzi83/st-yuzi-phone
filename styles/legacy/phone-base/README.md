# styles/legacy/phone-base 目标归档说明

该目录用于未来承接以下 legacy 样式：
- `03-table-legacy.css`
- `04-settings-legacy.css`

## 当前状态
- 这两个文件目前仍保留在 `styles/phone-base/` 原路径。
- 原因不是继续参与默认加载，而是为了保持历史计划、工作日志、护栏脚本与人工检索路径稳定。

## 未来迁移顺序
1. 保持 `styles/phone-base/` 原路径文件不动，先完成目录说明与护栏更新。
2. 物理迁移 legacy 文件到本目录时，在原位置保留桥接说明或极薄占位文件。
3. 更新 `styles/README.md`、`styles/phone-base/README.md`、相关计划文档与护栏脚本。
4. 一轮稳定回归后，再决定是否移除原路径桥接层。

## 现代替代关系
- `03-table-legacy.css` → 现代替代层：`styles/phone-base/09-table-manage-detail.css`
- `04-settings-legacy.css` → 现代替代层：`styles/phone-base/07-settings-modern.css`
