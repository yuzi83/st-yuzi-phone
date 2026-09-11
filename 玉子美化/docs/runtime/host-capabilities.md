# 美化页面宿主能力合同

本文件与 `host-capabilities.d.ts` 是制作包内自足的作者参考；无需读取小手机目录。基本生命周期、表快照、资源和四个导航动作沿用 `runtime-api-v1.md`。不要将旧文档的“v1 不提供 AI”误解为禁止本文件明确列出的受控生图动作；它们不开放通用 AI、数据库或任意宿主对象。

## 声明与运行时不是同一个版本号

普通页面不声明新能力时继续输出 formatVersion 2 / apiVersion 1；存在 `integrations`、`imageGeneration` 或 `displays` 时工具自动输出 formatVersion 3 / apiVersion 2。

当前页面 context.apiVersion 仍为 1（基础页面上下文），**不要用它等于2来判断能否生图**。先声明能力，再检查 `context.actions.generateImage` 等方法是否存在。编号由制作工具处理，不增加用户版本选择步骤。

## 字体与主题

在 item 上声明 `integrations: {font: true}`，或登记时传 `--font`。宿主会在当前根节点设置 `--yuzi-content-preset-font-family`，并随主设置更新；作者用 CSS 消费它，清除页面中阻断继承的硬编码字体，按钮、SVG文字也要覆盖。

```css
.my-page { font-family: var(--yuzi-content-preset-font-family, var(--yuzi-phone-font-family, system-ui)); }
.my-page button { font-family: inherit; }
```

`--yuzi-phone-font-family` 是手机壳的全局视觉变量；公开预设桥接变量是 `--yuzi-content-preset-font-family`。桥接不设置字号、颜色、布局。`integrations: {theme: true}` 同理提供 `--yuzi-content-preset-theme-mode`（light/dark），不自动给所有部件配色。主设置的真实资源加载与联动必须在宿主另验；制作环境不是手机设置页。

## 生图画布声明

“画布”是一个命名图片位置，不是 HTML canvas 元素。页面只能声明自己的目标表；稳定标识和描述字段都必须在 item.target.fields 中，并与真实表匹配。

```json
{
  "tableName": "人物表",
  "stableIdentityFields": ["人物编号"],
  "canvas": "avatar",
  "promptFields": ["性别", "年龄", "外貌特征", "身份"],
  "promptSuffix": "单人头像，1∶1正方形构图，头肩特写，人物居中，适当留白。用户补充：柔和光线。"
}
```

对象位于 `item.imageGeneration.canvases` 数组；`project:add-item --canvas '<上述JSON>'` 可重复传入多个画布。`promptSuffix` 是可选字符串：保存经用户确认的构图与自定义补充，空值或省略不附加。旧画布不受影响。工作台不会自动写入上述示例里的“柔和光线”。

宿主先按 promptFields 顺序组合“字段名：内容”，再换行追加 promptSuffix，然后沿用小手机主设置的人物提示词处理与可选转换流程。页面不能直接传密钥或修改主设置。当前公开方法没有 width/height/aspectRatio 参数；比例文字只指导构图，不保证出图尺寸。

## 六个公开图片动作

以下方法位于 `context.actions`；只对已声明画布的页面提供。没有方法时显示“当前无法生图”，保留原图与原功能，不伪装成功、不猜备用私有入口。

| 方法 | 参数与结果 |
| --- | --- |
| `generateImage(canvasName, rowValues)` | 画布名和当前行的字段对象；返回Promise。成功为 `{ok:true,status:'generated',imagePath,previousImagePath,record}`；imagePath可用于img.src。 |
| `saveImage(canvasName, rowValues, image)` | 保存用户上传的Blob，PNG/JPEG/WebP/GIF且大于0、不超过8MiB；成功为saved，带imagePath。不发起生图。 |
| `deleteImage(canvasName, rowValues)` | 清空该画布的稳定图片归属，成功为deleted；重开后仍为空。不会删除可能共享的底层图片文件。 |
| `readImage(canvasName, rowValues)` | 参数相同；有图返回 `{ok:true,status:'ready',imagePath,record}`，无图为 `{ok:true,status:'empty',cleared:false}`；曾主动清空则cleared为true，禁止回退到旧头像槽。 |
| `getImageGenerationState(canvasName, rowValues?)` | 检查是否可用；有 `available`、`status`、`canvasName`，可用时有 `sheetKey`。省略行只检查画布/表/开关，不证明某行身份有效。 |
| `subscribeImageGeneration(listener)` | 设置变化时通知；不立即补发，也不是生成进度。返回退订函数，页面清理必须调用。 |

