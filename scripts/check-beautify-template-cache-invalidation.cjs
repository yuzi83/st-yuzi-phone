const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    cache: 'modules/phone-beautify-templates/cache.js',
    repository: 'modules/phone-beautify-templates/repository.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function count(content, snippet) {
    return content.split(snippet).length - 1;
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
    const cache = read(FILES.cache);
    const repository = read(FILES.repository);
    const results = [];

    const resetDerivedCache = extractNamedFunction(cache, 'resetDerivedCache');
    const sourceRuntimeGetter = extractNamedFunction(cache, 'getCachedBeautifyTemplateSourceRuntime');
    const settingHelper = extractNamedFunction(repository, 'saveBeautifyTemplateSettingAndInvalidate');
    const setSourceMode = extractNamedFunction(repository, 'setBeautifyTemplateSourceMode');
    const getGenericActive = extractNamedFunction(repository, 'getActiveBeautifyTemplateIdByType');
    const getSpecialActive = extractNamedFunction(repository, 'getActiveBeautifyTemplateIdsForSpecial');
    const repairActive = extractNamedFunction(repository, 'repairActiveBeautifyTemplateSettings');
    const setActive = extractNamedFunction(repository, 'setActiveBeautifyTemplateIdByType');

    check(results, 'cache', 'derived cache 维护 generation 字段', has(cache, 'generation: 0,'));
    check(results, 'cache', 'resetDerivedCache 每次失效递增 generation', has(resetDerivedCache, 'derivedCache.generation += 1;'));
    check(results, 'cache', 'sourceRuntime producer 前捕获 generation', has(sourceRuntimeGetter, 'const generationBeforeProducer = derivedCache.generation;'));
    check(results, 'cache', 'sourceRuntime producer 后只有 generation 未变化才写旧 key', has(sourceRuntimeGetter, 'if (derivedCache.generation === generationBeforeProducer)') && has(sourceRuntimeGetter, 'derivedCache.sourceRuntime.set(safeKey, clonedResult);'));
    check(results, 'cache', 'sourceRuntime producer 期间失效后直接返回结果且不缓存旧 key', has(sourceRuntimeGetter, 'return clonedResult;'));

    check(results, 'repository', 'repository 定义统一模板设置写入并失效 helper', has(repository, 'function saveBeautifyTemplateSettingAndInvalidate(settingKey, value)') && has(settingHelper, 'savePhoneSetting(settingKey, value);') && has(settingHelper, 'invalidatePhoneBeautifyTemplateCache();'));
    check(results, 'repository', 'repository 中只有统一 helper 直接调用 savePhoneSetting', count(repository, 'savePhoneSetting(') === 1);
    check(results, 'repository', 'source mode 写入走统一失效 helper', has(setSourceMode, 'saveBeautifyTemplateSettingAndInvalidate(settingKey, normalized);'));
    check(results, 'repository', 'generic active getter 保留 fallback 返回但不再写入设置', has(getGenericActive, "return options.withFallback === false ? '' : getDefaultGenericTemplateId();") && !has(getGenericActive, 'saveBeautifyTemplateSettingAndInvalidate('));
    check(results, 'repository', 'special active getter 保留 fallback 返回但不再写入设置', has(getSpecialActive, 'return merged;') && !has(getSpecialActive, 'saveBeautifyTemplateSettingAndInvalidate('));
    check(results, 'repository', '显式 active repair 定义独立函数', has(repository, 'export function repairActiveBeautifyTemplateSettings()'));
    check(results, 'repository', 'generic active 显式 repair 写入走统一失效 helper', has(repairActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, nextGenericId);'));
    check(results, 'repository', 'special active 显式 repair 写入走统一失效 helper', has(repairActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextSpecialMap);'));
    check(results, 'repository', 'generic active 显式启用写入走统一失效 helper', has(setActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, safeTemplateId);'));
    check(results, 'repository', 'special active 显式启用写入走统一失效 helper', has(setActive, 'saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextMap);'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[beautify-template-cache-invalidation-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[beautify-template-cache-invalidation-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
