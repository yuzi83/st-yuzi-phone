// modules/phone/phone-core.js
/**
 * 玉子的手机 - 核心框架
 * Tab 注册、路由、桥接、全屏适配
 */

import { PHONE_ICONS } from './phone-home.js';
import { initPhoneShellDrag, initPhoneShellResize } from './window.js';
import { getPhoneSettings, savePhoneSetting } from './settings.js';

export { getPhoneSettings, savePhoneSetting } from './settings.js';

// ===== 数据库桥接层 =====
// 零侵入：通过 AutoCardUpdaterAPI（数据库脚本暴露的全局 API）访问数据

/**
 * 获取数据库 API 对象
 * 等同于可视化前端的 getCore().getDB()
 */
function getDB() {
    const w = window.parent || window;
    const parentApi = (/** @type {any} */ (w)).AutoCardUpdaterAPI;
    const selfApi = (/** @type {any} */ (window)).AutoCardUpdaterAPI;
    return parentApi || selfApi || null;
}

/**
 * 获取当前表格数据（从 AutoCardUpdaterAPI.exportTableAsJson）
 * 返回的是 { sheet_xxx: { name, content: [[headers], [row1], ...], ... }, mate: {...} } 结构
 */
export function getTableData() {
    const api = getDB();
    if (api && typeof api.exportTableAsJson === 'function') {
        return api.exportTableAsJson();
    }
    return null;
}

export async function saveTableData(rawData) {
    const api = getDB();
    if (!api || typeof api.importTableAsJson !== 'function') return false;

    try {
        const jsonString = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
        return await api.importTableAsJson(jsonString);
    } catch (e) {
        console.warn('[玉子的手机] importTableAsJson 调用失败:', e);
        return false;
    }
}

export function getTableLockState(sheetKey) {
    const api = getDB();
    if (!api || typeof api.getTableLockState !== 'function') {
        return { rows: [], cols: [], cells: [] };
    }

    try {
        const lockState = api.getTableLockState(sheetKey);
        return normalizeLockState(lockState);
    } catch (e) {
        console.warn('[玉子的手机] getTableLockState 调用失败:', e);
        return { rows: [], cols: [], cells: [] };
    }
}

export function setTableCellLock(sheetKey, rowIndex, colIndex, locked) {
    const api = getDB();
    if (!api || typeof api.lockTableCell !== 'function') return false;

    try {
        return !!api.lockTableCell(sheetKey, rowIndex, colIndex, locked);
    } catch (e) {
        console.warn('[玉子的手机] lockTableCell 调用失败:', e);
        return false;
    }
}

export function setTableRowLock(sheetKey, rowIndex, locked) {
    const api = getDB();
    if (!api) return false;

    try {
        if (typeof api.lockTableRow === 'function') {
            return !!api.lockTableRow(sheetKey, rowIndex, !!locked);
        }

        // 兼容回退：使用 setTableLockState 覆盖 rows
        if (typeof api.getTableLockState === 'function' && typeof api.setTableLockState === 'function') {
            const current = normalizeLockState(api.getTableLockState(sheetKey));
            const nextRows = new Set(current.rows);
            if (locked) {
                nextRows.add(Number(rowIndex));
            } else {
                nextRows.delete(Number(rowIndex));
            }

            return !!api.setTableLockState(sheetKey, {
                rows: Array.from(nextRows).filter(Number.isInteger),
                cols: current.cols,
                cells: current.cells,
            }, { merge: false });
        }
    } catch (e) {
        console.warn('[玉子的手机] lockTableRow/setTableLockState 调用失败:', e);
        return false;
    }

    return false;
}

export function isTableRowLocked(sheetKey, rowIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;
    return lockState.rows.includes(Number(rowIndex));
}

export function isTableCellLocked(sheetKey, rowIndex, colIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;

    const rowLocked = lockState.rows.includes(rowIndex);
    const colLocked = lockState.cols.includes(colIndex);
    const key = `${rowIndex}:${colIndex}`;
    const cellLocked = lockState.cells.includes(key);
    return rowLocked || colLocked || cellLocked;
}

