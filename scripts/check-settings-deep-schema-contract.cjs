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

async function testAppearanceResourcePoolDeepNormalization() {
    const { validateSetting, validateSettings } = await loadSchema();
    const pngDataUrl = `data:image/png;base64,${Buffer.from('png-a').toString('base64')}`;
    const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from('jpeg-a').toString('base64')}`;

    const result = validateSetting('appearanceResourcePool', {
        wallpapers: [
            {
                id: '  wall-1  ',
                name: '  Wall 1  ',
                mime: 'IMAGE/PNG',
                dataUrl: pngDataUrl,
                hash: ' hash-wall-1 ',
                bytes: '999999',
                width: '1920.8',
                height: '1080.2',
                source: ' import ',
                extraKey: 'drop',
            },
            {
                id: 'duplicate-wall',
                name: 'Duplicate Wall',
                mime: 'image/png',
                dataUrl: pngDataUrl,
                hash: 'hash-wall-1',
            },
            {
                id: 'bad-wall',
                mime: 'text/plain',
                dataUrl: 'data:text/plain;base64,AAAA',
            },
        ],
        icons: [
            {
                id: 'icon-1',
                name: 'Icon 1',
                mime: 'image/jpeg',
                dataUrl: jpegDataUrl,
                hash: '',
                bytes: 1,
                width: -5,
                height: Infinity,
                source: 'pack',
            },
            null,
            {
                id: 'bad-icon',
                mime: 'image/png',
                dataUrl: 'not-a-data-url',
            },
        ],
        unknownRootKey: 'drop',
    });

    assert.equal(result.valid, true);
    assert.deepEqual(Object.keys(result.value).sort(), ['icons', 'wallpapers']);
    assert.equal(result.value.wallpapers.length, 1);
    assert.equal(result.value.wallpapers[0].id, 'wall-1');
    assert.equal(result.value.wallpapers[0].name, 'Wall 1');
    assert.equal(result.value.wallpapers[0].mime, 'image/png');
    assert.equal(result.value.wallpapers[0].hash, 'hash-wall-1');
    assert.equal(result.value.wallpapers[0].width, 1921);
    assert.equal(result.value.wallpapers[0].height, 1080);
    assert.equal(Object.prototype.hasOwnProperty.call(result.value.wallpapers[0], 'extraKey'), false);
    assert.equal(result.value.icons.length, 1);
    assert.equal(result.value.icons[0].id, 'icon-1');
    assert.equal(result.value.icons[0].mime, 'image/jpeg');
    assert.equal(result.value.icons[0].width, 0);
    assert.equal(result.value.icons[0].height, 0);
    assert.ok(result.value.icons[0].hash.startsWith('djb2:'));

    const settings = validateSettings({ appearanceResourcePool: [] });
    assert.deepEqual(settings.appearanceResourcePool, {
        wallpapers: [],
        icons: [],
    });
}

async function testAppearanceFontLibraryDeepNormalization() {
    const { validateSetting, validateSettings, APPEARANCE_FONT_LIBRARY_LIMITS } = await loadSchema();
    const woff2DataUrl = `data:font/woff2;base64,${Buffer.from('font-a').toString('base64')}`;
    const ttfDataUrl = `data:application/octet-stream;base64,${Buffer.from('font-b').toString('base64')}`;

    const result = validateSetting('appearanceFontLibrary', {
        activeFontId: 'user-font-1',
        userFonts: [
            {
                id: ' user-font-1 ',
                name: '  Font A  ',
                family: ' Bad;Family"Name ',
                mime: 'FONT/WOFF2',
                format: 'woff2',
                dataUrl: woff2DataUrl,
                hash: ' hash-font-a ',
                bytes: 1234,
                source: ' import ',
                createdAt: '123.6',
                extraKey: 'drop',
            },
            {
                id: 'duplicate-font',
                name: 'Duplicate Font',
                mime: 'font/woff2',
                format: 'woff2',
                dataUrl: woff2DataUrl,
                hash: 'hash-font-a',
                bytes: 1234,
            },
            {
                id: 'font-ttf',
                name: 'Font TTF',
                format: 'ttf',
                dataUrl: ttfDataUrl,
                bytes: APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes + 1,
            },
            {
                id: 'bad-font',
                mime: 'text/plain',
                format: 'txt',
                dataUrl: 'data:text/plain;base64,AAAA',
            },
        ],
        unknownRootKey: 'drop',
    });

    assert.equal(result.valid, true);
    assert.deepEqual(Object.keys(result.value).sort(), ['activeFontId', 'userFonts']);
    assert.equal(result.value.activeFontId, 'user-font-1');
    assert.equal(result.value.userFonts.length, 1);
    assert.equal(result.value.userFonts[0].id, 'user-font-1');
    assert.equal(result.value.userFonts[0].name, 'Font A');
    assert.equal(result.value.userFonts[0].mime, 'font/woff2');
    assert.equal(result.value.userFonts[0].format, 'woff2');
    assert.equal(result.value.userFonts[0].family.includes(';'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.value.userFonts[0], 'extraKey'), false);

    const fallback = validateSetting('appearanceFontLibrary', {
        activeFontId: 'missing-font',
        userFonts: [],
    });
    assert.equal(fallback.value.activeFontId, 'builtin.system-ui');

    const settings = validateSettings({ appearanceFontLibrary: [] });
    assert.deepEqual(settings.appearanceFontLibrary, {
        activeFontId: 'builtin.system-ui',
        userFonts: [],
    });
}

async function testSharedNormalizersAreExported() {
    const schema = await loadSchema();
    assert.equal(typeof schema.normalizePhoneChatSettings, 'function');
    assert.equal(typeof schema.normalizePhoneAiInstructionSettings, 'function');
    assert.equal(typeof schema.normalizePhoneAiInstructionMediaMarkers, 'function');
    assert.equal(typeof schema.normalizeWorldbookSelectionSettings, 'function');
    assert.equal(typeof schema.normalizeAppearanceResourcePoolSettings, 'function');
    assert.equal(typeof schema.normalizeAppearanceFontLibrarySettings, 'function');
}

async function main() {
    const tests = [
        ['phoneChat 字段级归一化覆盖错误数字和未知字段', testPhoneChatDeepNormalization],
        ['phoneAiInstruction 字段级归一化保留旧槽位兼容与空媒体前缀', testPhoneAiInstructionDeepNormalization],
        ['worldbookSelection 字段级归一化覆盖异常 entries 结构', testWorldbookSelectionDeepNormalization],
        ['appearanceResourcePool 字段级归一化覆盖坏图片、重复资源和未知字段', testAppearanceResourcePoolDeepNormalization],
        ['appearanceFontLibrary 字段级归一化覆盖坏字体、重复字体和回退默认', testAppearanceFontLibraryDeepNormalization],
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
