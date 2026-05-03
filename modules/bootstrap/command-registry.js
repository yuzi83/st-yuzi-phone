import { Logger } from '../error-handler.js';
import { getSheetKeys, getTableData } from '../phone-core/data-api.js';
import { navigateTo } from '../phone-core/routing.js';
import { defaultSettings, extensionName } from '../settings.js';
import { DOM_IDS, resetPhoneTogglePosition } from './toggle-button.js';

const logger = Logger.withScope({ scope: 'bootstrap/command-registry', feature: 'slash' });

function getPhoneContainer() {
    return document.getElementById(DOM_IDS.container);
}

function getPhoneToggle() {
    return document.getElementById(DOM_IDS.toggle);
}

function normalizeCommandText(value) {
    return String(value ?? '').trim();
}

function normalizeLookupText(value) {
    return normalizeCommandText(value).toLowerCase();
}

function getAvailableTableEntries(rawData = getTableData()) {
    if (!rawData || typeof rawData !== 'object') {
        return [];
    }

    return getSheetKeys(rawData)
        .map((sheetKey) => {
            const sheet = rawData[sheetKey];
            const tableName = normalizeCommandText(sheet?.name) || sheetKey;
            const content = Array.isArray(sheet?.content) ? sheet.content : [];
            return {
                sheetKey,
                tableName,
                rowCount: Math.max(0, content.length - 1),
            };
        })
        .filter((entry) => entry.sheetKey);
}

function findDuplicateTableNames(entries) {
    const counts = new Map();
    entries.forEach((entry) => {
        const key = normalizeLookupText(entry.tableName);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
}

function formatTableListItem(entry, duplicateNameCounts = findDuplicateTableNames([entry])) {
    const duplicateCount = duplicateNameCounts.get(normalizeLookupText(entry.tableName)) || 0;
    const suffix = duplicateCount > 1 ? ` (${entry.sheetKey})` : '';
    return `${entry.tableName}${suffix} - ${entry.rowCount} 条`;
}

function resolveTableEntry(rawQuery, entries = getAvailableTableEntries()) {
    const query = normalizeCommandText(rawQuery);
    if (!query) {
        return { ok: false, code: 'empty_query', message: '请指定表格名称: /phone-table <表名或sheetKey>' };
    }

    if (entries.length === 0) {
        return { ok: false, code: 'empty_tables', message: '暂无可用表格，无法打开' };
    }

    const bySheetKey = entries.find((entry) => entry.sheetKey === query);
    if (bySheetKey) {
        return { ok: true, entry: bySheetKey };
    }

    const exactNameMatches = entries.filter((entry) => entry.tableName === query);
    if (exactNameMatches.length === 1) {
        return { ok: true, entry: exactNameMatches[0] };
    }
    if (exactNameMatches.length > 1) {
        return {
            ok: false,
            code: 'duplicate_name',
            message: `存在多个名为「${query}」的表格，请使用 sheetKey: ${exactNameMatches.map(entry => entry.sheetKey).join(', ')}`,
        };
    }

    const normalizedQuery = normalizeLookupText(query);
    const looseNameMatches = entries.filter((entry) => normalizeLookupText(entry.tableName) === normalizedQuery);
    if (looseNameMatches.length === 1) {
        return { ok: true, entry: looseNameMatches[0] };
    }
    if (looseNameMatches.length > 1) {
        return {
            ok: false,
            code: 'duplicate_name_case_insensitive',
            message: `存在多个名称匹配「${query}」的表格，请使用 sheetKey: ${looseNameMatches.map(entry => entry.sheetKey).join(', ')}`,
        };
    }

    return {
        ok: false,
        code: 'not_found',
        message: `未找到表格「${query}」，可使用 /phone-tables 查看可用表格`,
    };
}

function openTableInPhone(tableName, togglePhone) {
    const resolved = resolveTableEntry(tableName);
    if (!resolved.ok) {
        return resolved;
    }

    const entry = resolved.entry;
    const visible = typeof togglePhone === 'function' ? togglePhone(true) : false;
    if (visible === false) {
        return {
            ok: false,
            code: 'phone_unavailable',
            message: '手机界面不可用，无法打开表格',
            sheetKey: entry.sheetKey,
            tableName: entry.tableName,
        };
    }

    navigateTo(`app:${entry.sheetKey}`);
    return {
        ok: true,
        code: 'opened',
        message: `已打开表格「${entry.tableName}」`,
        sheetKey: entry.sheetKey,
        tableName: entry.tableName,
    };
}

function listAvailableTables() {
    const entries = getAvailableTableEntries();
    const duplicateNameCounts = findDuplicateTableNames(entries);
    return entries.map((entry) => formatTableListItem(entry, duplicateNameCounts));
}

function parseSettingsImportPayload(rawPayload) {
    try {
        const parsed = JSON.parse(String(rawPayload || ''));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, message: '设置导入失败：JSON 须为对象' };
        }

        const namespacePayload = parsed[extensionName];
        if (namespacePayload !== undefined) {
            if (!namespacePayload || typeof namespacePayload !== 'object' || Array.isArray(namespacePayload)) {
                return { ok: false, message: `设置导入失败：${extensionName} 必须是对象` };
            }
            return { ok: true, payload: namespacePayload };
        }

        return { ok: true, payload: parsed };
    } catch (error) {
        return {
            ok: false,
            message: `设置导入失败：JSON 解析错误：${error?.message || '未知错误'}`,
        };
    }
}

