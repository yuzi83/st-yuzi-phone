/**
 * 变量管理器 - 平铺卡片视图组件
 * 将嵌套 JSON 对象渲染为分组可折叠的平铺卡片
 * 文字全部显示，不省略；删除态支持一级/二级标题也可删除
 */

import { escapeHtml } from '../utils.js';

/**
 * 将嵌套对象扁平化为分组结构
 */
export function flattenToGroups(data) {
    if (!data || typeof data !== 'object') return [];

    const groups = [];

    for (const [topKey, topValue] of Object.entries(data)) {
        if (topValue !== null && typeof topValue === 'object' && !Array.isArray(topValue)) {
            const group = {
                groupPath: topKey,
                groupName: topKey,
                items: [],
            };
            flattenObjectItems(topValue, topKey, group.items);
            groups.push(group);
        } else {
            let miscGroup = groups.find((g) => g.groupPath === '__misc__');
            if (!miscGroup) {
                miscGroup = { groupPath: '__misc__', groupName: '其他', items: [] };
                groups.push(miscGroup);
            }
            miscGroup.items.push({
                path: topKey,
                key: topKey,
                value: topValue,
                valueType: getValueType(topValue),
            });
        }
    }

    return groups;
}

function flattenObjectItems(obj, parentPath, items) {
    for (const [key, value] of Object.entries(obj)) {
        const fullPath = `${parentPath}.${key}`;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            if (Object.keys(value).length === 0) {
                items.push({
                    path: fullPath,
                    key,
                    value,
                    valueType: 'object',
                    parentPath,
                });
                continue;
            }

            flattenObjectItems(value, fullPath, items);
        } else {
            items.push({
                path: fullPath,
                key,
                value,
                valueType: getValueType(value),
                parentPath,
            });
        }
    }
}

function getValueType(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
}

export function formatDisplayValue(value, valueType) {
    if (valueType === 'null') return 'null';
    if (valueType === 'boolean') return value ? 'true' : 'false';
    if (valueType === 'number') return String(value);
    if (valueType === 'string') return String(value);
    if (valueType === 'array') {
        try { return JSON.stringify(value); } catch { return String(value); }
    }
    if (valueType === 'object') {
        try { return JSON.stringify(value); } catch { return '[object]'; }
    }
    return String(value);
}

export function parseInputValue(inputStr, originalType) {
    const trimmed = String(inputStr).trim();
    if (trimmed === 'null') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (originalType === 'number') {
        const num = Number(trimmed);
        if (!isNaN(num) && trimmed !== '') return num;
    }
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
}

export function getValueTypeClass(valueType) {
    const classMap = {
        number: 'vm-value-number',
        string: 'vm-value-string',
        boolean: 'vm-value-boolean',
        null: 'vm-value-null',
        array: 'vm-value-array',
        object: 'vm-value-object',
    };
    return classMap[valueType] || 'vm-value-unknown';
}

/**
 * 渲染单个变量卡片 HTML
 */
function renderCardHtml(item, deleteMode, selectedPaths) {
    const displayValue = formatDisplayValue(item.value, item.valueType);
    const typeClass = getValueTypeClass(item.valueType);
    const isSelected = selectedPaths.has(item.path);
    const selectedClass = isSelected ? 'vm-card-selected' : '';
    const deleteModeClass = deleteMode ? 'vm-card-delete-mode' : '';

    return `
        <div class="vm-card ${selectedClass} ${deleteModeClass}"
             data-var-path="${escapeHtml(item.path)}"
             data-var-type="${escapeHtml(item.valueType)}">
            ${deleteMode ? `
                <div class="vm-card-checkbox">
                    <div class="vm-checkbox ${isSelected ? 'vm-checkbox-checked' : ''}"></div>
                </div>
            ` : ''}
            <div class="vm-card-content">
                <span class="vm-card-key">${escapeHtml(item.key)}</span>
                <span class="vm-card-value ${typeClass}">${escapeHtml(displayValue)}</span>
            </div>
        </div>
    `;
}

/**
 * 渲染分组卡片 HTML
 * 删除态下一级标题和二级标题也可选中删除
 */
export function renderGroupsHtml(groups, options = {}) {
    const { deleteMode = false, selectedPaths = new Set() } = options;

    if (!groups || groups.length === 0) {
        return '<div class="vm-empty-state">当前楼层没有变量数据</div>';
    }

    return groups.map((group) => {
        const subGroups = extractSubGroups(group.items);
        let renderedItemsHtml = '';

        // 一级标题（分组头）在删除态下也可选中
        const groupSelected = selectedPaths.has(group.groupPath);
        const groupCheckboxHtml = deleteMode ? `
            <div class="vm-card-checkbox vm-group-checkbox">
                <div class="vm-checkbox ${groupSelected ? 'vm-checkbox-checked' : ''}"></div>
            </div>
        ` : '';

        if (subGroups.length > 0) {
            renderedItemsHtml = subGroups.map((sub) => {
                const subItemsHtml = sub.items.map((item) => renderCardHtml(item, deleteMode, selectedPaths)).join('');

                if (sub.subName) {
                    // 二级标题在删除态下也可选中
                    const subPath = `${group.groupPath}.${sub.subName}`;
                    const subSelected = selectedPaths.has(subPath);
                    const subCheckboxHtml = deleteMode ? `
                        <div class="vm-card-checkbox vm-sub-checkbox">
                            <div class="vm-checkbox ${subSelected ? 'vm-checkbox-checked' : ''}"></div>
                        </div>
                    ` : '';

                    return `
                        <div class="vm-sub-group" data-sub-path="${escapeHtml(subPath)}">
                            <div class="vm-sub-group-title ${deleteMode ? 'vm-sub-title-delete-mode' : ''}">
                                ${subCheckboxHtml}
                                <span class="vm-sub-group-name">${escapeHtml(sub.subName)}</span>
                            </div>
                            <div class="vm-sub-group-items">${subItemsHtml}</div>
                        </div>
                    `;
                }
                return subItemsHtml;
            }).join('');
        } else {
            renderedItemsHtml = group.items.map((item) => renderCardHtml(item, deleteMode, selectedPaths)).join('');
        }

        return `
            <div class="vm-group" data-group-path="${escapeHtml(group.groupPath)}">
                <div class="vm-group-header ${deleteMode ? 'vm-group-header-delete-mode' : ''}">
                    ${groupCheckboxHtml}
                    <span class="vm-group-chevron">▼</span>
                    <span class="vm-group-name">${escapeHtml(group.groupName)}</span>
                    <span class="vm-group-count">${group.items.length}</span>
                </div>
                <div class="vm-group-body">
                    ${renderedItemsHtml}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 从 items 中提取二级子分组
 */
function extractSubGroups(items) {
    const subMap = new Map();

    for (const item of items) {
        const parts = item.path.split('.');
        if (parts.length >= 3) {
            const subName = parts[1];
            if (!subMap.has(subName)) {
                subMap.set(subName, { subName, items: [] });
            }
            subMap.get(subName).items.push(item);
        } else {
            if (!subMap.has('')) {
                subMap.set('', { subName: '', items: [] });
            }
            subMap.get('').items.push(item);
        }
    }

    return Array.from(subMap.values());
}
