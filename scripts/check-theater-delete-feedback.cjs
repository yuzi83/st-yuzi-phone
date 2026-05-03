const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    deleteService: 'modules/phone-theater/delete-service.js',
    interactions: 'modules/phone-theater/interactions.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractFunctionBody(source, name, pattern) {
    const match = pattern.exec(source);
    assert(match, `未找到 ${name}`);

    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        index += 1;
    }

    assert(depth === 0, `${name} 函数体括号不平衡`);
    return source.slice(match.index, index);
}

function assertOrdered(haystack, tokens, label) {
    let cursor = -1;
    for (const token of tokens) {
        const next = haystack.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    }
}

const sources = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

const deleteService = sources.deleteService;
const interactions = sources.interactions;

const deleteBody = extractFunctionBody(
    deleteService,
    'deleteTheaterEntities',
    /export\s+async\s+function\s+deleteTheaterEntities\s*\([^)]*\)\s*{/
);
assertOrdered(deleteBody, [
    'const refreshed = await refreshPhoneTableProjection();',
    'message: refreshed ? `已删除 ${removedCount} 条相关数据` : `已删除 ${removedCount} 条相关数据，但刷新投影失败`,',
    'refreshed,',
], 'deleteTheaterEntities 必须返回投影刷新状态和失败文案');

assert(
    interactions.includes('function showToastIfActive(container, options, message, isError = false)'),
    'interactions 必须保留 showToastIfActive 的 isError 参数',
);

const executeBody = extractFunctionBody(
    interactions,
    'executeConfirmedDelete',
    /async\s+function\s+executeConfirmedDelete\s*\([^)]*\)\s*{/
);
assertOrdered(executeBody, [
    'if (result?.ok) {',
    'state.deleteManageMode = false;',
    'state.selectedKeys.clear();',
    'requestRenderIfActive(container, options);',
    "showToastIfActive(container, options, result.message || '删除完成', result.refreshed === false);",
    'return;',
], 'executeConfirmedDelete 成功删除但投影刷新失败时必须使用异常样式');
assert(
    !executeBody.includes("showToastIfActive(container, options, result.message || '删除完成', false);"),
    'executeConfirmedDelete 不能固定用成功样式展示删除完成',
);
assertOrdered(executeBody, [
    'requestRenderIfActive(container, options);',
    "showToastIfActive(container, options, result?.message || '删除失败', true);",
], 'executeConfirmedDelete 删除失败仍必须使用错误样式');

console.log('[theater-delete-feedback-check] 检查通过');
console.log('- OK | 小剧场删除服务返回 refreshed 和刷新失败文案');
console.log('- OK | 小剧场删除交互根据 result.refreshed === false 选择异常样式');
