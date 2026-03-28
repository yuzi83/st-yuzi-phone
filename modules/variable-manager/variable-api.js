/**
 * 变量管理器 - 变量接口封装层
 * 自动检测 MVU 框架，提供统一的变量读写接口
 */

import { Logger } from '../error-handler.js';
import { getTavernHelper } from '../integration/tavern-helper-bridge.js';

const logger = Logger.withScope ? Logger.withScope({ scope: 'variable-manager/api' }) : Logger;

/**
 * 检测 MVU 变量框架是否可用
 */
export function isMvuAvailable() {
    try {
        return typeof window !== 'undefined'
            && window.Mvu
            && typeof window.Mvu.getMvuData === 'function';
    } catch {
        return false;
    }
}

/**
 * 获取最新楼层 ID
 * @returns {number} 最新楼层号，失败返回 -1
 */
export function getLastMessageId() {
    const helper = getTavernHelper();
    if (!helper || typeof helper.getLastMessageId !== 'function') {
        return -1;
    }
    try {
        return helper.getLastMessageId();
    } catch (error) {
        logger.error?.({ action: 'getLastMessageId', message: '获取最新楼层号失败', error });
        return -1;
    }
}

/**
 * 获取指定楼层的变量数据
 * @param {number|'latest'} messageId 楼层号
 * @returns {{ data: object, isMvu: boolean, raw: object }}
 */
export function getFloorVariables(messageId = 'latest') {
    const resolvedId = messageId === 'latest' ? getLastMessageId() : messageId;
    if (resolvedId < 0) {
        return { data: {}, isMvu: false, raw: {} };
    }

    if (isMvuAvailable()) {
        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: resolvedId });
            return {
                data: mvuData?.stat_data || {},
                isMvu: true,
                raw: mvuData || {},
                messageId: resolvedId,
            };
        } catch (error) {
            logger.warn?.({ action: 'getFloorVariables.mvu', message: 'MVU 获取失败，降级到通用接口', error });
        }
    }

    const helper = getTavernHelper();
    if (!helper || typeof helper.getVariables !== 'function') {
        return { data: {}, isMvu: false, raw: {}, messageId: resolvedId };
    }

    try {
        const vars = helper.getVariables({ type: 'message', message_id: resolvedId });
        return { data: vars || {}, isMvu: false, raw: vars || {}, messageId: resolvedId };
    } catch (error) {
        logger.error?.({ action: 'getFloorVariables', message: '获取楼层变量失败', error });
        return { data: {}, isMvu: false, raw: {}, messageId: resolvedId };
    }
}

/**
 * 设置指定楼层的单个变量
 * @param {number} messageId 楼层号
 * @param {string} path 变量路径（如 '角色.络络.好感度'）
 * @param {any} newValue 新值
 * @returns {Promise<boolean>} 是否成功
 */
export async function setFloorVariable(messageId, path, newValue) {
    if (messageId < 0 || !path) return false;

    if (isMvuAvailable()) {
        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: messageId });
            if (mvuData) {
                await window.Mvu.setMvuVariable(mvuData, path, newValue, { reason: '变量管理器手动修改' });
                await window.Mvu.replaceMvuData(mvuData, { type: 'message', message_id: messageId });
                return true;
            }
        } catch (error) {
            logger.warn?.({ action: 'setFloorVariable.mvu', message: 'MVU 设置失败，降级到通用接口', error });
        }
    }

    const helper = getTavernHelper();
    if (!helper || typeof helper.updateVariablesWith !== 'function') {
        return false;
    }

    try {
        await helper.updateVariablesWith(
            (vars) => {
                if (typeof _ !== 'undefined' && typeof _.set === 'function') {
                    _.set(vars, path, newValue);
                } else {
                    setNestedValue(vars, path, newValue);
                }
                return vars;
            },
            { type: 'message', message_id: messageId },
        );
        return true;
    } catch (error) {
        logger.error?.({ action: 'setFloorVariable', message: '设置变量失败', error });
        return false;
    }
}

/**
 * 删除指定楼层的变量
 * @param {number} messageId 楼层号
 * @param {string} path 变量路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteFloorVariable(messageId, path) {
    if (messageId < 0 || !path) return false;

    if (isMvuAvailable()) {
        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: messageId });
            if (mvuData && mvuData.stat_data) {
                if (typeof _ !== 'undefined' && typeof _.unset === 'function') {
                    _.unset(mvuData.stat_data, path);
                    _.unset(mvuData.display_data, path);
                    _.unset(mvuData.delta_data, path);
                } else {
                    deleteNestedValue(mvuData.stat_data, path);
                }
                await window.Mvu.replaceMvuData(mvuData, { type: 'message', message_id: messageId });
                return true;
            }
        } catch (error) {
            logger.warn?.({ action: 'deleteFloorVariable.mvu', message: 'MVU 删除失败，降级到通用接口', error });
        }
    }

    const helper = getTavernHelper();
    if (!helper || typeof helper.deleteVariable !== 'function') {
        return false;
    }

    try {
        await helper.deleteVariable(path, { type: 'message', message_id: messageId });
        return true;
    } catch (error) {
        logger.error?.({ action: 'deleteFloorVariable', message: '删除变量失败', error });
        return false;
    }
}

/**
 * 添加新变量到指定楼层
 * @param {number} messageId 楼层号
 * @param {string} path 变量路径
 * @param {any} value 值
 * @returns {Promise<boolean>}
 */
export async function addFloorVariable(messageId, path, value) {
    return setFloorVariable(messageId, path, value);
}

// ---- 辅助函数 ----

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
}

function deleteNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') return;
        current = current[key];
    }
    delete current[keys[keys.length - 1]];
}
