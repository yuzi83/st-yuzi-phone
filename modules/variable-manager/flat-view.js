/**
 * 变量管理器 - 树状卡片视图组件
 * 保留顶层分组，但组内使用对象节点 + 叶子卡片递归渲染
 */

import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

/**
 * 将嵌套对象转换为顶层分组 + 树节点结构
 */
export function flattenToGroups(data, options = {}) {
    if (!data || typeof data !== 'object') return [];

    const normalizeOptions = normalizeFlattenOptions(options);
    const groups = [];

    for (const [topKey, topValue] of Object.entries(data)) {
        if (isPlainObject(topValue)) {
            const nodes = buildChildNodes(topValue, topKey, 0, normalizeOptions);
            groups.push({
                groupPath: topKey,
                groupName: topKey,
                leafCount: countLeafNodes(nodes),
                nodes,
            });
            continue;
        }

        let miscGroup = groups.find((group) => group.groupPath === '__misc__');
        if (!miscGroup) {
            miscGroup = {
                groupPath: '__misc__',
                groupName: '其他',
                leafCount: 0,
                nodes: [],
            };
            groups.push(miscGroup);
        }

        const node = createLeafNode({
            path: topKey,
            key: topKey,
            value: topValue,
            parentPath: '',
            depth: 0,
        }, normalizeOptions);
        miscGroup.nodes.push(node);
        miscGroup.leafCount = countLeafNodes(miscGroup.nodes);
    }

    return groups;
}

