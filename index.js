// index.js
/**
 * 玉子手机 - 独立扩展入口
 * @version 1.2.2
 * @description 集成 SillyTavern 事件系统、TavernHelper API、Slash 命令、错误处理等
 * @fix P0-001 修复 innerHTML XSS 风险
 * @fix P0-002 修复事件监听器内存泄漏
 * @fix P0-003 修复 CSS URL 注入风险
 * @fix P1-002 修复异步初始化竞态条件
 */

import { onPhoneActivated, onPhoneDeactivated, destroyPhoneRuntime } from './modules/phone-core.js';
import {
    getPhoneSettings,
    resetPhoneSettingsToDefault,
    migrateLegacyPhoneSettings,
    flushPhoneSettingsSave,
} from './modules/settings.js';
import { createPhoneSettingsPanel } from './modules/settings-panel.js';
import { EventManager } from './modules/utils.js';
import {
    cleanupIntegration,
    showNotification,
    getChatMessages,
    getLastMessageId,
    getVariables,
    setVariables,
} from './modules/integration.js';
import {
    registerSlashCommands,
    unregisterSlashCommands,
    registerCommandHandler,
    isSlashCommandsRegistered,
} from './modules/slash-commands.js';
import {
    Logger,
    handleError,
    YuziPhoneError,
    ErrorCodes,
    configureErrorHandler,
} from './modules/error-handler.js';
import {
    initializePhoneBootstrapUi,
    setPhoneBootstrapEnabledState,
    togglePhoneBootstrapVisibility,
} from './modules/bootstrap/app-bootstrap.js';
import { registerPhoneSlashCommandHandlers } from './modules/bootstrap/command-registry.js';
import {
    bindPhoneBootstrapWindowEvents,
    registerPhoneEventListeners,
} from './modules/bootstrap/event-registry.js';

// 全局事件管理器 - 用于统一管理事件监听器的清理
const globalEventManager = new EventManager();
const logger = Logger.withScope({ scope: 'index' });
let initRetryTimeoutId = null;
let isDestroying = false;

function clearInitRetryTimeout() {
    if (initRetryTimeoutId === null) return;
    window.clearTimeout(initRetryTimeoutId);
    initRetryTimeoutId = null;
}

function resetInitializationState() {
    initPromise = null;
    isInitializing = false;
    isInitialized = false;
    isDestroying = false;
}

function togglePhone(show) {
    return togglePhoneBootstrapVisibility(show, {
        onPhoneActivated,
        onPhoneDeactivated,
    });
}

/**
 * 设置手机启用状态（带UI更新）
 * @param {boolean} enabled 是否启用
 */
function setPhoneEnabledWithUI(enabled) {
    return setPhoneBootstrapEnabledState(enabled, {
        onToggle: togglePhone,
    });
}

/**
 * 注册 Slash 命令处理器
 */
function setupSlashCommandHandlers() {
    return registerPhoneSlashCommandHandlers({
        registerCommandHandler,
        togglePhone,
        onPhoneActivated,
        onPhoneDeactivated,
        destroyPhoneRuntime,
        resetPhoneSettingsToDefault,
        getPhoneSettings,
        setPhoneEnabledWithUI,
    });
}

/**
 * 注册 SillyTavern 事件监听器
 */
async function registerEventListeners() {
    await registerPhoneEventListeners({
        onVisiblePhoneRefresh: () => {
            onPhoneDeactivated();
            window.setTimeout(() => onPhoneActivated(), 100);
        },
    });
}

/**
 * 初始化状态管理
 * @fix P1-002 防止异步初始化竞态条件
 */
let initPromise = null;
let isInitializing = false;
let isInitialized = false;

/**
 * 确保初始化只执行一次
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
    if (isDestroying) {
        logger.warn({
            feature: 'lifecycle',
            action: 'initialize.skip',
            message: '初始化被跳过：当前正在卸载',
        });
        return initPromise || Promise.resolve();
    }

    // 已经初始化完成
    if (isInitialized && initPromise) {
        return initPromise;
    }

    // 正在初始化中，返回现有的 Promise
    if (isInitializing && initPromise) {
        return initPromise;
    }

    // 开始初始化
    isInitializing = true;
    initPromise = doInitialize();

    try {
        await initPromise;
        isInitialized = true;
    } finally {
        isInitializing = false;
    }

    return initPromise;
}

/**
 * 执行实际的初始化逻辑
 * @returns {Promise<void>}
 */
