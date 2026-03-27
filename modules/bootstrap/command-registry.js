import { Logger } from '../error-handler.js';
import { DOM_IDS, resetPhoneTogglePosition } from './toggle-button.js';

const logger = Logger.withScope({ scope: 'bootstrap/command-registry', feature: 'slash' });

function getPhoneContainer() {
    return document.getElementById(DOM_IDS.container);
}

function getPhoneToggle() {
    return document.getElementById(DOM_IDS.toggle);
}

export function registerPhoneSlashCommandHandlers(options = {}) {
    const {
        registerCommandHandler,
        togglePhone,
        onPhoneActivated,
        onPhoneDeactivated,
        destroyPhoneRuntime,
        resetPhoneSettingsToDefault,
        getPhoneSettings,
        setPhoneEnabledWithUI,
    } = options;

    if (typeof registerCommandHandler !== 'function') {
        logger.warn({
            action: 'setup',
            message: 'Slash 命令处理器注册函数不可用',
        });
        return false;
    }

    registerCommandHandler('phone-action', (action) => {
        const container = getPhoneContainer();
        const toggle = getPhoneToggle();

        switch (action) {
            case 'open':
                if (container) {
                    container.classList.add('visible');
                    onPhoneActivated?.();
                    logger.info({
                        action: 'phone-action.open',
                        message: '手机已通过命令打开',
                    });
                }
                break;
            case 'close':
                if (container) {
                    container.classList.remove('visible');
                    onPhoneDeactivated?.();
                    logger.info({
                        action: 'phone-action.close',
                        message: '手机已通过命令关闭',
                    });
                }
                break;
            case 'toggle':
                togglePhone?.();
                logger.info({
                    action: 'phone-action.toggle',
                    message: '手机状态已通过命令切换',
                });
                break;
            case 'reset':
                if (toggle) {
                    resetPhoneTogglePosition();
                }
                break;
        }
    });

    registerCommandHandler('open-table', (tableName) => {
        logger.info({
            action: 'open-table',
            message: '触发表格打开命令',
            context: { tableName },
        });

        const event = new CustomEvent('yuzi-phone-open-table', {
            detail: { tableName },
        });
        window.dispatchEvent(event);
    });

    registerCommandHandler('list-tables', () => {
        const event = new CustomEvent('yuzi-phone-list-tables');
        window.dispatchEvent(event);
        return [];
    });

    registerCommandHandler('reset-settings', () => {
        const wasVisible = getPhoneContainer()?.classList.contains('visible');

        destroyPhoneRuntime?.();
        const resetOk = resetPhoneSettingsToDefault?.();
        if (!resetOk) {
            logger.warn({
                action: 'reset-settings',
                message: '设置重置失败',
            });
            return false;
        }

        setPhoneEnabledWithUI?.(false);
        const settings = typeof getPhoneSettings === 'function' ? getPhoneSettings() : null;
        if (settings?.enabled !== false) {
            setPhoneEnabledWithUI?.(true);
            if (wasVisible) {
                togglePhone?.(true);
            }
        }

        logger.info({
            action: 'reset-settings',
            message: '设置已重置',
        });
        return true;
    });

    registerCommandHandler('export-settings', () => {
        return typeof getPhoneSettings === 'function' ? getPhoneSettings() : null;
    });

    logger.debug({
        action: 'setup',
        message: 'Slash 命令处理器已注册',
    });
    return true;
}
