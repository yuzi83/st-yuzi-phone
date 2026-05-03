// modules/integration/cleanup.js
/**
 * 玉子的手机 - 集成层清理入口
 *
 * 把 SillyTavern 集成相关的 cache 在卸载时清理：
 *   - context-bridge：getSillyTavernContext 缓存
 *   - event-bridge：事件订阅状态
 *   - tavern-helper-bridge：TavernHelper 缓存
 *
 * 在 [`index.js`](index.js:1) 的 destroyPhone 链路里调用一次，确保扩展卸载时不留全局副作用。
 */

import { clearSillyTavernContextCache } from './context-bridge.js';
import { clearEventBridgeState } from './event-bridge.js';
import { clearTavernHelperCache } from './tavern-helper-bridge.js';

export function cleanupIntegration() {
    clearEventBridgeState();
    clearTavernHelperCache();
    clearSillyTavernContextCache();
}
