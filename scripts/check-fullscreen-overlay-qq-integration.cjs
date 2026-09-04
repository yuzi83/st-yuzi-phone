const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function importModule(relativePath) {
    return import(`${pathToFileURL(path.join(ROOT, relativePath)).href}?check=${Date.now()}-${Math.random()}`);
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

async function main() {
    const { createFullscreenOverlayRuntime } = await importModule(
        'modules/fullscreen-overlay/runtime.js',
    );

    let sourceListener = null;
    let unsubscribed = false;
    const qqAdapter = {
        id: 'qq',
        modelId: 'table-popup',
        modelIds: ['table-popup'],
        defaultEnabled: true,
        getSignature: () => 'qq',
        readEvents: context => context.events || [],
        async readTestEvents() {
            return [{
                kind: 'message-notification',
                senderName: '测试人物',
                text: '测试人物给你发了1条消息',
            }];
        },
        subscribe(listener) {
            sourceListener = listener;
            return () => {
                unsubscribed = true;
                sourceListener = null;
            };
        },
    };
    const replaceCalls = [];
    const appendCalls = [];
    const runtime = createFullscreenOverlayRuntime({
        settingKey: 'fullscreenOverlay',
        normalizeSettings: value => value,
        getSettings: () => ({
            fullscreenOverlay: {
                enabled: true,
                sourceEnabledBySheetKey: { qq: true },
                sourceOrder: ['qq'],
                sourceModelBySheetKey: { qq: 'table-popup' },
                models: { 'table-popup': {} },
            },
        }),
        readSnapshot: async () => ({}),
        registry: {
            list: () => [qqAdapter],
            get: id => (id === 'qq' ? qqAdapter : null),
        },
        buildSourceCatalog: () => [{
            sheetKey: 'qq',
            tableName: 'QQ',
            sourceId: 'qq',
            modelId: 'table-popup',
            modelIds: ['table-popup'],
            supported: true,
            enabled: true,
        }],
        createLayerRuntime: () => ({
            clear() {},
            dispose() {},
            getState: () => ({}),
        }),
        createRendererRegistry: () => new Map([['table-popup', {
            play: async () => ({ status: 'completed' }),
            clear() {},
            dispose() {},
        }]]),
        createScheduler: () => ({
            replace(batches) {
                replaceCalls.push(batches);
                return true;
            },
            append(batches) {
                appendCalls.push(batches);
                return true;
            },
            clear() {},
            dispose() {},
            pause() {},
            resume() {},
            getState: () => ({}),
        }),
        createCoordinator: () => ({
            start: () => true,
            stop() {},
            suspendForChatChange: () => true,
            resumeWithBaseline: async () => true,
            getState: () => ({}),
        }),
    });

    runtime.start();
    await flushMicrotasks();
    assert.equal(typeof sourceListener, 'function', '运行时启动后必须订阅 QQ 外部来源');
    assert.equal(runtime.getState().suspended, false);

    await sourceListener([{
        kind: 'message-notification',
        senderName: '林知夏',
        text: '林知夏给你发了1条消息',
    }]);
    assert.equal(appendCalls.length, 1, 'QQ 主动消息必须追加到当前 Scheduler 队列');
    assert.equal(appendCalls[0][0].sourceId, 'qq');
    assert.equal(appendCalls[0][0].rendererId, 'table-popup');
    assert.equal(appendCalls[0][0].items[0].senderName, '林知夏');

    const testResult = await runtime.testSelectedSources({});
    assert.equal(testResult.ok, true);
    assert.equal(replaceCalls.at(-1)[0].sourceId, 'qq');
    assert.equal(
        replaceCalls.at(-1)[0].items[0].text,
        '测试人物给你发了1条消息',
        '点击测试必须复用 QQ Adapter 与现有 Scheduler 顺序',
    );

    runtime.stop();
    assert.equal(unsubscribed, true, '停止浮层必须注销 QQ 主动消息订阅');

    console.log('[fullscreen-overlay-qq-integration] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-qq-integration] failed');
    console.error(error);
    process.exitCode = 1;
});
