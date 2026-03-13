// modules/integration.js
/**
 * Yuzi Phone - SillyTavern 核心集成
 * @version 2.0.0
 * @description 提供事件系统、TavernHelper API 和其他核心功能的集成
 * @optimized 使用标准 ES Module 导入方式，增强类型安全
 */

import { createRuntimeScope } from './runtime-manager.js';
import { Logger, handleError } from './error-handler.js';

const runtime = createRuntimeScope('yuzi-integration');

// ===== 标准事件系统导入 =====

/**
 * SillyTavern 事件源对象
 * @type {Object|null}
 */
let eventSource = null;

/**
 * SillyTavern 事件类型
 * @type {Object|null}
 */
let eventTypes = null;

/**
 * SillyTavern 上下文对象
 * @type {Object|null}
 */
let stContext = null;

/**
 * 初始化状态
 * @type {boolean}
 */
let isInitialized = false;

/**
 * SillyTavern 事件类型映射
 * 参考: @types.txt 中的 tavern_events
 * @type {Object}
 */
export const EventTypes = {
    // 消息相关事件
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_SWIPED: 'message_swiped',

    // 生成相关事件
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',

    // 聊天相关事件
    CHAT_CHANGED: 'chat_id_changed',
    CHAT_CREATED: 'chat_created',

    // 应用相关事件
    APP_READY: 'app_ready',
    SETTINGS_LOADED: 'settings_loaded_after',

    // 角色相关事件
    CHARACTER_LOADED: 'character_loaded',
};

/**
 * 初始化事件系统（标准方式）
 * @returns {Promise<boolean>} 是否成功初始化
 */
async function initEventSystem() {
    if (isInitialized) {
        return eventSource !== null;
    }

    try {
        // 方式1: 尝试从全局 SillyTavern 对象获取
        if (typeof window !== 'undefined' && window.eventSource && window.event_types) {
            eventSource = window.eventSource;
            eventTypes = window.event_types;
            Logger.info('[玉子手机] 从全局对象获取事件系统成功');
            isInitialized = true;
            return true;
        }

        // 方式2: 尝试从 getContext 获取
        const context = getSillyTavernContext();
        if (context) {
            if (context.eventSource) {
                eventSource = context.eventSource;
            }
            if (context.event_types) {
                eventTypes = context.event_types;
            }
            if (eventSource) {
                Logger.info('[玉子手机] 从上下文获取事件系统成功');
                isInitialized = true;
                return true;
            }
        }

        // 方式3: 尝试动态导入（如果支持）
        if (typeof window !== 'undefined') {
            try {
                // 尝试从相对路径导入（SillyTavern 扩展标准路径）
                const scriptModule = await import('../../../script.js').catch(() => null);
                if (scriptModule) {
                    if (scriptModule.eventSource) {
                        eventSource = scriptModule.eventSource;
                    }
                    if (scriptModule.event_types) {
                        eventTypes = scriptModule.event_types;
                    }
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

/**
 * 获取 SillyTavern 上下文（标准方式）
 * @returns {Object|null} SillyTavern 上下文对象
 */
export function getSillyTavernContext() {
    if (stContext) {
        return stContext;
    }

    try {
        // 方式1: 从全局 getContext 函数获取
        if (typeof getContext !== 'undefined' && typeof getContext === 'function') {
            stContext = getContext();
            return stContext;
        }

        // 方式2: 从 window 对象获取
        if (typeof window !== 'undefined') {
            if (typeof window.getContext === 'function') {
                stContext = window.getContext();
                return stContext;
            }

            // 方式3: 从 SillyTavern 全局对象获取
            if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                stContext = window.SillyTavern.getContext();
                return stContext;
            }
        }

        return null;
    } catch (error) {
        Logger.debug('[玉子手机] 获取 SillyTavern 上下文失败:', error);
        return null;
    }
}

/**
 * 注册事件监听器（标准方式）
 * @param {string} eventType 事件类型
 * @param {Function} listener 监听器函数
 * @param {Object} options 选项 { once: boolean, priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 返回取消监听的函数（Promise）
 */
export async function onEvent(eventType, listener, options = {}) {
    // 确保事件系统已初始化
    if (!isInitialized) {
        await initEventSystem();
    }

    if (!eventSource) {
        Logger.warn(`[玉子手机] 无法注册事件监听器: ${eventType}，事件系统不可用`);
        return () => {};
    }

    try {
        const { once = false, priority = 'normal' } = options;

        // 根据优先级选择注册方法
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

        // 注册监听器
        registerMethod(eventType, listener);
        Logger.debug(`[玉子手机] 事件监听器已注册: ${eventType}`);

        // 使用 runtime 管理清理
        const cleanup = () => {
            try {
                if (eventSource && typeof eventSource.off === 'function') {
                    eventSource.off(eventType, listener);
                    Logger.debug(`[玉子手机] 事件监听器已取消: ${eventType}`);
                }
            } catch (error) {
                Logger.debug(`[玉子手机] 取消事件监听失败: ${eventType}`, error);
            }
        };

        runtime.registerCleanup(cleanup);

        return cleanup;
    } catch (error) {
        handleError(error, `[玉子手机] 注册事件监听器失败: ${eventType}`);
        return () => {};
    }
}

/**
 * 注册一次性事件监听器
 * @param {string} eventType 事件类型
 * @param {Function} listener 监听器函数
 * @returns {Promise<Function>} 返回取消监听的函数（Promise）
 */
export async function onceEvent(eventType, listener) {
    return onEvent(eventType, listener, { once: true });
}

/**
 * 触发自定义事件
 * @param {string} eventType 事件类型
 * @param {any} data 事件数据
 */
export async function triggerEvent(eventType, data) {
    // 确保事件系统已初始化
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

/**
 * 等待特定事件发生（Promise 包装）
 * @param {string} eventType 事件类型
 * @param {number} timeout 超时时间（毫秒），默认 30000
 * @returns {Promise<any>} 返回事件数据的 Promise
 */
export function waitForEvent(eventType, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`等待事件超时: ${eventType}`));
        }, timeout);

        onceEvent(eventType, (data) => {
            clearTimeout(timeoutId);
            resolve(data);
        }).catch(reject);
    });
}

