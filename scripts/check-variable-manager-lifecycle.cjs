const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    routeRenderer: 'modules/phone-core/route-renderer.js',
    index: 'modules/variable-manager/index.js',
    interactions: 'modules/variable-manager/interactions.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function createFunctionStartPattern(name) {
    return new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
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
    let index = bodyStart;

    for (; index < source.length; index += 1) {
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

function extractFunctionBody(source, name, pattern) {
    const match = pattern.exec(source) || createFunctionStartPattern(name).exec(source);
    assert(match, `未找到 ${name}`);

    const bodyStart = findFunctionBodyStart(source, match.index, name);
    const bodyEnd = findFunctionBodyEnd(source, bodyStart, name);
    return source.slice(match.index, bodyEnd);
}

function assertOrdered(haystack, tokens, label) {
    let cursor = -1;
    tokens.forEach((token) => {
        const next = haystack.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    });
}

const sources = Object.fromEntries(Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]));
const routeRenderer = sources.routeRenderer;
const indexSource = sources.index;
const interactions = sources.interactions;

assert(
    routeRenderer.includes('async function loadRouteRenderer(route, renderToken)')
        && routeRenderer.includes('renderVariableManager(page, { renderToken });'),
    'variable-manager route 必须把 renderToken 显式传给 renderVariableManager',
);

assert(indexSource.includes("import { getPhoneCoreState } from '../phone-core/state.js';"), 'variable-manager index 必须读取 phone core routeRenderToken');
assert(indexSource.includes('function normalizeRenderToken(value)'), 'variable-manager index 必须归一化 renderToken');

const createInstanceBody = extractFunctionBody(
    indexSource,
    'createVariableManagerPageInstance',
    /function\s+createVariableManagerPageInstance\s*\([^)]*\)\s*{/
);
assert(createInstanceBody.includes('const renderToken = normalizeRenderToken(options.renderToken);'), 'page instance 必须保存 options.renderToken');
assert(createInstanceBody.includes('const isActive = (expectedMessageId = null) => {'), 'page instance 必须定义 isActive(expectedMessageId)');
assert(createInstanceBody.includes('if (disposed) return false;'), 'page lifecycle 必须检查 disposed');
assert(createInstanceBody.includes('runtime.isDisposed()'), 'page lifecycle 必须检查 runtime.isDisposed()');
assert(createInstanceBody.includes('!container.isConnected'), 'page lifecycle 必须检查 container.isConnected');
assert(createInstanceBody.includes('getPhoneCoreState().routeRenderToken !== renderToken'), 'page lifecycle 必须检查 route token 未过期');
assert(createInstanceBody.includes('state.currentMessageId !== expectedMessageId'), 'page lifecycle 必须检查 messageId 未漂移');
assert(createInstanceBody.includes('lifecycle,'), 'page instance 必须把 lifecycle 传给 interactions');
assertOrdered(createInstanceBody, [
    'const refreshView = () => {',
    'if (!isActive()) return;',
    'state.currentMessageId = getLastMessageId();',
    'if (!isActive()) return;',
    'renderContent();',
], 'refreshView lifecycle');

const bindBody = extractFunctionBody(
    interactions,
    'bindVariableManagerInteractions',
    /export\s+function\s+bindVariableManagerInteractions\s*\([^)]*\)\s*{/
);
assert(bindBody.includes('const runtime = createRuntimeAdapter(deps.runtime);'), 'interactions 必须复用传入 runtime');
assert(bindBody.includes('handlePageKeydown(event, page, deps, runtime);'), 'keydown 保存路径必须传入同一 runtime');
assert(bindBody.includes('bindLongPressDelete(page, deps, runtime, state, clearPress);'), '长按删除必须传入 deps/lifecycle');

assert(interactions.includes('function isVariableManagerPageAlive(page, deps = {}, expectedMessageId = null'), 'interactions 必须定义统一 active guard');
assert(interactions.includes('lifecycle.isActive(expectedMessageId)'), 'active guard 必须调用 deps.lifecycle.isActive(expectedMessageId)');
assert(interactions.includes('function showToastIfAlive(page, deps, expectedMessageId, message, isError = false'), 'interactions 必须定义 toast active helper');
assert(interactions.includes('function refreshViewIfAlive(page, deps, expectedMessageId'), 'interactions 必须定义 refresh active helper');
assert(interactions.includes('function closeDialogIfAlive(overlay, page, deps, expectedMessageId'), 'interactions 必须定义 dialog close active helper');

