import { Logger } from '../error-handler.js';
import { getTableLockState } from '../phone-core/data-api.js';

/**
 * 表格查看器状态管理类
 * 提供统一的状态存储、变更监听和快照功能
 */
export class TableViewerState {
    /**
     * @param {Object} initialState - 初始状态
     * @param {Object} [options] - 配置选项
     * @param {boolean} [options.debug] - 是否启用调试模式
     */
    constructor(initialState, options = {}) {
        this._state = { ...initialState };
        this._listeners = new Set();
        this._history = [];
        this._maxHistoryLength = 10;
        this._debug = options.debug || false;
    }

    /**
     * 获取当前状态
     * @returns {Object} 状态副本
     */
    getState() {
        return { ...this._state };
    }

    /**
     * 获取单个状态值
     * @param {string} key - 状态键名
     * @returns {any} 状态值
     */
    get(key) {
        return this._state[key];
    }

    /**
     * 设置状态值
     * @param {string|Object} keyOrUpdates - 状态键名或更新对象
     * @param {any} [value] - 状态值（当第一个参数为字符串时使用）
     * @returns {Object} 更新后的状态
     */
    set(keyOrUpdates, value) {
        const updates = typeof keyOrUpdates === 'string'
            ? { [keyOrUpdates]: value }
            : keyOrUpdates;

        if (typeof updates !== 'object' || updates === null) {
            Logger.warn('[TableViewerState] set: 无效的更新参数');
            return this._state;
        }

        const prevSnapshot = this._createSnapshot();
        const changedKeys = [];

        Object.entries(updates).forEach(([key, val]) => {
            if (this._state[key] !== val) {
                changedKeys.push(key);
                this._state[key] = val;
            }
        });

        if (changedKeys.length > 0) {
            this._pushHistory(prevSnapshot);
            this._notifyListeners(changedKeys, updates);

            if (this._debug) {
                Logger.debug('[TableViewerState] 状态变更:', changedKeys, updates);
            }
        }

        return this._state;
    }

    /**
     * 批量更新状态
     * @param {Object} updates - 更新对象
     * @returns {Object} 更新后的状态
     */
    batchUpdate(updates) {
        return this.set(updates);
    }

    /**
     * 重置状态到初始值
     * @param {Object} initialState - 初始状态
     */
    reset(initialState) {
        const prevSnapshot = this._createSnapshot();
        this._state = { ...initialState };
        this._pushHistory(prevSnapshot);
        this._notifyListeners(Object.keys(this._state), this._state);

        if (this._debug) {
            Logger.debug('[TableViewerState] 状态重置');
        }
    }

    /**
     * 订阅状态变更
     * @param {Function} listener - 监听函数 (changedKeys, updates) => void
     * @returns {Function} 取消订阅函数
     */
    subscribe(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * 创建状态快照
     * @returns {Object} 快照对象
     */
    _createSnapshot() {
        return {
            state: { ...this._state },
            timestamp: Date.now(),
        };
    }

    /**
     * 推送历史记录
     * @param {Object} snapshot - 快照对象
     */
    _pushHistory(snapshot) {
        this._history.push(snapshot);
        if (this._history.length > this._maxHistoryLength) {
            this._history.shift();
        }
    }

    /**
     * 通知监听器
     * @param {string[]} changedKeys - 变更的键列表
     * @param {Object} updates - 更新对象
     */
    _notifyListeners(changedKeys, updates) {
        this._listeners.forEach(listener => {
            try {
                listener(changedKeys, updates);
            } catch (e) {
                Logger.warn('[TableViewerState] 监听器执行错误:', e);
            }
        });
    }

    /**
     * 撤销到上一个状态
     * @returns {boolean} 是否撤销成功
     */
    undo() {
        if (this._history.length === 0) {
            return false;
        }

        const snapshot = this._history.pop();
        this._state = snapshot.state;
        this._notifyListeners(Object.keys(this._state), this._state);

        if (this._debug) {
            Logger.debug('[TableViewerState] 撤销到:', snapshot.timestamp);
        }

        return true;
    }

    /**
     * 获取历史记录长度
     * @returns {number}
     */
    getHistoryLength() {
        return this._history.length;
    }

    /**
     * 清空历史记录
     */
    clearHistory() {
        this._history = [];
    }

    /**
     * 启用/禁用调试模式
     * @param {boolean} enabled
     */
    setDebug(enabled) {
        this._debug = enabled;
    }
}

/**
 * 创建表格查看器状态
 * @param {string} sheetKey - 表格键名
 * @returns {Object} 状态管理实例（支持直接属性访问）
 */
export function createTableViewerState(sheetKey) {
    const stateManager = new TableViewerState({
        mode: 'list',
        rowIndex: -1,
        editMode: false,
        draftValues: {},
        lockState: getTableLockState(sheetKey),
        saving: false,
        lockManageMode: false,
        deleteManageMode: false,
        deletingRowIndex: -1,
        listScrollTop: 0,
        listSearchQuery: '',
    });

    return new Proxy(stateManager, {
        get(target, prop) {
            if (prop in target) {
                const value = target[prop];
                if (typeof value === 'function') {
                    return value.bind(target);
                }
                return value;
            }
            return target.get(String(prop));
        },
        set(target, prop, value) {
            target.set(String(prop), value);
            return true;
        },
    });
}
