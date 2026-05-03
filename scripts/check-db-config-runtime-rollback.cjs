const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = 'modules/settings-app/services/db-config-runtime.js';
const source = fs.readFileSync(path.join(root, file), 'utf8');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractFunctionBody(name, pattern) {
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

const normalizeBody = extractFunctionBody(
    'normalizeWriteResult',
    /const\s+normalizeWriteResult\s*=\s*\([^)]*\)\s*=>\s*{/
);
assert(normalizeBody.includes('ok: result.ok === true,'), '写入结果归一化必须严格按 result.ok === true 判断成功');
assert(normalizeBody.includes("ok: false,"), '非对象写入结果不能被误判为成功');

const rollbackMessageBody = extractFunctionBody(
    'buildRollbackFailureMessage',
    /const\s+buildRollbackFailureMessage\s*=\s*\([^)]*\)\s*=>\s*{/
);
assert(rollbackMessageBody.includes('更新配置回滚失败'), 'rollback 失败详情必须包含更新配置回滚失败 fallback');
assert(rollbackMessageBody.includes('手动表选择回滚失败'), 'rollback 失败详情必须包含手动表选择回滚失败 fallback');

const rollbackBody = extractFunctionBody(
    'rollbackDbSnapshot',
    /const\s+rollbackDbSnapshot\s*=\s*\([^)]*\)\s*=>\s*{/
);
assertOrdered(rollbackBody, [
    'const normalized = normalizeDbConfigSnapshot(snapshot);',
    'const updateResult = normalizeWriteResult(',
    'writeDbUpdateConfigViaApi(normalized.updateConfig)',
], 'rollbackDbSnapshot 必须先恢复 update 配置并记录结果');
assertOrdered(rollbackBody, [
    'const manualResult = normalized.manualSelection.hasManualSelection',
    'writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables)',
    'clearManualTableSelectionViaApi()',
], 'rollbackDbSnapshot 必须按原手动选择状态恢复 manual 配置并记录结果');
assert(rollbackBody.includes('const ok = updateResult.ok && manualResult.ok;'), 'rollbackDbSnapshot 必须汇总 update/manual 两步成功状态');
assert(rollbackBody.includes('updateResult,'), 'rollbackDbSnapshot 必须返回 updateResult');
assert(rollbackBody.includes('manualResult,'), 'rollbackDbSnapshot 必须返回 manualResult');
assert(rollbackBody.includes("message: ok ? '数据库配置已回滚' : buildRollbackFailureMessage({ updateResult, manualResult }),"), 'rollbackDbSnapshot 必须返回回滚失败详情 message');

const applyBody = extractFunctionBody(
    'applyDbSnapshot',
    /const\s+applyDbSnapshot\s*=\s*\([^)]*\)\s*=>\s*{/
);
assertOrdered(applyBody, [
    'const updateWrite = normalizeWriteResult(',
    'if (!updateWrite.ok) {',
    'return {',
    'message: updateWrite.message || \'更新配置写入失败\'',
], 'applyDbSnapshot update 写失败时必须直接失败且不回滚');
assertOrdered(applyBody, [
    'const manualWrite = normalized.manualSelection.hasManualSelection',
    'if (!manualWrite.ok) {',
    'const rollbackResult = rollbackSnapshot ? rollbackDbSnapshot(rollbackSnapshot) : null;',
    'const baseMessage = manualWrite.message || \'手动更新表选择写入失败\';',
], 'applyDbSnapshot manual 写失败时必须执行并检查 rollback');
assert(applyBody.includes('if (rollbackResult && !rollbackResult.ok) {'), 'applyDbSnapshot 必须检查 rollbackResult.ok');
assert(applyBody.includes('回滚也失败，当前配置可能部分写入'), 'applyDbSnapshot 必须暴露半应用风险文案');
assert(applyBody.includes('rollbackResult,'), 'applyDbSnapshot 失败返回必须保留 rollbackResult 供未来调用方诊断');
assert(!/if \(!manualWrite\.ok\) \{\s*if \(rollbackSnapshot\) \{\s*rollbackDbSnapshot\(rollbackSnapshot\);\s*\}/m.test(applyBody), 'applyDbSnapshot 不能恢复静默 rollback 旧写法');

assert(
    source.includes('showToast(toastHost, `切换失败：${applied.message}`, true);'),
    'switchPresetByName 必须继续把 applied.message 暴露给 UI toast',
);

console.log('[db-config-runtime-rollback-check] 检查通过');
console.log('- OK | rollbackDbSnapshot 返回 update/manual 分步结果');
console.log('- OK | applyDbSnapshot 检查 rollback.ok 并暴露半应用风险');
console.log('- OK | switchPresetByName 通过 applied.message 向 UI 暴露失败详情');
