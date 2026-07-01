// index.js
/**
 * 玉子手机 - 独立扩展入口
 * @version 1.4.2
 * @description 集成 SillyTavern 事件系统、TavernHelper API、Slash 命令、错误处理等
 * @fix P0-001 修复 innerHTML XSS 风险
 * @fix P0-002 修复事件监听器内存泄漏
 * @fix P0-003 修复 CSS URL 注入风险
 * @fix P1-002 修复异步初始化竞态条件
 */

import { onPhoneActivated, onPhoneDeactivated, destroyPhoneRuntime } from './modules/phone-core/lifecycle.js';
import {
    getPhoneSettings,
    resetPhoneSettingsToDefault,
    migrateLegacyPhoneSettings,
    flushPhoneSettingsSave,
    savePhoneSettingsPatch,
} from './modules/settings.js';
import { createPhoneSettingsPanel, destroyPhoneSettingsPanel } from './modules/settings-panel.js';
import { EventManager } from './modules/utils/event-manager.js';
import { cleanupIntegration } from './modules/integration/cleanup.js';
import { showNotification } from './modules/integration/toast-bridge.js';
import {
    getChatMessages,
    getLastMessageId,
    getVariables,
    setVariables,
} from './modules/integration/tavern-helper-bridge.js';
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
    unmountPhoneBootstrapUi,
} from './modules/bootstrap/app-bootstrap.js';
import { registerPhoneSlashCommandHandlers } from './modules/bootstrap/command-registry.js';
import {
    bindPhoneBootstrapWindowEvents,
    registerPhoneEventListeners,
} from './modules/bootstrap/event-registry.js';
import { repairActiveBeautifyTemplateSettings } from './modules/phone-beautify-templates/repository.js';
import { subscribeTableUpdate } from './modules/phone-core/callbacks.js';
import { getCurrentRoute } from './modules/phone-core/routing.js';
import { requestHomePhoneRouteRender } from './modules/phone-core/route-runtime.js';

