import { onPhoneActivated, onPhoneDeactivated, destroyPhoneRuntime } from '../phone-core/lifecycle.js';
import {
    getPhoneSettings,
    resetPhoneSettingsToDefault,
    flushPhoneSettingsSave,
    savePhoneSettingsPatch,
    migrateLegacyPhoneSettings,
} from '../settings.js';
import { EventManager } from '../utils/event-manager.js';
import { cleanupIntegration } from '../integration/cleanup.js';
import { showNotification } from '../integration/toast-bridge.js';
import {
    registerSlashCommands,
    unregisterSlashCommands,
    registerCommandHandler,
    isSlashCommandsRegistered,
} from '../slash-commands.js';
import {
    Logger,
    handleError,
    configureErrorHandler,
} from '../error-handler.js';
import {
    initializePhoneBootstrapUi,
    setPhoneBootstrapEnabledState,
    togglePhoneBootstrapVisibility,
    unmountPhoneBootstrapUi,
} from '../bootstrap/app-bootstrap.js';
import { registerPhoneSlashCommandHandlers } from '../bootstrap/command-registry.js';
import {
    bindPhoneBootstrapWindowEvents,
    registerPhoneEventListeners,
} from '../bootstrap/event-registry.js';

const ASSISTANT_VERSION = '1.4.2-assistant';
const logger = Logger.withScope({ scope: 'assistant/entry' });
const globalEventManager = new EventManager('yuzi-phone-assistant-events');

let initPromise = null;
let initialized = false;
let initializing = false;
let destroying = false;
let slashHandlersReady = false;
let lifecycleToken = 0;
let windowEventsBound = false;
let initRunId = 0;
let activeInitRunId = 0;
let pendingDomReadyReject = null;

function togglePhone(show) {
    return togglePhoneBootstrapVisibility(show, {
        onPhoneActivated,
        onPhoneDeactivated,
    });
}

function setPhoneEnabledWithUI(enabled) {
    return setPhoneBootstrapEnabledState(enabled, {
        onToggle: togglePhone,
    });
}

