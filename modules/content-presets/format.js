import {
    CONTENT_PRESET_API_VERSION,
    CONTENT_PRESET_FORMAT,
    CONTENT_PRESET_FORMAT_VERSION,
    LEGACY_CONTENT_PRESET_API_VERSION,
    LEGACY_CONTENT_PRESET_FORMAT_VERSION,
} from './constants.js';
import { isDisplayMetadata, isPageItemHostCapabilities } from './display-contract.js';
import { normalizePackagePath } from './paths.js';

function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
function hasOnlyKeys(value, allowedKeys) {
    if (!isObject(value)) return false;
    const allowed = new Set(allowedKeys);
    return Object.keys(value).every(key => allowed.has(key));
}
function isIssue(value) { return hasOnlyKeys(value, ['code', 'message', 'itemId']) && typeof value.code === 'string' && typeof value.message === 'string' && typeof value.itemId === 'string'; }
function isV2(value) { return value?.formatVersion === LEGACY_CONTENT_PRESET_FORMAT_VERSION && value?.apiVersion === LEGACY_CONTENT_PRESET_API_VERSION; }
function isV3(value) { return value?.formatVersion === CONTENT_PRESET_FORMAT_VERSION && value?.apiVersion === CONTENT_PRESET_API_VERSION; }
function isSupportedVersion(value) { return isV2(value) || isV3(value); }
function isNormalizedPackagePath(value) { if (typeof value !== 'string' || value !== value.trim()) return false; try { return normalizePackagePath(value) === value; } catch { return false; } }
function stripNonCode(source) {
    let result = ''; let index = 0; let quote = '';
    while (index < source.length) {
        const char = source[index]; const next = source[index + 1];
        if (quote) {
            if (char === '\\') { result += '  '; index += 2; continue; }
            if (char === quote) quote = '';
            result += char === '\n' ? '\n' : ' '; index += 1; continue;
        }
        if (char === '/' && next === '/') { const end = source.indexOf('\n', index); result += ' '.repeat((end < 0 ? source.length : end) - index); index = end < 0 ? source.length : end; continue; }
        if (char === '/' && next === '*') { const end = source.indexOf('*/', index + 2); const comment = source.slice(index, end < 0 ? source.length : end + 2); result += comment.replace(/[^\n]/g, ' '); index = end < 0 ? source.length : end + 2; continue; }
        if (char === '\'' || char === '"' || char === '`') quote = char;
        result += char; index += 1;
    }
    return result;
}
function hasMountExport(file) {
    return !!file
        && file.encoding === 'text'
        && /^(?:text|application)\/javascript$/i.test(text(file.mimeType))
        && /^\s*export\s+(?:async\s+)?function\s+mount\s*\(\s*context\s*\)/m.test(stripNonCode(String(file.content ?? '')));
}
function isRawFile(file) { return hasOnlyKeys(file, ['mimeType', 'encoding', 'content']) && !!text(file.mimeType) && (file.encoding === 'text' || file.encoding === 'base64') && typeof file.content === 'string'; }
function isTrustedFile(file) { return hasOnlyKeys(file, ['path', 'mimeType', 'encoding', 'content']) && isNormalizedPackagePath(file.path) && !!text(file.mimeType) && (file.encoding === 'text' || file.encoding === 'base64') && typeof file.content === 'string'; }
function isTarget(target) { return hasOnlyKeys(target, ['tableName', 'fields']) && Array.isArray(target.fields); }
function isEntry(entry) { return hasOnlyKeys(entry, ['html', 'css', 'mount']) && typeof entry.mount === 'string'; }
function isRawItem(item, v3) {
    const allowedKeys = v3
        ? ['id', 'name', 'target', 'entry', 'assets', 'integrations', 'imageGeneration']
        : ['id', 'name', 'target', 'entry', 'assets'];
    return hasOnlyKeys(item, allowedKeys)
        && isTarget(item.target)
        && isEntry(item.entry)
        && (item.assets === undefined || Array.isArray(item.assets))
        && (!v3 || isPageItemHostCapabilities(item));
}
function isRawDisplay(display) {
    return isDisplayMetadata(display)
        && isEntry(display.entry)
        && (display.assets === undefined || Array.isArray(display.assets));
}
function isRawManifest(manifest, v3) {
    return hasOnlyKeys(manifest, v3 ? ['id', 'name', 'version', 'author', 'items', 'displays'] : ['id', 'name', 'version', 'author', 'items'])
        && Array.isArray(manifest.items)
        && manifest.items.every(item => isRawItem(item, v3))
        && (!v3 || (Array.isArray(manifest.displays) && manifest.displays.every(isRawDisplay)));
}
function trustedEntry(entry, files) {
    return isEntry(entry)
        && isNormalizedPackagePath(entry.mount)
        && hasMountExport(files[entry.mount])
        && (!hasOwn(entry, 'html') || (isNormalizedPackagePath(entry.html) && isTrustedFile(files[entry.html]) && files[entry.html].encoding === 'text' && text(files[entry.html].mimeType).toLowerCase() === 'text/html'))
        && (!hasOwn(entry, 'css') || (isNormalizedPackagePath(entry.css) && isTrustedFile(files[entry.css]) && files[entry.css].encoding === 'text' && text(files[entry.css].mimeType).toLowerCase() === 'text/css'));
}
function trustedTarget(target) { return isTarget(target) && text(target.tableName) && target.fields.every(field => typeof field === 'string' && field === field.trim() && !!field); }
function trustedItem(item, files, ids, v3) {
    const allowedKeys = v3
        ? ['id', 'name', 'target', 'entry', 'assets', 'integrations', 'imageGeneration', 'issues', 'activatable']
        : ['id', 'name', 'target', 'entry', 'assets', 'issues', 'activatable'];
    if (!hasOnlyKeys(item, allowedKeys) || !text(item.id) || ids.has(item.id) || !trustedTarget(item.target) || !trustedEntry(item.entry, files) || !Array.isArray(item.assets) || !Array.isArray(item.issues) || !item.issues.every(isIssue) || typeof item.activatable !== 'boolean' || (v3 && !isPageItemHostCapabilities(item))) return false;
    ids.add(item.id);
    return item.assets.every(path => isNormalizedPackagePath(path) && isTrustedFile(files[path]));
}
function trustedDisplay(display, files, ids) {
    const metadata = {
        id: display?.id,
        name: display?.name,
        kind: display?.kind,
        targets: display?.targets,
        entry: display?.entry,
        assets: display?.assets,
        ...(hasOwn(display, 'integrations') ? { integrations: display.integrations } : {}),
        ...(hasOwn(display, 'imageGeneration') ? { imageGeneration: display.imageGeneration } : {}),
        ...(hasOwn(display, 'interactions') ? { interactions: display.interactions } : {}),
    };
    if (!hasOnlyKeys(display, ['id', 'name', 'kind', 'targets', 'entry', 'assets', 'integrations', 'imageGeneration', 'interactions', 'issues', 'activatable']) || !isDisplayMetadata(metadata) || ids.has(display.id) || !trustedEntry(display.entry, files) || !Array.isArray(display.assets) || !Array.isArray(display.issues) || !display.issues.every(isIssue) || typeof display.activatable !== 'boolean') return false;
    ids.add(display.id);
    return display.assets.every(path => isNormalizedPackagePath(path) && isTrustedFile(files[path]));
}

