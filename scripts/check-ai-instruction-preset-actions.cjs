const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createPreset(name, overrides = {}) {
    return {
        name,
        description: `${name} description`,
        mediaMarkers: {
            imagePrefix: '[图片]',
            videoPrefix: '[视频]',
        },
        promptGroup: [
            {
                id: `${name}-seg-1`,
                name: `${name} 片段 1`,
                role: 'system',
                content: `${name} content`,
                deletable: true,
                mainSlot: '',
            },
        ],
        ...overrides,
    };
}

function createHarness(overrides = {}) {
    const logs = {
        toasts: [],
        downloads: [],
        rerenders: 0,
        saveCalls: [],
        deleteCalls: [],
        importCalls: [],
        applyCalls: [],
        confirms: [],
    };

    const presetMap = new Map(Object.entries({
        Alpha: createPreset('Alpha'),
        Beta: createPreset('Beta'),
        Imported: createPreset('Imported'),
        Remaining: createPreset('Remaining'),
        ...(overrides.presets || {}),
    }));

    const state = {
        aiInstructionSelectedPresetName: 'Alpha',
        aiInstructionDraftName: 'Alpha',
        aiInstructionDraftOriginalName: 'Alpha',
        aiInstructionDraftImagePrefix: '[图片]',
        aiInstructionDraftVideoPrefix: '[视频]',
        aiInstructionDraftPromptGroup: [
            {
                id: 'alpha-seg-1',
                name: 'Alpha 片段 1',
                role: 'system',
                content: 'Alpha content',
                deletable: true,
                mainSlot: '',
            },
        ],
        ...(overrides.state || {}),
    };

    const deps = {
        container: {},
        state,
        currentPresetName: overrides.currentPresetName || 'CurrentPreset',
        selectedPresetName: overrides.selectedPresetName || state.aiInstructionSelectedPresetName,
        safeRerender: () => {
            logs.rerenders += 1;
        },
        createDefaultPhoneAiInstructionPreset: overrides.createDefaultPhoneAiInstructionPreset || ((options = {}) => {
            const nextName = String(options.name || '默认实时回复预设').trim() || '默认实时回复预设';
            return createPreset(nextName, {
                mediaMarkers: {
                    imagePrefix: '[默认图片]',
                    videoPrefix: '[默认视频]',
                },
            });
        }),
        savePhoneAiInstructionPreset: (payload, options) => {
            logs.saveCalls.push({ payload, options });
            if (typeof overrides.savePhoneAiInstructionPreset === 'function') {
                return overrides.savePhoneAiInstructionPreset(payload, options);
            }
            return { success: true, presetName: payload.name, message: '保存成功（测试）' };
        },
        showConfirmDialog: (...args) => {
            logs.confirms.push(args);
            const onConfirm = args[3];
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
        },
        showToast: (_container, message, isError = false) => {
            logs.toasts.push({ message, isError });
        },
        downloadTextFile: (...args) => {
            logs.downloads.push(args);
        },
        getPhoneAiInstructionPreset: (name) => presetMap.get(String(name || '').trim()) || null,
        setCurrentPhoneAiInstructionPresetName: (name) => {
            logs.applyCalls.push(name);
            if (typeof overrides.setCurrentPhoneAiInstructionPresetName === 'function') {
                return overrides.setCurrentPhoneAiInstructionPresetName(name);
            }
            return { success: true, message: '应用成功（测试）' };
        },
        deletePhoneAiInstructionPreset: (name) => {
            logs.deleteCalls.push(name);
            if (typeof overrides.deletePhoneAiInstructionPreset === 'function') {
                return overrides.deletePhoneAiInstructionPreset(name);
            }
            return { success: true, presetName: 'Remaining', message: '删除成功（测试）' };
        },
        importPhoneAiInstructionPresetsFromData: (text, options) => {
            logs.importCalls.push({ text, options });
            if (typeof overrides.importPhoneAiInstructionPresetsFromData === 'function') {
                return overrides.importPhoneAiInstructionPresetsFromData(text, options);
            }
            return { success: true, presetNames: ['Imported'], currentPresetName: '', message: '导入成功（测试）' };
        },
        exportPhoneAiInstructionPresetPack: (name) => {
            logs.exportSingleName = name;
            if (typeof overrides.exportPhoneAiInstructionPresetPack === 'function') {
                return overrides.exportPhoneAiInstructionPresetPack(name);
            }
            return { presetName: name, exported: true };
        },
        exportAllPhoneAiInstructionPresetsPack: () => {
            logs.exportAllCalled = true;
            if (typeof overrides.exportAllPhoneAiInstructionPresetsPack === 'function') {
                return overrides.exportAllPhoneAiInstructionPresetsPack();
            }
            return { exportedAll: true };
        },
    };

    return {
        logs,
        state,
        presetMap,
        deps,
    };
}

