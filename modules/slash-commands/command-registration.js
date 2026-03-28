import { Logger } from '../error-handler.js';
import { createFallbackSlashCommands, handleListTablesCommand, handlePhoneCommand, handleSettingsCommand, handleTableCommand } from './command-actions.js';
import { clearFallbackSlashCommands, registerFallbackSlashCommands } from './host-adapter.js';
import { addRegisteredCommand, getRegisteredCommandsSnapshot } from './state.js';

const SLASH_COMMAND_DEFINITIONS = Object.freeze([
    {
        name: 'phone',
        handler: handlePhoneCommand,
        description: '玉子手机控制命令：/phone [open|close|toggle|reset|status|help]',
    },
    {
        name: 'phone-open',
        handler: () => handlePhoneCommand('open'),
        description: '打开玉子手机',
    },
    {
        name: 'phone-close',
        handler: () => handlePhoneCommand('close'),
        description: '关闭玉子手机',
    },
    {
        name: 'phone-toggle',
        handler: () => handlePhoneCommand('toggle'),
        description: '切换玉子手机状态',
    },
    {
        name: 'phone-table',
        handler: handleTableCommand,
        description: '在手机中打开指定表格：/phone-table <表名>',
    },
    {
        name: 'phone-tables',
        handler: handleListTablesCommand,
        description: '列出所有可用表格',
    },
    {
        name: 'phone-settings',
        handler: handleSettingsCommand,
        description: '手机设置命令：/phone-settings [reset|export|import]',
    },
]);

function registerCommandDefinition(registerSlashCommand, definition) {
    registerSlashCommand(
        definition.name,
        definition.handler,
        definition.args ?? [],
        definition.description,
        definition.isVisible ?? true
    );
    addRegisteredCommand(definition.name);
}

export function registerSlashCommandDefinitions(registerSlashCommand) {
    SLASH_COMMAND_DEFINITIONS.forEach((definition) => {
        registerCommandDefinition(registerSlashCommand, definition);
    });
}

export function registerFallbackCommandSet() {
    const registered = registerFallbackSlashCommands(createFallbackSlashCommands());
    if (registered) {
        Logger.info('使用降级方案注册命令');
    }
    return registered;
}

export function unregisterSlashCommandDefinitions(unregisterSlashCommand) {
    if (typeof unregisterSlashCommand === 'function') {
        getRegisteredCommandsSnapshot().forEach((commandName) => {
            try {
                unregisterSlashCommand(commandName);
            } catch (error) {
                Logger.debug(`注销命令失败: ${commandName}`, error);
            }
        });
    }

    clearFallbackSlashCommands();
}