function normalizeLockState(lockState) {
    if (!lockState || typeof lockState !== 'object') {
        return { rows: [], cols: [], cells: [] };
    }

    const rows = Array.isArray(lockState.rows)
        ? lockState.rows.map(v => Number(v)).filter(Number.isInteger)
        : [];

    const cols = Array.isArray(lockState.cols)
        ? lockState.cols.map(v => Number(v)).filter(Number.isInteger)
        : [];

    const cells = Array.isArray(lockState.cells)
        ? lockState.cells.map(v => {
            if (Array.isArray(v) && v.length >= 2) {
                const r = Number(v[0]);
                const c = Number(v[1]);
                if (Number.isInteger(r) && Number.isInteger(c)) return `${r}:${c}`;
                return null;
            }
            return String(v || '').trim() || null;
        }).filter(Boolean)
        : [];

    return {
        rows: Array.from(new Set(rows)),
        cols: Array.from(new Set(cols)),
        cells: Array.from(new Set(cells)),
    };
}

/**
 * 把 raw table data 转为按表名索引的结构
 * { "全局数据表": { key: "sheet_global_data", headers: [...], rows: [[...], ...] }, ... }
 */
export function processTableData(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;
    const tables = {};
    for (const sheetId in rawData) {
        const sheet = rawData[sheetId];
        if (sheet?.name && sheet?.content) {
            tables[sheet.name] = {
                key: sheetId,
                headers: sheet.content[0] || [],
                rows: sheet.content.slice(1),
            };
        }
    }
    return Object.keys(tables).length > 0 ? tables : null;
}

/**
 * 获取 raw data 中按 orderNo 排序的 sheet 键列表
 */
export function getSheetKeys(rawData) {
    if (!rawData || typeof rawData !== 'object') return [];
    const keys = Object.keys(rawData).filter(k => k.startsWith('sheet_'));
    return keys.sort((a, b) => {
        const aSheet = rawData[a];
        const bSheet = rawData[b];
        const ao = Number.isFinite(aSheet?.orderNo) ? aSheet.orderNo : Infinity;
        const bo = Number.isFinite(bSheet?.orderNo) ? bSheet.orderNo : Infinity;
        if (ao !== bo) return ao - bo;
        return String(aSheet?.name || a).localeCompare(String(bSheet?.name || b));
    });
}

/**
 * 触发手动更新
 */
export async function triggerManualUpdate() {
    const api = getDB();
    if (api && typeof api.manualUpdate === 'function') {
        try {
            return await api.manualUpdate();
        } catch (e) {
            console.warn('[玉子的手机] manualUpdate 调用失败:', e);
        }
    }
    // 回退：尝试 DOM 点击方式
    try {
        const topDoc = (window.parent || window).document;
        // 数据库按钮 ID 格式: shujuku_v120-manual-update-card
        const btn = topDoc.querySelector('[id$="-manual-update-card"]');
        if (btn instanceof HTMLElement) {
            btn.click();
            return true;
        }
    } catch (e) {
        console.warn('[玉子的手机] 按钮点击方式也失败:', e);
    }
    return false;
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout(taskPromise, timeoutMs = 4000, timeoutMessage = '请求超时') {
    const timeout = Number(timeoutMs);
    const ms = Number.isFinite(timeout) && timeout > 0 ? timeout : 4000;

    return Promise.race([
        Promise.resolve(taskPromise),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage)), ms);
        }),
    ]);
}

/**
 * 打开可视化编辑器（API: openVisualizer）
 * 返回结构用于前端统一反馈
 */
export async function openVisualizerWithStatus(options = {}) {
    const timeoutMs = Number(options.timeoutMs);
    const api = getDB();

    if (!api || typeof api.openVisualizer !== 'function') {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '可视化编辑器接口不可用，请确认数据库插件已加载',
        };
    }

    try {
        await withTimeout(
            Promise.resolve(api.openVisualizer()),
            timeoutMs || 4000,
            '打开可视化编辑器超时'
        );
        return {
            ok: true,
            code: 'ok',
            message: '已打开可视化编辑器',
        };
    } catch (e) {
        const isTimeout = /超时/.test(String(e?.message || ''));
        return {
            ok: false,
            code: isTimeout ? 'timeout' : 'failed',
            message: isTimeout ? '打开可视化编辑器超时' : `打开可视化编辑器失败：${e?.message || '未知错误'}`,
        };
    }
}

/**
 * 打开数据库设置面板（API: openSettings）
 * 返回结构用于前端统一反馈
 */
