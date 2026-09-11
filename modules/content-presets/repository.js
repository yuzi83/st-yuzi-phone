import {
    CONTENT_PRESET_BINDING_INDEX, CONTENT_PRESET_DB_NAME, CONTENT_PRESET_DB_VERSION, CONTENT_PRESET_STORES,
} from './constants.js';
import { isTrustedContentPresetRecord } from './format.js';
import { hasPageCapability, hasPopupCapability } from './matcher.js';
import { normalizePackagePath } from './paths.js';

let dbPromise = null;

function openRequest(factory = globalThis.indexedDB) {
    if (!factory?.open) throw new Error('IndexedDB 不可用');
    return factory.open(CONTENT_PRESET_DB_NAME, CONTENT_PRESET_DB_VERSION);
}

function ensureBindingStore(db, transaction, name) {
    const store = db.objectStoreNames.contains(name)
        ? transaction.objectStore(name)
        : db.createObjectStore(name, { keyPath: 'sheetKey' });
    if (!store.indexNames.contains(CONTENT_PRESET_BINDING_INDEX)) {
        store.createIndex(CONTENT_PRESET_BINDING_INDEX, 'presetId', { unique: false });
    }
    return store;
}

export function openContentPresetRepository(factory = globalThis.indexedDB) {
    if (factory === globalThis.indexedDB && dbPromise) return dbPromise;
    const promise = new Promise((resolve, reject) => {
        let settled = false;
        const fail = error => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        let request;
        try { request = openRequest(factory); } catch (error) { fail(error); return; }
        request.onerror = () => fail(request.error || new Error('打开玉子美化数据库失败'));
        request.onblocked = () => fail(new DOMException('玉子美化数据库升级被阻塞', 'BlockedError'));
        request.onupgradeneeded = () => {
            const db = request.result;
            const transaction = request.transaction;
            if (!db.objectStoreNames.contains(CONTENT_PRESET_STORES.presets)) {
                db.createObjectStore(CONTENT_PRESET_STORES.presets, { keyPath: 'id' });
            }
            // activeByTable 是 v1 已存在的页面绑定表；升级时不迁移、不重写旧用户记录。
            ensureBindingStore(db, transaction, CONTENT_PRESET_STORES.activeByTable);
            ensureBindingStore(db, transaction, CONTENT_PRESET_STORES.popupByTable);
        };
        request.onsuccess = () => {
            const db = request.result;
            if (settled) { db.close(); return; }
            settled = true;
            db.onversionchange = () => { db.close(); if (dbPromise === promise) dbPromise = null; };
            resolve(db);
        };
    });
    if (factory === globalThis.indexedDB) {
        dbPromise = promise;
        promise.catch(() => { if (dbPromise === promise) dbPromise = null; });
    }
    return promise;
}

function runTransaction(db, stores, mode, operation) {
    return new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction(stores, mode); } catch (error) { reject(error); return; }
        let settled = false;
        let transactionCompleted = false;
        let operationCompleted = false;
        let operationValue;
        const fail = error => { if (!settled) { settled = true; reject(error || tx.error || new Error('玉子美化数据库事务失败')); } };
        const abortAndFail = error => {
            if (settled) return;
            try { tx.abort(); } catch {}
            fail(error);
        };
        const succeedIfReady = () => {
            if (settled || !transactionCompleted || !operationCompleted) return;
            settled = true;
            resolve(operationValue);
        };
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error || new DOMException('事务已中止', 'AbortError'));
        tx.oncomplete = () => { transactionCompleted = true; succeedIfReady(); };
        let result;
        try { result = operation(tx); } catch (error) { abortAndFail(error); return; }
        Promise.resolve(result).then(value => {
            operationValue = value;
            operationCompleted = true;
            succeedIfReady();
        }, abortAndFail);
    });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
    });
}
function text(value) { return String(value ?? '').trim(); }
function toBinding(sheetKey, presetId, targetId, targetKey) {
    const value = text(targetId);
    const record = { sheetKey: text(sheetKey), presetId: text(presetId), [targetKey]: value, ...(targetKey === 'displayId' ? { itemId: value } : {}) };
    if (!record.sheetKey || !record.presetId || !record[targetKey]) throw new Error(`绑定缺少 sheetKey、presetId 或 ${targetKey}`);
    return record;
}
function toPopupSourceBinding(sheetKey, presetId) {
    const record = { sheetKey: text(sheetKey), presetId: text(presetId) };
    if (!record.sheetKey || !record.presetId) throw new Error('绑定缺少 sheetKey 或 presetId');
    return record;
}

