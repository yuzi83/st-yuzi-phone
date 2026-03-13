// modules/slash-commands.js
/**
 * Yuzi Phone - Slash 命令系统
 * @version 1.0.0
 * @description 提供命令行操作接口，支持手机控制、表格操作等
 */

import { Logger, handleError, YuziPhoneError, ErrorCodes } from './error-handler.js';
import { showNotification } from './integration.js';

/**
 * Slash 命令注册状态
 */
let isRegistered = false;
let registeredCommands = [];

/**
 * 命令处理器映射
 */
const commandHandlers = new Map();

/**
 * 注册 Slash 命令
 * @returns {boolean} 是否成功注册
 */
export function registerSlashCommands() {
    if (isRegistered) {
        Logger.warn('Slash 命令已经注册，跳过重复注册');
        return false;
    }

    try {
        // 尝试获取 SillyTavern 的 registerSlashCommand 函数
        const registerSlashCommand = getSillyTavernSlashCommandRegistrar();
        
        if (!registerSlashCommand) {
            Logger.warn('SillyTavern Slash 命令系统不可用，使用降级方案');
            return registerFallbackCommands();
        }

        // 注册手机控制命令
        registerPhoneCommands(registerSlashCommand);
        
        // 注册表格命令
        registerTableCommands(registerSlashCommand);
        
        // 注册设置命令
        registerSettingsCommands(registerSlashCommand);

        isRegistered = true;
        Logger.info('Slash 命令注册成功');
        return true;
    } catch (error) {
        handleError(error, '注册 Slash 命令失败');
        return false;
    }
}

/**
 * 获取 SillyTavern 的 Slash 命令注册函数
 * @returns {Function|null} 注册函数
 */
function getSillyTavernSlashCommandRegistrar() {
    try {
        // 尝试从全局获取
        if (typeof registerSlashCommand !== 'undefined') {
            return registerSlashCommand;
        }

        // 尝试从 SillyTavern 上下文获取
        if (typeof window !== 'undefined' && window.registerSlashCommand) {
            return window.registerSlashCommand;
        }

        // 尝试从 TavernHelper 获取
        if (typeof window !== 'undefined' && window.TavernHelper) {
            const helper = window.TavernHelper;
            if (helper.registerSlashCommand) {
                return helper.registerSlashCommand;
            }
        }

        return null;
    } catch (error) {
        Logger.debug('获取 Slash 命令注册函数失败:', error);
        return null;
    }
}

/**
 * 注册手机控制命令
 * @param {Function} registerSlashCommand - 注册函数
 */
function registerPhoneCommands(registerSlashCommand) {
    // /phone 命令 - 主命令
    registerSlashCommand(
        'phone',
        handlePhoneCommand,
        [],
        '玉子手机控制命令：/phone [open|close|toggle|reset|status|help]',
        true
    );
    registeredCommands.push('phone');

    // /phone-open 命令
    registerSlashCommand(
        'phone-open',
        () => executePhoneAction('open'),
        [],
        '打开玉子手机',
        true
    );
    registeredCommands.push('phone-open');

    // /phone-close 命令
    registerSlashCommand(
        'phone-close',
        () => executePhoneAction('close'),
        [],
        '关闭玉子手机',
        true
    );
    registeredCommands.push('phone-close');

    // /phone-toggle 命令
    registerSlashCommand(
        'phone-toggle',
        () => executePhoneAction('toggle'),
        [],
        '切换玉子手机状态',
        true
    );
    registeredCommands.push('phone-toggle');
}

/**
 * 注册表格命令
 * @param {Function} registerSlashCommand - 注册函数
 */
function registerTableCommands(registerSlashCommand) {
    // /phone-table 命令
    registerSlashCommand(
        'phone-table',
        handleTableCommand,
        [],
        '在手机中打开指定表格：/phone-table <表名>',
        true
    );
    registeredCommands.push('phone-table');

    // /phone-tables 命令 - 列出所有表格
    registerSlashCommand(
        'phone-tables',
        handleListTablesCommand,
        [],
        '列出所有可用表格',
        true
    );
    registeredCommands.push('phone-tables');
}

/**
 * 注册设置命令
 * @param {Function} registerSlashCommand - 注册函数
 */
function registerSettingsCommands(registerSlashCommand) {
    // /phone-settings 命令
    registerSlashCommand(
        'phone-settings',
        handleSettingsCommand,
        [],
        '手机设置命令：/phone-settings [reset|export|import]',
        true
    );
    registeredCommands.push('phone-settings');
}

/**
 * 降级方案 - 使用全局命令
 * @returns {boolean} 是否成功
 */
