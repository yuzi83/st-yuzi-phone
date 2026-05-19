const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    api: 'modules/variable-manager/variable-api.js',
    index: 'modules/variable-manager/index.js',
    flatView: 'modules/variable-manager/flat-view.js',
    style: 'styles/12-variable-manager.css',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertIncludes(source, token, label) {
    assert(source.includes(token), `${label} 缺少片段：${token}`);
}

function assertNotIncludes(source, token, label) {
    assert(!source.includes(token), `${label} 禁止片段：${token}`);
}

function assertOrdered(source, tokens, label) {
    let cursor = -1;
    tokens.forEach((token) => {
        const next = source.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    });
}

function createSyntaxScanner() {
    return {
        quote: null,
        escaped: false,
        lineComment: false,
        blockComment: false,
    };
}

function advanceSyntaxScanner(state, source, index) {
    const char = source[index];
    const next = source[index + 1];

    if (state.lineComment) {
        if (char === '\n') state.lineComment = false;
        return true;
    }
    if (state.blockComment) {
        if (char === '*' && next === '/') {
            state.blockComment = false;
            return 2;
        }
        return true;
    }
    if (state.quote) {
        if (state.escaped) {
            state.escaped = false;
            return true;
        }
        if (char === '\\') {
            state.escaped = true;
            return true;
        }
        if (char === state.quote) {
            state.quote = null;
        }
        return true;
    }
    if (char === '/' && next === '/') {
        state.lineComment = true;
        return 2;
    }
    if (char === '/' && next === '*') {
        state.blockComment = true;
        return 2;
    }
    if (char === '\'' || char === '"' || char === '`') {
        state.quote = char;
        return true;
    }
    return false;
}

function findFunctionBodyStart(source, signatureIndex, name) {
    const paramsStart = source.indexOf('(', signatureIndex);
    assert(paramsStart !== -1, `${name} 缺少参数列表`);

    const state = createSyntaxScanner();
    let parenDepth = 0;
    let index = paramsStart;
    for (; index < source.length; index += 1) {
        const skipped = advanceSyntaxScanner(state, source, index);
        if (skipped === 2) {
            index += 1;
            continue;
        }
        if (skipped) continue;

        const char = source[index];
        if (char === '(') parenDepth += 1;
        if (char === ')') {
            parenDepth -= 1;
            if (parenDepth === 0) break;
        }
    }

    assert(parenDepth === 0, `${name} 参数列表括号不平衡`);

    for (index += 1; index < source.length; index += 1) {
        const char = source[index];
        if (/\s/.test(char)) continue;
        assert(char === '{', `${name} 参数列表后未找到函数体`);
        return index;
    }

    throw new Error(`${name} 缺少函数体`);
}

function findFunctionBodyEnd(source, bodyStart, name) {
    const state = createSyntaxScanner();
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
        const skipped = advanceSyntaxScanner(state, source, index);
        if (skipped === 2) {
            index += 1;
            continue;
        }
        if (skipped) continue;

        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return index + 1;
        }
    }

    throw new Error(`${name} 函数体括号不平衡`);
}