export async function listPresetMetadata() {
    const db = await openContentPresetRepository();
    return runTransaction(db, [CONTENT_PRESET_STORES.presets], 'readonly', tx => requestResult(tx.objectStore(CONTENT_PRESET_STORES.presets).getAll())
        .then(records => records.filter(isTrustedContentPresetRecord)
            .map(record => ({ id: record.id, name: record.name, version: record.version, author: record.author, itemCount: record.items.length, issues: record.issues || [], importedAt: record.importedAt }))));
}
export async function listPresetRecords() {
    const db = await openContentPresetRepository();
    return runTransaction(db, [CONTENT_PRESET_STORES.presets], 'readonly', tx => requestResult(tx.objectStore(CONTENT_PRESET_STORES.presets).getAll())
        .then(records => records.filter(isTrustedContentPresetRecord)));
}
export async function getPresetRecord(id) {
    const db = await openContentPresetRepository();
    return runTransaction(db, [CONTENT_PRESET_STORES.presets], 'readonly', tx => requestResult(tx.objectStore(CONTENT_PRESET_STORES.presets).get(text(id)))
        .then(record => isTrustedContentPresetRecord(record) ? record : null));
}

function loadBindingsFromStore(tx, storeName, valuesOf, capability, targetKey) {
    return Promise.all([
        requestResult(tx.objectStore(CONTENT_PRESET_STORES.presets).getAll()),
        requestResult(tx.objectStore(storeName).getAll()),
    ]).then(([presets, bindings]) => {
        const validTargets = new Map(presets.filter(isTrustedContentPresetRecord).map(preset => [
            text(preset.id),
            new Set((Array.isArray(valuesOf(preset)) ? valuesOf(preset) : []).filter(capability).map(value => text(value.id)).filter(Boolean)),
        ]));
        return new Map(bindings.map(binding => {
            const targetId = text(binding?.[targetKey]);
            return { sheetKey: text(binding?.sheetKey), presetId: text(binding?.presetId), [targetKey]: targetId, ...(targetKey === 'displayId' ? { itemId: targetId } : {}) };
        })
            .filter(binding => binding.sheetKey && binding.presetId && binding[targetKey] && validTargets.get(binding.presetId)?.has(binding[targetKey]))
            .map(binding => [binding.sheetKey, binding]));
    });
}
function loadBindings(storeName, valuesOf, capability, targetKey) {
    return openContentPresetRepository().then(db => runTransaction(
        db,
        [CONTENT_PRESET_STORES.presets, storeName],
        'readonly',
        tx => loadBindingsFromStore(tx, storeName, valuesOf, capability, targetKey),
    ));
}
// 兼容旧调用：activeByTable 永远是页面绑定。
export function loadActiveBindings() { return loadBindings(CONTENT_PRESET_STORES.activeByTable, preset => preset.items, hasPageCapability, 'itemId'); }
export function loadPageBindings() { return loadActiveBindings(); }
export function loadPopupBindings() {
    return openContentPresetRepository().then(db => runTransaction(
        db,
        [CONTENT_PRESET_STORES.presets, CONTENT_PRESET_STORES.popupByTable],
        'readonly',
        tx => Promise.all([
            requestResult(tx.objectStore(CONTENT_PRESET_STORES.presets).getAll()),
            requestResult(tx.objectStore(CONTENT_PRESET_STORES.popupByTable).getAll()),
        ]).then(([presets, bindings]) => {
            const displaysByPresetId = new Map(presets
                .filter(isTrustedContentPresetRecord)
                .map(preset => [
                    text(preset.id),
                    Object.freeze((preset.displays || []).filter(hasPopupCapability)),
                ])
                .filter(([presetId, displays]) => presetId && displays.length > 0));
            return new Map(bindings
                .map(binding => ({
                    sheetKey: text(binding?.sheetKey),
                    presetId: text(binding?.presetId),
                }))
                .filter(binding => binding.sheetKey && displaysByPresetId.has(binding.presetId))
                .map(binding => [binding.sheetKey, Object.freeze({
                    ...binding,
                    displays: displaysByPresetId.get(binding.presetId),
                })]));
        }),
    ));
}
function writeValidatedBinding(tx, record, storeName, valuesOf, capability, targetKey, label) {
    const presetStore = tx.objectStore(CONTENT_PRESET_STORES.presets);
    const bindingStore = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
        let request;
        try { request = presetStore.get(record.presetId); } catch (error) { reject(error); return; }
        request.onerror = () => reject(request.error || new Error('读取绑定预设失败'));
        request.onsuccess = () => {
            try {
                const preset = request.result;
                if (!isTrustedContentPresetRecord(preset)) throw new Error('绑定引用的预设不符合玉子美化 Runtime API 合同');
                const target = (Array.isArray(valuesOf(preset)) ? valuesOf(preset) : []).find(value => value.id === record[targetKey]);
                if (!capability(target)) throw new Error(`绑定引用的预设项不提供${label}能力`);
                bindingStore.put(record);
                resolve(record);
            } catch (error) { reject(error); }
        };
    });
}
function setBinding(sheetKey, presetId, targetId, storeName, valuesOf, capability, targetKey, label) {
    const record = toBinding(sheetKey, presetId, targetId, targetKey);
    return openContentPresetRepository().then(db => runTransaction(
        db,
        [CONTENT_PRESET_STORES.presets, storeName],
        'readwrite',
        tx => writeValidatedBinding(tx, record, storeName, valuesOf, capability, targetKey, label),
    ));
}
function clearBinding(sheetKey, storeName) {
    const key = text(sheetKey);
    if (!key) return Promise.resolve(false);
    return openContentPresetRepository().then(db => runTransaction(db, [storeName], 'readwrite', tx => {
        tx.objectStore(storeName).delete(key);
        return true;
    }));
}
function clearAllBindings(storeName) {
    return openContentPresetRepository().then(db => runTransaction(db, [storeName], 'readwrite', tx => {
        tx.objectStore(storeName).clear();
        return true;
    }));
}
export function setPageActiveBinding(sheetKey, presetId, itemId) { return setBinding(sheetKey, presetId, itemId, CONTENT_PRESET_STORES.activeByTable, preset => preset.items, hasPageCapability, 'itemId', '表格美化页面'); }
export function clearPageActiveBinding(sheetKey) { return clearBinding(sheetKey, CONTENT_PRESET_STORES.activeByTable); }
export function clearAllPageActiveBindings() { return clearAllBindings(CONTENT_PRESET_STORES.activeByTable); }
export function setPopupActiveBindings(bindings) {
    const records = [];
    const seen = new Set();
    for (const binding of Array.isArray(bindings) ? bindings : []) {
        const record = toPopupSourceBinding(binding?.sheetKey, binding?.presetId);
        if (seen.has(record.sheetKey)) throw new Error('同一原子弹窗应用不能重复绑定同一表');
        seen.add(record.sheetKey);
        records.push(record);
    }
    if (records.length === 0) throw new Error('弹窗美化原子应用缺少绑定目标');
    return openContentPresetRepository().then(db => runTransaction(
        db,
        [CONTENT_PRESET_STORES.presets, CONTENT_PRESET_STORES.popupByTable],
        'readwrite',
        tx => {
            const presetStore = tx.objectStore(CONTENT_PRESET_STORES.presets);
            const bindingStore = tx.objectStore(CONTENT_PRESET_STORES.popupByTable);
            return Promise.all([...new Set(records.map(record => record.presetId))]
                .map(presetId => requestResult(presetStore.get(presetId)).then(preset => {
                    if (!isTrustedContentPresetRecord(preset)) throw new Error('绑定引用的预设不符合玉子美化 Runtime API 合同');
                    if (!(preset.displays || []).some(hasPopupCapability)) throw new Error('绑定引用的预设不提供弹窗美化能力');
                }))).then(() => {
                records.forEach(record => bindingStore.put(record));
                return Object.freeze(records.map(record => Object.freeze({ ...record })));
            });
        },
    ));
}
export function setPopupActiveBinding(sheetKey, presetId) {
    return setPopupActiveBindings([{ sheetKey, presetId }]).then(records => records[0]);
}
export function clearPopupActiveBinding(sheetKey) { return clearBinding(sheetKey, CONTENT_PRESET_STORES.popupByTable); }
export function clearAllPopupActiveBindings() { return clearAllBindings(CONTENT_PRESET_STORES.popupByTable); }
// v2 API 别名，不能把旧页面绑定迁移成弹窗绑定。
export const setActiveBinding = setPageActiveBinding;
export const clearActiveBinding = clearPageActiveBinding;
export const clearAllActiveBindings = clearAllPageActiveBindings;
function removePresetBindings(tx, presetId, storeName) {
    const store = tx.objectStore(storeName);
    const index = store.index(CONTENT_PRESET_BINDING_INDEX);
    return new Promise((resolve, reject) => {
        let request;
        try { request = index.getAll(text(presetId)); } catch (error) { reject(error); return; }
        request.onerror = () => reject(request.error || new Error('读取预设绑定失败'));
        request.onsuccess = () => {
            try {
                const affectedSheetKeys = request.result.map(record => text(record?.sheetKey)).filter(Boolean);
                affectedSheetKeys.forEach(sheetKey => store.delete(sheetKey));
                resolve(affectedSheetKeys);
            } catch (error) { reject(error); }
        };
    });
}
function removeAllPresetBindings(tx, presetId) {
    return Promise.all([
        removePresetBindings(tx, presetId, CONTENT_PRESET_STORES.activeByTable),
        removePresetBindings(tx, presetId, CONTENT_PRESET_STORES.popupByTable),
    ]).then(groups => [...new Set(groups.flat())]);
}

