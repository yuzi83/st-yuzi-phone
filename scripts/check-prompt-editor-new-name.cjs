const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function loadIntentModule() {
    return import(toModuleUrl('modules/settings-app/intent.js'));
}

function createGetPreset(names = []) {
    const presetNames = new Set(names.map((name) => String(name || '').trim()).filter(Boolean));
    return (name) => {
        const safeName = String(name || '').trim();
        return presetNames.has(safeName) ? { name: safeName } : null;
    };
}

async function testKeepsBaseNameWhenAvailable() {
    const intent = await loadIntentModule();
    const result = intent.resolveUniquePromptEditorPresetName('默认实时回复预设', createGetPreset([]));

    assert.equal(result, '默认实时回复预设');
}

async function testGeneratesNextNameWhenDefaultExists() {
    const intent = await loadIntentModule();
    const result = intent.resolveUniquePromptEditorPresetName('默认实时回复预设', createGetPreset(['默认实时回复预设']));

    assert.equal(result, '默认实时回复预设 (2)');
}

async function testSkipsExistingNumberedNames() {
    const intent = await loadIntentModule();
    const result = intent.resolveUniquePromptEditorPresetName('默认实时回复预设', createGetPreset([
        '默认实时回复预设',
        '默认实时回复预设 (2)',
        '默认实时回复预设 (3)',
    ]));

    assert.equal(result, '默认实时回复预设 (4)');
}

async function testBlankBaseNameFallsBackToUnnamedPreset() {
    const intent = await loadIntentModule();
    const result = intent.resolveUniquePromptEditorPresetName('   ', createGetPreset(['未命名预设']));

    assert.equal(result, '未命名预设 (2)');
}

async function testGetPresetFailureDoesNotCrash() {
    const intent = await loadIntentModule();
    const result = intent.resolveUniquePromptEditorPresetName('默认实时回复预设', () => {
        throw new Error('preset store unavailable');
    });

    assert.equal(result, '默认实时回复预设');
}

function testPromptEditorIntentUsesUniqueNameForNewPreset() {
    const sourcePath = path.join(ROOT, 'modules/settings-app/intent.js');
    const source = fs.readFileSync(sourcePath, 'utf8');

    assert.ok(
        source.includes('export function resolveUniquePromptEditorPresetName('),
        '缺少导出的兼容编辑器唯一命名 helper',
    );
    assert.ok(
        /const\s+promptEditorName\s*=\s*targetPresetName\s*\?\s*String\(preset\?\.name\s*\|\|\s*targetPresetName\)\.trim\(\)\s*:\s*resolveUniquePromptEditorPresetName\(preset\?\.name,\s*getPhoneAiInstructionPreset\);/s.test(source),
        'prompt_editor 无目标新建分支未使用唯一命名 helper，或带目标路径被错误改名',
    );
    assert.ok(
        /patch\.promptEditorOriginalName\s*=\s*targetPresetName\s*\?\s*String\(preset\?\.name\s*\|\|\s*''\)\.trim\(\)\s*:\s*promptEditorName;/s.test(source),
        '新建兼容编辑器 originalName 未与生成的唯一名称保持一致',
    );
    assert.ok(
        source.includes('patch.promptEditorIsNew = !preset || !targetPresetName;'),
        '新建/编辑判定契约已被意外改动',
    );
}

async function main() {
    const tests = [
        ['默认名可用时保持原名', testKeepsBaseNameWhenAvailable],
        ['默认名已存在时生成后缀名', testGeneratesNextNameWhenDefaultExists],
        ['多重冲突时递增到首个可用名称', testSkipsExistingNumberedNames],
        ['空基础名回退到未命名预设并继续避让冲突', testBlankBaseNameFallsBackToUnnamedPreset],
        ['查询预设失败时不让 intent 崩溃', testGetPresetFailureDoesNotCrash],
        ['prompt_editor 新建分支接入唯一命名 helper', testPromptEditorIntentUsesUniqueNameForNewPreset],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[prompt-editor-new-name-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[prompt-editor-new-name-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
