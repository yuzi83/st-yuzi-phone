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
- 🎯 **SillyTavern 集成**：事件系统、TavernHelper API、聊天历史访问
- 🔔 **统一通知系统**：使用 SillyTavern 的 toastr 通知
- ⌨️ **Slash 命令支持**：通过命令行快速操作手机
- 🚀 **性能优化**：虚拟滚动、防抖节流、资源管理

## 🆕 v1.2.0 新功能

### ⌨️ Slash 命令系统

支持通过命令行快速操作手机：

```
/phone              - 切换手机状态
/phone open         - 打开手机
/phone close        - 关闭手机
/phone toggle       - 切换手机状态
/phone reset        - 重置手机位置
/phone status       - 查看手机状态
/phone help         - 显示帮助信息

/phone-table <表名> - 在手机中打开指定表格
/phone-tables       - 列出所有可用表格

/phone-settings reset   - 重置设置
/phone-settings export  - 导出设置到剪贴板
```

### 🛠️ 错误处理系统

- ✅ 统一的错误处理和日志记录
- ✅ 自定义错误类型和错误代码
- ✅ 错误包装器 `withErrorHandler`
- ✅ 断言函数和默认值处理

### 🚀 性能优化工具

#### 防抖和节流
```javascript
import { debounce, throttle } from './modules/utils.js';

// 防抖 - 延迟执行
const debouncedSave = debounce(saveData, 300);
input.addEventListener('input', debouncedSave);

// 节流 - 间隔执行
const throttledScroll = throttle(handleScroll, 100);
window.addEventListener('scroll', throttledScroll);
```

#### 虚拟滚动
```javascript
import { VirtualScroll } from './modules/virtual-scroll.js';

const virtualScroll = new VirtualScroll(container, {
    itemHeight: 60,
    bufferSize: 3,
});

virtualScroll.setRenderFunction((item, index) => {
    const element = document.createElement('div');
    element.textContent = item.name;
    return element;
});

virtualScroll.setItems(largeDataArray);
```

#### 批量处理
```javascript
import { createBatchHandler } from './modules/utils.js';

const batchUpdate = createBatchHandler((items) => {
    console.log('批量处理:', items);
}, 100);

batchUpdate({ id: 1 });
batchUpdate({ id: 2 });
// 100ms 后一次性处理
```

### 📚 工具函数扩展

新增实用工具函数：

- `debounce` - 防抖函数
- `throttle` - 节流函数
- `requestIdleCallback` - 空闲回调
- `createBatchHandler` - 批量处理
- `createSingletonPromise` - 单例 Promise
- `deepMerge` - 深度合并
- `generateUniqueId` - 生成唯一 ID
- `formatFileSize` - 格式化文件大小
- `isMobileDevice` - 检测移动设备
- `isTouchDevice` - 检测触摸设备

## 📌 Changelog

### 1.2.0

- ⌨️ **Slash 命令系统**
  - 新增 `/phone` 系列命令
  - 新增 `/phone-table` 表格操作命令
  - 新增 `/phone-settings` 设置命令
  - 支持命令处理器注册

- 🛠️ **错误处理系统**
  - 新增 `error-handler.js` 模块
  - 统一的错误处理和日志记录
  - 自定义错误类型 `YuziPhoneError`
  - 错误代码定义

- 🚀 **性能优化**
  - 新增 `virtual-scroll.js` 虚拟滚动模块
  - 新增防抖、节流工具函数
  - 新增批量处理、单例 Promise 等工具
  - 优化资源管理

- 📚 **代码质量**
  - 完善的 JSDoc 注释
  - 统一的代码风格
  - 模块化设计

### 1.1.3

- 🎯 **核心集成优化**
  - 集成 SillyTavern 事件系统
  - 集成 TavernHelper API
  - 改进设置管理系统
  - 添加类型安全和错误处理
- 🔔 **通知系统**
  - 使用 SillyTavern 的 toastr 通知
  - 统一 UI 风格
- 📚 **代码质量**
  - 添加详细的 JSDoc 注释
  - 改进错误处理
  - 优化代码结构

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
├── index.js                      # 入口文件
├── manifest.json                 # 扩展清单
├── style.css                     # 主样式文件
├── README.md                     # 说明文档
├── modules/
│   ├── integration.js            # SillyTavern 核心集成
│   ├── settings.js               # 设置管理
│   ├── storage-manager.js        # 存储管理
│   ├── runtime-manager.js        # 运行时管理
│   ├── error-handler.js          # 错误处理系统 (v1.2.0)
│   ├── slash-commands.js         # Slash 命令系统 (v1.2.0)
│   ├── virtual-scroll.js         # 虚拟滚动模块 (v1.2.0)
│   ├── utils.js                  # 工具函数 (v1.2.0 增强)
│   ├── phone-core.js             # 手机核心功能
│   ├── phone-home.js             # 主屏UI
│   ├── phone-fusion.js           # 融合功能
│   ├── phone-settings.js         # 手机设置
│   ├── phone-table-viewer.js     # 表格查看器
│   ├── phone-beautify-templates.js # 模板系统
│   ├── settings-panel.js         # 设置面板
│   ├── cache-manager.js          # 缓存管理
│   └── window.js                 # 窗口管理
└── styles/
    ├── 00-phone-shell.css        # 手机外壳样式
    ├── 01-phone-base.css         # 基础样式
    ├── 02-phone-nav-detail.css   # 导航详情样式
    ├── 03-phone-special-base.css # 特殊基础样式
    ├── 04-phone-special-interactions.css # 特殊交互样式
    └── 05-phone-generic-template.css # 通用模板样式
```

## 🔌 API 导出

扩展导出以下 API 供外部使用：

```javascript
// 集成 API
export {
    getChatMessages,      // 获取聊天消息
    getLastMessageId,     // 获取最后消息ID
    getVariables,         // 获取变量
    setVariables,         // 设置变量
    showNotification,     // 显示通知
};

// Slash 命令
export {
    registerSlashCommands,      // 注册 Slash 命令
    unregisterSlashCommands,    // 注销 Slash 命令
    registerCommandHandler,     // 注册命令处理器
    isSlashCommandsRegistered,  // 检查命令是否已注册
};

// 错误处理
export {
    Logger,               // 日志系统
    handleError,          // 错误处理函数
    YuziPhoneError,       // 自定义错误类
    ErrorCodes,           // 错误代码
    configureErrorHandler, // 配置错误处理器
};

// 虚拟滚动
export {
    VirtualScroll,        // 虚拟滚动类
    createVirtualScroll,  // 创建虚拟滚动
    renderVirtualList,    // 渲染虚拟列表
};

// 工具函数
export {
    debounce,             // 防抖函数
    throttle,             // 节流函数
    requestIdleCallback,  // 空闲回调
    cancelIdleCallback,   // 取消空闲回调
    createBatchHandler,   // 批量处理
    createSingletonPromise, // 单例 Promise
    deepMerge,            // 深度合并
    generateUniqueId,     // 生成唯一 ID
    formatFileSize,       // 格式化文件大小
    isMobileDevice,       // 检测移动设备
    isTouchDevice,        // 检测触摸设备
};
```

## ✅ 独立性约束

- 不引用 `st-tamako-market` 路径
- 不写入 `TamakoMarket` 新配置
- 不新增 `tamako-*` 样式作用域
- 仅保留迁移白名单中的旧键读取

## 📄 License

[MIT license](https://opensource.org/licenses/MIT)