function buildSettingsImportPatch(payload) {
    const allowedKeys = new Set(Object.keys(defaultSettings));
    const patch = {};
    const ignoredKeys = [];

    Object.entries(payload).forEach(([key, value]) => {
        if (allowedKeys.has(key)) {
            patch[key] = value;
        } else {
            ignoredKeys.push(key);
        }
    });

    return { patch, ignoredKeys };
}

function importPhoneSettingsPayload(rawPayload, deps = {}) {
    const {
        savePhoneSettingsPatch,
        flushPhoneSettingsSave,
    } = deps;

    if (typeof savePhoneSettingsPatch !== 'function') {
        return { ok: false, message: '设置导入失败：保存处理器不可用' };
    }

    const parsed = parseSettingsImportPayload(rawPayload);
    if (!parsed.ok) {
        return parsed;
    }

    const { patch, ignoredKeys } = buildSettingsImportPatch(parsed.payload);
    const patchKeys = Object.keys(patch);
    if (patchKeys.length === 0) {
        return {
            ok: false,
            message: ignoredKeys.length > 0
                ? `设置导入失败：未包含可识别设置字段，已忽略 ${ignoredKeys.length} 个未知字段`
                : '设置导入失败：未包含可导入的设置字段',
        };
    }

    const saved = savePhoneSettingsPatch(patch);
    if (!saved) {
        return {
            ok: false,
            message: `设置导入未完全成功：已处理 ${patchKeys.length} 个字段${ignoredKeys.length > 0 ? `，忽略 ${ignoredKeys.length} 个未知字段` : ''}`,
        };
    }

    if (typeof flushPhoneSettingsSave === 'function') {
        flushPhoneSettingsSave();
    }

    return {
        ok: true,
        message: `设置已导入：${patchKeys.length} 个字段${ignoredKeys.length > 0 ? `，忽略 ${ignoredKeys.length} 个未知字段` : ''}`,
    };
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
        savePhoneSettingsPatch,
        flushPhoneSettingsSave,
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
        const result = openTableInPhone(tableName, togglePhone);
        logger.info({
            action: 'open-table',
            message: result.ok ? '表格打开命令已执行' : '表格打开命令失败',
            context: {
                query: normalizeCommandText(tableName),
                code: result.code,
                sheetKey: result.sheetKey || '',
                tableName: result.tableName || '',
            },
        });
        return result;
    });

    registerCommandHandler('list-tables', () => listAvailableTables());

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

    registerCommandHandler('import-settings', (rawPayload) => importPhoneSettingsPayload(rawPayload, {
        savePhoneSettingsPatch,
        flushPhoneSettingsSave,
    }));

    logger.debug({
        action: 'setup',
        message: 'Slash 命令处理器已注册',
    });
    return true;
}