function normalizeFlattenOptions(options = {}) {
    return {
        isMvu: options?.isMvu === true,
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildChildNodes(obj, parentPath, depth, options) {
    const nodes = [];

    for (const [key, value] of Object.entries(obj)) {
        const fullPath = `${parentPath}.${key}`;

        if (isPlainObject(value)) {
            if (Object.keys(value).length === 0) {
                nodes.push(createLeafNode({
                    path: fullPath,
                    key,
                    value,
                    parentPath,
                    depth,
                }, options));
                continue;
            }

            const children = buildChildNodes(value, fullPath, depth + 1, options);
            nodes.push(createObjectNode({
                path: fullPath,
                key,
                depth,
                children,
            }));
            continue;
        }

        nodes.push(createLeafNode({
            path: fullPath,
            key,
            value,
            parentPath,
            depth,
        }, options));
    }

    return nodes;
}

function createObjectNode(input) {
    const children = Array.isArray(input.children) ? input.children : [];
    return {
        kind: 'object',
        path: input.path,
        key: input.key,
        depth: Number.isFinite(Number(input.depth)) ? Number(input.depth) : 0,
        children,
        childCount: children.length,
        leafCount: countLeafNodes(children),
        isEmptyObject: children.length === 0,
    };
}

function createLeafNode(input, options) {
    const normalized = normalizeVariableItemValue(input.value, options);
    return {
        kind: 'leaf',
        path: input.path,
        key: input.key,
        value: normalized.value,
        valueType: input.valueType || normalized.valueType,
        sourceValue: normalized.sourceValue,
        parentPath: input.parentPath,
        depth: Number.isFinite(Number(input.depth)) ? Number(input.depth) : 0,
        deleteKind: normalized.valueType === 'object' ? 'object' : 'leaf',
        leafCount: normalized.valueType === 'object' ? 0 : 1,
        mvu: normalized.mvu,
    };
}

function countLeafNodes(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    return nodes.reduce((total, node) => {
        if (!node || typeof node !== 'object') return total;
        if (node.kind === 'object') {
            return total + countLeafNodes(node.children);
        }
        return total + 1;
    }, 0);
}

function normalizeVariableItemValue(value, options) {
    if (options?.isMvu && isMvuTupleLeaf(value)) {
        const tupleValue = value[0];
        const description = typeof value[1] === 'string' ? value[1] : '';
        return {
            value: tupleValue,
            valueType: getValueType(tupleValue),
            sourceValue: value,
            mvu: {
                isTupleLeaf: true,
                description,
                rawTuple: value,
            },
        };
    }

    return {
        value,
        valueType: getValueType(value),
        sourceValue: value,
        mvu: {
            isTupleLeaf: false,
            description: '',
            rawTuple: null,
        },
    };
}

function isMvuTupleLeaf(value) {
    return Array.isArray(value)
        && value.length >= 1
        && value.length <= 2
        && (value.length === 1 || typeof value[1] === 'string');
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
    if ((trimmed.startsWith('[') && trimmed.endsWith(']'))
        || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
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

function buildDeleteTargetAttrs(target) {
    const path = String(target?.path || '').trim();
    if (!path) return '';

    const kind = String(target?.deleteKind || target?.kind || 'leaf').trim() || 'leaf';
    const label = String(target?.key || path).trim() || path;
    const leafCount = Number.isFinite(Number(target?.leafCount)) ? Number(target.leafCount) : 0;

    return `
        data-delete-path="${escapeHtmlAttr(path)}"
        data-delete-kind="${escapeHtmlAttr(kind)}"
        data-delete-label="${escapeHtmlAttr(label)}"
        data-delete-leaf-count="${escapeHtmlAttr(String(leafCount))}"
    `;
}

function buildTreeNodeAttrs(node) {
    const depth = Number.isFinite(Number(node?.depth)) ? Math.max(0, Number(node.depth)) : 0;
    return `
        data-node-depth="${escapeHtmlAttr(String(depth))}"
        style="--vm-node-indent: ${escapeHtmlAttr(String(depth * 12))}px;"
    `;
}

/**
 * 渲染单个变量叶子卡片 HTML
 */
function renderCardHtml(item, deleteMode, selectedPaths) {
    const displayValue = formatDisplayValue(item.value, item.valueType);
    const typeClass = getValueTypeClass(item.valueType);
    const isSelected = selectedPaths.has(item.path);
    const selectedClass = isSelected ? 'vm-card-selected' : '';
    const deleteModeClass = deleteMode ? 'vm-card-delete-mode' : '';
    const description = String(item?.mvu?.description || '').trim();
    const descriptionHtml = description ? `
        <span class="vm-card-description-label">说明</span>
        <span class="vm-card-description">${escapeHtml(description)}</span>
    ` : '';
    const deleteAttrs = buildDeleteTargetAttrs(item);
    const treeAttrs = buildTreeNodeAttrs(item);

    return `
        <div class="vm-tree-node vm-tree-leaf" data-node-kind="leaf" ${treeAttrs}>
            <div class="vm-card ${selectedClass} ${deleteModeClass}"
                 data-var-path="${escapeHtmlAttr(item.path)}"
                 data-var-type="${escapeHtmlAttr(item.valueType)}"
                 ${deleteAttrs}>
                ${deleteMode ? `
                    <div class="vm-card-checkbox">
                        <div class="vm-checkbox ${isSelected ? 'vm-checkbox-checked' : ''}"></div>
                    </div>
                ` : ''}
                <div class="vm-card-content">
                    <span class="vm-card-key">${escapeHtml(item.key)}</span>
                    <span class="vm-card-value ${typeClass}">${escapeHtml(displayValue)}</span>
                    ${descriptionHtml}
                </div>
            </div>
        </div>
    `;
}

function renderObjectNodeHtml(node, deleteMode, selectedPaths) {
    const isSelected = selectedPaths.has(node.path);
    const deleteModeClass = deleteMode ? 'vm-object-title-delete-mode vm-delete-selectable' : '';
    const deleteAttrs = buildDeleteTargetAttrs({
        ...node,
        deleteKind: 'object',
    });
    const metaText = node.leafCount > 0 ? `${node.leafCount} 项字段` : '空对象';
    const childrenHtml = renderTreeNodesHtml(node.children, deleteMode, selectedPaths);
    const treeAttrs = buildTreeNodeAttrs(node);

    return `
        <div class="vm-tree-node" data-node-kind="object" ${treeAttrs}>
            <div class="vm-object-title ${deleteModeClass} ${isSelected ? 'vm-delete-selected' : ''}" ${deleteAttrs}>
                ${deleteMode ? `
                    <div class="vm-card-checkbox vm-object-checkbox">
                        <div class="vm-checkbox ${isSelected ? 'vm-checkbox-checked' : ''}"></div>
                    </div>
                ` : ''}
                <span class="vm-object-name">${escapeHtml(node.key)}</span>
                <span class="vm-object-meta">${escapeHtml(metaText)}</span>
            </div>
            <div class="vm-object-children">
                ${childrenHtml}
            </div>
        </div>
    `;
}

function renderTreeNodesHtml(nodes, deleteMode, selectedPaths) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
        return '<div class="vm-object-empty">空对象</div>';
    }

    return nodes.map((node) => {
        if (!node || typeof node !== 'object') return '';
        if (node.kind === 'object') {
            return renderObjectNodeHtml(node, deleteMode, selectedPaths);
        }
        return renderCardHtml(node, deleteMode, selectedPaths);
    }).join('');
}

/**
 * 渲染分组卡片 HTML
 * 删除态下顶层分组、对象标题和叶子卡片都可选中删除
 */
export function renderGroupsHtml(groups, options = {}) {
    const { deleteMode = false, selectedPaths = new Set() } = options;

    if (!groups || groups.length === 0) {
        return '<div class="vm-empty-state">当前楼层没有变量数据</div>';
    }

    return groups.map((group) => {
        const groupSelected = selectedPaths.has(group.groupPath);
        const groupCheckboxHtml = deleteMode ? `
            <div class="vm-card-checkbox vm-group-checkbox">
                <div class="vm-checkbox ${groupSelected ? 'vm-checkbox-checked' : ''}"></div>
            </div>
        ` : '';
        const deleteAttrs = buildDeleteTargetAttrs({
            path: group.groupPath,
            key: group.groupName,
            deleteKind: 'group',
            leafCount: group.leafCount,
        });
        const renderedNodesHtml = renderTreeNodesHtml(group.nodes, deleteMode, selectedPaths);

        return `
            <div class="vm-group" data-group-path="${escapeHtmlAttr(group.groupPath)}">
                <div class="vm-group-header ${deleteMode ? 'vm-group-header-delete-mode' : ''} ${groupSelected ? 'vm-delete-selected' : ''}" ${deleteAttrs}>
                    ${groupCheckboxHtml}
                    <span class="vm-group-chevron">▼</span>
                    <span class="vm-group-name">${escapeHtml(group.groupName)}</span>
                    <span class="vm-group-count">${group.leafCount}</span>
                </div>
                <div class="vm-group-body">
                    ${renderedNodesHtml}
                </div>
            </div>
        `;
    }).join('');
}
