import { Logger } from '../error-handler.js';

const logger = Logger.withScope({ scope: 'content-presets/index-state', feature: 'content-presets' });
const state = {
    status: 'loading',
    error: null,
    metadata: new Map(),
    pageByTable: new Map(),
    popupByTable: new Map(),
    revision: 0,
};
const listeners = new Set();

function emit() {
    const snapshot = getContentPresetIndexSnapshot();
    for (const listener of [...listeners]) {
        try {
            listener(snapshot);
        } catch (error) {
            logger.warn({
                action: 'index.subscriber-error',
                message: '内容预设索引订阅回调执行失败',
                error,
            });
        }
    }
}

export function getContentPresetIndexSnapshot() {
    const pageByTable = new Map(state.pageByTable);
    return Object.freeze({
        status: state.status,
        error: state.error,
        metadata: new Map(state.metadata),
        pageByTable,
        popupByTable: new Map(state.popupByTable),
        // 旧页面 renderer 继续读取此字段；它明确等同于 pageByTable。
        activeByTable: new Map(pageByTable),
        revision: state.revision,
    });
}

export function subscribeContentPresetIndex(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function commitContentPresetIndex(patch = {}) {
    if (patch.status) state.status = patch.status;
    if ('error' in patch) state.error = patch.error;
    if (patch.metadata) state.metadata = new Map(patch.metadata);
    if ('pageByTable' in patch) state.pageByTable = new Map(patch.pageByTable);
    else if ('activeByTable' in patch) state.pageByTable = new Map(patch.activeByTable);
    if ('popupByTable' in patch) state.popupByTable = new Map(patch.popupByTable);
    state.revision += 1;
    emit();
    return getContentPresetIndexSnapshot();
}

export function markContentPresetIndexUnavailable(error) { return commitContentPresetIndex({ status: 'unavailable', error }); }
export function markContentPresetIndexError(error) { return commitContentPresetIndex({ status: 'error', error }); }
