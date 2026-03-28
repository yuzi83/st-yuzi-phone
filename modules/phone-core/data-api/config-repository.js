import {
    clampNonNegativeInteger,
    clampPositiveInteger,
    getDB,
} from '../db-bridge.js';

function normalizeUpdateConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        autoUpdateThreshold: clampNonNegativeInteger(src.autoUpdateThreshold, 3),
        autoUpdateFrequency: clampPositiveInteger(src.autoUpdateFrequency, 1),
        updateBatchSize: clampPositiveInteger(src.updateBatchSize, 2),
        autoUpdateTokenThreshold: clampNonNegativeInteger(src.autoUpdateTokenThreshold, 0),
    };
}

function normalizeManualSelection(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const selectedTables = Array.isArray(src.selectedTables)
        ? Array.from(new Set(src.selectedTables.map((key) => String(key || '').trim()).filter(Boolean)))
        : [];

    return {
        selectedTables,
        hasManualSelection: typeof src.hasManualSelection === 'boolean'
            ? src.hasManualSelection
            : selectedTables.length > 0,
    };
}

function getDbConfigApi() {
    const api = getDB();
    if (!api) return null;

    const requiredMethods = [
        'getUpdateConfigParams',
        'setUpdateConfigParams',
        'getManualSelectedTables',
        'setManualSelectedTables',
        'clearManualSelectedTables',
    ];

    const missingMethods = requiredMethods.filter((method) => typeof api[method] !== 'function');
    if (missingMethods.length > 0) {
        return { api, missingMethods, ok: false };
    }

    return { api, missingMethods: [], ok: true };
}

export function getDbConfigApiAvailability() {
    const pack = getDbConfigApi();
    if (!pack) {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '数据库 API 不可用，请确认数据库插件已加载',
            missingMethods: [],
        };
    }

    if (!pack.ok) {
        return {
            ok: false,
            code: 'api_methods_missing',
            message: `数据库 API 缺少方法：${pack.missingMethods.join(', ')}`,
            missingMethods: pack.missingMethods,
        };
    }

    return {
        ok: true,
        code: 'ok',
        message: '数据库配置 API 可用',
        missingMethods: [],
    };
}

export function readDbUpdateConfigViaApi() {
    const pack = getDbConfigApi();
    if (!pack || !pack.ok) {
        const availability = getDbConfigApiAvailability();
        return {
            ok: false,
            code: availability.code,
            message: availability.message,
            data: normalizeUpdateConfig({}),
        };
    }

    try {
        const raw = pack.api.getUpdateConfigParams();
        return {
            ok: true,
            code: 'ok',
            message: '读取更新配置成功',
            data: normalizeUpdateConfig(raw),
        };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: `读取更新配置失败：${error?.message || '未知错误'}`,
            data: normalizeUpdateConfig({}),
        };
    }
}

export function writeDbUpdateConfigViaApi(config = {}) {
    const pack = getDbConfigApi();
    if (!pack || !pack.ok) {
        const availability = getDbConfigApiAvailability();
        return {
            ok: false,
            code: availability.code,
            message: availability.message,
        };
    }

    const src = config && typeof config === 'object' ? config : {};
    const payload = {};

    if ('autoUpdateThreshold' in src) {
        payload.autoUpdateThreshold = clampNonNegativeInteger(src.autoUpdateThreshold, 0);
    }
    if ('autoUpdateFrequency' in src) {
        payload.autoUpdateFrequency = clampPositiveInteger(src.autoUpdateFrequency, 1);
    }
    if ('updateBatchSize' in src) {
        payload.updateBatchSize = clampPositiveInteger(src.updateBatchSize, 1);
    }
    if ('autoUpdateTokenThreshold' in src) {
        payload.autoUpdateTokenThreshold = clampNonNegativeInteger(src.autoUpdateTokenThreshold, 0);
    }

    if (Object.keys(payload).length === 0) {
        return {
            ok: false,
            code: 'invalid_payload',
            message: '未提供可写入的更新配置参数',
        };
    }

    try {
        const success = !!pack.api.setUpdateConfigParams(payload);
        return success
            ? { ok: true, code: 'ok', message: '更新配置已保存' }
            : { ok: false, code: 'failed', message: '更新配置保存失败' };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: `更新配置保存失败：${error?.message || '未知错误'}`,
        };
    }
}

export function readManualTableSelectionViaApi() {
    const pack = getDbConfigApi();
    if (!pack || !pack.ok) {
        const availability = getDbConfigApiAvailability();
        return {
            ok: false,
            code: availability.code,
            message: availability.message,
            data: normalizeManualSelection({ selectedTables: [], hasManualSelection: false }),
        };
    }

    try {
        const raw = pack.api.getManualSelectedTables();
        return {
            ok: true,
            code: 'ok',
            message: '读取手动表选择成功',
            data: normalizeManualSelection(raw),
        };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: `读取手动表选择失败：${error?.message || '未知错误'}`,
            data: normalizeManualSelection({ selectedTables: [], hasManualSelection: false }),
        };
    }
}

export function writeManualTableSelectionViaApi(selectedKeys = []) {
    const pack = getDbConfigApi();
    if (!pack || !pack.ok) {
        const availability = getDbConfigApiAvailability();
        return {
            ok: false,
            code: availability.code,
            message: availability.message,
        };
    }

    const normalizedKeys = Array.isArray(selectedKeys)
        ? Array.from(new Set(selectedKeys.map((key) => String(key || '').trim()).filter(Boolean)))
        : [];

    try {
        const success = !!pack.api.setManualSelectedTables(normalizedKeys);
        return success
            ? { ok: true, code: 'ok', message: '手动更新表选择已保存' }
            : { ok: false, code: 'failed', message: '手动更新表选择保存失败' };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: `手动更新表选择保存失败：${error?.message || '未知错误'}`,
        };
    }
}

export function clearManualTableSelectionViaApi() {
    const pack = getDbConfigApi();
    if (!pack || !pack.ok) {
        const availability = getDbConfigApiAvailability();
        return {
            ok: false,
            code: availability.code,
            message: availability.message,
        };
    }

    try {
        const success = !!pack.api.clearManualSelectedTables();
        return success
            ? { ok: true, code: 'ok', message: '已恢复默认全选' }
            : { ok: false, code: 'failed', message: '恢复默认全选失败' };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: `恢复默认全选失败：${error?.message || '未知错误'}`,
        };
    }
}
