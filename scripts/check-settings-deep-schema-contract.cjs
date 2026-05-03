const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function loadSchema() {
    return import(toModuleUrl('modules/settings/schema.js'));
}

async function testPhoneChatDeepNormalization() {
    const { validateSetting, validateSettings, PHONE_CHAT_NUMERIC_LIMITS } = await loadSchema();

    const result = validateSetting('phoneChat', {
        useStoryContext: 'false',
        storyContextTurns: '999',
        apiPresetName: '  preset A  ',
        maxHistoryMessages: -3,
        maxReplyTokens: 'bad-number',
        requestTimeoutMs: 1,
        worldbookMaxEntries: Infinity,
        worldbookMaxChars: '250000',
        unknownKey: 'must-drop',
    });

    assert.equal(result.valid, true);
    assert.deepEqual(Object.keys(result.value).sort(), [
        'apiPresetName',
        'maxHistoryMessages',
        'maxReplyTokens',
        'requestTimeoutMs',
        'storyContextTurns',
        'useStoryContext',
        'worldbookMaxChars',
        'worldbookMaxEntries',
    ].sort());
    assert.equal(result.value.useStoryContext, false);
    assert.equal(result.value.storyContextTurns, PHONE_CHAT_NUMERIC_LIMITS.storyContextTurns.max);
    assert.equal(result.value.apiPresetName, 'preset A');
    assert.equal(result.value.maxHistoryMessages, PHONE_CHAT_NUMERIC_LIMITS.maxHistoryMessages.min);
    assert.equal(result.value.maxReplyTokens, 900);
    assert.equal(result.value.requestTimeoutMs, PHONE_CHAT_NUMERIC_LIMITS.requestTimeoutMs.min);
    assert.equal(result.value.worldbookMaxEntries, 24);
    assert.equal(result.value.worldbookMaxChars, PHONE_CHAT_NUMERIC_LIMITS.worldbookMaxChars.max);

    const settings = validateSettings({ phoneChat: [] });
    assert.deepEqual(settings.phoneChat, {
        useStoryContext: true,
        storyContextTurns: 3,
        apiPresetName: '',
        maxHistoryMessages: 12,
        maxReplyTokens: 900,
        requestTimeoutMs: 90000,
        worldbookMaxEntries: 24,
        worldbookMaxChars: 6000,
    });
}

async function testPhoneAiInstructionDeepNormalization() {
    const { validateSetting } = await loadSchema();

    const result = validateSetting('phoneAiInstruction', {
        currentPresetName: 'broken-current',
        lastOpenedPresetName: 'Preset 1',
        migratedLegacyTemplates: true,
        presets: [
            {
                id: ' preset id ',
                name: 'Preset 1',
                description: '  desc  ',
                updatedAt: '123.8',
                mediaMarkers: {
                    imagePrefix: '',
                },
                segments: [
                    {
                        id: 's1',
                        name: 'Seg 1',
                        role: 'ADMIN',
                        content: 123,
                        isMain2: true,
                        unknownSegmentKey: 'drop',
                    },
                ],
            },
        ],
        extraRootKey: 'drop',
    });

    assert.equal(result.valid, true);
    assert.equal(result.value.currentPresetName, 'Preset 1');
    assert.equal(result.value.lastOpenedPresetName, 'Preset 1');
    assert.equal(result.value.migratedLegacyTemplates, true);
    assert.equal(result.value.presets.length, 1);
    assert.deepEqual(Object.keys(result.value.presets[0]).sort(), [
        'description',
        'id',
        'mediaMarkers',
        'name',
        'promptGroup',
        'scope',
        'updatedAt',
    ].sort());
    assert.equal(result.value.presets[0].mediaMarkers.imagePrefix, '');
    assert.equal(result.value.presets[0].mediaMarkers.videoPrefix, '[视频]');
    assert.equal(result.value.presets[0].promptGroup[0].role, 'system');
    assert.equal(result.value.presets[0].promptGroup[0].content, '123');
    assert.equal(result.value.presets[0].promptGroup[0].mainSlot, 'B');
    assert.equal(Object.prototype.hasOwnProperty.call(result.value.presets[0].promptGroup[0], 'unknownSegmentKey'), false);
}

async function testWorldbookSelectionDeepNormalization() {
    const { validateSetting, validateSettings } = await loadSchema();

    const result = validateSetting('worldbookSelection', {
        sourceMode: 'unknown-mode',
        selectedWorldbook: '  世界书 A  ',
        entries: {
            ' 世界书 A ': {
                1: true,
                2: false,
                3: 'true',
                empty: null,
            },
            Invalid: ['bad'],
            '': { 1: true },
        },
        extraRootKey: 'drop',
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.value, {
        sourceMode: 'manual',
        selectedWorldbook: '世界书 A',
        entries: {
            '世界书 A': {
                1: true,
                2: false,
            },
        },
    });

    const settings = validateSettings({ worldbookSelection: null });
    assert.deepEqual(settings.worldbookSelection, {
        sourceMode: 'manual',
        selectedWorldbook: '',
        entries: {},
    });
}

async function testSharedNormalizersAreExported() {
    const schema = await loadSchema();
    assert.equal(typeof schema.normalizePhoneChatSettings, 'function');
    assert.equal(typeof schema.normalizePhoneAiInstructionSettings, 'function');
    assert.equal(typeof schema.normalizePhoneAiInstructionMediaMarkers, 'function');
    assert.equal(typeof schema.normalizeWorldbookSelectionSettings, 'function');
}

async function main() {
    const tests = [
        ['phoneChat 字段级归一化覆盖错误数字和未知字段', testPhoneChatDeepNormalization],
        ['phoneAiInstruction 字段级归一化保留旧槽位兼容与空媒体前缀', testPhoneAiInstructionDeepNormalization],
        ['worldbookSelection 字段级归一化覆盖异常 entries 结构', testWorldbookSelectionDeepNormalization],
        ['settings schema 暴露共享嵌套 normalizer', testSharedNormalizersAreExported],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[settings-deep-schema-contract-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[settings-deep-schema-contract-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
