const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testBlockedKeywordSettingsHaveDatabaseDefaultsAndNormalizeEdits() {
    const {
        defaultSettings,
        normalizeWorldbookReadingBlockedKeywordsSettings,
    } = await importModule('modules/settings/schema.js');
    const expectedDefaults = [
        '规则',
        '思维链',
        'cot',
                '变量',
        '状态',
        'Status',
        'Rule',
        'rule',
        '检定',
        '判断',
        '叙事',
        '文风',
        'InitVar',
        '格式',
    ];

    assert.deepEqual(defaultSettings.worldbookReadingBlockedKeywords, expectedDefaults);
    assert.deepEqual(normalizeWorldbookReadingBlockedKeywordsSettings(undefined), expectedDefaults);
    assert.deepEqual(normalizeWorldbookReadingBlockedKeywordsSettings([
        ' MVU ',
        '规则',
            '',
        '  ',
        '自定义阶段',
    ]), ['MVU', '规则', '自定义阶段']);
    assert.deepEqual(normalizeWorldbookReadingBlockedKeywordsSettings([]), []);
}

async function main() {
    await testBlockedKeywordSettingsHaveDatabaseDefaultsAndNormalizeEdits();
    console.log('[worldbook-reading-blocked-keywords-contract] passed');
}

main().catch((error) => {
    console.error('[worldbook-reading-blocked-keywords-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
