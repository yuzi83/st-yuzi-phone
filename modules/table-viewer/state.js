import { Logger } from '../error-handler.js';
import { getTableLockState } from '../phone-core/data-api.js';

const stateLogger = Logger.withScope({ scope: 'table-viewer/state', feature: 'table-viewer' });
const DIAGNOSTIC_STATE_KEYS = new Set([
    'mode',
    'rowIndex',
    'editMode',
    'cellLockManageMode',
    'saving',
    'lockManageMode',
    'deleteManageMode',
    'deletingRowIndex',
]);

function isRecordObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getDraftValuesRecord(draftValues) {
    return isRecordObject(draftValues) ? draftValues : {};
}

function getClearedDraftValues(draftValues) {
    const currentDraftValues = getDraftValuesRecord(draftValues);
    return Object.keys(currentDraftValues).length > 0 ? {} : currentDraftValues;
}

function setDraftValueEntry(draftValues, key, value) {
    const currentDraftValues = getDraftValuesRecord(draftValues);
    const draftKey = String(key);
    const nextValue = String(value ?? '');

    if (currentDraftValues[draftKey] === nextValue) {
        return currentDraftValues;
    }

    return {
        ...currentDraftValues,
        [draftKey]: nextValue,
    };
}

function removeDraftValueEntry(draftValues, key) {
    const currentDraftValues = getDraftValuesRecord(draftValues);
    const draftKey = String(key);
    if (!Object.prototype.hasOwnProperty.call(currentDraftValues, draftKey)) {
        return currentDraftValues;
    }

    const nextDraftValues = { ...currentDraftValues };
    delete nextDraftValues[draftKey];
    return Object.keys(nextDraftValues).length > 0 ? nextDraftValues : {};
}

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
        this._initialState = { ...initialState };
        this._allowedKeys = new Set(Object.keys(this._state));
        this._listeners = new Set();
        this._debug = options.debug || false;
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

        const changedKeys = [];
        const appliedUpdates = {};
        const invalidKeys = [];

        Object.entries(updates).forEach(([key, val]) => {
            if (!this._allowedKeys.has(key)) {
                invalidKeys.push(key);
                return;
            }

            appliedUpdates[key] = val;
            if (this._state[key] !== val) {
                changedKeys.push(key);
                this._state[key] = val;
            }
        });

        if (invalidKeys.length > 0) {
            Logger.warn('[TableViewerState] set: 忽略未知状态键', invalidKeys);
        }

        if (changedKeys.length > 0) {
            const changedUpdates = Object.fromEntries(
                changedKeys.map((key) => [key, appliedUpdates[key]])
            );
            const diagnosticKeys = changedKeys.filter((key) => DIAGNOSTIC_STATE_KEYS.has(key));
            if (diagnosticKeys.length > 0) {
                stateLogger.info({
                    action: 'state.change',
                    message: '表格查看器关键状态变更',
                    context: {
                        changedKeys: diagnosticKeys,
                        updates: Object.fromEntries(diagnosticKeys.map((key) => [key, changedUpdates[key]])),
                        snapshot: {
                            mode: this._state.mode,
                            rowIndex: this._state.rowIndex,
                            editMode: this._state.editMode,
                            cellLockManageMode: this._state.cellLockManageMode,
                            saving: this._state.saving,
                            lockManageMode: this._state.lockManageMode,
                            deleteManageMode: this._state.deleteManageMode,
                            deletingRowIndex: this._state.deletingRowIndex,
                        },
                    },
                });
            }
            this._notifyListeners(changedKeys, changedUpdates);

            if (this._debug) {
                Logger.debug('[TableViewerState] 状态变更:', changedKeys, changedUpdates);
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
    reset(initialState = this._initialState) {
        const sourceState = typeof initialState === 'object' && initialState !== null
            ? initialState
            : this._initialState;
        const invalidKeys = Object.keys(sourceState).filter((key) => !this._allowedKeys.has(key));
        const nextState = {};

        this._allowedKeys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(sourceState, key)) {
                nextState[key] = sourceState[key];
                return;
            }
            nextState[key] = this._initialState[key];
        });

        if (invalidKeys.length > 0) {
            Logger.warn('[TableViewerState] reset: 忽略未知状态键', invalidKeys);
        }

        this._state = nextState;
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
     * 同步锁状态
     * @param {Object} lockState
     * @returns {Object}
     */
    syncLockState(lockState) {
        return this.set('lockState', lockState);
    }

    /**
     * 清空列表管理模式
     * @returns {Object}
     */
    clearListManageModes() {
        return this.set({
            lockManageMode: false,
            deleteManageMode: false,
        });
    }

    /**
     * 设置锁定管理模式
     * @param {boolean} enabled
     * @returns {Object}
     */
    setLockManageMode(enabled) {
        const nextEnabled = !!enabled;
        return this.set({
            lockManageMode: nextEnabled,
            deleteManageMode: nextEnabled ? false : this._state.deleteManageMode,
        });
    }

    /**
     * 设置删除管理模式
     * @param {boolean} enabled
     * @returns {Object}
     */
    setDeleteManageMode(enabled) {
        const nextEnabled = !!enabled;
        return this.set({
            deleteManageMode: nextEnabled,
            lockManageMode: nextEnabled ? false : this._state.lockManageMode,
        });
    }

    /**
     * 进入详情模式
     * @param {number} rowIndex
     * @returns {Object}
     */
    enterDetailMode(rowIndex) {
        const nextRowIndex = Number(rowIndex);
        if (!Number.isInteger(nextRowIndex) || nextRowIndex < 0) {
            Logger.warn('[TableViewerState] enterDetailMode: 无效的行索引');
            return this._state;
        }

        return this.set({
            mode: 'detail',
            rowIndex: nextRowIndex,
            editMode: false,
            draftValues: getClearedDraftValues(this._state.draftValues),
            lockManageMode: false,
            deleteManageMode: false,
            cellLockManageMode: false,
            saving: false,
        });
    }

    /**
     * 返回列表模式并清理通用详情态
     * @returns {Object}
     */
    returnToListMode() {
        return this.set({
            mode: 'list',
            rowIndex: -1,
            editMode: false,
            draftValues: getClearedDraftValues(this._state.draftValues),
            lockManageMode: false,
            deleteManageMode: false,
            cellLockManageMode: false,
            saving: false,
        });
    }

    /**
     * 设置详情编辑模式
     * @param {boolean} enabled
     * @returns {Object}
     */
    setEditMode(enabled) {
        const nextEnabled = !!enabled;
        return this.set({
            editMode: nextEnabled,
            draftValues: nextEnabled ? this._state.draftValues : getClearedDraftValues(this._state.draftValues),
            cellLockManageMode: nextEnabled ? false : this._state.cellLockManageMode,
        });
    }

    /**
     * 设置字段锁管理模式
     * @param {boolean} enabled
     * @returns {Object}
     */
    setCellLockManageMode(enabled) {
        const nextEnabled = !!enabled;
        return this.set({
            cellLockManageMode: nextEnabled,
            editMode: nextEnabled ? false : this._state.editMode,
            draftValues: nextEnabled ? getClearedDraftValues(this._state.draftValues) : this._state.draftValues,
        });
    }

    /**
     * 设置保存中状态
     * @param {boolean} enabled
     * @returns {Object}
     */
    setSaving(enabled) {
        return this.set('saving', !!enabled);
    }

    /**
     * 更新单个草稿字段
     * @param {number|string} colIndex
     * @param {any} value
     * @returns {Object}
     */
    updateDraftValue(colIndex, value) {
        const nextColIndex = Number(colIndex);
        if (!Number.isInteger(nextColIndex) || nextColIndex < 0) {
            Logger.warn('[TableViewerState] updateDraftValue: 无效的列索引');
            return this._state;
        }

        const currentDraftValues = getDraftValuesRecord(this._state.draftValues);
        const nextDraftValues = setDraftValueEntry(currentDraftValues, nextColIndex, value);
        if (nextDraftValues === currentDraftValues) {
            return this._state;
        }
        return this.set('draftValues', nextDraftValues);
    }

    /**
     * 删除单个草稿字段
     * @param {number|string} colIndex
     * @returns {Object}
     */
    removeDraftValue(colIndex) {
        const nextColIndex = Number(colIndex);
        if (!Number.isInteger(nextColIndex) || nextColIndex < 0) {
            Logger.warn('[TableViewerState] removeDraftValue: 无效的列索引');
            return this._state;
        }

        const currentDraftValues = getDraftValuesRecord(this._state.draftValues);
        const nextDraftValues = removeDraftValueEntry(currentDraftValues, nextColIndex);
        if (nextDraftValues === currentDraftValues) {
            return this._state;
        }
        return this.set('draftValues', nextDraftValues);
    }

    /**
     * 清空所有草稿字段
     * @returns {Object}
     */
    clearDraftValues() {
        const currentDraftValues = getDraftValuesRecord(this._state.draftValues);
        const nextDraftValues = getClearedDraftValues(currentDraftValues);
        if (nextDraftValues === currentDraftValues) {
            return this._state;
        }
        return this.set('draftValues', nextDraftValues);
    }

    /**
     * 删除行后的状态修正
     * @param {number} deletedRowIndex
     * @param {number} remainingRowCount
     * @returns {Object}
     */
    reconcileAfterRowDelete(deletedRowIndex, remainingRowCount) {
        const nextDeletedRowIndex = Number(deletedRowIndex);
        const nextRemainingRowCount = Number(remainingRowCount);

        if (!Number.isInteger(nextDeletedRowIndex) || nextDeletedRowIndex < 0) {
            Logger.warn('[TableViewerState] reconcileAfterRowDelete: 无效的删除行索引');
            return this._state;
        }
        if (!Number.isInteger(nextRemainingRowCount) || nextRemainingRowCount < 0) {
            Logger.warn('[TableViewerState] reconcileAfterRowDelete: 无效的剩余行数');
            return this._state;
        }
        if (nextRemainingRowCount === 0) {
            return this.returnToListMode();
        }

        const currentRowIndex = Number(this._state.rowIndex);
        if (!Number.isInteger(currentRowIndex) || currentRowIndex < 0) {
            return this._state;
        }

        let nextRowIndex = currentRowIndex;
        if (currentRowIndex === nextDeletedRowIndex) {
            nextRowIndex = Math.min(currentRowIndex, nextRemainingRowCount - 1);
        } else if (currentRowIndex > nextDeletedRowIndex) {
            nextRowIndex = currentRowIndex - 1;
        }

        if (nextRowIndex === currentRowIndex) {
            return this._state;
        }
        return this.set('rowIndex', nextRowIndex);
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
        cellLockManageMode: false,
        draftValues: {},
        lockState: getTableLockState(sheetKey),
        saving: false,
        lockManageMode: false,
        deleteManageMode: false,
        deletingRowIndex: -1,
        listScrollTop: 0,
        listSearchQuery: '',
        listSortDescending: false,
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
