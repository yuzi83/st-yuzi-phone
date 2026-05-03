const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function loadPromptEditor() {
    return import(toModuleUrl('modules/settings-app/pages/prompt-editor.js'));
}

function createGetPreset(names = []) {
    const presetNames = new Set(names.map((name) => String(name || '').trim()).filter(Boolean));
    return (name) => {
        const safeName = String(name || '').trim();
        return presetNames.has(safeName) ? { name: safeName } : null;
    };
}

async function testNewPresetBlocksExistingName() {
    const editor = await loadPromptEditor();
    const result = editor.resolvePromptEditorNameConflict({
        isNew: true,
        name: 'Alpha',
        originalName: '',
        getPreset: createGetPreset(['Alpha']),
    });

    assert.equal(result.conflict, true);
    assert.equal(result.message, '预设名称已存在');
    assert.equal(result.presetName, 'Alpha');
}

async function testEditingSameNameDoesNotConflict() {
    const editor = await loadPromptEditor();
    const result = editor.resolvePromptEditorNameConflict({
        isNew: false,
        name: 'Alpha',
        originalName: 'Alpha',
        getPreset: createGetPreset(['Alpha', 'Beta']),
    });

    assert.deepEqual(result, { conflict: false });
}

async function testEditingRenameToMissingNameDoesNotConflict() {
    const editor = await loadPromptEditor();
    const result = editor.resolvePromptEditorNameConflict({
        isNew: false,
        name: 'Gamma',
        originalName: 'Alpha',
        getPreset: createGetPreset(['Alpha', 'Beta']),
    });

    assert.deepEqual(result, { conflict: false });
}

async function testEditingRenameToExistingNameIsBlocked() {
    const editor = await loadPromptEditor();
    const result = editor.resolvePromptEditorNameConflict({
        isNew: false,
        name: 'Beta',
        originalName: 'Alpha',
        getPreset: createGetPreset(['Alpha', 'Beta']),
    });

    assert.equal(result.conflict, true);
    assert.equal(result.presetName, 'Beta');
    assert.equal(result.originalName, 'Alpha');
    assert.match(result.message, /不能将预设/);
    assert.match(result.message, /Alpha/);
    assert.match(result.message, /Beta/);
}

async function testEditingWithoutOriginalNameBlocksExistingName() {
    const editor = await loadPromptEditor();
    const result = editor.resolvePromptEditorNameConflict({
        isNew: false,
        name: 'Beta',
        originalName: '',
        getPreset: createGetPreset(['Beta']),
    });

    assert.equal(result.conflict, true);
    assert.equal(result.message, '已存在同名预设：Beta');
    assert.equal(result.presetName, 'Beta');
}

async function testGetPresetFailureDoesNotCrash() {
    const editor = await loadPromptEditor();
    const result = editor.resolvePromptEditorNameConflict({
        isNew: false,
        name: 'Beta',
        originalName: 'Alpha',
        getPreset: () => {
            throw new Error('preset repository unavailable');
        },
    });

    assert.deepEqual(result, { conflict: false });
}

async function main() {
    const tests = [
        ['新建预设阻止已有名称', testNewPresetBlocksExistingName],
        ['编辑同名预设不误判冲突', testEditingSameNameDoesNotConflict],
        ['编辑改名到不存在名称允许保存', testEditingRenameToMissingNameDoesNotConflict],
        ['编辑改名到已有名称前置阻止', testEditingRenameToExistingNameIsBlocked],
        ['编辑模式缺失原名时阻止覆盖已有名称', testEditingWithoutOriginalNameBlocksExistingName],
        ['getPreset 异常时不让页面崩溃', testGetPresetFailureDoesNotCrash],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[prompt-editor-rename-conflict-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[prompt-editor-rename-conflict-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