function setupSlashHandlers() {
    if (slashHandlersReady) return true;
    const ok = registerPhoneSlashCommandHandlers({
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
    slashHandlersReady = !!ok;
    return slashHandlersReady;
}

async function registerEventListeners(options = {}) {
    const { shouldAbort } = options;
    await registerPhoneEventListeners({
        shouldAbort,
        onVisiblePhoneRefresh: () => {
            onPhoneDeactivated();
            window.setTimeout(() => onPhoneActivated(), 100);
        },
    });
}

function isActiveToken(token) {
    return token === lifecycleToken;
}

function ensureActiveToken(token) {
    if (!isActiveToken(token)) {
        throw new Error('助手生命周期令牌已失效');
    }
}

function waitForDomReady(token) {
    if (typeof document === 'undefined' || document.readyState !== 'loading') {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        pendingDomReadyReject = reject;
        const onReady = () => {
            try {
                ensureActiveToken(token);
                pendingDomReadyReject = null;
                resolve();
            } catch (error) {
                pendingDomReadyReject = null;
                reject(error);
            }
        };
        globalEventManager.add(document, 'DOMContentLoaded', onReady, { once: true });
    });
}

function cancelPendingDomReadyWaiter(reason = '助手初始化等待已取消') {
    if (typeof pendingDomReadyReject === 'function') {
        const reject = pendingDomReadyReject;
        pendingDomReadyReject = null;
        reject(new Error(reason));
    }
}

function ensureWindowEventsBound() {
    if (windowEventsBound) {
        return;
    }
    bindPhoneBootstrapWindowEvents(globalEventManager);
    windowEventsBound = true;
}

function runCleanupTask(taskName, task) {
    try {
        task();
    } catch (error) {
        logger.warn({
            feature: 'assistant',
            action: 'cleanup.partial_failure',
            message: `助手清理任务失败: ${taskName}`,
            context: { error },
        });
    }
}

function cleanupAssistantRuntime() {
    cancelPendingDomReadyWaiter();
    runCleanupTask('unregisterSlashCommands', () => unregisterSlashCommands());
    slashHandlersReady = false;
    runCleanupTask('destroyPhoneRuntime', () => destroyPhoneRuntime());
    runCleanupTask('cleanupIntegration', () => cleanupIntegration());
    runCleanupTask('unmountPhoneBootstrapUi', () => unmountPhoneBootstrapUi());
    runCleanupTask('flushPhoneSettingsSave', () => flushPhoneSettingsSave());
    runCleanupTask('globalEventManager.dispose', () => globalEventManager.dispose());
    windowEventsBound = false;
    initialized = false;
    initializing = false;
    initPromise = null;
}

function rollbackInitializationFailure(error, token, runId) {
    if (!isActiveToken(token) && activeInitRunId !== runId) {
        return;
    }
    logger.warn({
        feature: 'assistant',
        action: 'initialize.rollback',
        message: '助手入口初始化失败，开始回滚',
        context: { error },
    });
    cleanupAssistantRuntime();
}

function installGlobalApi(api) {
    if (typeof window === 'undefined') {
        return;
    }
    const existing = window.YuziPhoneAssistant;
    if (existing && existing !== api) {
        const isKnownAssistant = existing?.__yuziPhoneAssistant === true;
        if (!isKnownAssistant) {
            logger.error({
                feature: 'assistant',
                action: 'api.global_collision_rejected',
                message: '检测到未知 window.YuziPhoneAssistant，拒绝覆盖',
            });
            return false;
        }

        if (typeof existing.destroy === 'function') {
            try {
                existing.destroy();
            } catch (error) {
                logger.warn({
                    feature: 'assistant',
                    action: 'api.global_collision_destroy_failed',
                    message: '覆盖旧助手实例前销毁失败，继续安装新实例',
                    context: { error },
                });
            }
        }

        logger.warn({
            feature: 'assistant',
            action: 'api.global_collision_replace',
            message: '检测到旧助手实例，已按单开策略替换',
        });
    }
    window.YuziPhoneAssistant = api;
    return true;
}


async function doInitialize(token) {
    ensureActiveToken(token);
    await waitForDomReady(token);
    ensureActiveToken(token);
    ensureWindowEventsBound();

    await initializePhoneBootstrapUi({
        migrateLegacyPhoneSettings,
        getPhoneSettings,
        setPhoneEnabledWithUI,
        registerEventListeners,
        onToggle: togglePhone,
        shouldAbort: () => !isActiveToken(token) || destroying,
    });

    ensureActiveToken(token);

    const slashRegisteredNow = registerSlashCommands();
    if (slashRegisteredNow || isSlashCommandsRegistered()) {
        setupSlashHandlers();
    }

    ensureActiveToken(token);

    initialized = true;
    logger.info({
        feature: 'assistant',
        action: 'initialize.complete',
        message: '助手入口初始化完成',
        context: { version: ASSISTANT_VERSION },
    });

    showNotification(`玉子手机助手已加载 (v${ASSISTANT_VERSION})`, 'success');
}

export async function init() {
    if (destroying) {
        return false;
    }
    if (initialized) {
        return true;
    }
    if (initializing && initPromise) {
        return initPromise;
    }

    const token = lifecycleToken;
    const runId = ++initRunId;
    activeInitRunId = runId;
    initializing = true;
    initPromise = doInitialize(token);

    try {
        await initPromise;
        return isActiveToken(token) && initialized;
    } catch (error) {
        handleError(error, '助手入口初始化失败');
        rollbackInitializationFailure(error, token, runId);
        return false;
    } finally {
        if (activeInitRunId === runId) {
            activeInitRunId = 0;
        }
        if (isActiveToken(token)) {
            initializing = false;
            initPromise = null;
        }
    }
}

export function open() {
    return togglePhone(true);
}

export function close() {
    return togglePhone(false);
}

export function toggle() {
    return togglePhone();
}

export function destroy() {
    if (destroying) return false;

    lifecycleToken += 1;
    cancelPendingDomReadyWaiter('助手初始化等待因 destroy() 被取消');
    destroying = true;
    try {
        cleanupAssistantRuntime();
        return true;
    } catch (error) {
        handleError(error, '助手入口卸载失败');
        return false;
    } finally {
        destroying = false;
    }
}

export function getState() {
    return {
        initialized,
        initializing,
        destroying,
        slashHandlersReady,
        slashRegistered: isSlashCommandsRegistered(),
    };
}

configureErrorHandler({
    enableLogging: true,
    enableNotification: true,
    logLevel: 'info',
});

const api = {
    __yuziPhoneAssistant: true,
    version: ASSISTANT_VERSION,
    init,
    open,
    close,
    toggle,
    destroy,
    getState,
};

installGlobalApi(api);

export default api;
