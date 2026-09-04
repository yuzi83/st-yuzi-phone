const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importModule(relativePath) {
    return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function testSettingsServiceBuildsPhysicalTableCatalogAndPersistsThroughFacade() {
    const {
        createFullscreenOverlaySettingsService,
    } = await importModule('modules/settings-app/services/fullscreen-overlay.js');

    let storedSettings = {};
    const saved = [];
    const actionCalls = [];
    let sourceCatalogCalls = 0;
    const rawData = {
        sheet_live: {
            name: '直播表',
            orderNo: 1,
            content: [
                ['直播间标题', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                ['直播间', '甲；乙', '丙', '丁'],
            ],
        },
        sheet_diary: {
            name: '小日记表',
            orderNo: 2,
            content: [['日期', '正文'], ['2026-08-29', '今天很好']],
        },
        sheet_broken_live: {
            name: '直播备份',
            orderNo: 3,
            content: [['剧情弹幕串'], ['只有一列']],
        },
    };
    const sourceCatalog = {
        buildSourceCatalog(receivedRawData, navigationCatalog) {
            sourceCatalogCalls += 1;
            assert.strictEqual(receivedRawData, rawData, 'source catalog 必须消费原始表格快照');
            assert.deepStrictEqual(
                navigationCatalog.map(item => item.sheetKey),
                ['sheet_live', 'sheet_diary', 'sheet_broken_live'],
                'source catalog 必须建立在共享物理表导航目录上',
            );
            return [{
                sheetKey: 'sheet_live',
                sourceId: 'live-table',
                modelId: 'scrolling-barrage',
                status: 'available',
                supported: true,
                enabled: true,
            }, {
                sheetKey: 'sheet_diary',
                status: 'unsupported',
                supported: false,
            }, {
                sheetKey: 'sheet_broken_live',
                sourceId: 'live-table',
                status: 'format_mismatch',
                supported: false,
            }];
        },
    };
    const service = createFullscreenOverlaySettingsService({
        getPhoneSettings: () => storedSettings,
        savePhoneSetting(key, value) {
            saved.push({ key, value });
            storedSettings = { ...storedSettings, [key]: value };
            return true;
        },
        tableReader: async () => rawData,
        sourceCatalog,
        overlayActions: {
            refreshSettings(config) {
                actionCalls.push({ type: 'refresh', config });
                return { ok: true };
            },
            async testSources(payload) {
                actionCalls.push({ type: 'test', payload });
                return { ok: true };
            },
            clear() {
                actionCalls.push({ type: 'clear' });
                return { ok: true };
            },
        },
    });

    const viewModel = await service.loadViewModel();
    assert.strictEqual(sourceCatalogCalls, 1);
    assert.strictEqual(viewModel.status, 'ready');
    assert.deepStrictEqual(
        viewModel.tables.map(table => [
            table.sheetKey,
            table.tableName,
            table.availability,
            table.enabled,
        ]),
        [
            ['sheet_live', '直播表', 'available', true],
            ['sheet_diary', '小日记表', 'unsupported', false],
            ['sheet_broken_live', '直播备份', 'format_mismatch', false],
        ],
        '必须展示全部物理表，仅合法直播表默认勾选',
    );
    assert.deepStrictEqual(
        viewModel.config.sourceOrder,
        ['sheet_live', 'sheet_diary', 'sheet_broken_live'],
        '默认顺序必须沿用共享物理表目录顺序',
    );
    assert.strictEqual(
        viewModel.config.sourceEnabledBySheetKey.sheet_live,
        true,
        '合法直播表必须继承 source catalog 的默认勾选',
    );

    const palette = Array.from({ length: 20 }, (_, index) => (
        index % 2 === 0 ? '#ff0000' : '#00ff00'
    ));
    const saveResult = await service.saveConfig({
        enabled: true,
        sourceEnabledBySheetKey: {
            sheet_live: true,
            sheet_diary: true,
        },
        sourceOrder: ['sheet_diary', 'sheet_live'],
        sourceModelBySheetKey: {
            sheet_live: 'scrolling-barrage',
        },
        models: {
            'scrolling-barrage': {
                maxConcurrent: 99,
                intervalMs: 0,
                durationMs: 99000,
                fontSizePx: 2,
                opacity: 9,
                palette,
            },
        },
    });
    assert.strictEqual(saveResult.ok, true);
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].key, 'fullscreenOverlay');
    assert.strictEqual(
        saved[0].value.sourceEnabledBySheetKey.sheet_live,
        true,
        '保存时必须移除不可用来源，不能把禁用表写入运行配置',
    );
    assert.strictEqual(saved[0].value.sourceEnabledBySheetKey.sheet_diary, false);
    assert.strictEqual(saved[0].value.models['scrolling-barrage'].maxConcurrent, 6);
    assert.strictEqual(saved[0].value.models['scrolling-barrage'].intervalMs, 500);
    assert.strictEqual(saved[0].value.models['scrolling-barrage'].durationMs, 20000);
    assert.strictEqual(saved[0].value.models['scrolling-barrage'].fontSizePx, 12);
    assert.strictEqual(saved[0].value.models['scrolling-barrage'].opacity, 1);
    assert.strictEqual(saved[0].value.models['scrolling-barrage'].palette.length, 16);
    assert.strictEqual(
        saved[0].value.models['scrolling-barrage'].palette.filter(color => color === '#FF0000').length,
        8,
        '调色板允许重复颜色，不能去重',
    );

    const testResult = await service.testSelectedSources(saved[0].value);
    assert.strictEqual(testResult.ok, true);
    assert.deepStrictEqual(
        actionCalls[1].payload.sourceSheetKeys,
        ['sheet_live'],
        '测试必须尊重已勾选且可用的来源',
    );
    assert.strictEqual(actionCalls[1].payload.config.enabled, true);
    assert.strictEqual(actionCalls[1].payload.settings.enabled, true);

    const clearResult = await service.clearOverlay();
    assert.strictEqual(clearResult.ok, true);
    assert.deepStrictEqual(actionCalls[2], { type: 'clear' });
}

