import { CONTENT_PRESET_DISPLAY_KINDS } from './constants.js';

export function normalizeMatchText(value) { return String(value ?? '').normalize('NFKC').trim(); }
export function normalizeFieldList(fields) { return Object.freeze((Array.isArray(fields) ? fields : []).map(normalizeMatchText).filter(Boolean)); }
export function matchesPresetItem(item, table) {
    const target = item?.target && typeof item.target === 'object' ? item.target : {};
    const expectedName = normalizeMatchText(target.tableName);
    if (!expectedName || expectedName !== normalizeMatchText(table?.tableName)) return false;
    const actualFields = new Set(normalizeFieldList(table?.headers));
    return normalizeFieldList(target.fields).every(field => actualFields.has(field));
}

export function hasPageCapability(item) { return !!item?.activatable && !!item?.entry?.mount; }
export function hasDisplayCapability(display) {
    return !!display?.activatable
        && CONTENT_PRESET_DISPLAY_KINDS.includes(display?.kind)
        && !!display?.entry?.mount
        && Array.isArray(display?.targets)
        && display.targets.length > 0;
}
// 保留仓库层旧名称；“弹窗应用”现在是三类自定义展示的统一来源入口。
export const hasPopupCapability = hasDisplayCapability;

function listMatching(presets, table, values, capability, toCandidate) {
    const matches = [];
    for (const preset of Array.isArray(presets) ? presets : []) {
        for (const value of Array.isArray(values(preset)) ? values(preset) : []) {
            if (!capability(value)) continue;
            const candidate = toCandidate(value, preset, table);
            if (candidate) matches.push(Object.freeze(candidate));
        }
    }
    return Object.freeze(matches);
}

export function listMatchingPageItems(presets, table) {
    return listMatching(presets, table, preset => preset?.items, hasPageCapability, (item, preset, sourceTable) => matchesPresetItem(item, sourceTable) ? { presetId: preset.id, itemId: item.id, preset, item } : null).filter(Boolean);
}

export function matchesDisplayTarget(display, table) {
    return (Array.isArray(display?.targets) ? display.targets : []).some(target => matchesPresetItem({ target }, table));
}

export function matchesDisplay(display, tables) {
    const availableTables = Array.isArray(tables) ? tables : [];
    return Array.isArray(display?.targets)
        && display.targets.length > 0
        && display.targets.every(target => availableTables.filter(table => matchesPresetItem({ target }, table)).length === 1);
}

function displayCandidate(display) {
    return Object.freeze({ displayId: display.id, itemId: display.id, display, item: display });
}

/**
 * 正式“弹窗应用”候选：按预设来源聚合。displayId 是样式选择而不是应用绑定，
 * 所以只在 displays[] 内出现；外层稳定使用 presetId。
 */
export function listMatchingDisplays(presets, tables) {
    const matches = [];
    for (const preset of Array.isArray(presets) ? presets : []) {
        const displays = (Array.isArray(preset?.displays) ? preset.displays : [])
            .filter(hasDisplayCapability)
            .filter(display => matchesDisplay(display, tables))
            .map(displayCandidate);
        if (displays.length) matches.push(Object.freeze({
            presetId: preset.id,
            preset,
            displays: Object.freeze(displays),
        }));
    }
    return Object.freeze(matches);
}

/**
 * 旧调用者仍可按单表取得“逐样式”列表。组合必须通过 listMatchingDisplays
 * 以完整 targets 集合判断，避免单表错误宣告组合可应用。
 */
export function listMatchingPopupDisplays(presets, table) {
    return listMatching(presets, table, preset => preset?.displays, hasDisplayCapability, (display, preset, sourceTable) => display.targets.length === 1 && matchesDisplayTarget(display, sourceTable) ? { presetId: preset.id, ...displayCandidate(display) } : null).filter(Boolean);
}

export const listMatchingPopupItems = listMatchingPopupDisplays;
// 旧调用者只认识页面候选；保留别名，避免把展示-only 误送入全页 renderer。
export const listMatchingItems = listMatchingPageItems;