// ===== TavernHelper API 集成 =====

/**
 * TavernHelper API 对象
 */
let tavernHelper = null;

/**
 * 初始化 TavernHelper API
 * @returns {boolean} 是否成功初始化
 */
function initTavernHelper() {
    try {
        if (typeof window !== 'undefined' && window.TavernHelper) {
            tavernHelper = window.TavernHelper;
            return true;
        }

        console.warn('[玉子手机] TavernHelper API 不可用，部分功能将降级');
        return false;
    } catch (error) {
        console.warn('[玉子手机] 初始化 TavernHelper API 失败:', error);
        return false;
    }
}

/**
 * 获取 TavernHelper API
 * @returns {Object|null} TavernHelper API 对象
 */
export function getTavernHelper() {
    if (!tavernHelper) {
        initTavernHelper();
    }
    return tavernHelper;
}

/**
 * 获取聊天消息
 * @param {string|number} range 消息范围，例如 '0-{{lastMessageId}}' 或 -1（最新消息）
 * @param {Object} options 选项
 * @returns {Array} 消息数组
 */
export function getChatMessages(range = -1, options = {}) {
    const helper = getTavernHelper();
    if (!helper || !helper.getChatMessages) {
        console.warn('[玉子手机] getChatMessages API 不可用');
        return [];
    }

    try {
        return helper.getChatMessages(range, options);
    } catch (error) {
        console.error('[玉子手机] 获取聊天消息失败:', error);
        return [];
    }
}

/**
 * 获取最后一条消息ID
 * @returns {number} 最后一条消息的ID
 */
export function getLastMessageId() {
    const helper = getTavernHelper();
    if (!helper || !helper.getLastMessageId) {
        console.warn('[玉子手机] getLastMessageId API 不可用');
        return -1;
    }

    try {
        return helper.getLastMessageId();
    } catch (error) {
        console.error('[玉子手机] 获取最后消息ID失败:', error);
        return -1;
    }
}

/**
 * 获取变量
 * @param {Object} options 选项 { type: 'chat' | 'character' | 'global' | 'message' }
 * @returns {Object} 变量对象
 */
export function getVariables(options = {}) {
    const helper = getTavernHelper();
    if (!helper || !helper.getVariables) {
        console.warn('[玉子手机] getVariables API 不可用');
        return {};
    }

    try {
        return helper.getVariables(options);
    } catch (error) {
        console.error('[玉子手机] 获取变量失败:', error);
        return {};
    }
}

/**
 * 设置变量
 * @param {Object} variables 变量对象
 * @param {Object} options 选项
 * @returns {Promise<void>}
 */
export async function setVariables(variables, options = {}) {
    const helper = getTavernHelper();
    if (!helper || !helper.insertOrAssignVariables) {
        console.warn('[玉子手机] insertOrAssignVariables API 不可用');
        return;
    }

    try {
        await helper.insertOrAssignVariables(variables, options);
    } catch (error) {
        console.error('[玉子手机] 设置变量失败:', error);
    }
}

/**
 * 替换宏
 * @param {string} text 包含宏的文本
 * @returns {string} 替换后的文本
 */
export function substituteMacros(text) {
    const helper = getTavernHelper();
    if (!helper || !helper.substitudeMacros) {
        console.warn('[玉子手机] substitudeMacros API 不可用');
        return text;
    }

    try {
        return helper.substitudeMacros(text);
    } catch (error) {
        console.error('[玉子手机] 替换宏失败:', error);
        return text;
    }
}

