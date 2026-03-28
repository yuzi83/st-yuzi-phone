import { Logger, handleError } from '../error-handler.js';
import { showNotification } from '../integration/toast-bridge.js';
import { hasFallbackSlashCommands } from './host-adapter.js';
import { getCommandHandler, getRegisteredCommandsSnapshot } from './state.js';

export function handlePhoneCommand(args) {
    const action = String(args ?? '').trim().toLowerCase();

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
            executePhoneAction('toggle');
            break;
        default:
            showNotification(`未知命令: ${action}，使用 /phone help 查看帮助`, 'warning');
    }
}

function executePhoneAction(action) {
    try {
        const handler = getCommandHandler('phone-action');
        if (handler) {
            handler(action);
            return;
        }

        const container = typeof document !== 'undefined'
            ? document.getElementById('yuzi-phone-standalone')
            : null;
        const toggle = typeof document !== 'undefined'
            ? document.getElementById('yuzi-phone-toggle')
            : null;

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
                if (toggle && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-position-reset'));
                    showNotification('手机位置已重置', 'success');
                }
                break;
        }
    } catch (error) {
        handleError(error, `执行手机操作失败: ${action}`);
    }
}

function getPhoneStatusSnapshot() {
    const container = typeof document !== 'undefined'
        ? document.getElementById('yuzi-phone-standalone')
        : null;
    const toggle = typeof document !== 'undefined'
        ? document.getElementById('yuzi-phone-toggle')
        : null;

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
        registeredCommands: getRegisteredCommandsSnapshot(),
        hasFallbackCommands: hasFallbackSlashCommands(),
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

function showPhoneHelp() {
    Logger.info('[玉子手机] Slash 命令帮助:\n/phone\n/phone open\n/phone close\n/phone toggle\n/phone reset\n/phone status\n/phone help\n/phone-table <表名>\n/phone-tables\n/phone-settings reset\n/phone-settings export\n/phone-settings import');
    showNotification('Slash 命令帮助已输出到控制台', 'info');
}

export function handleTableCommand(args) {
    const tableName = String(args ?? '').trim();

    if (!tableName) {
        showNotification('请指定表格名称: /phone-table <表名>', 'warning');
        return;
    }

    try {
        const handler = getCommandHandler('open-table');
        if (handler) {
            handler(tableName);
        } else {
            showNotification(`打开表格: ${tableName}`, 'info');
        }
    } catch (error) {
        handleError(error, `打开表格失败: ${tableName}`);
    }
}

export function handleListTablesCommand() {
    try {
        const handler = getCommandHandler('list-tables');
        if (handler) {
            const tables = handler();
            if (Array.isArray(tables) && tables.length > 0) {
                const message = ['📋 可用表格列表', '─'.repeat(20), ...tables.map(tableName => `• ${tableName}`)].join('\n');
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

export function handleSettingsCommand(args) {
    const action = String(args ?? '').trim().toLowerCase();

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

function resetPhoneSettings() {
    try {
        const handler = getCommandHandler('reset-settings');
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

function exportPhoneSettings() {
    try {
        const handler = getCommandHandler('export-settings');
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

function importPhoneSettings() {
    showNotification('请使用 /phone-settings import <JSON> 导入设置', 'info');
}

function copyToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return;
    }

    if (typeof document === 'undefined') {
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

export function createFallbackSlashCommands() {
    return {
        phone: handlePhoneCommand,
        'phone-open': () => executePhoneAction('open'),
        'phone-close': () => executePhoneAction('close'),
        'phone-toggle': () => executePhoneAction('toggle'),
        'phone-table': handleTableCommand,
        'phone-tables': handleListTablesCommand,
        'phone-settings': handleSettingsCommand,
    };
}
