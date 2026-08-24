import {
    onChatChanged,
    onChatDeleted,
    onGroupChatDeleted,
    onCharacterLoaded,
    onAppReady,
    onMessageReceived,
    onUserMessageRendered,
    onCharacterMessageRendered,
    onMessageUpdated,
    onMessageDeleted,
    onGenerationEnded,
    onGenerationAfterCommands,
} from '../integration/event-bridge.js';
import { resolveCurrentHostIdentity } from '../integration/chat-identity.js';
import { createHostChatDeletedFact } from '../qq-v2/host/lifecycle.js';
import { Logger, handleError } from '../error-handler.js';
import {
    DOM_IDS,
    syncPhoneToggleVisualStyle,
    resetPhoneTogglePosition,
    applyPhoneTogglePosition,
} from './toggle-button.js';

function dispatchQQV2Event(callback, eventName, ...args) {
    if (typeof callback !== 'function') return;

    try {
        void Promise.resolve(callback(...args)).catch((error) => {
            Logger.warn(`QQ v2 ${eventName}处理失败`, error);
        });
    } catch (error) {
        Logger.warn(`QQ v2 ${eventName}处理失败`, error);
    }
}

export async function registerPhoneEventListeners(options = {}) {
    const {
        onVisiblePhoneRefresh,
        onBackgroundChatChanged,
        onQQV2ChatChanged,
        onQQV2ChatDeleted,
        onQQV2GroupChatDeleted,
        onQQV2MessageReceived,
        resolveQQV2HostIdentity = resolveCurrentHostIdentity,
    } = options;

    try {
        await onChatChanged((chatId) => {
            Logger.info('聊天切换:', chatId);
            onBackgroundChatChanged?.(chatId);
            dispatchQQV2Event(onQQV2ChatChanged, '聊天切换', chatId);
            const container = document.getElementById(DOM_IDS.container);
            if (container && container.classList.contains('visible')) {
                onVisiblePhoneRefresh?.();
            }
        });

        await onChatDeleted((chatFile) => {
            const identity = resolveQQV2HostIdentity?.();
            const fact = createHostChatDeletedFact('character', chatFile, {
                hostId: identity?.hostType === 'character' ? identity.hostId : '',
            });
            Logger.info('私聊聊天删除:', fact);
            dispatchQQV2Event(onQQV2ChatDeleted, '私聊聊天删除', fact);
        });

        await onGroupChatDeleted((chatId) => {
            const identity = resolveQQV2HostIdentity?.();
            const fact = createHostChatDeletedFact('group', chatId, {
                hostId: identity?.hostType === 'group' ? identity.hostId : '',
            });
            Logger.info('群聊聊天删除:', fact);
            dispatchQQV2Event(onQQV2GroupChatDeleted, '群聊聊天删除', fact);
        });

        await onCharacterLoaded((characterId) => {
            Logger.info('角色加载:', characterId);
        });

        await onAppReady(() => {
            Logger.info('SillyTavern 应用就绪');
        });

        await onUserMessageRendered((messageId) => {
            Logger.debug('用户消息渲染完成:', messageId);
        });

        await onMessageReceived((messageId, generationType) => {
            Logger.debug('角色消息已写入正文:', messageId, generationType);
            dispatchQQV2Event(onQQV2MessageReceived, '正文角色消息写入', messageId, generationType);
        });

        await onCharacterMessageRendered((messageId, generationType) => {
            Logger.debug('角色消息渲染完成:', messageId, generationType);
        });

        await onMessageUpdated((messageId) => {
            Logger.debug('消息更新:', messageId);
        });

        await onMessageDeleted((messageId) => {
            Logger.debug('消息删除:', messageId);
        });

        await onGenerationEnded(() => {
            Logger.debug('AI 生成结束');
        });

        await onGenerationAfterCommands((type, params, dryRun) => {
            if (dryRun) return;
            Logger.debug('生成前命令处理:', { type, params });
        });

        Logger.debug('事件监听器已注册');
    } catch (error) {
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