function testSwitchPreset(factory) {
    const harness = createHarness();
    const actions = factory(harness.deps);

    actions.switchPreset('Beta');

    assert.equal(harness.state.aiInstructionSelectedPresetName, 'Beta');
    assert.equal(harness.state.aiInstructionDraftName, 'Beta');
    assert.equal(harness.state.aiInstructionDraftOriginalName, 'Beta');
    assert.equal(harness.state.aiInstructionDraftPromptGroup[0].id, 'Beta-seg-1');
    assert.equal(harness.logs.rerenders, 1);
}

function testSavePreset(factory) {
    const harness = createHarness({
        state: {
            aiInstructionDraftName: 'Gamma',
            aiInstructionDraftOriginalName: 'Alpha',
        },
    });
    const actions = factory(harness.deps);

    actions.savePreset({
        originalName: 'Alpha',
        overwrite: true,
    });

    assert.equal(harness.logs.saveCalls.length, 1);
    assert.equal(harness.logs.saveCalls[0].payload.name, 'Gamma');
    assert.equal(harness.logs.saveCalls[0].options.originalName, 'Alpha');
    assert.equal(harness.logs.saveCalls[0].options.overwrite, true);
    assert.equal(harness.logs.saveCalls[0].options.switchTo, false);
    assert.equal(harness.state.aiInstructionSelectedPresetName, 'Gamma');
    assert.equal(harness.state.aiInstructionDraftOriginalName, 'Gamma');
    assert.equal(harness.state.aiInstructionDraftName, 'Gamma');
    assert.equal(harness.logs.toasts.at(-1).message, '保存成功（测试）');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
    assert.equal(harness.logs.rerenders, 1);
}

function testSaveAsPreset(factory) {
    const harness = createHarness({
        state: {
            aiInstructionDraftName: 'Gamma Copy',
        },
        savePhoneAiInstructionPreset: () => {
            return { success: true, presetName: 'Gamma Copy' };
        },
    });
    const actions = factory(harness.deps);

    actions.savePreset({
        originalName: '',
        overwrite: false,
    });

    assert.equal(harness.logs.saveCalls.length, 1);
    assert.equal(harness.logs.saveCalls[0].options.overwrite, false);
    assert.equal(harness.state.aiInstructionSelectedPresetName, 'Gamma Copy');
    assert.equal(harness.logs.toasts.at(-1).message, '已另存为新预设');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
    assert.equal(harness.logs.rerenders, 1);
}

function testApplyPreset(factory) {
    const harness = createHarness({
        state: {
            aiInstructionSelectedPresetName: 'Beta',
        },
    });
    const actions = factory(harness.deps);

    actions.applyPreset();

    assert.deepEqual(harness.logs.applyCalls, ['Beta']);
    assert.equal(harness.logs.toasts.at(-1).message, '当前实时回复预设已切换为：Beta');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
    assert.equal(harness.logs.rerenders, 1);
}

async function testImportPresetFile(factory) {
    const harness = createHarness();
    const actions = factory(harness.deps);
    const file = {
        async text() {
            return '{"hello":"world"}';
        },
    };

    await actions.importPresetFile(file);

    assert.equal(harness.logs.importCalls.length, 1);
    assert.equal(harness.logs.importCalls[0].text, '{"hello":"world"}');
    assert.equal(harness.logs.importCalls[0].options.overwrite, true);
    assert.equal(harness.logs.importCalls[0].options.switchTo, false);
    assert.equal(harness.state.aiInstructionSelectedPresetName, 'Imported');
    assert.equal(harness.state.aiInstructionDraftName, 'Imported');
    assert.equal(harness.logs.toasts.at(-1).message, '导入成功（测试）');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
    assert.equal(harness.logs.rerenders, 1);
}