export async function openDatabaseSettingsWithStatus(options = {}) {
    const timeoutMs = Number(options.timeoutMs);
    const api = getDB();

    if (!api || typeof api.openSettings !== 'function') {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '数据库设置接口不可用，请确认数据库插件已加载',
        };
    }

    try {
        const ret = await withTimeout(
            Promise.resolve(api.openSettings()),
            timeoutMs || 4000,
            '打开数据库设置面板超时'
        );
        if (ret === false) {
            return {
                ok: false,
                code: 'failed',
                message: '打开数据库设置面板失败',
            };
        }
        await sleep(120);
        return {
            ok: true,
            code: 'ok',
            message: '已打开数据库设置面板',
        };
    } catch (e) {
        const isTimeout = /超时/.test(String(e?.message || ''));
        return {
            ok: false,
            code: isTimeout ? 'timeout' : 'failed',
            message: isTimeout ? '打开数据库设置面板超时' : `打开数据库设置面板失败：${e?.message || '未知错误'}`,
        };
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clampNonNegativeInteger(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.round(n));
}

function clampPositiveInteger(value, fallback = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.round(n));
}

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
        ? Array.from(new Set(src.selectedTables.map(k => String(k || '').trim()).filter(Boolean)))
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

    const missingMethods = requiredMethods.filter(method => typeof api[method] !== 'function');
    if (missingMethods.length > 0) {
        return { api, missingMethods, ok: false };
    }

    return { api, missingMethods: [], ok: true };
}

/**
 * 数据库配置 API 可用性检测
 */
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

/**
 * 读取数据库更新配置（API 直连）
 */
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
    } catch (e) {
        return {
            ok: false,
            code: 'failed',
            message: `读取更新配置失败：${e?.message || '未知错误'}`,
            data: normalizeUpdateConfig({}),
        };
    }
}

/**
 * 写入数据库更新配置（API 直连）
 */
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
    } catch (e) {
        return {
            ok: false,
            code: 'failed',
            message: `更新配置保存失败：${e?.message || '未知错误'}`,
        };
    }
}

/**
 * 读取手动更新表选择（API 直连）
 */
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
    } catch (e) {
        return {
            ok: false,
            code: 'failed',
            message: `读取手动表选择失败：${e?.message || '未知错误'}`,
            data: normalizeManualSelection({ selectedTables: [], hasManualSelection: false }),
        };
    }
}

/**
 * 写入手动更新表选择（API 直连）
 */
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
        ? Array.from(new Set(selectedKeys.map(k => String(k || '').trim()).filter(Boolean)))
        : [];

    try {
        const success = !!pack.api.setManualSelectedTables(normalizedKeys);
        return success
            ? { ok: true, code: 'ok', message: '手动更新表选择已保存' }
            : { ok: false, code: 'failed', message: '手动更新表选择保存失败' };
    } catch (e) {
        return {
            ok: false,
            code: 'failed',
            message: `手动更新表选择保存失败：${e?.message || '未知错误'}`,
        };
    }
}

/**
 * 清除手动更新表选择（恢复全选）
 */
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
    } catch (e) {
        return {
            ok: false,
            code: 'failed',
            message: `恢复默认全选失败：${e?.message || '未知错误'}`,
        };
    }
}

/**
 * 调试：检查 API 是否可用
 */
export function debugCheckAPI() {
    const api = getDB();
    if (!api) {
        console.log('[玉子的手机] AutoCardUpdaterAPI 不可用（数据库脚本未加载）');
        return;
    }
    console.log('[玉子的手机] AutoCardUpdaterAPI 可用');
    const data = api.exportTableAsJson?.();
    if (data) {
        const sheetKeys = Object.keys(data).filter(k => k.startsWith('sheet_'));
        console.log(`[玉子的手机] 当前有 ${sheetKeys.length} 个表格:`, sheetKeys.map(k => `${k} (${data[k]?.name})`));
    } else {
        console.log('[玉子的手机] 数据为空（可能还没有聊天或模板未加载）');
    }
    console.log('[玉子的手机] API 方法:', Object.keys(api));
}

// ===== 路由管理 =====

let currentRoute = 'home';
let routeHistory = [];
let phoneContainer = null;
let onRouteChangeCallbacks = [];