function registerFallbackCommands() {
    try {
        // 创建全局命令处理器
        if (typeof window !== 'undefined') {
            window.yuziPhoneCommands = {
                phone: handlePhoneCommand,
                'phone-open': () => executePhoneAction('open'),
                'phone-close': () => executePhoneAction('close'),
                'phone-toggle': () => executePhoneAction('toggle'),
                'phone-table': handleTableCommand,
                'phone-tables': handleListTablesCommand,
                'phone-settings': handleSettingsCommand,
            };

            Logger.info('使用降级方案注册命令');
            isRegistered = true;
            return true;
        }
        return false;
    } catch (error) {
        Logger.error('降级方案注册失败:', error);
        return false;
    }
}

/**
 * 处理 /phone 命令
 * @param {string} args - 命令参数
 */
function handlePhoneCommand(args) {
    const action = args.trim().toLowerCase();

    switch (action) {
        case 'open':
            executePhoneAction('open');
            break;
        case 'close':
            executePhoneAction('close');
            break;
        case 'toggle':
            executePhoneAction('toggle');
            break;
        case 'reset':
            executePhoneAction('reset');
            break;
        case 'status':
            showPhoneStatus();
            break;
        case 'help':
            showPhoneHelp();
            break;
        case '':
            // 默认切换
            executePhoneAction('toggle');
            break;
        default:
            showNotification(`未知命令: ${action}，使用 /phone help 查看帮助`, 'warning');
    }
}

/**
 * 执行手机操作
 * @param {string} action - 操作类型
 */
function executePhoneAction(action) {
    try {
        const handler = commandHandlers.get('phone-action');
        if (handler) {
            handler(action);
        } else {
            // 直接操作 DOM
            const container = document.getElementById('yuzi-phone-standalone');
            const toggle = document.getElementById('yuzi-phone-toggle');

            switch (action) {
                case 'open':
                    if (container) {
                        container.classList.add('visible');
                        showNotification('手机已打开', 'success');
                    }
                    break;
                case 'close':
                    if (container) {
                        container.classList.remove('visible');
                        showNotification('手机已关闭', 'success');
                    }
                    break;
                case 'toggle':
                    if (container) {
                        container.classList.toggle('visible');
                        const isVisible = container.classList.contains('visible');
                        showNotification(isVisible ? '手机已打开' : '手机已关闭', 'info');
                    }
                    break;
                case 'reset':
                    if (toggle) {
                        // 重置位置到默认
                        toggle.style.left = '';
                        toggle.style.top = '';
                        showNotification('手机位置已重置', 'success');
                    }
                    break;
            }
        }
    } catch (error) {
        handleError(error, `执行手机操作失败: ${action}`);
    }
}

/**
 * 显示手机状态
 */
function showPhoneStatus() {
    try {
        const container = document.getElementById('yuzi-phone-standalone');
        const isVisible = container && container.classList.contains('visible');
        const toggle = document.getElementById('yuzi-phone-toggle');
        const position = toggle ? {
            left: toggle.style.left || '默认',
            top: toggle.style.top || '默认',
        } : null;

        const status = [
            '📱 玉子手机状态',
            '─'.repeat(20),
            `状态: ${isVisible ? '✅ 打开' : '❌ 关闭'}`,
        ];

        if (position) {
            status.push(`位置: 左 ${position.left}, 上 ${position.top}`);
        }

        showNotification(status.join('\n'), 'info');
    } catch (error) {
        handleError(error, '获取手机状态失败');
    }
}

/**
 * 显示手机帮助
 */
function showPhoneHelp() {
    const help = [
        '📱 玉子手机命令帮助',
        '─'.repeat(30),
        '/phone - 切换手机状态',
        '/phone open - 打开手机',
        '/phone close - 关闭手机',
        '/phone toggle - 切换手机状态',
        '/phone reset - 重置手机位置',
        '/phone status - 查看手机状态',
        '/phone help - 显示此帮助',
        '',
        '/phone-table <表名> - 打开指定表格',
        '/phone-tables - 列出所有表格',
        '',
        '/phone-settings reset - 重置设置',
        '/phone-settings export - 导出设置',
        '/phone-settings import - 导入设置',
    ].join('\n');

    showNotification(help, 'info');
}

/**
 * 处理表格命令
 * @param {string} args - 命令参数
 */
function handleTableCommand(args) {
    const tableName = args.trim();

    if (!tableName) {
        showNotification('请指定表格名称: /phone-table <表名>', 'warning');
        return;
    }

    try {
        const handler = commandHandlers.get('open-table');
        if (handler) {
            handler(tableName);
        } else {
            showNotification(`打开表格: ${tableName}`, 'info');
            // 实际的表格打开逻辑需要由外部提供
        }
    } catch (error) {
        handleError(error, `打开表格失败: ${tableName}`);
    }
}

/**
 * 处理列出表格命令
 */