async function testDefaultSourceCatalogKeepsDisplayNameAndDefaultLiveSelection() {
    const {
        createFullscreenOverlaySettingsService,
    } = await importModule('modules/settings-app/services/fullscreen-overlay.js');
    const service = createFullscreenOverlaySettingsService({
        getPhoneSettings: () => ({}),
        savePhoneSetting: () => true,
        tableReader: async () => ({
            sheet_live: {
                name: '直播表',
                orderNo: 1,
                content: [
                    ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                    ['剧情一', '推角一', '对线一'],
                ],
            },
            sheet_diary: {
                name: '小日记表',
                orderNo: 2,
                content: [['日期', '正文']],
            },
        }),
    });

    const viewModel = await service.loadViewModel();
    assert.deepStrictEqual(
        viewModel.tables.map(table => [
            table.sheetKey,
            table.tableName,
            table.availability,
            table.enabled,
        ]),
        [
            ['sheet_live', '直播表', 'available', true],
            ['sheet_diary', '小日记表', 'available', true],
            ['qq', 'QQ', 'available', true],
        ],
        '默认 source catalog 必须勾选全部物理表，并把 QQ 默认放在最后',
    );
    assert.strictEqual(viewModel.config.sourceEnabledBySheetKey.sheet_live, true);
    assert.strictEqual(viewModel.config.sourceEnabledBySheetKey.sheet_diary, true);
    assert.strictEqual(viewModel.config.sourceEnabledBySheetKey.qq, true);
    assert.deepStrictEqual(viewModel.config.sourceOrder, ['sheet_live', 'sheet_diary', 'qq']);
    assert.deepStrictEqual(
        viewModel.tables.find(table => table.sheetKey === 'qq')?.modelIds,
        ['table-popup'],
        'QQ 只能绑定普通表格弹窗模型',
    );
    assert.deepStrictEqual(
        viewModel.tables.find(table => table.sheetKey === 'sheet_live')?.modelIds,
        ['scrolling-barrage', 'table-popup'],
        '直播表必须可独立选择弹幕或普通表格弹窗',
    );
    assert.deepStrictEqual(
        viewModel.tables.find(table => table.sheetKey === 'sheet_diary')?.modelIds,
        ['table-popup'],
        '普通物理表第一版只提供普通表格弹窗模型',
    );
    const rebound = await service.saveConfig({
        ...viewModel.config,
        sourceModelBySheetKey: {
            ...viewModel.config.sourceModelBySheetKey,
            sheet_live: 'table-popup',
        },
    });
    assert.equal(
        rebound.tables.find(table => table.sheetKey === 'sheet_live')?.modelId,
        'table-popup',
        '保存每表模型绑定后，设置页 view model 必须立即反映新选择',
    );
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(viewModel.config, 'enabledSourceSheetKeys'),
        false,
        '正式 view model 不得再把 enabledSourceSheetKeys 当作主事实源',
    );
}

