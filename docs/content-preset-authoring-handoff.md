# 内容预设能力的作者交接

这是一条维护流程，不是普通用户制作美化的操作步骤。

小手机提供公开能力，玉子美化制作包必须自带完整的使用说明、类型、最小示例和本地测试替身。普通用户拿到制作包与表格即可制作，不需要小手机源码、内部服务对象或父项目依赖。

## 单一作者参考

作者说明随 `玉子美化/docs/runtime/` 交付：

- `authoring-workflow.md`：先检查能力再集中讨论；画框显示尺寸/比例、完整拼接提示词、可选用户补充；模拟永远只测试。
- `host-capabilities.md` 与 `.d.ts`：声明、调用、返回值、错误与生命周期。
- `玉子美化/examples/image-avatar/`：最小声明和独立页面示例。

维护者修改内容预设 actions、画布声明、外观桥接或提示词拼接时，同时更新这些文件和相应检查。不要重复维护一份不同步的作者文档，也不要要求作者到 modules 里推测签名。

## 当前接入路径

页面 `context.actions` 公开 generateImage、readImage、saveImage、deleteImage、getImageGenerationState、subscribeImageGeneration。上传和生图共用稳定图片归属；清空后写入持久空记录，旧上传不能回退复活，底层文件不做破坏性删除。image-actions 把声明和当前行交给共享生图宿主；页面不调用内部 imageRuntime。图片的稳定归属仍由宿主处理。

画布可选 `promptSuffix` 保存已确认的构图要求与用户自定义补充；先拼表格描述，再附加它，随后沿用主设置的提示词处理。字段组合和附加描述都在制作期展示给用户确认。“1∶1”文字不等于接口具有宽高参数。空值或省略不改变旧画布。

字体声明映射到 `--yuzi-content-preset-font-family`，不把作者引向手机内部设置服务。

## 检查与职责

- `node scripts/check-beautify-authoring-handoff.cjs`：作者示例可被宿主识别，公开动作有配套说明/类型。
- `node scripts/check-content-presets-default-image-generation-host.cjs`：提示词附加描述抵达现有生图组合链（测试替身，不进行真实生成）。
- `node scripts/check-content-presets-page-host-capabilities.cjs`：声明的导入、导出、回读与坏参数。
- 在玉子美化目录运行自己的 `npm run verify`：不引用父目录模块、测试图片与模拟状态、流程要求、声明与打包。

制作期模拟永远不调用真实生图，没有真实模式切换，不读取服务密钥。真实用户使用产生的服务调用属于小手机，不属于模拟。不要添加面向小白的手机版本调查或升级审批步骤；技术合同编号由工具处理。
