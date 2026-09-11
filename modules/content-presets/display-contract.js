import {
    CONTENT_PRESET_DISPLAY_INTEGRATIONS,
    CONTENT_PRESET_DISPLAY_INTERACTIONS,
    CONTENT_PRESET_DISPLAY_KINDS,
} from './constants.js';

function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function hasOnlyKeys(value, allowedKeys) {
    if (!isObject(value)) return false;
    const allowed = new Set(allowedKeys);
    return Object.keys(value).every(key => allowed.has(key));
}
function exactText(value) { return typeof value === 'string' && !!value && value === value.trim(); }
function exactTextList(value) {
    return Array.isArray(value)
        && value.length > 0
        && value.every(exactText)
        && new Set(value).size === value.length;
}
function freezeList(values) { return Object.freeze([...values]); }

function normalizeTarget(source) {
    if (!hasOnlyKeys(source, ['tableName', 'fields']) || !exactText(source.tableName) || !exactTextList(source.fields)) {
        throw new Error('展示 targets 必须声明唯一的表名和至少一个无重复必需字段');
    }
    return Object.freeze({ tableName: source.tableName, fields: freezeList(source.fields) });
}

function normalizeIntegrations(source) {
    if (!hasOnlyKeys(source, CONTENT_PRESET_DISPLAY_INTEGRATIONS) || Object.keys(source).length === 0
        || Object.values(source).some(value => value !== true)) {
        throw new Error('展示 integrations 只能显式声明 theme 或 font 为 true');
    }
    return Object.freeze(Object.fromEntries(Object.keys(source).map(key => [key, true])));
}

export function normalizeContentPresetHostIntegrations(source) {
    return normalizeIntegrations(source);
}

function normalizeImageCanvas(source, targets) {
    if (!hasOnlyKeys(source, ['tableName', 'stableIdentityFields', 'canvas', 'promptFields', 'promptSuffix'])
        || !exactText(source.tableName)
        || !exactText(source.canvas)
        || !exactTextList(source.stableIdentityFields)
        || !exactTextList(source.promptFields)
        || (source.promptSuffix !== undefined && typeof source.promptSuffix !== 'string')) {
        throw new Error('展示 imageGeneration.canvases 必须完整声明归属表、稳定标识字段、画布和提示词字段');
    }
    const target = targets.find(value => value.tableName === source.tableName);
    if (!target) throw new Error(`展示生图归属表未声明为 targets：${source.tableName}`);
    const targetFields = new Set(target.fields);
    if (![...source.stableIdentityFields, ...source.promptFields].every(field => targetFields.has(field))) {
        throw new Error('展示生图字段必须全部属于归属表的必需字段');
    }
    return Object.freeze({
        tableName: source.tableName,
        stableIdentityFields: freezeList(source.stableIdentityFields),
        canvas: source.canvas,
        promptFields: freezeList(source.promptFields),
        ...(source.promptSuffix !== undefined ? { promptSuffix: source.promptSuffix.trim() } : {}),
    });
}
function normalizeImageGeneration(source, targets) {
    if (!hasOnlyKeys(source, ['canvases']) || !Array.isArray(source.canvases) || source.canvases.length === 0) {
        throw new Error('展示 imageGeneration 必须声明至少一个画布');
    }
    const canvases = source.canvases.map(canvas => normalizeImageCanvas(canvas, targets));
    const identities = new Set(canvases.map(canvas => `${canvas.tableName}\u001F${canvas.canvas}`));
    if (identities.size !== canvases.length) throw new Error('展示 imageGeneration 不允许同一归属表重复画布名');
    return Object.freeze({ canvases: freezeList(canvases) });
}

export function normalizeContentPresetImageGeneration(source, targets) {
    return normalizeImageGeneration(source, targets);
}

/**
 * 页面项与展示共享主题、字体及图片画布的受限声明合同。页面只绑定一张
 * 物理表，因此每个画布的 tableName 必须等于该页面项的 target.tableName。
 */
export function normalizePageItemHostCapabilities(source) {
    const target = normalizeTarget(source?.target);
    const capabilities = {
        ...(Object.prototype.hasOwnProperty.call(source, 'integrations')
            ? { integrations: normalizeIntegrations(source.integrations) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(source, 'imageGeneration')
            ? { imageGeneration: normalizeImageGeneration(source.imageGeneration, [target]) }
            : {}),
    };
    return Object.freeze(capabilities);
}

export function isPageItemHostCapabilities(source) {
    try {
        normalizePageItemHostCapabilities(source);
        return true;
    } catch {
        return false;
    }
}

function normalizeInteractions(source, kind, imageGeneration) {
    if (kind !== 'inline') throw new Error('只有 inline 展示可以声明 interactions');
    if (!exactTextList(source) || source.some(value => !CONTENT_PRESET_DISPLAY_INTERACTIONS.includes(value))) {
        throw new Error('展示 interactions 包含不支持或重复的动作');
    }
    if (source.includes('image-generate') && !imageGeneration) {
        throw new Error('image-generate 交互需要 imageGeneration 声明');
    }
    return freezeList(source);
}

/**
 * 规范化 v3 展示的声明部分。entry/assets 仍由格式层分别验证和规范化，
 * 以保留页面条目的旧格式逻辑。
 */
export function normalizeDisplayMetadata(source) {
    if (!hasOnlyKeys(source, ['id', 'name', 'kind', 'targets', 'entry', 'assets', 'integrations', 'imageGeneration', 'interactions'])
        || !exactText(source.id)
        || !exactText(source.name)
        || !CONTENT_PRESET_DISPLAY_KINDS.includes(source.kind)
        || !Array.isArray(source.targets)
        || source.targets.length === 0) {
        throw new Error('展示声明缺少稳定身份、名称、类型或 targets');
    }
    const targets = source.targets.map(normalizeTarget);
    if (new Set(targets.map(target => target.tableName)).size !== targets.length) {
        throw new Error('展示 targets 不允许重复同一物理表');
    }
    const integrations = Object.prototype.hasOwnProperty.call(source, 'integrations') ? normalizeIntegrations(source.integrations) : undefined;
    const imageGeneration = Object.prototype.hasOwnProperty.call(source, 'imageGeneration') ? normalizeImageGeneration(source.imageGeneration, targets) : undefined;
    if (imageGeneration && source.kind !== 'inline') throw new Error('只有 inline 展示可以声明 imageGeneration');
    const interactions = Object.prototype.hasOwnProperty.call(source, 'interactions') ? normalizeInteractions(source.interactions, source.kind, imageGeneration) : undefined;
    return Object.freeze({
        id: source.id,
        name: source.name,
        kind: source.kind,
        targets: freezeList(targets),
        ...(integrations ? { integrations } : {}),
        ...(imageGeneration ? { imageGeneration } : {}),
        ...(interactions ? { interactions } : {}),
    });
}

export function isDisplayMetadata(value) {
    try {
        normalizeDisplayMetadata(value);
        return true;
    } catch {
        return false;
    }
}