const handleDialogBody = extractFunctionBody(
    interactions,
    'handleDialogClick',
    /function\s+handleDialogClick\s*\([^)]*\)\s*{/
);
assert(handleDialogBody.includes('if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;'), 'dialog click 入口必须检查 active');
assertOrdered(handleDialogBody, [
    'const messageId = typeof deps.getMessageId === \'function\' ? deps.getMessageId() : null;',
    'if (!closeDialogIfAlive(overlay, page, deps, messageId, runtime)) return;',
    'if (typeof onConfirm === \'function\' && isVariableManagerPageAlive(page, deps, messageId, runtime)) onConfirm();',
], 'confirm dialog delayed lifecycle');

const handleKeydownBody = extractFunctionBody(
    interactions,
    'handlePageKeydown',
    /function\s+handlePageKeydown\s*\([^)]*\)\s*{/
);
assert(handleKeydownBody.includes('if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;'), 'keydown 入口必须检查 active');
assert(handleKeydownBody.includes('void handleSaveEdit(editCard, page, deps, runtime);'), 'keydown 保存必须复用 runtime');

const saveBody = extractFunctionBody(
    interactions,
    'doSaveEdit',
    /async\s+function\s+doSaveEdit\s*\([^)]*\)\s*{/
);
assertOrdered(saveBody, [
    'if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;',
    'const success = await setFloorVariable(messageId, path, newValue);',
    'if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;',
    "showToastIfAlive(page, deps, messageId, '变量已更新', false, runtime);",
    'refreshViewIfAlive(page, deps, messageId, runtime);',
], 'doSaveEdit lifecycle');
assert(!saveBody.includes('showToast(page,'), 'doSaveEdit 不能裸 showToast');
assert(!saveBody.includes('deps.refreshView?.();'), 'doSaveEdit 不能裸 refreshView');

const deleteBody = extractFunctionBody(
    interactions,
    'doDeleteVariables',
    /async\s+function\s+doDeleteVariables\s*\([^)]*\)\s*{/
);
assertOrdered(deleteBody, [
    'if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;',
    'const ok = await deleteFloorVariable(messageId, path);',
    'if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;',
    'exitDeleteMode(page);',
    'refreshViewIfAlive(page, deps, messageId, runtime);',
], 'doDeleteVariables lifecycle');
assert(!deleteBody.includes('showToast(page,'), 'doDeleteVariables 不能裸 showToast');
assert(!deleteBody.includes('deps.refreshView?.();'), 'doDeleteVariables 不能裸 refreshView');

const addBody = extractFunctionBody(
    interactions,
    'confirmAddVariableDialog',
    /async\s+function\s+confirmAddVariableDialog\s*\([^)]*\)\s*{/
);
assertOrdered(addBody, [
    'if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;',
    'const ok = await addFloorVariable(messageId, path, value);',
    'if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;',
    'closeDialogIfAlive(overlay, page, deps, messageId, runtime);',
    "showToastIfAlive(page, deps, messageId, '变量已添加', false, runtime);",
    'refreshViewIfAlive(page, deps, messageId, runtime);',
], 'confirmAddVariableDialog lifecycle');
assert(!addBody.includes('showToast(page,'), 'confirmAddVariableDialog 不能裸 showToast');
assert(!addBody.includes('deps.refreshView?.();'), 'confirmAddVariableDialog 不能裸 refreshView');
assert(!addBody.includes('closeDialog(overlay, runtime);'), 'confirmAddVariableDialog 不能裸 closeDialog');

const longPressBody = extractFunctionBody(
    interactions,
    'bindLongPressDelete',
    /function\s+bindLongPressDelete\s*\([^)]*\)\s*{/
);
assert(longPressBody.includes('function bindLongPressDelete(page, deps, runtime, state, clearPress)'), 'bindLongPressDelete 必须接收 deps');
assert(longPressBody.includes('if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;'), '长按 timeout 写 DOM 前必须检查 lifecycle，且不能传空 deps');
assert(!longPressBody.includes('isVariableManagerPageAlive(page, {},'), '长按 timeout 不能丢弃 deps/lifecycle');

console.log('[variable-manager-lifecycle-check] 检查通过');
console.log('- OK | variable-manager route token 显式传入页面实例');
console.log('- OK | 页面 lifecycle 组合检查 runtime、container、route token 与 messageId');
console.log('- OK | 保存、删除、新增 await 后 UI 回写受 active guard 保护');
console.log('- OK | 弹窗延迟确认、键盘保存与长按删除复用同一 lifecycle');
