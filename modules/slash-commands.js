// modules/slash-commands.js
/**
 * Yuzi Phone - Slash 命令系统
 * @version 1.0.0
 * @description 提供命令行操作接口，支持手机控制、表格操作等
 */

import { Logger, handleError } from './error-handler.js';
import { registerFallbackCommandSet, registerSlashCommandDefinitions, unregisterSlashCommandDefinitions } from './slash-commands/command-registration.js';
import { getSillyTavernSlashCommandRegistrar, getSillyTavernSlashCommandUnregistrar } from './slash-commands/host-adapter.js';
import {
    clearCommandHandlers,
    clearRegisteredCommands,
    deleteCommandHandler,
    getRegisteredCommandsSnapshot,
    hasSlashCommandsRegistered,
    setCommandHandler,
    setSlashCommandsRegistered,
} from './slash-commands/state.js';

/**
 * 注册 Slash 命令
 * @returns {boolean} 是否成功注册
 */
export function registerSlashCommands() {
    if (hasSlashCommandsRegistered()) {
        Logger.warn('Slash 命令已经注册，跳过重复注册');
        return false;
    }

    try {
        const registerSlashCommand = getSillyTavernSlashCommandRegistrar();
        if (!registerSlashCommand) {
            Logger.warn('SillyTavern Slash 命令系统不可用，使用降级方案');
            const fallbackRegistered = registerFallbackCommandSet();
            if (fallbackRegistered) {
                setSlashCommandsRegistered(true);
            }
            return fallbackRegistered;
        }

        registerSlashCommandDefinitions(registerSlashCommand);
        setSlashCommandsRegistered(true);
        Logger.info('Slash 命令注册成功');
        return true;
    } catch (error) {
        handleError(error, '注册 Slash 命令失败');
        return false;
    }
}

/**
 * 注册命令处理器
 * @param {string} command - 命令名称
 * @param {Function} handler - 处理函数
 */
export function registerCommandHandler(command, handler) {
    if (typeof handler !== 'function') {
        Logger.warn(`命令处理器必须是函数: ${command}`);
        return;
    }

    setCommandHandler(command, handler);
    Logger.debug(`注册命令处理器: ${command}`);
}

/**
 * 注销命令处理器
 * @param {string} command - 命令名称
 */
export function unregisterCommandHandler(command) {
    deleteCommandHandler(command);
    Logger.debug(`注销命令处理器: ${command}`);
}

/**
 * 注销所有 Slash 命令
 */
export function unregisterSlashCommands() {
    if (!hasSlashCommandsRegistered()) {
        return;
    }

    try {
        const unregisterSlashCommand = getSillyTavernSlashCommandUnregistrar();
        unregisterSlashCommandDefinitions(unregisterSlashCommand);
        clearRegisteredCommands();
        clearCommandHandlers();
        setSlashCommandsRegistered(false);
        Logger.info('Slash 命令已注销');
    } catch (error) {
        Logger.error('注销 Slash 命令失败:', error);
    }
}

/**
 * 检查命令是否已注册
 * @returns {boolean} 是否已注册
 */
export function isSlashCommandsRegistered() {
    return hasSlashCommandsRegistered();
}

/**
 * 获取已注册的命令列表
 * @returns {string[]} 命令列表
 */
export function getRegisteredCommands() {
    return getRegisteredCommandsSnapshot();
}
