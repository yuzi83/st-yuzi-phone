// modules/slash-commands.js
/**
 * Yuzi Phone - Slash 命令系统
 * @version 1.0.0
 * @description 提供命令行操作接口，支持手机控制、表格操作等
 */

import { Logger, handleError } from './error-handler.js';
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

const HOST_FUNCTION_POLICY = Object.freeze({
    registerSlashCommand: {
        description: 'SillyTavern Slash 注册函数',
        stableSources: ['sillyTavernContext'],
        compatSources: [],
    },
    unregisterSlashCommand: {
        description: 'SlashCommandParser 注册表清理包装器',
        stableSources: ['slashCommandParserRegistry'],
        compatSources: [],
    },
});

function getSlashCommandContextRoot() {
    try {
        if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
            return window.SillyTavern.getContext();
        }

        if (typeof getContext === 'function') {
            return getContext();
        }

        if (typeof window !== 'undefined' && typeof window.getContext === 'function') {
            return window.getContext();
        }
    } catch (error) {
        Logger.debug('获取 Slash 上下文失败:', error);
    }

    return null;
}

function getHostSourceRoot(sourceName) {
    const globalRoot = typeof globalThis !== 'undefined' ? globalThis : null;

    if (sourceName === 'sillyTavernContext') {
        return getSlashCommandContextRoot();
    }

    if (sourceName === 'slashCommandParserRegistry') {
        const unregister = getSlashCommandRegistryUnregistrar();
        return unregister ? { unregisterSlashCommand: unregister } : null;
    }

    if (sourceName === 'globalThis') {
        return globalRoot;
    }

    if (sourceName === 'window') {
        if (typeof window === 'undefined') return null;
        return window === globalRoot ? null : window;
    }

    return null;
}

function formatHostFunctionBoundary(name) {
    const policy = HOST_FUNCTION_POLICY[name];
    if (!policy) {
        return `仅检查 globalThis.${name}`;
    }

    const stable = policy.stableSources.length
        ? policy.stableSources.map(source => `${source}.${name}`).join(' / ')
        : '无';
    const compat = policy.compatSources.length
        ? `；兼容回退：${policy.compatSources.map(source => `${source}.${name}`).join(' / ')}`
        : '';

    return `稳定来源：${stable}${compat}`;
}

function getSlashCommandParserRegistry() {
    const context = getSlashCommandContextRoot();
    const parser = context?.SlashCommandParser;
    if (!parser || typeof parser !== 'object' || !parser.commands || typeof parser.commands !== 'object') {
        return null;
    }

    return parser.commands;
}

function getSlashCommandRegistryUnregistrar() {
    const registry = getSlashCommandParserRegistry();
    if (!registry) {
        return null;
    }

    return (commandName) => {
        delete registry[commandName];
    };
}

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

function resolveGlobalFunction(name, options = {}) {
    const policy = HOST_FUNCTION_POLICY[name] || {
        stableSources: ['globalThis'],
        compatSources: ['window'],
    };

    const allowCompatWindow = options.allowCompatWindow === true;
    const candidates = [
        ...policy.stableSources.map(source => ({ source, level: 'stable' })),
        ...(allowCompatWindow ? policy.compatSources.map(source => ({ source, level: 'compat' })) : []),
    ];

    for (const candidate of candidates) {
        const root = getHostSourceRoot(candidate.source);
        if (!root || typeof root[name] !== 'function') {
            continue;
        }

        return {
            fn: root[name].bind(root),
            source: candidate.source,
            level: candidate.level,
        };
    }

    return null;
}

/**
 * 获取 SillyTavern 的 Slash 命令注册函数
 * @returns {Function|null} 注册函数
 */
function getSillyTavernSlashCommandRegistrar() {
    try {
        const resolved = resolveGlobalFunction('registerSlashCommand');
        if (resolved) {
            return resolved.fn;
        }

        Logger.warn(`未检测到稳定的 registerSlashCommand 接口；${formatHostFunctionBoundary('registerSlashCommand')}。将使用本地降级命令方案`);
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
                        window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-position-reset'));
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
function getPhoneStatusSnapshot() {
    const container = document.getElementById('yuzi-phone-standalone');
    const toggle = document.getElementById('yuzi-phone-toggle');

    return {
        hasContainer: !!container,
        isVisible: !!(container && container.classList.contains('visible')),
        hasToggle: !!toggle,
        position: toggle ? {
            left: toggle.style.left || '默认',
            top: toggle.style.top || '默认',
        } : null,
        size: container ? {
            width: container.style.width || '自动',
            height: container.style.height || '自动',
        } : null,
        registeredCommands: [...registeredCommands],
        hasFallbackCommands: !!(typeof window !== 'undefined' && window.yuziPhoneCommands),
    };
}

function showPhoneStatus() {
    try {
        const snapshot = getPhoneStatusSnapshot();
        Logger.info('[玉子手机] Slash 状态详情:', snapshot);

        const summary = snapshot.isVisible
            ? '玉子手机当前已打开，详细状态已输出到控制台'
            : '玉子手机当前已关闭，详细状态已输出到控制台';

        showNotification(summary, 'info');
    } catch (error) {
        handleError(error, '获取手机状态失败');
    }
}

/**
 * 显示手机帮助
 */
function showPhoneHelp() {
    Logger.info('[玉子手机] Slash 命令帮助:\n/phone\n/phone open\n/phone close\n/phone toggle\n/phone reset\n/phone status\n/phone help\n/phone-table <表名>\n/phone-tables\n/phone-settings reset\n/phone-settings export\n/phone-settings import');
    showNotification('Slash 命令帮助已输出到控制台', 'info');
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
            showNotification('未检测到设置重置处理器，无法安全重置扩展设置', 'warning');
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
            showNotification('未检测到设置导出处理器，无法导出扩展设置', 'warning');
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
 * 获取 Slash 注册表清理函数
 * 当前项目优先通过 [`SlashCommandParser.commands`](../../../slash-commands/SlashCommandParser.js:39) 删除本扩展注册项，
 * 避免继续依赖未在稳定接口文档中确认的全局 `unregisterSlashCommand`。
 * @returns {Function|null} 注销函数
 */
function getSillyTavernSlashCommandUnregistrar() {
    try {
        const resolved = resolveGlobalFunction('unregisterSlashCommand');
        if (resolved) {
            return resolved.fn;
        }

        Logger.debug(`未检测到 Slash 注册表清理接口；${formatHostFunctionBoundary('unregisterSlashCommand')}`);
        return null;
    } catch (error) {
        Logger.debug('获取 Slash 命令注销函数失败:', error);
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