function handleListTablesCommand() {
    try {
        const handler = commandHandlers.get('list-tables');
        if (handler) {
            const tables = handler();
            if (Array.isArray(tables) && tables.length > 0) {
                const message = ['📋 可用表格列表', '─'.repeat(20), ...tables.map(t => `• ${t}`)].join('\n');
                showNotification(message, 'info');
            } else {
                showNotification('暂无可用表格', 'info');
            }
        } else {
            showNotification('表格列表功能暂不可用', 'warning');
        }
    } catch (error) {
        handleError(error, '获取表格列表失败');
    }
}

/**
 * 处理设置命令
 * @param {string} args - 命令参数
 */
function handleSettingsCommand(args) {
    const action = args.trim().toLowerCase();

    switch (action) {
        case 'reset':
            resetPhoneSettings();
            break;
        case 'export':
            exportPhoneSettings();
            break;
        case 'import':
            importPhoneSettings();
            break;
        case '':
        case 'help':
            showNotification(
                '设置命令:\n/phone-settings reset - 重置设置\n/phone-settings export - 导出设置\n/phone-settings import - 导入设置',
                'info'
            );
            break;
        default:
            showNotification(`未知设置命令: ${action}`, 'warning');
    }
}

/**
 * 重置手机设置
 */
function resetPhoneSettings() {
    try {
        const handler = commandHandlers.get('reset-settings');
        if (handler) {
            handler();
            showNotification('设置已重置', 'success');
        } else {
            // 清除 localStorage
            const keys = Object.keys(localStorage).filter(key => key.startsWith('yuzi-phone'));
            keys.forEach(key => localStorage.removeItem(key));
            showNotification(`已清除 ${keys.length} 个设置项，请刷新页面`, 'success');
        }
    } catch (error) {
        handleError(error, '重置设置失败');
    }
}

/**
 * 导出手机设置
 */
function exportPhoneSettings() {
    try {
        const handler = commandHandlers.get('export-settings');
        if (handler) {
            const settings = handler();
            const json = JSON.stringify(settings, null, 2);
            copyToClipboard(json);
            showNotification('设置已复制到剪贴板', 'success');
        } else {
            // 从 localStorage 导出
            const settings = {};
            Object.keys(localStorage)
                .filter(key => key.startsWith('yuzi-phone'))
                .forEach(key => {
                    try {
                        settings[key] = JSON.parse(localStorage.getItem(key));
                    } catch {
                        settings[key] = localStorage.getItem(key);
                    }
                });
            const json = JSON.stringify(settings, null, 2);
            copyToClipboard(json);
            showNotification('设置已复制到剪贴板', 'success');
        }
    } catch (error) {
        handleError(error, '导出设置失败');
    }
}

/**
 * 导入手机设置
 */
function importPhoneSettings() {
    showNotification('请使用 /phone-settings import <JSON> 导入设置', 'info');
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 */
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
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
    commandHandlers.set(command, handler);
    Logger.debug(`注册命令处理器: ${command}`);
}

/**
 * 注销命令处理器
 * @param {string} command - 命令名称
 */
export function unregisterCommandHandler(command) {
    commandHandlers.delete(command);
    Logger.debug(`注销命令处理器: ${command}`);
}

/**
 * 注销所有 Slash 命令
 */
export function unregisterSlashCommands() {
    if (!isRegistered) return;

    try {
        // 尝试注销 SillyTavern 命令
        const unregisterSlashCommand = getSillyTavernSlashCommandUnregistrar();
        
        if (unregisterSlashCommand) {
            registeredCommands.forEach(cmd => {
                try {
                    unregisterSlashCommand(cmd);
                } catch (error) {
                    Logger.debug(`注销命令失败: ${cmd}`, error);
                }
            });
        }

        // 清理全局命令
        if (typeof window !== 'undefined' && window.yuziPhoneCommands) {
            delete window.yuziPhoneCommands;
        }

        registeredCommands = [];
        commandHandlers.clear();
        isRegistered = false;
        Logger.info('Slash 命令已注销');
    } catch (error) {
        Logger.error('注销 Slash 命令失败:', error);
    }
}

/**
 * 获取 SillyTavern 的 Slash 命令注销函数
 * @returns {Function|null} 注销函数
 */
function getSillyTavernSlashCommandUnregistrar() {
    try {
        if (typeof unregisterSlashCommand !== 'undefined') {
            return unregisterSlashCommand;
        }

        if (typeof window !== 'undefined' && window.unregisterSlashCommand) {
            return window.unregisterSlashCommand;
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * 检查命令是否已注册
 * @returns {boolean} 是否已注册
 */
export function isSlashCommandsRegistered() {
    return isRegistered;
}

/**
 * 获取已注册的命令列表
 * @returns {string[]} 命令列表
 */
export function getRegisteredCommands() {
    return [...registeredCommands];
}
