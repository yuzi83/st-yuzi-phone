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

function createExistingPreset() {
    return {
        name: 'Existing Preset',
        description: 'existing description',
        mediaMarkers: {
            imagePrefix: '<OLD_IMG>',
            videoPrefix: '<OLD_VID>',
        },
        promptGroup: [
            { id: 'old-seg', name: '旧片段', role: 'system', content: 'old' },
        ],
    };
}

function createDefaultPreset() {
    return {
        name: 'Default Preset',
        mediaMarkers: {
            imagePrefix: '[默认图片]',
            videoPrefix: '[默认视频]',
        },
        promptGroup: [
            { id: 'default-seg', name: '默认片段', role: 'system', content: 'default' },
        ],
    };
}

async function testArrayInputKeepsExistingMediaMarkers() {
    const editor = await loadPromptEditor();
    const resolved = editor.resolvePresetPayloadFromText(JSON.stringify([
        { id: 'seg-1', name: '新片段', role: 'system', content: 'new' },
    ]));

    assert.equal(resolved.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(resolved.presetPatch, 'mediaMarkers'), false);

    const payload = editor.buildPromptEditorPresetPayload({
        name: 'Existing Preset',
        resolved,
        existingPreset: createExistingPreset(),
        defaultPreset: createDefaultPreset(),
    });

    assert.deepEqual(payload.mediaMarkers, {
        imagePrefix: '<OLD_IMG>',
        videoPrefix: '<OLD_VID>',
    });
    assert.equal(payload.promptGroup[0].content, 'new');
}

async function testPresetObjectInputOverridesMediaMarkers() {
    const editor = await loadPromptEditor();
    const resolved = editor.resolvePresetPayloadFromText(JSON.stringify({
        name: 'Imported Preset',
        description: 'imported description',
        mediaMarkers: {
            imagePrefix: '<NEW_IMG>',
            videoPrefix: '<NEW_VID>',
        },
        promptGroup: [
            { id: 'seg-1', name: '新片段', role: 'system', content: 'new' },
        ],
    }));

    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.presetPatch.mediaMarkers, {
        imagePrefix: '<NEW_IMG>',
        videoPrefix: '<NEW_VID>',
    });

    const payload = editor.buildPromptEditorPresetPayload({
        name: 'Existing Preset',
        resolved,
        existingPreset: createExistingPreset(),
        defaultPreset: createDefaultPreset(),
    });

    assert.deepEqual(payload.mediaMarkers, {
        imagePrefix: '<NEW_IMG>',
        videoPrefix: '<NEW_VID>',
    });
    assert.equal(payload.description, 'imported description');
}

async function testPackInputKeepsFirstPresetMediaMarkers() {
    const editor = await loadPromptEditor();
    const resolved = editor.resolvePresetPayloadFromText(JSON.stringify({
        format: 'yuzi-phone-ai-instruction-pack',
        presets: [
            {
                name: 'Packed Preset',
                mediaMarkers: {
                    imagePrefix: '<PACK_IMG>',
                    videoPrefix: '<PACK_VID>',
                },
                promptGroup: [
                    { id: 'seg-1', name: '包片段', role: 'user', content: 'packed' },
                ],
            },
        ],
    }));

    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.presetPatch.mediaMarkers, {
        imagePrefix: '<PACK_IMG>',
        videoPrefix: '<PACK_VID>',
    });
}

async function testNewPresetFallsBackToDefaultMediaMarkers() {
    const editor = await loadPromptEditor();
    const resolved = editor.resolvePresetPayloadFromText(JSON.stringify([
        { id: 'seg-1', name: '新片段', role: 'assistant', content: 'new' },
    ]));

    const payload = editor.buildPromptEditorPresetPayload({
        name: 'New Preset',
        resolved,
        defaultPreset: createDefaultPreset(),
    });

    assert.deepEqual(payload.mediaMarkers, {
        imagePrefix: '[默认图片]',
        videoPrefix: '[默认视频]',
    });
}

async function testStateMediaMarkersWinBeforeExistingPreset() {
    const editor = await loadPromptEditor();
    const resolved = editor.resolvePresetPayloadFromText(JSON.stringify([
        { id: 'seg-1', name: '新片段', role: 'system', content: 'new' },
    ]));

    const payload = editor.buildPromptEditorPresetPayload({
        name: 'Existing Preset',
        resolved,
        stateMediaMarkers: {
            imagePrefix: '<STATE_IMG>',
            videoPrefix: '<STATE_VID>',
        },
        existingPreset: createExistingPreset(),
        defaultPreset: createDefaultPreset(),
    });

    assert.deepEqual(payload.mediaMarkers, {
        imagePrefix: '<STATE_IMG>',
        videoPrefix: '<STATE_VID>',
    });
}

async function testNullMediaMarkersFallBackWithoutStringPollution() {
    const editor = await loadPromptEditor();
    const resolved = editor.resolvePresetPayloadFromText(JSON.stringify({
        name: 'Imported Preset',
        mediaMarkers: {
            imagePrefix: null,
            videoPrefix: null,
        },
        promptGroup: [
            { id: 'seg-1', name: '空值片段', role: 'system', content: 'new' },
        ],
    }));

    const payload = editor.buildPromptEditorPresetPayload({
        name: 'Existing Preset',
        resolved,
        existingPreset: createExistingPreset(),
        defaultPreset: createDefaultPreset(),
    });

    assert.notEqual(payload.mediaMarkers.imagePrefix, 'null');
    assert.notEqual(payload.mediaMarkers.videoPrefix, 'null');
    assert.deepEqual(payload.mediaMarkers, {
        imagePrefix: '[图片]',
        videoPrefix: '[视频]',
    });
}

async function main() {
    const tests = [
        ['数组输入保存时继承原预设媒体标记', testArrayInputKeepsExistingMediaMarkers],
        ['完整预设 JSON 可覆盖媒体标记', testPresetObjectInputOverridesMediaMarkers],
        ['预设包输入保留首个预设媒体标记', testPackInputKeepsFirstPresetMediaMarkers],
        ['新建预设缺省时回退默认媒体标记', testNewPresetFallsBackToDefaultMediaMarkers],
        ['导入后 state 缓存优先于原预设媒体标记', testStateMediaMarkersWinBeforeExistingPreset],
        ['JSON null 媒体标记按缺失处理且不会污染为字符串', testNullMediaMarkersFallBackWithoutStringPollution],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[prompt-editor-media-markers-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[prompt-editor-media-markers-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