export async function replacePresetRecord(record) {
    if (!isTrustedContentPresetRecord(record)) throw new Error('预设记录不符合玉子美化 Runtime API 合同');
    const db = await openContentPresetRepository();
    return runTransaction(db, [CONTENT_PRESET_STORES.presets, CONTENT_PRESET_STORES.activeByTable, CONTENT_PRESET_STORES.popupByTable], 'readwrite', tx => {
        tx.objectStore(CONTENT_PRESET_STORES.presets).put(record);
        return removeAllPresetBindings(tx, record.id).then(affectedSheetKeys => ({ record, affectedSheetKeys }));
    });
}

export async function updatePresetFiles(presetId, patch = {}) {
    const id = text(presetId);
    if (!id) throw new Error('预设 ID 不能为空');
    const removePaths = [...new Set((Array.isArray(patch.removePaths) ? patch.removePaths : []).map(normalizePackagePath))];
    const file = patch.file == null ? null : { ...patch.file, path: normalizePackagePath(patch.file.path) };
    const db = await openContentPresetRepository();
    return runTransaction(db, [CONTENT_PRESET_STORES.presets], 'readwrite', tx => new Promise((resolve, reject) => {
        const store = tx.objectStore(CONTENT_PRESET_STORES.presets);
        let request;
        try { request = store.get(id); } catch (error) { reject(error); return; }
        request.onerror = () => reject(request.error || new Error('读取预设失败'));
        request.onsuccess = () => {
            try {
                const current = request.result;
                if (!isTrustedContentPresetRecord(current)) throw new Error(`预设不存在或记录无效：${id}`);
                const files = { ...current.files };
                removePaths.forEach(path => delete files[path]);
                if (file) files[file.path] = file;
                const record = { ...current, files };
                if (!isTrustedContentPresetRecord(record)) throw new Error('更新后的预设记录不符合玉子美化 Runtime API 合同');
                store.put(record);
                resolve(record);
            } catch (error) { reject(error); }
        };
    }));
}

export async function deletePresetRecord(presetId) {
    const id = text(presetId);
    if (!id) throw new Error('预设 ID 不能为空');
    const db = await openContentPresetRepository();
    return runTransaction(db, [CONTENT_PRESET_STORES.presets, CONTENT_PRESET_STORES.activeByTable, CONTENT_PRESET_STORES.popupByTable], 'readwrite', tx => {
        tx.objectStore(CONTENT_PRESET_STORES.presets).delete(id);
        return removeAllPresetBindings(tx, id).then(affectedSheetKeys => ({ presetId: id, affectedSheetKeys }));
    });
}

export async function getPresetExportRecord(presetId) { return getPresetRecord(presetId); }
