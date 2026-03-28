// modules/integration.js
/**
 * Yuzi Phone - SillyTavern 核心集成 facade
 * @version 2.2.0
 * @description 将上下文、事件系统、TavernHelper 与通知适配拆分到 `modules/integration/`，
 * 保留原有导出面与 import 路径兼容。
 */

export { getSillyTavernContext } from './integration/context-bridge.js';

export {
    EventTypes,
    onEvent,
    onceEvent,
    triggerEvent,
    waitForEvent,
    onWorldInfoUpdated,
    onChatChanged,
    onCharacterLoaded,
    onMessageSent,
    onMessageReceived,
    onAppReady,
    onUserMessageRendered,
    onCharacterMessageRendered,
    onMessageUpdated,
    onMessageDeleted,
    onMessageSwiped,
    onGenerationStarted,
    onGenerationEnded,
    onGenerationStopped,
    onGenerationAfterCommands,
    onChatCreated,
    onSettingsLoaded,
    setManagedTimeout,
    setManagedInterval,
    addManagedEventListener,
} from './integration/event-bridge.js';

export {
    getTavernHelper,
    getChatMessages,
    getLastMessageId,
    getVariables,
    setVariables,
    substituteMacros,
    getCharacterData,
    getWorldbookNames,
    getCurrentCharacterWorldbooks,
    getWorldbook,
} from './integration/tavern-helper-bridge.js';

export { showNotification } from './integration/toast-bridge.js';

import { clearSillyTavernContextCache } from './integration/context-bridge.js';
import { clearEventBridgeState } from './integration/event-bridge.js';
import { clearTavernHelperCache } from './integration/tavern-helper-bridge.js';

export function cleanupIntegration() {
    clearEventBridgeState();
    clearTavernHelperCache();
    clearSillyTavernContextCache();
}
