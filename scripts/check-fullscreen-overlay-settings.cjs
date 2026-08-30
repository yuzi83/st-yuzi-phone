const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule() {
    const modulePath = path.resolve(
        process.cwd(),
        'modules/fullscreen-overlay/settings.js',
    );
    return import(`${pathToFileURL(modulePath).href}?check=${Date.now()}`);
}

async function testPublicDefaults(mod) {
    assert.strictEqual(
        mod.FULLSCREEN_OVERLAY_SETTING_KEY,
        'fullscreenOverlay',
        '全屏浮层设置必须拥有稳定的 settings facade key',
    );
    assert.strictEqual(
        mod.SCROLLING_BARRAGE_MODEL_ID,
        'scrolling-barrage',
        '滚动弹幕模型必须拥有稳定的公共 model id',
    );
    assert.deepStrictEqual(
        mod.FULLSCREEN_OVERLAY_DEFAULTS,
        {
            enabled: false,
            sourceEnabledBySheetKey: {},
            sourceOrder: [],
            sourceModelBySheetKey: {},
            models: {
                'scrolling-barrage': {
                    maxConcurrent: 3,
                    intervalMs: 1600,
                    durationMs: 8000,
                    fontSizePx: 14,
                    opacity: 0.86,
                    areaPercent: 75,
                    eternalEnabled: false,
                    palette: ['#FFFFFF'],
                },
            },
        },
        '公共默认值必须完整表达第一版全屏浮层配置',
    );
}

async function testTopLevelSettingsNormalization(mod) {
    const normalized = mod.normalizeFullscreenOverlaySettings({
        enabled: true,
        sourceEnabledBySheetKey: {
            sheet_live: true,
            sheet_disabled: false,
            sheet_invalid: 'false',
        },
        sourceOrder: ['sheet_live', ' sheet_diary ', 'sheet_live', '', 42],
        sourceModelBySheetKey: {
            sheet_live: 'scrolling-barrage',
            sheet_diary: ' popup ',
            sheet_empty: '   ',
            sheet_invalid: false,
        },
    });

    assert.deepStrictEqual(
        {
            enabled: normalized.enabled,
            sourceEnabledBySheetKey: normalized.sourceEnabledBySheetKey,
            sourceOrder: normalized.sourceOrder,
            sourceModelBySheetKey: normalized.sourceModelBySheetKey,
        },
        {
            enabled: true,
            sourceEnabledBySheetKey: {
                sheet_live: true,
                sheet_disabled: false,
            },
            sourceOrder: ['sheet_live', 'sheet_diary'],
            sourceModelBySheetKey: {
                sheet_live: 'scrolling-barrage',
                sheet_diary: 'popup',
            },
        },
        '顶层设置必须保留显式 false，并清理来源顺序与模型映射',
    );

    const firstDefaults = mod.normalizeFullscreenOverlaySettings(null);
    const secondDefaults = mod.normalizeFullscreenOverlaySettings([]);
    firstDefaults.sourceOrder.push('sheet_live');
    firstDefaults.models['scrolling-barrage'].palette.push('#000000');
    assert.deepStrictEqual(
        secondDefaults,
        mod.FULLSCREEN_OVERLAY_DEFAULTS,
        '每次默认归一化必须返回独立副本，调用方修改不得污染公共默认值',
    );
}

async function testScrollingBarrageNumericNormalization(mod) {
    const normalized = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                maxConcurrent: 99,
                intervalMs: '499',
                durationMs: 20001,
                fontSizePx: 17.6,
                opacity: 0.2,
            },
        },
    });
    assert.deepStrictEqual(
        normalized.models['scrolling-barrage'],
        {
            maxConcurrent: 6,
            intervalMs: 500,
            durationMs: 20000,
            fontSizePx: 18,
            opacity: 0.3,
            areaPercent: 75,
            eternalEnabled: false,
            palette: ['#FFFFFF'],
        },
        '弹幕数值设置必须夹紧到手机安全范围',
    );

    const invalid = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                maxConcurrent: 'many',
                intervalMs: null,
                durationMs: Number.NaN,
                fontSizePx: {},
                opacity: Number.POSITIVE_INFINITY,
            },
        },
    });
    assert.deepStrictEqual(
        invalid.models['scrolling-barrage'],
        mod.FULLSCREEN_OVERLAY_DEFAULTS.models['scrolling-barrage'],
        '非法弹幕数值必须逐项回落到公共默认值',
    );
}