function extractFunctionBody(source, name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapedName}\\s*\\(`);
    const match = pattern.exec(source);
    assert(match, `未找到函数 ${name}`);

    const bodyStart = findFunctionBodyStart(source, match.index, name);
    const bodyEnd = findFunctionBodyEnd(source, bodyStart, name);
    return source.slice(match.index, bodyEnd);
}

const api = read(files.api);
const indexSource = read(files.index);
const flatView = read(files.flatView);
const style = read(files.style);

assertIncludes(api, 'export async function getFloorVariablesAsync(messageId = \'latest\', options = {})', 'variable-api 必须导出异步读取入口');
assertIncludes(api, 'const DEFAULT_MVU_READ_OPTIONS = Object.freeze', 'variable-api 必须定义有限等待参数');
assertIncludes(api, 'async function waitForMvuInitialized(timeoutMs)', 'variable-api 必须等待 MVU 初始化');
assertIncludes(api, 'resolveWaitGlobalInitialized()', 'variable-api 必须尝试复用 waitGlobalInitialized');
assertIncludes(api, 'readMvuDataWithRetry(messageId, options = {})', 'variable-api 必须提供 bounded retry 读取');
const getFloorVariablesAsyncBody = extractFunctionBody(api, 'getFloorVariablesAsync');
assertOrdered(getFloorVariablesAsyncBody, [
    'if (isMvuAvailable()) {',
    'const result = await readMvuDataWithRetry(resolvedId, options);',
    'const data = normalizePlainObject(result.mvuData.stat_data);',
    'if (Object.keys(data).length > 0) {',
    "return buildReadResult('ready', data, true, result.mvuData, resolvedId, {",
    'const fallback = readTavernHelperVariables(resolvedId, result.error);',
    "return buildReadResult('empty', data, true, result.mvuData, resolvedId, {",
    'return readTavernHelperVariables(resolvedId);',
], 'getFloorVariablesAsync 必须优先读取 MVU stat_data，空数据再降级 TavernHelper');
assertNotIncludes(getFloorVariablesAsyncBody, 'display_data', 'getFloorVariablesAsync 不能把 display_data 当成可编辑变量树返回');

const setFloorVariableBody = extractFunctionBody(api, 'setFloorVariable');
assertOrdered(setFloorVariableBody, [
    'const oldValue = getNestedValue(mvuData.stat_data, path);',
    'const oldDescription = isMvuTupleLeafValue(oldValue) && typeof oldValue[1] === \'string\'',
    'await window.Mvu.setMvuVariable(mvuData, path, newValue, { reason: \'变量管理器手动修改\' });',
    'const updatedValue = getNestedValue(mvuData.stat_data, path);',
    'setNestedValue(mvuData.stat_data, path, [newValue, oldDescription]);',
    'await window.Mvu.replaceMvuData(mvuData, { type: \'message\', message_id: messageId });',
], 'setFloorVariable 必须保留 MVU tuple 字段说明');

assertIncludes(indexSource, "import { escapeHtml } from '../utils/dom-escape.js';", 'variable-manager 页面必须导入 HTML 转义工具');
assertIncludes(indexSource, 'getFloorVariablesAsync(expectedMessageId)', 'variable-manager 页面必须使用异步读取入口');
assertIncludes(indexSource, 'renderVariableStatus(container, \'loading\'', 'variable-manager 页面首开必须先渲染 loading');
assertIncludes(indexSource, 'await waitForContainerConnection(container, runtime, () => isPendingRouteActive());', 'variable-manager 页面必须等待 DOM 连接后写内容');
assertIncludes(indexSource, '${escapeHtml(safeMessage)}', 'variable-manager 状态消息必须 HTML 转义后写入 DOM');
assertIncludes(indexSource, 'flattenToGroups(data, { isMvu: result?.isMvu === true });', 'variable-manager 页面必须把 MVU 模式传入平铺视图');
assertIncludes(indexSource, 'if (result?.status === \'error\')', 'variable-manager 页面必须渲染读取错误态');
assertIncludes(indexSource, 'if (result?.status === \'unavailable\')', 'variable-manager 页面必须渲染接口不可用态');

assertIncludes(flatView, 'export function flattenToGroups(data, options = {})', 'flat-view 必须接收 options');
assertIncludes(flatView, 'isMvu: options?.isMvu === true', 'flat-view 必须显式启用 MVU 模式');
assertIncludes(flatView, 'options?.isMvu && isMvuTupleLeaf(value)', 'tuple 解释只能在 MVU 模式启用');
assertIncludes(flatView, 'const tupleValue = value[0];', 'tuple 第 0 项必须作为显示值');
assertIncludes(flatView, 'const description = typeof value[1] === \'string\' ? value[1] : \'\';', 'tuple 第 1 项必须作为说明');
assertIncludes(flatView, 'const nodes = buildChildNodes(topValue, topKey, 0, normalizeOptions);', 'flat-view 必须为顶层对象构建树节点');
assertIncludes(flatView, 'function createObjectNode(input) {', 'flat-view 必须定义对象节点工厂');
assertIncludes(flatView, 'deleteKind: normalized.valueType === \'object\' ? \'object\' : \'leaf\'', '空对象叶子卡片必须保留对象删除语义');
assertIncludes(flatView, 'function buildTreeNodeAttrs(node) {', 'flat-view 必须为树节点输出缩进属性');
assertIncludes(flatView, 'data-var-type="${escapeHtmlAttr(item.valueType)}"', 'data-var-type 必须基于归一化后的真实值类型');
assertIncludes(flatView, 'vm-card-description', 'flat-view 必须渲染 tuple 说明');
assertIncludes(flatView, 'data-delete-kind="${escapeHtmlAttr(kind)}"', 'flat-view 必须输出结构化删除类型');
assertIncludes(flatView, 'style="--vm-node-indent: ${escapeHtmlAttr(String(depth * 12))}px;"', 'flat-view 必须输出树节点缩进变量');
assertIncludes(flatView, 'class="vm-object-title', 'flat-view 必须渲染对象标题节点');
assertNotIncludes(flatView, 'extractSubGroups', 'flat-view 不能继续依赖旧的临时二级分组恢复逻辑');
assertNotIncludes(flatView, 'vm-sub-group-path', 'flat-view 不能继续渲染旧的中间路径 badge');

assertIncludes(style, '.vm-state-loading', 'CSS 必须包含 loading 状态样式');
assertIncludes(style, '.vm-state-error', 'CSS 必须包含 error 状态样式');
assertIncludes(style, '.vm-state-unavailable', 'CSS 必须包含 unavailable 状态样式');
assertIncludes(style, '.vm-tree-node', 'CSS 必须包含树节点容器样式');
assertIncludes(style, '.vm-object-title', 'CSS 必须包含对象标题样式');
assertIncludes(style, '.vm-card-description', 'CSS 必须包含 tuple 说明样式');
assertIncludes(style, '.vm-confirm-delete-kind', 'CSS 必须包含删除类型标签样式');
assertNotIncludes(style, '.vm-sub-group-path', 'CSS 不能继续依赖旧的中间路径 badge 样式');
assertIncludes(style, 'white-space: pre-wrap;', 'CSS 必须保留长文本换行显示');
assertIncludes(style, 'word-break: break-word;', 'CSS 必须保留长文本断词显示');

console.log('[variable-manager-mvu-readiness-check] 检查通过');
console.log('- OK | MVU 读取等待初始化并有限重试');
console.log('- OK | 页面首开 loading、连接等待与异步读取契约已覆盖');
console.log('- OK | MVU tuple 当前值、说明与编辑保真契约已覆盖');
console.log('- OK | 树状对象节点与结构化删除语义契约已覆盖');
console.log('- OK | UI 不把 display_data 当成可编辑变量树');