async function doInitialize() {
    if (isDestroying) {
        logger.warn({
            feature: 'lifecycle',
            action: 'initialize.skip',
            message: '初始化被跳过：当前正在卸载',
        });
        return;
    }

    await initializePhoneBootstrapUi({
        migrateLegacyPhoneSettings,
        getPhoneSettings,
        createPhoneSettingsPanel,
        setPhoneEnabledWithUI,
        registerEventListeners,
        onToggle: togglePhone,
    });

    // 6. 注册 Slash 命令
    if (registerSlashCommands()) {
        setupSlashCommandHandlers();
        logger.info({
            feature: 'slash',
            action: 'register',
            message: 'Slash 命令已注册',
        });
    } else {
        logger.warn({
            feature: 'slash',
            action: 'register',
            message: 'Slash 命令注册失败，使用降级方案',
        });
    }

    logger.info({
        feature: 'lifecycle',
        action: 'initialize.complete',
        message: '扩展初始化完成',
        context: { version: '1.2.2' },
    });
    showNotification('玉子手机已加载 (v1.2.2)', 'success');
}

/**
 * 初始化函数
 */
(function init() {
    // 配置错误处理器
    configureErrorHandler({
        enableLogging: true,
        enableNotification: true,
        logLevel: 'info',
    });

    bindPhoneBootstrapWindowEvents(globalEventManager);

    /**
     * 就绪回调 - 使用初始化锁防止重复初始化
     */
    const onReady = async () => {
        try {
            logger.info({
                feature: 'lifecycle',
                action: 'initialize.start',
                message: '开始初始化...',
            });
            await ensureInitialized();
        } catch (error) {
            handleError(error, '玉子手机初始化失败');
            // 重置初始化状态，允许重试
            resetInitializationState();
        }
    };

    // 等待 DOM 就绪
    if (document.readyState === 'loading') {
        globalEventManager.add(document, 'DOMContentLoaded', onReady, { once: true });
    } else {
        initRetryTimeoutId = window.setTimeout(() => {
            initRetryTimeoutId = null;
            onReady();
        }, 100);
    }
})();

/**
 * 获取初始化状态
 * @returns {{isInitialized: boolean, isInitializing: boolean}}
 */
export function getInitStatus() {
    return {
        isInitialized,
        isInitializing,
    };
}

/**
 * 销毁函数 - 清理所有资源
 */
export function destroy() {
    if (isDestroying) {
        logger.warn({
            feature: 'lifecycle',
            action: 'destroy.skip',
            message: '卸载已在进行中，跳过重复调用',
        });
        return;
    }

    isDestroying = true;

    try {
        logger.info({
            feature: 'lifecycle',
            action: 'destroy.start',
            message: '开始卸载...',
        });
        clearInitRetryTimeout();

        // 1. 注销 Slash 命令
        unregisterSlashCommands();

        // 2. 销毁手机运行时
        destroyPhoneRuntime();

        // 3. 清理事件监听器
        cleanupIntegration();

        // P0-002 修复: 清理全局事件管理器中的所有事件监听器
        globalEventManager.dispose();
        unmountPhoneBootstrapUi();

        // 4. 保存设置
        flushPhoneSettingsSave();

        logger.info({
            feature: 'lifecycle',
            action: 'destroy.complete',
            message: '扩展已卸载',
        });
        showNotification('玉子手机已卸载', 'info');
    } catch (error) {
        handleError(error, '卸载错误');
    } finally {
        clearInitRetryTimeout();
        resetInitializationState();
    }
}

/**
 * 导出 API 供外部使用
 */
export {
    // 集成 API
    getChatMessages,
    getLastMessageId,
    getVariables,
    setVariables,
    showNotification,
    
    // Slash 命令
    registerSlashCommands,
    unregisterSlashCommands,
    registerCommandHandler,
    isSlashCommandsRegistered,
    
    // 错误处理
    Logger,
    handleError,
    YuziPhoneError,
    ErrorCodes,
    configureErrorHandler,
};

// 导出虚拟滚动（按需使用）
export { VirtualScroll, createVirtualScroll, renderVirtualList } from './modules/virtual-scroll.js';

// 导出工具函数
export {
    debounce,
    throttle,
    requestIdleCallback,
    cancelIdleCallback,
    createBatchHandler,
    createSingletonPromise,
    deepMerge,
    generateUniqueId,
    formatFileSize,
    isMobileDevice,
    isTouchDevice,
    createVisibilityObserver,
    createLazyLoader,
    createInfiniteScroll,
    createPerformanceTimer,
    createFPSMonitor,
    getMemoryUsage,
} from './modules/utils.js';