async function testColorControlNormalizesPaletteAndKeepsValueOnEyeDropperFailure() {
    const {
        DEFAULT_FULLSCREEN_OVERLAY_PALETTE,
        normalizeHexColor,
        normalizeFullscreenOverlayPalette,
        requestEyeDropperColor,
    } = await importModule('modules/settings-app/ui/color-control.js');

    assert.strictEqual(normalizeHexColor('#abc'), '#AABBCC');
    assert.strictEqual(normalizeHexColor('ffffff'), '#FFFFFF');
    assert.strictEqual(normalizeHexColor('not-a-color'), null);
    assert.deepStrictEqual(DEFAULT_FULLSCREEN_OVERLAY_PALETTE, ['#FFFFFF']);
    assert.deepStrictEqual(
        normalizeFullscreenOverlayPalette(['#abc', '#ABC', 'nope']),
        ['#AABBCC', '#AABBCC'],
        '调色板必须允许重复合法颜色',
    );
    assert.deepStrictEqual(
        normalizeFullscreenOverlayPalette([]),
        ['#FFFFFF'],
        '调色板必须始终至少保留一种颜色',
    );

    const sampled = await requestEyeDropperColor('#112233', {
        EyeDropper: class {
            async open() {
                return { sRGBHex: '#abcdef' };
            }
        },
    });
    assert.deepStrictEqual(sampled, {
        ok: true,
        changed: true,
        color: '#ABCDEF',
        reason: '',
    });

    const cancelled = await requestEyeDropperColor('#112233', {
        EyeDropper: class {
            async open() {
                const error = new Error('cancelled');
                error.name = 'AbortError';
                throw error;
            }
        },
    });
    assert.deepStrictEqual(cancelled, {
        ok: true,
        changed: false,
        color: '#112233',
        reason: 'cancelled',
    });

    const unsupported = await requestEyeDropperColor('#112233', {});
    assert.deepStrictEqual(unsupported, {
        ok: true,
        changed: false,
        color: '#112233',
        reason: 'unsupported',
    });
}

