const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    repository: 'modules/phone-beautify-templates/repository.js',
    beautifyBehavior: 'modules/settings-app/pages/beautify-behavior.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingParen(content, openParenIndex) {
    let depth = 0;
    for (let i = openParenIndex; i < content.length; i += 1) {
        const ch = content[i];
        if (ch === '(') depth += 1;
        if (ch === ')') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function extractNamedFunction(content, functionName) {
    const declarationPattern = new RegExp(`(?:export\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\(`);
    const match = declarationPattern.exec(content);
    if (!match) return '';

    const declarationStart = match.index;
    const openParenIndex = declarationStart + match[0].length - 1;
    const closeParenIndex = findMatchingParen(content, openParenIndex);
    if (closeParenIndex < 0) return '';

    const bodyStart = content.indexOf('{', closeParenIndex + 1);
    if (bodyStart < 0) return '';

    let depth = 0;
    for (let i = bodyStart; i < content.length; i += 1) {
        const ch = content[i];
        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return content.slice(declarationStart, i + 1);
            }
        }
    }

    return '';
}

function main() {
    const repository = read(FILES.repository);
    const beautifyBehavior = read(FILES.beautifyBehavior);
    const results = [];

    const deleteTemplate = extractNamedFunction(repository, 'deletePhoneBeautifyUserTemplate');
    const cleanupActive = extractNamedFunction(repository, 'cleanupActiveSettingsForDeletedTemplate');

    check(results, 'repository', '删除模板前捕获 removedTemplate 元数据', has(deleteTemplate, 'const removedTemplate = store.templates.find((template) => template.id === safeId) || null;'));
    check(results, 'repository', '删除模板继续清理 store bindings', has(deleteTemplate, 'delete nextBindings[sheetKey];'));
    check(results, 'repository', '删除 store 后立即失效模板缓存', has(deleteTemplate, 'saveTemplateStore({') && has(deleteTemplate, 'invalidatePhoneBeautifyTemplateCache();'));
    check(results, 'repository', '删除 store 后执行 active 设置清理', has(deleteTemplate, 'const activeCleanup = cleanupActiveSettingsForDeletedTemplate(removedTemplate);'));
    check(results, 'repository', '删除结果返回 templateType 供设置页刷新', has(deleteTemplate, 'templateType: normalizeTemplateType(removedTemplate?.templateType, \'\'),'));
    check(results, 'repository', '删除结果返回 rendererKey 供 special active 诊断', has(deleteTemplate, 'rendererKey: normalizeString(removedTemplate?.render?.rendererKey, 48),'));
    check(results, 'repository', '删除结果返回 activeSettingsUpdated', has(deleteTemplate, 'activeSettingsUpdated: activeCleanup.activeSettingsUpdated,'));

    check(results, 'repository', 'active 清理 helper 处理 generic 模板类型', has(cleanupActive, 'safeType === PHONE_TEMPLATE_TYPE_GENERIC'));
    check(results, 'repository', 'generic active 只有指向被删除模板时才写设置', has(cleanupActive, 'if (currentActiveId !== safeDeletedId)'));
    check(results, 'repository', 'generic active 清理走统一保存并失效 helper', has(cleanupActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, nextActiveId);'));
    check(results, 'repository', 'generic active fallback 排除被删除模板 id', has(cleanupActive, 'resolveActiveCleanupValue(safeDeletedId, getDefaultGenericTemplateId())'));

    check(results, 'repository', 'active 清理 helper 处理 special 模板类型', has(cleanupActive, 'safeType === PHONE_TEMPLATE_TYPE_SPECIAL'));
    check(results, 'repository', 'special active 只处理值等于被删除 id 的 rendererKey', has(cleanupActive, 'if (activeTemplateId !== safeDeletedId) return;'));
    check(results, 'repository', 'special active fallback 按 rendererKey 计算', has(cleanupActive, 'getDefaultSpecialTemplateIdByRenderer(rendererKey)'));
    check(results, 'repository', 'special active 无 fallback 时移除对应 rendererKey', has(cleanupActive, 'delete nextMap[rendererKey];'));
    check(results, 'repository', 'special active 清理走统一保存并失效 helper', has(cleanupActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextMap);'));

    check(results, 'beautifyBehavior', '设置页删除刷新不再使用不存在的 target.type', !has(beautifyBehavior, 'target?.type'));
    check(results, 'beautifyBehavior', '设置页删除刷新优先使用删除结果 templateType', has(beautifyBehavior, 'buildTemplateTypeRefreshPlan(result.templateType || target?.templateType'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[beautify-template-delete-active-cleanup-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[beautify-template-delete-active-cleanup-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
