// modules/utils/event-manager.js
/**
 * 玉子的手机 - 事件管理器
 *
 * EventManager 是基于 [`createRuntimeScope()`](modules/runtime-manager.js:48) 的兼容包装：
 *   - 兼容旧路径里"按 target/type/handler 移除监听"的索引式语义
 *   - 同时暴露 [`observeMutation()`](modules/runtime-manager.js:236) / [`observeDisconnection()`](modules/runtime-manager.js:203)
 *     这类统一 cleanup 语义，避免 observer 生命周期分散实现
 *
 * 新代码优先直接使用 [`createRuntimeScope()`](modules/runtime-manager.js:48)；
 * 这里保留 EventManager 仅为了让既有调用方（toggle-button / table-viewer 等）零改动迁移。
 */

import { createRuntimeScope } from '../runtime-manager.js';

/**
 * 事件管理器 - 基于 runtimeScope 的兼容包装。
 * @example
 * const eventManager = new EventManager();
 * eventManager.add(element, 'click', handler);
 * eventManager.add(window, 'resize', handler2);
 * // 清理所有监听器
 * eventManager.dispose();
 */
export class EventManager {
    constructor(scopeName = 'utils-event-manager') {
        this.scopeName = scopeName;
        this.runtime = createRuntimeScope(scopeName);
        /** @type {Map<string, {target: EventTarget, type: string, handler: Function, unsubscribe: Function}>} */
        this.listeners = new Map();
        this.listenerSequence = 0;
    }

    ensureRuntime() {
        if (this.runtime?.isDisposed?.()) {
            this.runtime = createRuntimeScope(this.scopeName);
        }
        return this.runtime;
    }

    /**
     * 添加事件监听器
     * @param {EventTarget} target - 目标对象
     * @param {string} type - 事件类型
     * @param {Function} handler - 处理函数
     * @param {Object} options - 选项
     * @returns {Function} 取消监听的函数
     */
    add(target, type, handler, options = {}) {
        if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
            return () => {};
        }

        const key = `${String(type || 'event')}-${++this.listenerSequence}`;
        const unsubscribe = this.ensureRuntime().addEventListener(target, type, handler, options);
        this.listeners.set(key, { target, type, handler, unsubscribe });

        return () => {
            const listener = this.listeners.get(key);
            if (!listener) return;
            this.listeners.delete(key);
            try {
                listener.unsubscribe?.();
            } catch {}
        };
    }

    /**
     * 移除指定事件监听器
     * @param {EventTarget} target - 目标对象
     * @param {string} type - 事件类型
     * @param {Function} handler - 处理函数
     */
    remove(target, type, handler) {
        for (const [key, listener] of this.listeners.entries()) {
            if (listener.target === target &&
                listener.type === type &&
                listener.handler === handler) {
                this.listeners.delete(key);
                try {
                    listener.unsubscribe?.();
                } catch {}
                break;
            }
        }
    }

    registerCleanup(cleanup) {
        return this.ensureRuntime().registerCleanup(cleanup);
    }

    observeMutation(target, callback, options = {}) {
        return this.ensureRuntime().observeMutation(target, callback, options);
    }

    observeDisconnection(target, callback, options = {}) {
        return this.ensureRuntime().observeDisconnection(target, callback, options);
    }

    /**
     * 清理所有事件监听器
     */
    dispose() {
        this.runtime.dispose();
        this.listeners.clear();
        this.runtime = createRuntimeScope(this.scopeName);
    }

    /**
     * 获取监听器数量
     * @returns {number}
     */
    get size() {
        return this.listeners.size;
    }
}
