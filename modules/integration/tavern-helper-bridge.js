import { Logger } from '../error-handler.js';
import { getSillyTavernContext } from './context-bridge.js';

let tavernHelper = null;

function warnUnlessSilent(options, ...args) {
    if (options?.silent !== true) Logger.warn(...args);
}

function initTavernHelper(options = {}) {
    try {
        if (typeof window !== 'undefined' && window.TavernHelper) {
            tavernHelper = window.TavernHelper;
            return true;
        }

        const context = getSillyTavernContext();
        if (context?.TavernHelper) {
            tavernHelper = context.TavernHelper;
            return true;
        }

        warnUnlessSilent(options, '[玉子手机] TavernHelper API 不可用，部分功能将降级');
        return false;
    } catch (error) {
        warnUnlessSilent(options, '[玉子手机] 初始化 TavernHelper API 失败:', error);
        return false;
    }
}

export function getTavernHelper(options = {}) {
    if (!tavernHelper) {
        initTavernHelper(options);
    }
    return tavernHelper;
}

function resolveHelperOrGlobalMethod(methodName, options = {}) {
    const helper = getTavernHelper(options);
    if (helper && typeof helper[methodName] === 'function') {
        return helper[methodName].bind(helper);
    }

    if (typeof globalThis !== 'undefined' && typeof globalThis[methodName] === 'function') {
        return globalThis[methodName].bind(globalThis);
    }

    if (typeof window !== 'undefined' && typeof window[methodName] === 'function') {
        return window[methodName].bind(window);
    }

    return null;
}

export function getChatMessages(range = -1, options = {}) {
    const helper = getTavernHelper();
    if (!helper || !helper.getChatMessages) {
        Logger.warn('[玉子手机] getChatMessages API 不可用');
        return [];
    }

    try {
        return helper.getChatMessages(range, options);
    } catch (error) {
        Logger.error('[玉子手机] 获取聊天消息失败:', error);
        return [];
    }
}

export function getLastMessageId() {
    const helper = getTavernHelper();
    if (!helper || !helper.getLastMessageId) {
        Logger.warn('[玉子手机] getLastMessageId API 不可用');
        return -1;
    }

    try {
        return helper.getLastMessageId();
    } catch (error) {
        Logger.error('[玉子手机] 获取最后消息ID失败:', error);
        return -1;
    }
}

export function getVariables(options = {}) {
    const helper = getTavernHelper();
    if (!helper || !helper.getVariables) {
        Logger.warn('[玉子手机] getVariables API 不可用');
        return {};
    }

    try {
        return helper.getVariables(options);
    } catch (error) {
        Logger.error('[玉子手机] 获取变量失败:', error);
        return {};
    }
}

export async function setVariables(variables, options = {}) {
    const helper = getTavernHelper();
    if (!helper || !helper.insertOrAssignVariables) {
        Logger.warn('[玉子手机] insertOrAssignVariables API 不可用');
        return;
    }

    try {
        await helper.insertOrAssignVariables(variables, options);
    } catch (error) {
        Logger.error('[玉子手机] 设置变量失败:', error);
    }
}

export function substituteMacros(text) {
    const helper = getTavernHelper();
    if (!helper || !helper.substitudeMacros) {
        Logger.warn('[玉子手机] substitudeMacros API 不可用');
        return text;
    }

    try {
        return helper.substitudeMacros(text);
    } catch (error) {
        Logger.error('[玉子手机] 替换宏失败:', error);
        return text;
    }
}

export function getCharacterData(name = 'current', allowAvatar = false) {
    const helper = getTavernHelper();
    if (!helper || !helper.getCharData) {
        Logger.warn('[玉子手机] getCharData API 不可用');
        return null;
    }

    try {
        return helper.getCharData(name, allowAvatar);
    } catch (error) {
        Logger.error('[玉子手机] 获取角色数据失败:', error);
        return null;
    }
}

export async function getWorldbookNames(options = {}) {
    const strict = options.strict === true;
    const method = resolveHelperOrGlobalMethod('getWorldbookNames', options);
    if (!method) {
        warnUnlessSilent(options, '[玉子手机] getWorldbookNames API 不可用');
        if (strict) throw new Error('getWorldbookNames API unavailable');
        return [];
    }

    try {
        const result = await Promise.resolve(method());
        return Array.isArray(result) ? result : [];
    } catch (error) {
        warnUnlessSilent(options, '[玉子手机] 获取世界书列表失败:', error);
        if (strict) throw error;
        return [];
    }
}

export async function getCurrentCharacterWorldbooks(options = {}) {
    const strict = options.strict === true;
    const method = resolveHelperOrGlobalMethod('getCharWorldbookNames', options);
    if (!method) {
        warnUnlessSilent(options, '[玉子手机] getCharWorldbookNames API 不可用');
        if (strict) throw new Error('getCharWorldbookNames API unavailable');
        return { primary: null, additional: [] };
    }

    try {
        const result = await Promise.resolve(method('current'));
        return {
            primary: typeof result?.primary === 'string' && result.primary.trim() ? result.primary.trim() : null,
            additional: Array.isArray(result?.additional)
                ? result.additional.map(item => String(item || '').trim()).filter(Boolean)
                : [],
        };
    } catch (error) {
        warnUnlessSilent(options, '[玉子手机] 获取角色绑定世界书失败:', error);
        if (strict) throw error;
        return { primary: null, additional: [] };
    }
}

export async function getWorldbook(worldbookName, options = {}) {
    const strict = options.strict === true;
    const safeWorldbookName = String(worldbookName || '').trim();
    if (!safeWorldbookName) {
        return [];
    }

    const method = resolveHelperOrGlobalMethod('getWorldbook', options);
    if (!method) {
        warnUnlessSilent(options, '[玉子手机] getWorldbook API 不可用');
        if (strict) throw new Error('getWorldbook API unavailable');
        return [];
    }

    try {
        const result = await Promise.resolve(method(safeWorldbookName));
        return Array.isArray(result) ? result : [];
    } catch (error) {
        warnUnlessSilent(options, '[玉子手机] 获取世界书条目失败:', error);
        if (strict) throw error;
        return [];
    }
}

export async function replaceWorldbook(worldbookName, entries, options = {}) {
    const strict = options.strict === true;
    const safeWorldbookName = String(worldbookName || '').trim();
    if (!safeWorldbookName) return false;
    const method = resolveHelperOrGlobalMethod('replaceWorldbook');
    if (!method) {
        Logger.warn('[玉子手机] replaceWorldbook API 不可用');
        if (strict) throw new Error('replaceWorldbook API unavailable');
        return false;
    }
    try {
        await Promise.resolve(method(safeWorldbookName, Array.isArray(entries) ? entries : []));
        return true;
    } catch (error) {
        Logger.warn('[玉子手机] 替换世界书失败:', error);
        if (strict) throw error;
        return false;
    }
}

export function clearTavernHelperCache() {
    tavernHelper = null;
}