`rowValues` 是 `{"人物编号":"hero", "性别":"女", ...}`，不是行数组，也不是一整张表。通过 getState() 的 headers 与当前行组装。稳定字段要非空且唯一，重新排序不应改变人物身份。

常见非成功结果：

| status | 页面处理 |
| --- | --- |
| disabled | 小手机生图总开关或表开关关闭，保留旧图，提示当前未开启。 |
| unavailable | 当前不可用，不发起其他途径的请求。 |
| invalid-input / invalid-target | 画布声明不符、目标字段缺失或身份不唯一，提示不能确定生成对象。 |
| busy | 同一目标已在生成，不重复提交。 |
| stale | 页面、聊天、绑定或人物已失效，不把迟到结果贴给新的对象。 |
| failed | 生成失败，保留旧图，允许用户手动重试。 |

生图开关只影响生成与生图可用性查询；读取、上传、清空仍可操作，并继续核对当前页面、聊天与目标身份。不要在一次读取失败时清空已展示的头像。对Promise异常也要catch，按钮在finally恢复。生成中应锁定当前请求的身份，结果返回后重新核对，不能只看组件还在不在。

生成图由宿主按聊天、物理表、稳定字段和画布管理。不要把临时Blob URL写入表格，不绕过宿主保存。`presetAssets` 是旧手动上传资源槽，`presetAssets.delete()` 不会清空宿主生图记录。新页面用saveImage/deleteImage统一管理上传与生图；可在readImage返回empty且cleared为false时回退旧上传槽。有新图片或cleared为true时必须以管理记录为准，防止旧图复活。删除清空归属而非物理文件，以免误删其他引用。

正文内嵌展示还须声明 `interactions: ['image-generate']`；popup/barrage不支持生图。组合展示的状态接口不等于单表页面，本文件示例只针对单表页面。

## 组合正文的状态合同

弹窗／插入正文的多表组合不是单表页面的状态。组合展示的 `context.getState()` 会提供当前组合快照，形状如下：

```js
{
  version,
  modelId,
  presetId,
  displayId,
  kind: "inline",
  tables: [
    {
      sheetKey,
      tableName,
      headers,
      rawHeaders,
      rows,
    },
  ],
  events,
  settings,
}
```

`tables` 是已登记来源表的当前快照；每项的 `rows` 是当前数据行，不是需要用户选择的候选列表。页面不决定当前显示哪一行，而是使用 `getState()` 首次渲染，并用 `subscribe()` 接收宿主刷新。`events` 和 `settings` 也是宿主提供的当前上下文，页面只读取，不负责决定哪条记录触发或让用户配置宿主筛选规则。需要历史记录或行选择器时，必须先作为额外的可见功能提出并单独设计。

## 最小示例与测试边界

阅读 `examples/image-avatar/mount.js` 与 `canvas.json`。示例字段仅用于讲解，不应覆盖用户表格。运行 `node tests/preview-image-actions-tests.mjs` 检查本地测试替身。

制作模拟的六个同名方法只操作内存与带 TEST ONLY 标记的测试图，绝不调用真实服务。面板可选成功/失败/关闭/不可用；失败保持原图。沙箱禁止网络请求，远程图片/字体在模拟里也不可用。模拟不能证明真实生图速度、出图比例、主设置、存储、CSP或真实宿主生命周期。

## 弹窗制作入口

小手机有三个弹窗接口：**弹幕**、**弹窗／浮窗**、**弹窗／插入正文**。先问用户做哪一个。制作流程中弹幕和弹窗／浮窗仅单表；只有弹窗／插入正文可多表组合。对应kind为barrage、popup、inline，用户不需要记住代码名。详见 `popup-authoring-workflow.md`；不得以底层历史文件兼容行为代替当前制作规则。

## 图片标识与共用的制作确认

图片能力必须单独确认：制作弹窗／插入正文时，必须主动问“要不要加生图按钮？”，并说明可以只共用页面图片而不加按钮；不得把某个用户选择不加变成通用默认。弹幕和弹窗／浮窗不支持点击生图，应说明限制，不提供不可用选项。图片标识也必须问：用户选择稳定标识字段，AI 检查真实值的空值、重复与稳定性；即使只有一行也不能省略，不擅自选 row_id、姓名、提示词或行位置。已明确的决定不重复问。标识确认是图片归属，不是弹窗显示记录筛选。

同一聊天、实际表、稳定标识规则与值、画布名称一致时，页面与正文弹窗应读取同一图片归属。共用不等于必须两处都有生图按钮，也不等于已验证实时刷新。修改标识规则前说明旧图可能无法继续匹配，不猜测迁移或删除；说明并取得用户确认后才能变更。