async function testBarrageAreaNormalization(mod) {
    const selected = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                areaPercent: '50',
            },
        },
    });
    assert.strictEqual(
        selected.models['scrolling-barrage'].areaPercent,
        50,
        '弹幕区域必须只保存预设百分比，并兼容 select 传来的字符串值',
    );

    const invalid = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                areaPercent: 60,
            },
        },
    });
    assert.strictEqual(
        invalid.models['scrolling-barrage'].areaPercent,
        75,
        '非 25/50/75/100 的区域值必须回落到默认上方 75%',
    );
}

async function testEternalBarrageNormalization(mod) {
    const enabled = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                eternalEnabled: true,
            },
        },
    });
    assert.strictEqual(
        enabled.models['scrolling-barrage'].eternalEnabled,
        true,
        '永恒弹幕必须是滚动弹幕模型级的显式开关',
    );

    const invalid = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                eternalEnabled: 'true',
            },
        },
    });
    assert.strictEqual(
        invalid.models['scrolling-barrage'].eternalEnabled,
        false,
        '永恒弹幕只接受显式 true，避免旧配置或脏值意外开启无限循环',
    );
}

async function testHexAndPaletteNormalization(mod) {
    assert.strictEqual(
        mod.normalizeOverlayHexColor(' #a1b2c3 ', '#000000'),
        '#A1B2C3',
        '合法 HEX 必须清理空白并统一为大写',
    );
    assert.strictEqual(
        mod.normalizeOverlayHexColor('#fff', '#123abc'),
        '#123ABC',
        '非法 HEX 必须回落到合法 fallback',
    );
    assert.strictEqual(
        mod.normalizeOverlayHexColor('not-a-color', 'also-invalid'),
        '#FFFFFF',
        'value 与 fallback 都非法时必须回落白色',
    );

    const normalized = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                palette: [
                    '#ff0000',
                    'invalid',
                    '#00ff00',
                    '#ff0000',
                    '#000001',
                    '#000002',
                    '#000003',
                    '#000004',
                    '#000005',
                    '#000006',
                    '#000007',
                    '#000008',
                    '#000009',
                    '#00000a',
                    '#00000b',
                    '#00000c',
                    '#00000d',
                    '#00000e',
                ],
            },
        },
    });
    assert.deepStrictEqual(
        normalized.models['scrolling-barrage'].palette,
        [
            '#FF0000',
            '#00FF00',
            '#FF0000',
            '#000001',
            '#000002',
            '#000003',
            '#000004',
            '#000005',
            '#000006',
            '#000007',
            '#000008',
            '#000009',
            '#00000A',
            '#00000B',
            '#00000C',
            '#00000D',
        ],
        '调色板必须保留重复栏位，并只保留前 16 个合法完整 HEX',
    );

    const emptyPalette = mod.normalizeFullscreenOverlaySettings({
        models: {
            'scrolling-barrage': {
                palette: ['#fff', '', null],
            },
        },
    });
    assert.deepStrictEqual(
        emptyPalette.models['scrolling-barrage'].palette,
        ['#FFFFFF'],
        '无合法颜色时调色板必须恢复为唯一默认白色',
    );
}

async function testPaletteColorPicking(mod) {
    assert.strictEqual(
        mod.pickOverlayPaletteColor(['#ff0000', '#00ff00', '#ff0000'], '', () => 0.4),
        '#00FF00',
        '首次抽取必须按调色板栏位等概率选色',
    );
    assert.strictEqual(
        mod.pickOverlayPaletteColor(['#ff0000', '#00ff00', '#ff0000'], '', () => 0.99),
        '#FF0000',
        '重复颜色栏位必须保留并自然增加该颜色的抽取权重',
    );

    const draws = [0, 0];
    assert.strictEqual(
        mod.pickOverlayPaletteColor(
            ['#ff0000', '#00ff00', '#ff0000'],
            '#FF0000',
            () => draws.shift(),
        ),
        '#00FF00',
        '存在不同实际颜色时必须尽量避免连续两条同 HEX',
    );
    assert.strictEqual(
        mod.pickOverlayPaletteColor(['#abcdef', '#ABCDEF'], '#abcdef', () => 0.7),
        '#ABCDEF',
        '只有一种实际颜色时必须允许连续同色',
    );
    assert.strictEqual(
        mod.pickOverlayPaletteColor(['invalid'], null, () => 0.5),
        '#FFFFFF',
        '运行时收到损坏调色板时必须安全回落到默认白色',
    );
}

async function main() {
    const mod = await loadModule();
    await testPublicDefaults(mod);
    await testTopLevelSettingsNormalization(mod);
    await testScrollingBarrageNumericNormalization(mod);
    await testBarrageAreaNormalization(mod);
    await testEternalBarrageNormalization(mod);
    await testHexAndPaletteNormalization(mod);
    await testPaletteColorPicking(mod);
    console.log('[通过] 全屏浮层设置：设置模型与调色板核心');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
