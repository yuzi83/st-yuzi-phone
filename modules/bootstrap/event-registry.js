import {
    onChatChanged,
    onCharacterLoaded,
    onAppReady,
    onUserMessageRendered,
    onCharacterMessageRendered,
    onMessageUpdated,
    onMessageDeleted,
    onGenerationStarted,
    onGenerationEnded,
    onGenerationAfterCommands,
} from '../integration/event-bridge.js';
import { Logger, handleError } from '../error-handler.js';
import {
    DOM_IDS,
    syncPhoneToggleVisualStyle,
    resetPhoneTogglePosition,
    applyPhoneTogglePosition,
} from './toggle-button.js';

export async function registerPhoneEventListeners(options = {}) {
    const { onVisiblePhoneRefresh, shouldAbort } = options;
    const unregisterCallbacks = [];

    const cleanupRegisteredListeners = () => {
        while (unregisterCallbacks.length > 0) {
            const unsubscribe = unregisterCallbacks.pop();
            try {
                unsubscribe?.();
            } catch (error) {
                Logger.debug('清理事件监听器失败', error);
            }
        }
    };

    const assertNotAborted = () => {
        if (typeof shouldAbort === 'function' && shouldAbort()) {
            throw new Error('事件监听注册已取消');
        }
    };

    const registerManagedListener = async (register) => {
        assertNotAborted();
        const unsubscribe = await register();
        if (typeof unsubscribe === 'function') {
            unregisterCallbacks.push(unsubscribe);
        }
        assertNotAborted();
    };

    try {
        await registerManagedListener(() => onChatChanged((chatId) => {
            Logger.info('聊天切换:', chatId);
            const container = document.getElementById(DOM_IDS.container);
            if (container && container.classList.contains('visible')) {
                onVisiblePhoneRefresh?.();
            }
        }));

        await registerManagedListener(() => onCharacterLoaded((characterId) => {
            Logger.info('角色加载:', characterId);
        }));

        await registerManagedListener(() => onAppReady(() => {
            Logger.info('SillyTavern 应用就绪');
        }));

        await registerManagedListener(() => onUserMessageRendered((messageId) => {
            Logger.debug('用户消息渲染完成:', messageId);
        }));

        await registerManagedListener(() => onCharacterMessageRendered((messageId) => {
            Logger.debug('角色消息渲染完成:', messageId);
        }));

        await registerManagedListener(() => onMessageUpdated((messageId) => {
            Logger.debug('消息更新:', messageId);
        }));

        await registerManagedListener(() => onMessageDeleted((messageId) => {
            Logger.debug('消息删除:', messageId);
        }));

        await registerManagedListener(() => onGenerationStarted(() => {
            Logger.debug('AI 生成开始');
        }));

        await registerManagedListener(() => onGenerationEnded(() => {
            Logger.debug('AI 生成结束');
        }));

        await registerManagedListener(() => onGenerationAfterCommands((type, params, dryRun) => {
            if (dryRun) return;
            Logger.debug('生成前命令处理:', { type, params });
    }));

        Logger.debug('事件监听器已注册');
    } catch (error) {
        cleanupRegisteredListeners();
        handleError(error, '注册事件监听器失败');
    }
}

export function bindPhoneBootstrapWindowEvents(eventManager) {
    if (!eventManager || typeof eventManager.add !== 'function') {
        return;
    }

    const handleToggleStyleUpdated = () => {
        syncPhoneToggleVisualStyle();
    };

    const handleTogglePositionReset = () => {
        resetPhoneTogglePosition();
    };

    const handleViewportResize = () => {
        const btn = document.getElementById(DOM_IDS.toggle);
        if (!btn) return;
        applyPhoneTogglePosition(btn, { persistIfAdjusted: true });
    };

    eventManager.add(window, 'yuzi-phone-toggle-style-updated', handleToggleStyleUpdated);
    eventManager.add(window, 'yuzi-phone-toggle-position-reset', handleTogglePositionReset);
    eventManager.add(window, 'resize', handleViewportResize);
}