/**
 * 获取角色数据
 * @param {string} name 角色名称，'current' 表示当前角色
 * @param {boolean} allowAvatar 是否允许通过头像ID查找
 * @returns {Object|null} 角色数据
 */
export function getCharacterData(name = 'current', allowAvatar = false) {
    const helper = getTavernHelper();
    if (!helper || !helper.getCharData) {
        console.warn('[玉子手机] getCharData API 不可用');
        return null;
    }

    try {
        return helper.getCharData(name, allowAvatar);
    } catch (error) {
        console.error('[玉子手机] 获取角色数据失败:', error);
        return null;
    }
}

/**
 * 显示通知
 * @param {string} message 消息内容
 * @param {string} type 类型 'success' | 'error' | 'warning' | 'info'
 */
export function showNotification(message, type = 'info') {
    try {
        // 尝试使用 SillyTavern 的 toastr
        if (typeof toastr !== 'undefined') {
            switch (type) {
                case 'success':
                    toastr.success(message);
                    break;
                case 'error':
                    toastr.error(message);
                    break;
                case 'warning':
                    toastr.warning(message);
                    break;
                default:
                    toastr.info(message);
            }
            return;
        }

        // 降级到 console
        console.log(`[玉子手机][${type.toUpperCase()}] ${message}`);
    } catch (error) {
        console.error('[玉子手机] 显示通知失败:', error);
    }
}

// ===== 便捷的事件监听器 =====

/**
 * 监听聊天切换事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onChatChanged(callback, options = {}) {
    return onEvent(EventTypes.CHAT_CHANGED, callback, options);
}

/**
 * 监听角色加载事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onCharacterLoaded(callback, options = {}) {
    return onEvent(EventTypes.CHARACTER_LOADED, callback, options);
}

/**
 * 监听消息发送事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onMessageSent(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_SENT, callback, options);
}

/**
 * 监听消息接收事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onMessageReceived(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_RECEIVED, callback, options);
}

/**
 * 监听应用就绪事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onAppReady(callback, options = {}) {
    return onEvent(EventTypes.APP_READY, callback, options);
}

/**
 * 监听用户消息渲染完成事件
 * @param {Function} callback 回调函数，参数为 messageId
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onUserMessageRendered(callback, options = {}) {
    return onEvent(EventTypes.USER_MESSAGE_RENDERED, callback, options);
}

/**
 * 监听角色消息渲染完成事件
 * @param {Function} callback 回调函数，参数为 messageId
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onCharacterMessageRendered(callback, options = {}) {
    return onEvent(EventTypes.CHARACTER_MESSAGE_RENDERED, callback, options);
}

/**
 * 监听消息更新事件
 * @param {Function} callback 回调函数，参数为 messageId
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onMessageUpdated(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_UPDATED, callback, options);
}

/**
 * 监听消息删除事件
 * @param {Function} callback 回调函数，参数为 messageId
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onMessageDeleted(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_DELETED, callback, options);
}

/**
 * 监听消息滑动切换事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onMessageSwiped(callback, options = {}) {
    return onEvent(EventTypes.MESSAGE_SWIPED, callback, options);
}

/**
 * 监听生成开始事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onGenerationStarted(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_STARTED, callback, options);
}

/**
 * 监听生成结束事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onGenerationEnded(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_ENDED, callback, options);
}

/**
 * 监听生成停止事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onGenerationStopped(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_STOPPED, callback, options);
}

/**
 * 监听生成前命令处理事件（关键时机：AI生成前的最佳数据注入时机）
 * @param {Function} callback 回调函数，参数为 (type, params, dryRun)
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onGenerationAfterCommands(callback, options = {}) {
    return onEvent(EventTypes.GENERATION_AFTER_COMMANDS, callback, options);
}

/**
 * 监听聊天创建事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onChatCreated(callback, options = {}) {
    return onEvent(EventTypes.CHAT_CREATED, callback, options);
}

/**
 * 监听设置加载完成事件
 * @param {Function} callback 回调函数
 * @param {Object} options 选项 { priority: 'first' | 'last' | 'normal' }
 * @returns {Promise<Function>} 取消监听的函数（Promise）
 */
export async function onSettingsLoaded(callback, options = {}) {
    return onEvent(EventTypes.SETTINGS_LOADED, callback, options);
}

// ===== 清理函数 =====

/**
 * 清理所有事件监听器和资源
 */
export function cleanupIntegration() {
    runtime.cleanup();
    eventSource = null;
    eventTypes = null;
    tavernHelper = null;
    stContext = null;
    isInitialized = false;
}

// ===== 导出运行时管理器方法 =====

export const { setManagedTimeout, setManagedInterval, addManagedEventListener } = runtime;