export function isContentPresetBundle(value) {
    return hasOnlyKeys(value, ['format', 'formatVersion', 'apiVersion', 'manifest', 'files'])
        && value.format === CONTENT_PRESET_FORMAT
        && isSupportedVersion(value)
        && isRawManifest(value.manifest, isV3(value))
        && isObject(value.files)
        && Object.entries(value.files).every(([path, file]) => isNormalizedPackagePath(path) && isRawFile(file));
}

export function isTrustedContentPresetRecord(value) {
    if (!hasOnlyKeys(value, isV3(value)
        ? ['id', 'name', 'version', 'author', 'format', 'formatVersion', 'apiVersion', 'manifest', 'files', 'items', 'displays', 'issues', 'importedAt']
        : ['id', 'name', 'version', 'author', 'format', 'formatVersion', 'apiVersion', 'manifest', 'files', 'items', 'issues', 'importedAt'])
        || value.format !== CONTENT_PRESET_FORMAT
        || !isSupportedVersion(value)
        || !text(value.id)
        || !isRawManifest(value.manifest, isV3(value))
        || !Array.isArray(value.items)
        || !Array.isArray(value.issues)
        || !value.issues.every(isIssue)
        || typeof value.importedAt !== 'string') return false;
    const files = value.files;
    if (!isObject(files) || !Object.entries(files).every(([path, file]) => isNormalizedPackagePath(path) && file.path === path && isTrustedFile(file))) return false;
    const itemIds = new Set();
    if (!value.items.every(item => trustedItem(item, files, itemIds, isV3(value)))) return false;
    if (!isV3(value)) return true;
    const displayIds = new Set();
    return Array.isArray(value.displays) && value.displays.every(display => trustedDisplay(display, files, displayIds));
}

export function parseContentPresetBundle(input) {
    let value = input;
    if (typeof input === 'string') { try { value = JSON.parse(input); } catch (error) { throw new Error(`玉子美化预设不是有效 JSON：${error.message}`); } }
    if (!isContentPresetBundle(value)) throw new Error(`不支持的玉子美化预设格式，需要 ${CONTENT_PRESET_FORMAT}@${CONTENT_PRESET_FORMAT_VERSION} apiVersion=${CONTENT_PRESET_API_VERSION}，或旧版 v2/api1 页面预设`);
    return value;
}
