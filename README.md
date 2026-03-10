# 📱 Yuzi Phone 玉子手机

[![GitHub release](https://img.shields.io/github/v/release/yuzi83/st-yuzi-phone)](https://github.com/yuzi83/st-yuzi-phone/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

SillyTavern 独立手机扩展，提供手机壳 UI、主屏 App、表格查看与配置桥接能力。  
本仓库为独立发布线，不依赖 `st-tamako-market` 运行。

## ✨ 功能特性

- 📱 **独立手机容器**：支持浮动显示、拖拽移动、边角缩放
- 🏠 **手机主屏 App**：模块化入口与导航切换
- 📊 **表格查看能力**：支持表格内容浏览与卡片化展示
- 🔧 **数据库配置桥接**：可读取/写入数据库更新配置（依赖 `AutoCardUpdaterAPI`）
- 🧩 **模板渲染支持**：专属模板 + 通用模板作用域
- 💾 **独立设置命名空间**：使用 `extensionSettings.YuziPhone`
- 🔁 **旧数据一次性迁移**：支持从历史 `TamakoMarket.phone` 与旧本地键迁移

## 📌 Changelog

### 1.1.2

- 修复手机端滚动
- 路由历史/事件清理，避免回调堆积
- 移除 jQuery 依赖，改为原生 DOM 操作
- 存储配额异常处理更稳健
- 手机端缓存优化（背景/图标写入缓存并带 TTL）

## 📥 安装方法

### 方法一：URL 安装（推荐）

1. 打开 SillyTavern
2. 进入 **扩展** → **安装扩展**
3. 输入仓库地址：`https://github.com/yuzi83/st-yuzi-phone`
4. 点击安装并重启 SillyTavern

### 方法二：手动安装

1. [下载最新版本](https://github.com/yuzi83/st-yuzi-phone/releases)
2. 解压到 SillyTavern 的 `SillyTavern-1.15.0\public\scripts\extensions\third-party` 目录
3. 重启 SillyTavern

## 🚀 使用说明

1. 启动后会出现 **玉子手机** 悬浮按钮
2. 点击按钮打开手机容器
3. 在手机界面中进入各 App 页面执行查看与配置操作

### 交互说明

- **按钮拖拽**：拖动悬浮按钮改变位置
- **手机拖拽**：拖动刘海区/状态栏移动容器
- **手机缩放**：拖动右下缩放柄调整尺寸
- **位置与尺寸记忆**：自动保存到 `YuziPhone` 设置

## ⚙️ 配置与存储

### 扩展设置命名空间

- 主命名空间：`extensionSettings.YuziPhone`
- 典型字段：
  - `enabled`
  - `phoneToggleX / phoneToggleY`
  - `phoneContainerX / phoneContainerY`
  - `phoneContainerWidth / phoneContainerHeight`
  - `backgroundImage`
  - `appIcons`

### 本地存储键

- 当前键：`yzp_special_choices_v1`
- 兼容读取旧键：`tamako_phone_special_choices_v1`（迁移后写回新键）

## 🔁 迁移策略（保留白名单）

为保证历史用户无感迁移，允许以下**一次性迁移读取**：

1. `extensionSettings.TamakoMarket.phone` → 迁移到 `extensionSettings.YuziPhone`
2. `tamako_phone_special_choices_v1` → 迁移到 `yzp_special_choices_v1`

> 说明：以上仅用于旧数据迁移，不构成运行时依赖。新写入全部落在 `YuziPhone` 与 `yzp_*` 命名空间。

## 🧩 依赖说明

- 运行环境：SillyTavern 扩展系统
- 外部桥接：`AutoCardUpdaterAPI`（若未加载，对应功能会降级并提示）

## 📁 项目结构

```text
st-yuzi-phone/
├── index.js
├── manifest.json
├── style.css
├── README.md
├── modules/
│   ├── settings.js
│   ├── window.js
│   ├── phone-core.js
│   ├── phone-home.js
│   ├── phone-fusion.js
│   ├── phone-settings.js
│   ├── phone-table-viewer.js
│   └── phone-beautify-templates.js
└── styles/
    ├── 00-phone-shell.css
    ├── 01-phone-base.css
    ├── 02-phone-nav-detail.css
    ├── 03-phone-special-base.css
    ├── 04-phone-special-interactions.css
    └── 05-phone-generic-template.css
```

## ✅ 独立性约束

- 不引用 `st-tamako-market` 路径
- 不写入 `TamakoMarket` 新配置
- 不新增 `tamako-*` 样式作用域
- 仅保留迁移白名单中的旧键读取

## 📄 License

[MIT License](https://opensource.org/licenses/MIT)

