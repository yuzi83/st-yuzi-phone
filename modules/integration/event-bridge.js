import { createRuntimeScope } from '../runtime-manager.js';
import { Logger, handleError } from '../error-handler.js';
import { getSillyTavernContext, clearSillyTavernContextCache } from './context-bridge.js';

function createIntegrationRuntimeScope() {
    return createRuntimeScope('yuzi-integration');
}

let runtime = createIntegrationRuntimeScope();

function resetIntegrationRuntimeScope() {
    runtime.dispose();
    runtime = createIntegrationRuntimeScope();
    return runtime;
}

let eventSource = null;
let eventTypes = null;
let isInitialized = false;

export const EventTypes = {
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_SWIPED: 'message_swiped',
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
    CHAT_CHANGED: 'chat_id_changed',
    CHAT_CREATED: 'chat_created',
    APP_READY: 'app_ready',
    SETTINGS_LOADED: 'settings_loaded_after',
    WORLDINFO_UPDATED: 'worldinfo_updated',
    CHARACTER_PAGE_LOADED: 'character_page_loaded',
    CHARACTER_LOADED: 'character_page_loaded',
};

function resolveEventTypes(candidate = null) {
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }

    if (candidate.eventTypes && typeof candidate.eventTypes === 'object') {
        return candidate.eventTypes;
    }

    if (candidate.event_types && typeof candidate.event_types === 'object') {
        return candidate.event_types;
    }

    return null;
}

function removeEventListenerSafe(source, eventType, listener) {
    if (!source) {
        return false;
    }

    if (typeof source.removeListener === 'function') {
        source.removeListener(eventType, listener);
        return true;
    }

    if (typeof source.off === 'function') {
        source.off(eventType, listener);
        return true;
    }

    return false;
}

async function initEventSystem() {
    if (isInitialized) {
        return eventSource !== null;
    }

    try {
        if (typeof window !== 'undefined' && window.eventSource) {
            eventSource = window.eventSource;
            eventTypes = resolveEventTypes(window)
                || resolveEventTypes(window.SillyTavern)
                || null;
            Logger.info('[玉子手机] 从全局对象获取事件系统成功');
            isInitialized = true;
            return true;
        }

        const context = getSillyTavernContext();
        if (context) {
            if (context.eventSource) {
                eventSource = context.eventSource;
            }
            eventTypes = resolveEventTypes(context)
                || (typeof window !== 'undefined' ? resolveEventTypes(window.SillyTavern) : null)
                || eventTypes;
            if (eventSource) {
                Logger.info('[玉子手机] 从上下文获取事件系统成功');
                isInitialized = true;
                return true;
            }
        }

        if (typeof window !== 'undefined') {
            try {
                const scriptModule = await import('../../../script.js').catch(() => null);
                if (scriptModule) {
                    if (scriptModule.eventSource) {
                        eventSource = scriptModule.eventSource;
                    }
                    eventTypes = resolveEventTypes(scriptModule) || eventTypes;
                    if (eventSource) {
                        Logger.info('[玉子手机] 通过动态导入获取事件系统成功');
                        isInitialized = true;
                        return true;
                    }
                }
            } catch (importError) {
                Logger.debug('[玉子手机] 动态导入失败，使用降级方案');
            }
        }

        Logger.warn('[玉子手机] SillyTavern 事件系统不可用，部分功能将降级');
        isInitialized = true;
        return false;
    } catch (error) {
        handleError(error, '[玉子手机] 初始化事件系统失败');
        isInitialized = true;
        return false;
    }
}

export async function onEvent(eventType, listener, options = {}) {
    if (!isInitialized) {
        await initEventSystem();
    }

    if (!eventSource) {
        Logger.warn(`[玉子手机] 无法注册事件监听器: ${eventType}，事件系统不可用`);
        return () => {};
    }

    try {
        const { once = false, priority = 'normal' } = options;

        let registerMethod;
        if (priority === 'first' && typeof eventSource.makeFirst === 'function') {
            registerMethod = eventSource.makeFirst.bind(eventSource);
        } else if (priority === 'last' && typeof eventSource.makeLast === 'function') {
            registerMethod = eventSource.makeLast.bind(eventSource);
        } else if (once && typeof eventSource.once === 'function') {
            registerMethod = eventSource.once.bind(eventSource);
        } else if (typeof eventSource.on === 'function') {
            registerMethod = eventSource.on.bind(eventSource);
        } else {
            Logger.warn(`[玉子手机] 事件源不支持标准注册方法: ${eventType}`);
            return () => {};
        }

        registerMethod(eventType, listener);
        Logger.debug(`[玉子手机] 事件监听器已注册: ${eventType}`);

        const cleanup = () => {
            try {
                const removed = removeEventListenerSafe(eventSource, eventType, listener);
                if (removed) {
                    Logger.debug(`[玉子手机] 事件监听器已取消: ${eventType}`);
                }
            } catch (error) {
                Logger.debug(`[玉子手机] 取消事件监听失败: ${eventType}`, error);
            }
        };

        const unregisterRuntimeCleanup = runtime.registerCleanup(cleanup);

        return () => {
            cleanup();
            unregisterRuntimeCleanup();
        };
    } catch (error) {
        handleError(error, `[玉子手机] 注册事件监听器失败: ${eventType}`);
        return () => {};
    }
}