const PHONE_SCROLL_ROOT_SELECTOR = '.phone-app-body, .phone-app-grid';
const PHONE_SCROLL_GUARD_BOUND_ATTR = 'phoneScrollGuardBound';
const PHONE_SCROLL_EDGE_EPSILON = 1;
const PHONE_SCROLL_EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const PHONE_SCROLL_DEBUG_GLOBAL_KEY = 'TAMAKO_PHONE_SCROLL_DEBUG';
const PHONE_SCROLL_DEBUG_CANDIDATE_SELECTOR = '.phone-app-body, .phone-app-grid, .phone-table-body, .phone-nav-list, .phone-row-detail-card, .phone-special-message-list, .phone-special-moments-list, .phone-settings-scroll';

function isPhoneScrollDebugEnabled() {
    return !!window[PHONE_SCROLL_DEBUG_GLOBAL_KEY];
}

function formatElementDebugName(el) {
    if (!(el instanceof Element)) return String(el);

    const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const classes = typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
        : [];
    const classText = classes.length ? `.${classes.join('.')}` : '';
    return `<${tag}${id}${classText}>`;
}

function getElementScrollDebugSnapshot(el) {
    if (!(el instanceof HTMLElement)) return null;
    const style = window.getComputedStyle(el);

    return {
        name: formatElementDebugName(el),
        overflowY: style.overflowY,
        overflowX: style.overflowX,
        position: style.position,
        pointerEvents: style.pointerEvents,
        touchAction: style.touchAction,
        overscrollBehaviorY: style.overscrollBehaviorY,
        minHeight: style.minHeight,
        height: style.height,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        canScrollY: isElementScrollableY(el),
    };
}

function collectScrollDebugCandidates(scope) {
    if (!(scope instanceof Element)) return [];

    const candidates = [];
    if (scope.matches?.(PHONE_SCROLL_DEBUG_CANDIDATE_SELECTOR)) {
        candidates.push(scope);
    }

    scope.querySelectorAll(PHONE_SCROLL_DEBUG_CANDIDATE_SELECTOR).forEach((el) => {
        candidates.push(el);
    });

    return Array.from(new Set(candidates));
}

function logPhoneScrollDebug(title, payload) {
    if (!isPhoneScrollDebugEnabled()) return;

    if (payload === undefined) {
        console.log(`[玉子的手机][ScrollDebug] ${title}`);
        return;
    }

    console.log(`[玉子的手机][ScrollDebug] ${title}`, payload);
}

function logRouteScrollDebugSnapshot(route, page) {
    if (!isPhoneScrollDebugEnabled()) return;

    const candidates = collectScrollDebugCandidates(page)
        .map(getElementScrollDebugSnapshot)
        .filter(Boolean);

    logPhoneScrollDebug(`route=${route} layout snapshot`, {
        route,
        page: formatElementDebugName(page),
        candidates,
    });
}

function hasOverflowingContentY(el) {
    if (!(el instanceof HTMLElement)) return false;
    return el.scrollHeight > el.clientHeight + PHONE_SCROLL_EDGE_EPSILON;
}

function canElementScrollInDirectionLoose(el, deltaY) {
    if (!(el instanceof HTMLElement)) return false;
    if (!hasOverflowingContentY(el)) return false;

    const scrollTop = el.scrollTop;
    const maxScrollTop = el.scrollHeight - el.clientHeight;

    if (deltaY < 0) {
        return scrollTop > PHONE_SCROLL_EDGE_EPSILON;
    }
    if (deltaY > 0) {
        return scrollTop < (maxScrollTop - PHONE_SCROLL_EDGE_EPSILON);
    }

    return false;
}

function collectOverflowingChain(target, boundary) {
    const chain = [];
    let cursor = target instanceof Element ? target : boundary;

    while (cursor && cursor !== boundary) {
        if (cursor instanceof HTMLElement && hasOverflowingContentY(cursor)) {
            chain.push(cursor);
        }
        cursor = cursor.parentElement;
    }

    if (boundary instanceof HTMLElement && hasOverflowingContentY(boundary)) {
        chain.push(boundary);
    }

    return chain;
}

function applyWheelFallbackScroll(target, boundary, deltaY) {
    const overflowingChain = collectOverflowingChain(target, boundary);
    const host = overflowingChain.find(el => canElementScrollInDirectionLoose(el, deltaY));

    if (!(host instanceof HTMLElement)) {
        return false;
    }

    const before = host.scrollTop;
    host.scrollTop = before + deltaY;
    const moved = Math.abs(host.scrollTop - before) > PHONE_SCROLL_EDGE_EPSILON;

    if (moved) {
        logPhoneScrollDebug(`fallback scroll applied deltaY=${deltaY.toFixed(2)}`, {
            host: getElementScrollDebugSnapshot(host),
        });
    }

    return moved;
}