async function testBuilderExposesRequiredControlsAndSharedSettingsShell() {
    const {
        buildFullscreenOverlayPageHtml,
    } = await importModule('modules/settings-app/layout/page-builders/fullscreen-overlay-builders.js');

    const html = buildFullscreenOverlayPageHtml({
        status: 'ready',
        eyeDropperSupported: false,
        config: {
            enabled: false,
            sourceEnabledBySheetKey: { sheet_live: true, sheet_diary: false },
            sourceOrder: ['sheet_live', 'sheet_diary'],
            sourceModelBySheetKey: { sheet_live: 'scrolling-barrage' },
            models: {
                'scrolling-barrage': {
                    maxConcurrent: 3,
                    intervalMs: 1600,
                    durationMs: 8000,
                    fontSizePx: 14,
                    opacity: 0.86,
                    areaPercent: 25,
                    eternalEnabled: true,
                    palette: ['#FFFFFF', '#FF0000'],
                },
                'table-popup': {
                    maxConcurrent: 1,
                    areaPercent: 75,
                    intervalMs: 200,
                    durationMs: 4000,
                    columnCount: 2,
                    sizePreset: 'normal',
                    borderRadiusPx: 20,
                    backgroundColor: '#FFFFFF',
                    opacity: 0.94,
                },
            },
        },
        selectedModelId: 'scrolling-barrage',
        tables: [{
            sheetKey: 'sheet_live',
            tableName: '直播表',
            availability: 'available',
            enabled: true,
            statusLabel: '横向滚动弹幕',
            modelId: 'scrolling-barrage',
            modelIds: ['scrolling-barrage', 'table-popup'],
        }, {
            sheetKey: 'sheet_diary',
            tableName: '小日记表',
            availability: 'unsupported',
            enabled: false,
            statusLabel: '暂未适配',
        }],
    });

    assert.match(html, /弹幕设置/u);
    assert.match(html, /phone-app-body phone-settings-scroll/u);
    assert.match(html, /id="phone-fullscreen-overlay-enabled"/u);
    assert.match(html, /data-fullscreen-overlay-source="sheet_live"/u);
    assert.match(html, /data-fullscreen-overlay-source="sheet_diary"[^>]*disabled/u);
    assert.match(html, /data-fullscreen-overlay-move="up"/u);
    assert.match(html, /data-fullscreen-overlay-move="down"/u);
    assert.match(html, /class="phone-settings-select"/u);
    assert.match(html, /data-fullscreen-overlay-source-model="sheet_live"/u);
    assert.match(html, /value="table-popup">普通表格弹窗<\/option>/u);
    assert.doesNotMatch(
        html.match(/id="phone-fullscreen-overlay-playback-model"[^>]*>/u)?.[0] || '',
        /\bdisabled\b/u,
        '顶部播放模型下拉必须可切换参数面板',
    );
    assert.match(html, /id="phone-fullscreen-overlay-area"/u);
    assert.match(html, /option value="25" selected>上方 25%<\/option>/u);
    assert.match(html, /id="phone-fullscreen-overlay-density"/u);
    assert.match(html, /id="phone-fullscreen-overlay-interval"/u);
    assert.match(html, /id="phone-fullscreen-overlay-duration"/u);
    assert.match(html, /id="phone-fullscreen-overlay-font-size"/u);
    assert.match(html, /id="phone-fullscreen-overlay-opacity"/u);
    assert.match(html, /id="phone-fullscreen-overlay-eternal"[^>]*checked/u);
    assert.match(html, /永恒弹幕/u);
    assert.match(html, /data-fullscreen-overlay-color-input/u);
    assert.match(html, /data-fullscreen-overlay-color-hex/u);
    assert.match(html, /data-fullscreen-overlay-eyedropper[^>]*disabled/u);
    assert.match(html, /data-fullscreen-overlay-color-delete/u);
    assert.match(html, /id="phone-fullscreen-overlay-add-color"/u);
    assert.match(html, /id="phone-fullscreen-overlay-reset-palette"/u);
    assert.match(html, /id="phone-fullscreen-overlay-test"/u);
    assert.match(html, /id="phone-fullscreen-overlay-clear"/u);

    const popupHtml = buildFullscreenOverlayPageHtml({
        status: 'ready',
        eyeDropperSupported: true,
        selectedModelId: 'table-popup',
        config: {
            enabled: true,
            sourceEnabledBySheetKey: { sheet_diary: true },
            sourceOrder: ['sheet_diary'],
            sourceModelBySheetKey: { sheet_diary: 'table-popup' },
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
                'table-popup': {
                    maxConcurrent: 4,
                    placementMode: 'random',
                    areaPercent: 50,
                    intervalMs: 300,
                    durationMs: 5000,
                    columnCount: 3,
                    sizePreset: 'large',
                    borderRadiusPx: 24,
                    backgroundColor: '#123456',
                    opacity: 0.9,
                },
            },
        },
        tables: [{
            sheetKey: 'sheet_diary',
            tableName: '小日记表',
            availability: 'available',
            enabled: true,
            modelId: 'table-popup',
            modelIds: ['table-popup'],
            statusLabel: '普通表格弹窗',
        }],
    });
    assert.match(popupHtml, /id="phone-fullscreen-overlay-playback-model"/u);
    assert.match(popupHtml, /option value="table-popup" selected/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-placement"/u);
    assert.match(popupHtml, /option value="random" selected>随机<\/option>/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-area"/u);
    assert.match(popupHtml, /option value="50" selected>上方 50%<\/option>/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-max-concurrent"[^>]*value="4"/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-interval"[^>]*value="0\.3"/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-duration"[^>]*value="5"/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-column-count"/u);
    assert.match(popupHtml, /option value="3" selected/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-size"/u);
    assert.match(popupHtml, /option value="large" selected/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-radius"[^>]*value="24"/u);
    assert.match(popupHtml, /id="phone-fullscreen-overlay-popup-opacity"[^>]*value="0\.9"/u);
    assert.match(popupHtml, /data-fullscreen-overlay-single-color-input/u);
    assert.match(popupHtml, /data-fullscreen-overlay-single-color-hex/u);
    assert.match(popupHtml, /data-fullscreen-overlay-single-eyedropper/u);
    assert.doesNotMatch(popupHtml, /phone-fullscreen-overlay-eternal/u);
    assert.doesNotMatch(popupHtml, /phone-fullscreen-overlay-add-color/u);

    const centeredPopupHtml = buildFullscreenOverlayPageHtml({
        status: 'ready',
        selectedModelId: 'table-popup',
        config: {
            models: {
                'table-popup': {
                    maxConcurrent: 4,
                    placementMode: 'center',
                    areaPercent: 25,
                },
            },
        },
        tables: [],
    });
    assert.match(centeredPopupHtml, /option value="center" selected>居中<\/option>/u);
    assert.match(
        centeredPopupHtml,
        /id="phone-fullscreen-overlay-popup-max-concurrent"[^>]*value="1"[^>]*disabled/u,
        '居中模式必须在设置页固定一次显示一张',
    );
    assert.doesNotMatch(
        centeredPopupHtml,
        /id="phone-fullscreen-overlay-popup-area"[^>]*disabled/u,
        '居中模式仍需保留弹窗区域选择',
    );
}

async function testPageAndRendererExposeLifecycleAndScrollSafeSeams() {
    const pageSource = read('modules/settings-app/pages/fullscreen-overlay.js');
    const rendererSource = read('modules/settings-app/page-renderers/fullscreen-overlay-renderers.js');

    assert.match(pageSource, /export function createFullscreenOverlayPage/u);
    assert.match(pageSource, /mount\(\)/u);
    assert.match(pageSource, /update\(\)/u);
    assert.match(pageSource, /dispose\(\)/u);
    assert.match(pageSource, /ctx\.pageRuntime/u);
    assert.match(pageSource, /pageRuntime\.addEventListener/u);
    assert.match(pageSource, /rerenderFullscreenOverlayKeepScroll/u);
    assert.match(pageSource, /phone-fullscreen-overlay-eternal/u);
    assert.match(pageSource, /phone-fullscreen-overlay-area/u);
    assert.match(pageSource, /phone-fullscreen-overlay-playback-model/u);
    assert.match(pageSource, /data-fullscreen-overlay-source-model/u);
    assert.match(pageSource, /phone-fullscreen-overlay-popup-max-concurrent/u);
    assert.match(pageSource, /phone-fullscreen-overlay-popup-placement/u);
    assert.match(pageSource, /createFullscreenOverlaySingleColorControl/u);
    assert.doesNotMatch(
        pageSource,
        /(?<!pageRuntime\.)addEventListener\s*\(/u,
        '页面事件必须全部归 pageRuntime 管理',
    );

    const {
        createFullscreenOverlayPageRenderers,
    } = await importModule('modules/settings-app/page-renderers/fullscreen-overlay-renderers.js');
    const context = {
        container: {},
        state: {},
        render() {},
        pageRuntime: { addEventListener() { return () => {}; } },
        rerenderFullscreenOverlayKeepScroll() {},
        fullscreenOverlaySettingsService: {
            async loadViewModel() {
                return {
                    status: 'ready',
                    config: {},
                    tables: [],
                };
            },
        },
    };
    const renderers = createFullscreenOverlayPageRenderers({
        pageContexts: { fullscreenOverlay: context },
    });
    const page = renderers.pages.fullscreen_overlay.createPage();
    assert.strictEqual(typeof page.mount, 'function');
    assert.strictEqual(typeof page.update, 'function');
    assert.strictEqual(typeof page.dispose, 'function');
    assert.match(rendererSource, /fullscreen_overlay/u);
}

async function testSettingsCssUsesScopedThemeTokensForDarkInputsAndOptions() {
    const css = read('styles/fullscreen-overlay/01-settings.css');

    assert.match(css, /\.phone-fullscreen-overlay-settings-page/u);
    assert.match(css, /var\(--yuzi-settings-surface/u);
    assert.match(css, /var\(--yuzi-settings-text-primary/u);
    assert.match(css, /\.phone-settings-input/u);
    assert.match(css, /\.phone-settings-select/u);
    assert.match(css, /\.phone-settings-select option/u);
    assert.match(css, /-webkit-text-fill-color/u);
    assert.doesNotMatch(
        css,
        /(^|[,{]\s*)(input|select|option)(?=[\s:{.#\[])/mu,
        '样式不能用无作用域的原生表单选择器污染宿主页面',
    );
}

async function main() {
    await testSettingsServiceBuildsPhysicalTableCatalogAndPersistsThroughFacade();
    await testDefaultSourceCatalogKeepsDisplayNameAndDefaultLiveSelection();
    await testColorControlNormalizesPaletteAndKeepsValueOnEyeDropperFailure();
    await testBuilderExposesRequiredControlsAndSharedSettingsShell();
    await testPageAndRendererExposeLifecycleAndScrollSafeSeams();
    await testSettingsCssUsesScopedThemeTokensForDarkInputsAndOptions();
    console.log('[fullscreen-overlay-settings-ui] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-settings-ui] failed');
    console.error(error);
    process.exitCode = 1;
});