// 全局事件管理器 - 用于统一管理事件监听器的清理
const EXTENSION_VERSION = '1.4.2';
const globalEventManager = new EventManager();
const logger = Logger.withScope({ scope: 'index' });
const INSTANCE_KEY = '__YUZI_PHONE_INSTANCE__';
const INSTANCE_SOURCE = 'extension';
const INSTANCE_OWNER_TOKEN = `yuzi-phone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const LEGACY_INSTANCE_TRACE_IDS = Object.freeze([
    'yuzi-phone-root',
    'yuzi-phone-standalone',
    'yuzi-phone-toggle',
    'yuzi-phone-settings',
]);
const PHONE_CONTAINER_ID = 'yuzi-phone-standalone';
const HOME_REFRESH_SETTLE_DELAY_MS = 250;
const HOME_REFRESH_WAIT_TIMEOUT_MS = 3500;
let initRetryTimeoutId = null;
let isDestroying = false;
let singletonBlocked = false;
let singletonBlockReason = '';
let pendingHomeRefresh = null;
let homeRefreshTokenCounter = 0;

function getInstanceHost() {
    return typeof window !== 'undefined' ? window : globalThis;
}

function findLegacyInstanceTraces() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return [];
    return LEGACY_INSTANCE_TRACE_IDS.filter(id => !!document.getElementById(id));
}

function getOwnedInstanceRecord() {
    const host = getInstanceHost();
    const record = host?.[INSTANCE_KEY];
    return record && record.ownerToken === INSTANCE_OWNER_TOKEN ? record : null;
}

function setOwnedInstanceStatus(status, extra = {}) {
    const record = getOwnedInstanceRecord();
    if (!record) return;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    Object.assign(record, extra);
}

function releaseSingletonGuard() {
    const host = getInstanceHost();
    if (host?.[INSTANCE_KEY]?.ownerToken === INSTANCE_OWNER_TOKEN) {
        delete host[INSTANCE_KEY];
    }
}

function blockSingletonInitialization(reason, context = {}) {
    singletonBlocked = true;
    singletonBlockReason = reason;
    logger.warn({
        feature: 'lifecycle',
        action: 'singleton.block',
        message: '检测到玉子手机已加载或存在旧实例痕迹，已阻止重复初始化',
        context: { reason, ...context },
    });
    showNotification('检测到玉子手机已加载，请勿同时启用扩展版和脚本版。', 'warning');
    return false;
}

function acquireSingletonGuard() {
    const host = getInstanceHost();
    const existing = host?.[INSTANCE_KEY];
    if (existing && existing.ownerToken !== INSTANCE_OWNER_TOKEN && existing.status !== 'destroyed') {
        return blockSingletonInitialization('active-instance', {
            existingVersion: existing.version,
            existingSource: existing.source,
            existingStatus: existing.status,
        });
    }

    const legacyTraces = findLegacyInstanceTraces();
    if (legacyTraces.length > 0) {
        return blockSingletonInitialization('legacy-traces', { legacyTraces });
    }

    host[INSTANCE_KEY] = {
        version: EXTENSION_VERSION,
        source: INSTANCE_SOURCE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'initializing',
        ownerToken: INSTANCE_OWNER_TOKEN,
        instanceId: INSTANCE_OWNER_TOKEN,
        destroy,
        getInitStatus,
    };
    singletonBlocked = false;
    singletonBlockReason = '';
    return true;
}

function clearInitRetryTimeout() {
    if (initRetryTimeoutId === null) return;
    window.clearTimeout(initRetryTimeoutId);
    initRetryTimeoutId = null;
}

function cancelPendingHomeRefresh(reason = 'cancel') {
    const pending = pendingHomeRefresh;
    if (!pending) return false;

    pendingHomeRefresh = null;
    pending.cancelled = true;
    pending.stage = 'cancelled';

    if (pending.timeoutId !== null) {
        window.clearTimeout(pending.timeoutId);
        pending.timeoutId = null;
    }

    if (pending.settleDelayId !== null) {
        window.clearTimeout(pending.settleDelayId);
        pending.settleDelayId = null;
    }

    if (typeof pending.unsubscribe === 'function') {
        try {
            pending.unsubscribe();
        } catch (error) {
            logger.warn({
                feature: 'home-refresh',
                action: 'pending.unsubscribe',
                message: '主页刷新等待器订阅清理失败',
                context: { reason, token: pending.token },
                error,
            });
        }
        pending.unsubscribe = null;
    }

    logger.debug({
        feature: 'home-refresh',
        action: 'pending.cancel',
        message: '主页刷新等待器已清理',
        context: { reason, token: pending.token },
    });
    return true;
}

function isPhoneVisibleForHomeRefresh() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
        return false;
    }

    const container = document.getElementById(PHONE_CONTAINER_ID);
    return !!container && container.classList.contains('visible');
}

function scheduleVisibleHomeRefreshAfterTableUpdate() {
    cancelPendingHomeRefresh('replace');

    if (isDestroying) {
        return false;
    }

    if (!isPhoneVisibleForHomeRefresh()) {
        return false;
    }

    if (getCurrentRoute() !== 'home') {
        logger.debug({
            feature: 'home-refresh',
            action: 'pending.skip',
            message: '聊天切换后主页刷新跳过：当前 route 不是 home',
            context: { route: getCurrentRoute() },
        });
        return false;
    }

    const token = homeRefreshTokenCounter + 1;
    homeRefreshTokenCounter = token;

    const pending = {
        token,
        stage: 'waiting-table-update',
        updateCount: 0,
        cancelled: false,
        timeoutId: null,
        settleDelayId: null,
        unsubscribe: null,
    };

    const onTableUpdate = () => {
        if (pendingHomeRefresh !== pending || pending.cancelled || pending.token !== token) return;
        if (pending.stage !== 'waiting-table-update') return;

        // shujuku 在 CHAT_CHANGED 后会先发送运行时清空通知，再发送重建完成后的最终通知。
        // 第一段通知是切换中间态，必须忽略；第二段通知才代表当前聊天数据库最终态，
        // 即使最终态没有 sheet_* 表，也应该允许主页刷新为空表。
        pending.updateCount += 1;
        if (pending.updateCount < 2) {
            logger.debug({
                feature: 'home-refresh',
                action: 'pending.wait-second-update',
                message: '聊天切换后主页刷新等待第二段表格更新信号',
                context: { token, updateCount: pending.updateCount },
            });
            return;
        }

        logger.debug({
            feature: 'home-refresh',
            action: 'pending.second-update-received',
            message: '聊天切换后主页刷新已收到第二段表格更新信号，进入稳定等待',
            context: { token, updateCount: pending.updateCount },
        });

        pending.stage = 'settling';

        if (typeof pending.unsubscribe === 'function') {
            try {
                pending.unsubscribe();
            } catch (error) {
                logger.warn({
                    feature: 'home-refresh',
                    action: 'pending.unsubscribe',
                    message: '主页刷新等待器订阅清理失败',
                    context: { reason: 'table-update', token },
                    error,
                });
            }
            pending.unsubscribe = null;
        }

        if (pending.timeoutId !== null) {
            window.clearTimeout(pending.timeoutId);
            pending.timeoutId = null;
        }

        pending.settleDelayId = window.setTimeout(() => {
            if (pendingHomeRefresh !== pending || pending.cancelled || pending.token !== token || pending.stage !== 'settling') {
                return;
            }

            try {
                if (!isDestroying && isPhoneVisibleForHomeRefresh() && getCurrentRoute() === 'home') {
                    void requestHomePhoneRouteRender({
                        reason: 'chat-change-table-update',
                    });
                }
            } finally {
                cancelPendingHomeRefresh('settled');
            }
        }, HOME_REFRESH_SETTLE_DELAY_MS);
    };

    pendingHomeRefresh = pending;
    pending.unsubscribe = subscribeTableUpdate(onTableUpdate);
    pending.timeoutId = window.setTimeout(() => {
        cancelPendingHomeRefresh('timeout');
    }, HOME_REFRESH_WAIT_TIMEOUT_MS);

    return true;
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
        savePhoneSettingsPatch,
        flushPhoneSettingsSave,
        setPhoneEnabledWithUI,
    });
}

/**
 * 注册 SillyTavern 事件监听器
 */
async function registerEventListeners() {
    await registerPhoneEventListeners({
        onVisiblePhoneRefresh: scheduleVisibleHomeRefreshAfterTableUpdate,
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
        setOwnedInstanceStatus('initialized');
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
    setOwnedInstanceStatus('initializing');

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

    repairActiveBeautifyTemplateSettings();

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
        context: { version: EXTENSION_VERSION },
    });
    showNotification(`玉子手机已加载 (v${EXTENSION_VERSION})`, 'success');
}

/**
 * 初始化函数
 */
(function init() {
    if (!acquireSingletonGuard()) return;

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
            setOwnedInstanceStatus('failed', { lastError: error?.message || String(error) });
            releaseSingletonGuard();
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
        isDestroying,
        singletonBlocked,
        singletonBlockReason,
        instanceId: INSTANCE_OWNER_TOKEN,
    };
}

/**
 * 销毁函数 - 清理所有资源
 */
export function destroy() {
    if (singletonBlocked) return;

    if (isDestroying) {
        logger.warn({
            feature: 'lifecycle',
            action: 'destroy.skip',
            message: '卸载已在进行中，跳过重复调用',
        });
        return;
    }

    isDestroying = true;
    cancelPendingHomeRefresh('destroy');

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
        destroyPhoneSettingsPanel();
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
        setOwnedInstanceStatus('destroyed');
        cancelPendingHomeRefresh('destroy-finally');
        clearInitRetryTimeout();
        resetInitializationState();
        releaseSingletonGuard();
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

// 导出工具函数
export {
    debounce,
    throttle,
    requestIdleCallback,
    cancelIdleCallback,
    createBatchHandler,
    createSingletonPromise,
} from './modules/utils/timing.js';
export { deepMerge, generateUniqueId } from './modules/utils/object.js';
export { formatFileSize, isMobileDevice, isTouchDevice } from './modules/utils/device.js';
export { createVisibilityObserver, createLazyLoader, createInfiniteScroll } from './modules/utils/observers.js';
export { createPerformanceTimer, createFPSMonitor, getMemoryUsage } from './modules/utils/performance.js';