function ensureScrollRootLayout(rootEl) {
    if (!(rootEl instanceof HTMLElement)) return;

    const style = window.getComputedStyle(rootEl);
    const patched = {};

    if (!/(auto|scroll|overlay)/.test(String(style.overflowY || ''))) {
        rootEl.style.overflowY = 'auto';
        patched.overflowY = { from: style.overflowY, to: 'auto' };
    }

    if (String(style.overflowX || '') === 'visible') {
        rootEl.style.overflowX = 'hidden';
        patched.overflowX = { from: style.overflowX, to: 'hidden' };
    }

    if (String(style.minHeight || '') !== '0px') {
        rootEl.style.minHeight = '0';
        patched.minHeight = { from: style.minHeight, to: '0px' };
    }

    if (String(style.touchAction || '') === 'auto') {
        rootEl.style.touchAction = 'pan-y';
        patched.touchAction = { from: style.touchAction, to: 'pan-y' };
    }

    if (Object.keys(patched).length > 0) {
        logPhoneScrollDebug('scroll root layout healed', {
            root: formatElementDebugName(rootEl),
            patched,
            snapshot: getElementScrollDebugSnapshot(rootEl),
        });
    }
}

function isEditableScrollTarget(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest(PHONE_SCROLL_EDITABLE_SELECTOR);
}

function isElementScrollableY(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    const overflowY = String(style.overflowY || '');
    if (!/(auto|scroll|overlay)/.test(overflowY)) return false;
    return el.scrollHeight > el.clientHeight + PHONE_SCROLL_EDGE_EPSILON;
}

function canElementScrollInDirection(el, deltaY) {
    if (!(el instanceof HTMLElement)) return false;
    if (!isElementScrollableY(el)) return false;

    const scrollTop = el.scrollTop;
    const maxScrollTop = el.scrollHeight - el.clientHeight;

    if (deltaY < 0) {
        return scrollTop > PHONE_SCROLL_EDGE_EPSILON;
    }
    if (deltaY > 0) {
        return scrollTop < (maxScrollTop - PHONE_SCROLL_EDGE_EPSILON);
    }
    return false;
}

function collectScrollableChain(target, boundary) {
    const chain = [];
    let cursor = target instanceof Element ? target : boundary;

    while (cursor && cursor !== boundary) {
        if (cursor instanceof HTMLElement && isElementScrollableY(cursor)) {
            chain.push(cursor);
        }
        cursor = cursor.parentElement;
    }

    if (boundary instanceof HTMLElement) {
        chain.push(boundary);
    }

    return chain;
}

function bindScrollGuardToRoot(rootEl) {
    if (!(rootEl instanceof HTMLElement)) return;

    ensureScrollRootLayout(rootEl);

    if (rootEl.dataset[PHONE_SCROLL_GUARD_BOUND_ATTR] === '1') return;
    rootEl.dataset[PHONE_SCROLL_GUARD_BOUND_ATTR] = '1';

    logPhoneScrollDebug('bind root guard', {
        root: getElementScrollDebugSnapshot(rootEl),
    });

    rootEl.addEventListener('wheel', (e) => {
        const deltaY = Number(e.deltaY || 0);
        if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) return;

        const editableTarget = isEditableScrollTarget(e.target);
        const scrollables = collectScrollableChain(e.target, rootEl);
        const canScroll = scrollables.some(el => canElementScrollInDirection(el, deltaY));
        const fallbackScrolled = !canScroll && !editableTarget
            ? applyWheelFallbackScroll(e.target, rootEl, deltaY)
            : false;

        if (isPhoneScrollDebugEnabled()) {
            logPhoneScrollDebug(`wheel deltaY=${deltaY.toFixed(2)} canScroll=${canScroll} fallback=${fallbackScrolled}`, {
                target: formatElementDebugName(e.target),
                currentTarget: formatElementDebugName(e.currentTarget),
                editableTarget,
                root: getElementScrollDebugSnapshot(rootEl),
                scrollables: scrollables.map(getElementScrollDebugSnapshot).filter(Boolean),
            });
        }

        // 阻断向外冒泡，避免宿主层 wheel 监听干扰手机内部滚动。
        e.stopPropagation();

        // 输入控件保持原生行为。
        if (editableTarget) {
            return;
        }

        // 回退滚动已经生效时，阻断默认行为，避免潜在双重滚动。
        if (fallbackScrolled) {
            e.preventDefault();
            return;
        }

        // 其余情况不阻断默认滚动，避免误吞手机内部滚轮。
        if (!canScroll) {
            return;
        }
    }, { passive: false });
}

