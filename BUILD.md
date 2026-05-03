# 构建说明

## 首次设置

1. 安装 Node.js 18+。当前验证环境为 Node.js v22.19.0、npm 10.9.3。
2. 在扩展根目录执行：

```cmd
npm install
```

这会安装 esbuild 到 `node_modules/`。

## 日常开发

| 命令 | 用途 |
|------|------|
| `npm run build` | 生产构建（minified，发版用） |
| `npm run build:dev` | 一次性开发构建（未压缩，调试用） |
| `npm run build:watch` | 监听模式（未压缩，自动重建） |
| `npm run lint` | 静态代码检查（ESLint） |
| `npm run check` | 运行全部 contract checks，任何失败都会让命令失败 |
| `npm run check:ci` | 运行全部 contract checks，并额外校验历史失败基线是否仍匹配；当前基线应为 0 |

生产构建输出：

- `dist/yuzi-phone.bundle.js`
- `dist/yuzi-phone.bundle.js.map`
- `dist/yuzi-phone.bundle.css`
- `dist/yuzi-phone.bundle.css.map`

开发构建与监听模式也输出到同一组 `dist/` 文件。发版前必须重新执行 `npm run build`，不要把开发构建产物提交到 main。

发布前的最低自动化门禁是：`npm run lint`、`npm run check`、`npm run check:ci`、`npm run build` 全部通过。`check` 证明合同脚本真实全绿；`check:ci` 额外证明历史失败基线没有过期或重新堆积。当前项目不允许保留历史失败基线，否则发布链路就是假绿。

## 文件结构

- `index.js`：源码 JS 入口。
- `style.css`：源码 CSS 入口。
- `modules/`：业务模块。
- `styles/`：样式分层源码。
- `build.mjs`：esbuild 打包脚本。
- `dist/`：构建产物。
- `scripts/`：contract 静态检查。

## 为什么 `dist/` 必须提交

SillyTavern 的 `auto_update: true` 只会拉取仓库内容，不会自动执行：

```cmd
npm install
npm run build
```

所以 `dist/` 不能加入 `.gitignore`。如果仓库里没有 `dist/`，使用 auto_update 的环境会拿不到实际加载入口。

## 发布新版本

1. 修改 `manifest.json` 的 `version`。
2. 同步修改 `index.js` 文件头 `@version` 和 `EXTENSION_VERSION`。
3. 在 `CHANGELOG.md` 顶部新增对应版本条目（从 `[Unreleased]` 拷贝并加日期）。
4. 执行：

```cmd
npm run lint
npm run check
npm run check:ci
npm run build
```

5. 确认 `manifest.json` 的 `js` / `css` 仍指向 `dist/yuzi-phone.bundle.js` 与 `dist/yuzi-phone.bundle.css`，并确认这两个文件由上一步构建生成且非空。
6. 确认浏览器回归通过。
7. 提交以下关键文件：

```cmd
git add manifest.json index.js package.json package-lock.json build.mjs BUILD.md .gitignore .gitattributes .eslintrc.json CHANGELOG.md .github/ scripts/ dist/
```

8. 打 git tag 并推送：

```cmd
git tag v1.4.0
git push --tags
```

## 调试技巧

- 浏览器 Network 标签确认加载的是 `dist/yuzi-phone.bundle.js` 和 `dist/yuzi-phone.bundle.css`。
- 如果 Console 报错，优先看 sourcemap 映射到的源码位置。
- 如果样式异常，先确认 `dist/yuzi-phone.bundle.css` 是否重新生成。
- 如果扩展完全不加载，先检查 `manifest.json` 的 `js` / `css` 路径是否指向存在的文件。