function testDeletePreset(factory) {
    const harness = createHarness({
        state: {
            aiInstructionSelectedPresetName: 'Alpha',
        },
    });
    const actions = factory(harness.deps);

    actions.deletePreset();

    assert.equal(harness.logs.confirms.length, 1);
    assert.deepEqual(harness.logs.deleteCalls, ['Alpha']);
    assert.equal(harness.state.aiInstructionSelectedPresetName, 'Remaining');
    assert.equal(harness.state.aiInstructionDraftName, 'Remaining');
    assert.equal(harness.logs.toasts.at(-1).message, '删除成功（测试）');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
    assert.equal(harness.logs.rerenders, 1);
}

function testResetPresetDraft(factory) {
    const harness = createHarness({
        state: {
            aiInstructionDraftName: 'Reset Target',
            aiInstructionDraftImagePrefix: 'old-image',
            aiInstructionDraftVideoPrefix: 'old-video',
            aiInstructionDraftPromptGroup: [
                {
                    id: 'old-seg',
                    name: 'old',
                    role: 'user',
                    content: 'old content',
                    deletable: true,
                    mainSlot: '',
                },
            ],
        },
        createDefaultPhoneAiInstructionPreset: ({ name } = {}) => createPreset(name || 'Reset Target', {
            mediaMarkers: {
                imagePrefix: '[重置图片]',
                videoPrefix: '[重置视频]',
            },
            promptGroup: [
                {
                    id: 'reset-seg-1',
                    name: '重置片段',
                    role: 'system',
                    content: 'reset content',
                    deletable: true,
                    mainSlot: '',
                },
            ],
        }),
    });
    const actions = factory(harness.deps);

    actions.resetPresetDraft();

    assert.equal(harness.state.aiInstructionDraftImagePrefix, '[重置图片]');
    assert.equal(harness.state.aiInstructionDraftVideoPrefix, '[重置视频]');
    assert.equal(harness.state.aiInstructionDraftPromptGroup[0].id, 'reset-seg-1');
    assert.equal(harness.logs.toasts.at(-1).message, '已恢复为默认提示词结构');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
    assert.equal(harness.logs.rerenders, 1);
}

function testExportPreset(factory) {
    const harness = createHarness({
        state: {
            aiInstructionSelectedPresetName: 'Beta/Pack',
        },
    });
    const actions = factory(harness.deps);

    actions.exportPreset();

    assert.equal(harness.logs.exportSingleName, 'Beta/Pack');
    assert.equal(harness.logs.downloads.length, 1);
    assert.equal(harness.logs.downloads[0][0], 'yuzi_phone_ai_preset_Beta_Pack.json');
    assert.equal(harness.logs.toasts.at(-1).message, '已导出预设：Beta/Pack');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
}

function testExportAllPresets(factory) {
    const harness = createHarness();
    const actions = factory(harness.deps);

    actions.exportAllPresets();

    assert.equal(harness.logs.exportAllCalled, true);
    assert.equal(harness.logs.downloads.length, 1);
    assert.equal(harness.logs.downloads[0][0], 'yuzi_phone_ai_presets_all.json');
    assert.equal(harness.logs.toasts.at(-1).message, '已导出全部 AI 指令预设');
    assert.equal(harness.logs.toasts.at(-1).isError, false);
}

async function main() {
    const { createAiInstructionPresetActions } = await import(toModuleUrl('modules/settings-app/pages/ai-instruction-presets/preset-actions.js'));

    const tests = [
        ['切换预设会载入草稿并触发重渲染', () => testSwitchPreset(createAiInstructionPresetActions)],
        ['保存预设会同步选中态与草稿原始名', () => testSavePreset(createAiInstructionPresetActions)],
        ['另存为会走 overwrite=false 分支并更新当前选中项', () => testSaveAsPreset(createAiInstructionPresetActions)],
        ['应用预设会调用切换服务并提示成功', () => testApplyPreset(createAiInstructionPresetActions)],
        ['导入预设文件会载入导入结果并刷新草稿', () => testImportPresetFile(createAiInstructionPresetActions)],
        ['删除预设会经过确认并回退到下一个预设', () => testDeletePreset(createAiInstructionPresetActions)],
        ['重置会恢复默认结构与媒体标记', () => testResetPresetDraft(createAiInstructionPresetActions)],
        ['导出当前预设会生成安全文件名并下载', () => testExportPreset(createAiInstructionPresetActions)],
        ['导出全部预设会下载总包', () => testExportAllPresets(createAiInstructionPresetActions)],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[ai-instruction-preset-actions-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[ai-instruction-preset-actions-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