export function bindPhoneScrollGuards(root) {
    const scope = root instanceof Element ? root : phoneContainer;
    if (!scope) return;

    const roots = [];

    if (scope.matches?.(PHONE_SCROLL_ROOT_SELECTOR)) {
        roots.push(scope);
    }

    scope.querySelectorAll(PHONE_SCROLL_ROOT_SELECTOR).forEach((el) => {
        roots.push(el);
    });

    Array.from(new Set(roots)).forEach((el) => {
        ensureScrollRootLayout(el);
        bindScrollGuardToRoot(el);
    });

    if (roots.length === 0) {
        logPhoneScrollDebug('no scroll roots found in scope', {
            scope: formatElementDebugName(scope),
        });
    }
}

export function getCurrentRoute() { return currentRoute; }

export function navigateTo(route, opts = {}) {
    if (currentRoute !== 'home') {
        routeHistory.push(currentRoute);
    }
    currentRoute = route;
    onRouteChangeCallbacks.forEach(cb => cb(route, opts));
}

export function navigateBack() {
    const prev = routeHistory.pop() || 'home';
    currentRoute = prev;
    onRouteChangeCallbacks.forEach(cb => cb(prev, { isBack: true }));
}

export function onRouteChange(callback) {
    onRouteChangeCallbacks.push(callback);
}

export function getPhoneContainer() {
    return phoneContainer;
}

// ===== 手机界面初始化 =====

export function initPhoneUI() {
    const $container = $('#yuzi-phone-standalone');
    if (!$container.length) return;

    phoneContainer = $container[0];

    $container.html(`
        <div class="phone-shell">
            <div class="phone-notch"></div>
            <div class="phone-status-bar">
                <span class="phone-status-time"></span>
                <span class="phone-status-icons">
                    <span class="phone-signal">${PHONE_ICONS.signal}</span>
                    <span class="phone-wifi">${PHONE_ICONS.wifi || ''}</span>
                    <span class="phone-battery">${PHONE_ICONS.battery}</span>
                </span>
            </div>
            <div class="phone-screen"></div>
            <div class="phone-notification-overlay" id="phone-notif-container"></div>
            <div class="phone-home-indicator"></div>
        </div>
        <div class="yuzi-phone-resize yuzi-phone-resize-e" data-dir="e"></div>
        <div class="yuzi-phone-resize yuzi-phone-resize-se" data-dir="se"></div>
    `);

    updateStatusBarTime();
    setInterval(updateStatusBarTime, 30000);

    onRouteChange((route, opts) => {
        renderRoute(route, opts);
    });

    // 调试输出
    debugCheckAPI();

    // 启动数据监控
    startDataWatcherForNotifications();

    renderRoute('home');

    // 初始化拖拽（通过 notch 和 status-bar 拖动整个手机）+ 右侧/右下角缩放
    setTimeout(() => {
        initPhoneShellDrag();
        initPhoneShellResize();
    }, 100);
}

function updateStatusBarTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const el = document.querySelector('.phone-status-time');
    if (el) el.textContent = `${hh}:${mm}`;
}

