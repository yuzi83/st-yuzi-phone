import { isTrustedContentPresetRecord } from './format.js';
import { normalizeDisplayMetadata, normalizePageItemHostCapabilities } from './display-contract.js';
import { normalizeFileTable, normalizePackagePath } from './paths.js';

function text(value) { return String(value ?? '').trim(); }
function generatedId(prefix) { const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; return `${prefix}-${random}`; }
function issue(code, message, itemId = '') { return Object.freeze({ code, message, itemId }); }
function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
function normalizeFile(path, value) { return Object.freeze({ path, mimeType: text(value?.mimeType) || 'application/octet-stream', encoding: value?.encoding === 'base64' ? 'base64' : 'text', content: String(value?.content ?? '') }); }
function normalizeTarget(source) { return Object.freeze({ tableName: text(source?.tableName), fields: Object.freeze((Array.isArray(source?.fields) ? source.fields : []).map(text).filter(Boolean)) }); }
function requireEntry(source, files, owner, label) {
    const mount = text(source?.mount);
    if (!mount) throw new Error(`${owner} 缺少 ${label}.mount`);
    const entry = { mount: normalizePackagePath(mount) };
    if (!files[entry.mount]) throw new Error(`${owner} 的 ${label} 入口文件不存在：${entry.mount}`);
    for (const kind of ['html', 'css']) {
        const rawPath = text(source?.[kind]);
        if (!rawPath) continue;
        const path = normalizePackagePath(rawPath);
        if (!files[path]) throw new Error(`${owner} 的 ${label}.${kind} 文件不存在：${path}`);
        entry[kind] = path;
    }
    return Object.freeze(entry);
}
function normalizeId(source, index, seen, issues, prefix) {
    let id = text(source?.id);
    if (!id || seen.has(id)) { id = generatedId(`${prefix}-${index + 1}`); issues.push(issue('generated_item_id', `${prefix} ID 缺失或重复，已生成内部 ID`, id)); }
    seen.add(id);
    return id;
}
function normalizeAssets(source) { return Object.freeze(Array.isArray(source?.assets) ? source.assets.map(text).filter(Boolean) : []); }

export function normalizeContentPresetBundle(bundle) {
    const sourceManifest = bundle.manifest || {};
    const files = {};
    for (const [path, value] of Object.entries(normalizeFileTable(bundle.files))) files[path] = normalizeFile(path, value);
    const presetId = text(sourceManifest.id) || generatedId('preset');
    const issues = text(sourceManifest.id) ? [] : [issue('generated_preset_id', 'manifest.id 缺失，已生成稳定内部 ID')];
    const isV3 = bundle.formatVersion === 3 && bundle.apiVersion === 2;
    const itemIds = new Set();
    const items = (Array.isArray(sourceManifest.items) ? sourceManifest.items : []).map((source, index) => {
        if (hasOwn(source, 'scriptMode') || hasOwn(source?.entry, 'scriptMode') || hasOwn(source?.entry, 'js')) throw new Error('玉子美化预设不接受 scriptMode 或 entry.js；请使用 ES Module mount(context)');
        const id = normalizeId(source, index, itemIds, issues, 'item');
        const target = normalizeTarget(source?.target);
        const capabilities = isV3
            ? normalizePageItemHostCapabilities({ ...source, target })
            : {};
        return Object.freeze({
            id,
            name: text(source?.name) || id,
            target,
            entry: requireEntry(source?.entry, files, `预设项 ${id}`, 'entry'),
            assets: normalizeAssets(source),
            ...capabilities,
            issues: Object.freeze([]),
            activatable: true,
        });
    });
    const displayIds = new Set();
    const displays = isV3 ? (Array.isArray(sourceManifest.displays) ? sourceManifest.displays : []).map(source => {
        if (hasOwn(source, 'scriptMode') || hasOwn(source?.entry, 'scriptMode') || hasOwn(source?.entry, 'js')) throw new Error('玉子美化展示不接受 scriptMode 或 entry.js；请使用 ES Module mount(context)');
        const metadata = normalizeDisplayMetadata(source);
        const id = metadata.id;
        if (displayIds.has(id)) throw new Error(`展示 ID 重复：${id}`);
        displayIds.add(id);
        return Object.freeze({
            ...metadata,
            entry: requireEntry(source.entry, files, `展示 ${id}`, 'entry'),
            assets: normalizeAssets(source),
            issues: Object.freeze([]),
            activatable: true,
        });
    }) : [];
    const manifest = Object.freeze({ id: presetId, name: sourceManifest.name, version: sourceManifest.version, author: sourceManifest.author, items: Array.isArray(sourceManifest.items) ? sourceManifest.items : [], ...(isV3 ? { displays: Array.isArray(sourceManifest.displays) ? sourceManifest.displays : [] } : {}) });
    const record = Object.freeze({ id: presetId, name: text(sourceManifest.name) || presetId, version: text(sourceManifest.version), author: text(sourceManifest.author), format: bundle.format, formatVersion: bundle.formatVersion, apiVersion: bundle.apiVersion, manifest, files: Object.freeze(files), items: Object.freeze(items), ...(isV3 ? { displays: Object.freeze(displays) } : {}), issues: Object.freeze(issues), importedAt: new Date().toISOString() });
    if (!isTrustedContentPresetRecord(record)) throw new Error('玉子美化预设缺少有效的 ES Module mount(context) 导出或能力声明不完整');
    return record;
}
