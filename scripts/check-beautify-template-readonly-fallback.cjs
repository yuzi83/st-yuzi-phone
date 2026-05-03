const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    repository: 'modules/phone-beautify-templates/repository.js',
    matcher: 'modules/phone-beautify-templates/matcher.js',
    beautifyPage: 'modules/settings-app/pages/beautify.js',
    index: 'index.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function normalizeLineEndings(value) {
    return String(value).replace(/\r\n?/g, '\n');
}

function has(content, snippet) {
    return normalizeLineEndings(content).includes(normalizeLineEndings(snippet));
}

function count(content, snippet) {
    return normalizeLineEndings(content).split(normalizeLineEndings(snippet)).length - 1;
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
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];
    const detectSpecial = extractNamedFunction(contents.matcher, 'detectSpecialTemplateForTable');
    const detectGeneric = extractNamedFunction(contents.matcher, 'detectGenericTemplateForTable');
    const renderBeautify = extractNamedFunction(contents.beautifyPage, 'renderBeautifyTemplatePage');
    const sourceRuntime = extractNamedFunction(contents.repository, 'getBeautifyTemplateSourceModeRuntime');
    const getGenericActive = extractNamedFunction(contents.repository, 'getActiveBeautifyTemplateIdByType');
    const getSpecialActive = extractNamedFunction(contents.repository, 'getActiveBeautifyTemplateIdsForSpecial');
    const repairActive = extractNamedFunction(contents.repository, 'repairActiveBeautifyTemplateSettings');
    const doInitialize = extractNamedFunction(contents.index, 'doInitialize');

    check(results, 'repository', 'repository 暴露显式 active repair 函数', has(contents.repository, 'export function repairActiveBeautifyTemplateSettings()'));
    check(results, 'repository', 'generic active getter 不再写入设置', !has(getGenericActive, 'saveBeautifyTemplateSettingAndInvalidate('));
    check(results, 'repository', 'special active getter 不再写入设置', !has(getSpecialActive, 'saveBeautifyTemplateSettingAndInvalidate('));
    check(results, 'repository', '显式 repair 处理 generic active 设置写入', has(repairActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, nextGenericId);'));
    check(results, 'repository', '显式 repair 处理 special active 设置写入', has(repairActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextSpecialMap);'));
    check(results, 'repository', 'source runtime 读 special active fallback 时不持久化', has(sourceRuntime, 'const activeMap = getActiveBeautifyTemplateIdsForSpecial({\n                    withFallback: true,\n                    persist: false,\n                });'));
    check(results, 'repository', 'source runtime 读 generic active fallback 时不持久化', has(sourceRuntime, "const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {\n                    withFallback: true,\n                    persist: false,\n                });"));
    check(results, 'repository', 'source runtime 内不再出现 persist: true', !has(sourceRuntime, 'persist: true'));

    check(results, 'matcher', 'special matcher 读取 active fallback 时不持久化', has(contents.matcher, 'const activeMap = getActiveBeautifyTemplateIdsForSpecial({\n        withFallback: true,\n        persist: false,\n    });'));
    check(results, 'matcher', 'generic matcher 读取 active fallback 时不持久化', has(contents.matcher, "const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {\n        withFallback: true,\n        persist: false,\n    });"));
    check(results, 'matcher', 'matcher 读路径不再出现 persist: true', !has(contents.matcher, 'persist: true'));

    check(results, 'beautifyPage', 'beautify 页面渲染读取 special fallback 时不持久化', has(renderBeautify, 'const activeSpecialMap = getActiveBeautifyTemplateIdsForSpecial({\n        withFallback: true,\n        persist: false,\n    });'));
    check(results, 'beautifyPage', 'beautify 页面渲染读取 generic fallback 时不持久化', has(renderBeautify, "const activeGenericTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {\n        withFallback: true,\n        persist: false,\n    });"));
    check(results, 'beautifyPage', 'beautify 页面渲染读路径不再出现 persist: true', !has(renderBeautify, 'persist: true'));

    check(results, 'index', '入口导入显式 active repair', has(contents.index, "import { repairActiveBeautifyTemplateSettings } from './modules/phone-beautify-templates/repository.js';"));
    check(results, 'index', '初始化流程调用显式 active repair', has(doInitialize, 'repairActiveBeautifyTemplateSettings();'));
    check(results, 'index', '初始化流程只调用一次 active repair', count(doInitialize, 'repairActiveBeautifyTemplateSettings();') === 1);

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[beautify-template-readonly-fallback-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[beautify-template-readonly-fallback-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