async function renderRoute(route, opts = {}) {
    const screen = document.querySelector('.phone-screen');
    if (!screen) return;

    const isBack = opts.isBack || false;

    const oldContent = screen.firstElementChild;
    const EXIT_ANIM_MS = 220;
    const exitClass = isBack ? 'phone-page-exit-back' : 'phone-page-exit';

    const page = document.createElement('div');
    page.className = `phone-page ${isBack ? 'phone-page-enter-back' : 'phone-page-enter'}`;

    if (route === 'home') {
        routeHistory = [];
        const { renderHomeScreen } = await import('./phone-home.js');
        renderHomeScreen(page);
    } else if (route.startsWith('app:')) {
        const sheetKey = route.replace('app:', '');
        const { renderTableViewer } = await import('./phone-table-viewer.js');
        renderTableViewer(page, sheetKey);
    } else if (route === 'settings') {
        const { renderSettings } = await import('./phone-settings.js');
        renderSettings(page);
    } else if (route === 'fusion') {
        const { renderFusion } = await import('./phone-fusion.js');
        renderFusion(page);
    }

    setTimeout(() => {
        screen.appendChild(page);
        bindPhoneScrollGuards(page);

        if (oldContent instanceof HTMLElement) {
            oldContent.classList.add(exitClass);
            oldContent.setAttribute('inert', '');
            oldContent.style.pointerEvents = 'none';
            setTimeout(() => {
                if (!oldContent.isConnected) return;
                oldContent.setAttribute('aria-hidden', 'true');
                oldContent.remove();
            }, EXIT_ANIM_MS);
        }

        requestAnimationFrame(() => {
            logRouteScrollDebugSnapshot(route, page);
            page.classList.remove('phone-page-enter', 'phone-page-enter-back');
            page.classList.add('phone-page-active');
        });
    }, oldContent ? 16 : 0);
}

// ===== Tab 激活时刷新 =====

export function onPhoneActivated() {
    if (!phoneContainer) {
        initPhoneUI();
    } else {
        renderRoute(currentRoute);
    }
}

// ===== 通知与未读角标 =====

let lastTableRowsCount = {};
const unreadCounts = {};

export function getUnreadCount(sheetKey) {
    return unreadCounts[sheetKey] || 0;
}

export function clearUnreadBadge(sheetKey) {
    unreadCounts[sheetKey] = 0;
    updateBadgeUI(sheetKey);
}

function updateBadgeUI(sheetKey) {
    // 2026-03：主屏右上角徽标已改为“总条目数常驻徽标”，
    // 未读数仍保留在内存用于通知链路，但不再投射到主屏图标 UI。
    void sheetKey;
}

function startDataWatcherForNotifications() {
    // 轮询检查是否有新数据
    setInterval(() => {
        const rawData = getTableData();
        if (!rawData) return;
        
        const currentData = processTableData(rawData) || {};
        // Note: processTableData keys are table names, not sheetKey!
        for (const tableName in currentData) {
            const table = currentData[tableName];
            const currentCount = table.rows.length;
            const prevCount = lastTableRowsCount[tableName];
            
            if (prevCount !== undefined && currentCount > prevCount) {
                // 有新数据，触发通知
                const newRowsCount = currentCount - prevCount;
                const lastRow = table.rows[table.rows.length - 1]; // 假设新增在最后
                triggerPushNotification(tableName, table.key, lastRow, newRowsCount);
            }
            lastTableRowsCount[tableName] = currentCount;
        }
    }, 2000);
}

function triggerPushNotification(tableName, sheetKey, lastRow, newCount) {
    const container = document.getElementById('phone-notif-container');
    if (!container) return;

    let summary = '收到新内容';
    if (lastRow && Array.isArray(lastRow) && lastRow.length > 0) {
        summary = lastRow[1] || lastRow[0] || summary;
    }
    
    // 为桌面图标准备未读数量
    unreadCounts[sheetKey] = (unreadCounts[sheetKey] || 0) + newCount;
    updateBadgeUI(sheetKey);

    const notif = document.createElement('div');
    notif.className = 'phone-notif-bubble';
    
    // 简易生成图标首字母
    const firstChar = (tableName || '新').trim().charAt(0).toUpperCase();
    const iconHtml = `
        <div class="phone-notif-icon-box" style="background: linear-gradient(135deg, #FF4757, #FF6B81);">
            ${firstChar}
        </div>`;

    const safeTitle = String(tableName || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeSummary = String(summary || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    notif.innerHTML = `
        ${iconHtml}
        <div class="phone-notif-content">
            <div class="phone-notif-title">${safeTitle} <span class="phone-notif-now">现在</span></div>
            <div class="phone-notif-text">${safeSummary}</div>
        </div>
    `;

    notif.addEventListener('click', () => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
        clearUnreadBadge(sheetKey);
        navigateTo(`app:${sheetKey}`);
    });

    container.appendChild(notif);
    
    requestAnimationFrame(() => {
        notif.classList.add('show');
    });

    setTimeout(() => {
        if (notif.parentNode) {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 300);
        }
    }, 4000);
}