export async function onceEvent(eventType, listener) {
    return onEvent(eventType, listener, { once: true });
}

export async function triggerEvent(eventType, data) {
    if (!isInitialized) {
        await initEventSystem();
    }

    if (!eventSource) {
        Logger.warn(`[玉子手机] 无法触发事件: ${eventType}，事件系统不可用`);
        return;
    }

    try {
        if (typeof eventSource.emit === 'function') {
            eventSource.emit(eventType, data);
            Logger.debug(`[玉子手机] 事件已触发: ${eventType}`);
        } else {
            Logger.warn(`[玉子手机] 事件源不支持 emit 方法: ${eventType}`);
        }
    } catch (error) {
        handleError(error, `[玉子手机] 触发事件失败: ${eventType}`);
    }
}

export function waitForEvent(eventType, timeout = 30000) {
    return new Promise((resolve, reject) => {
        let isSettled = false;
        let cleanup = () => {};

        const finish = (callback) => {
            if (isSettled) return;
            isSettled = true;
            window.clearTimeout(timeoutId);
            try {
                cleanup();
            } catch (error) {
                Logger.debug(`[玉子手机] waitForEvent 清理监听失败: ${eventType}`, error);
            }
            callback();
        };

        const timeoutId = window.setTimeout(() => {
            finish(() => reject(new Error(`等待事件超时: ${eventType}`)));
        }, timeout);

        onEvent(eventType, (...data) => {
            const payload = data.length <= 1 ? data[0] : data;
            finish(() => resolve(payload));
        }, { once: true })
            .then((unsubscribe) => {
                cleanup = typeof unsubscribe === 'function' ? unsubscribe : cleanup;
                if (isSettled) {
                    cleanup();
                }
            })
            .catch((error) => {
                finish(() => reject(error));
            });
    });
}

export async function onWorldInfoUpdated(callback, options = {}) {
    return onEvent(EventTypes.WORLDINFO_UPDATED, callback, options);
}

export async function onChatChanged(callback, options = {}) {
    return onEvent(EventTypes.CHAT_CHANGED, callback, options);
}

export async function onCharacterLoaded(callback, options = {}) {
    return onEvent(EventTypes.CHARACTER_LOADED, callback, options);
}

export async function onMessageSent(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_SENT, callback, options);
}

export async function onMessageReceived(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_RECEIVED, callback, options);
}

export async function onAppReady(callback, options = {}) {
    return onEvent(EventTypes.APP_READY, callback, options);
}

export async function onUserMessageRendered(callback, options = {}) {
    return onEvent(EventTypes.USER_MESSAGE_RENDERED, callback, options);
}

export async function onCharacterMessageRendered(callback, options = {}) {
    return onEvent(EventTypes.CHARACTER_MESSAGE_RENDERED, callback, options);
}

export async function onMessageUpdated(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_UPDATED, callback, options);
}

export async function onMessageDeleted(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_DELETED, callback, options);
}

export async function onMessageSwiped(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_SWIPED, callback, options);
}

export async function onGenerationStarted(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_STARTED, callback, options);
}

export async function onGenerationEnded(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_ENDED, callback, options);
}

export async function onGenerationStopped(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_STOPPED, callback, options);
}

export async function onGenerationAfterCommands(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_AFTER_COMMANDS, callback, options);
}

export async function onChatCreated(callback, options = {}) {
    return onEvent(EventTypes.CHAT_CREATED, callback, options);
}

export async function onSettingsLoaded(callback, options = {}) {
    return onEvent(EventTypes.SETTINGS_LOADED, callback, options);
}

export function clearEventBridgeState() {
    resetIntegrationRuntimeScope();
    eventSource = null;
    eventTypes = null;
    isInitialized = false;
    clearSillyTavernContextCache();
}

export const setManagedTimeout = (...args) => runtime.setTimeout(...args);
export const setManagedInterval = (...args) => runtime.setInterval(...args);
export const addManagedEventListener = (...args) => runtime.addEventListener(...args);
