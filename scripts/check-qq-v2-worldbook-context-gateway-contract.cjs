const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function createEmitter() {
    const listeners = new Map();
    return {
        on(event, listener) {
            const items = listeners.get(event) || [];
            items.push(listener);
            listeners.set(event, items);
        },
        removeListener(event, listener) {
            listeners.set(event, (listeners.get(event) || []).filter((item) => item !== listener));
        },
        async emit(event, value) {
            for (const listener of [...(listeners.get(event) || [])]) await listener(value);
        },
        count(event) {
            return (listeners.get(event) || []).length;
        },
    };
}

/**
 * Public host seam under test:
 * createQQV2SillyTavernWorldbookContextGateway({ getContext }).runDryRun()
 * It must use Tavern's own dry run and retain only its final activated entries.
 */
async function testDirectedScanUsesTavernDryRunAndFinalActivatedEntries() {
    const { createQQV2SillyTavernWorldbookContextGateway } = await importModule('modules/qq-v2/prompt/st-worldbook-context.js');
    const emitter = createEmitter();
    const calls = [];
    const gateway = createQQV2SillyTavernWorldbookContextGateway({
        getContext: () => ({
            maxContext: 32768,
            eventSource: emitter,
            eventTypes: { WORLDINFO_SCAN_DONE: 'worldinfo_scan_done' },
            async getWorldInfoPrompt(chat, maxContext, dryRun) {
                calls.push({ chat, maxContext, dryRun });
                await emitter.emit('worldinfo_scan_done', {
                    state: { next: 'recursion' },
                    activated: { entries: new Map([['interim', { world: '主书', uid: 1, content: '中间结果' }]]) },
                });
                await emitter.emit('worldinfo_scan_done', {
                    state: { next: 0 },
                    activated: {
                        entries: new Map([
                            ['story', { world: '主书', uid: 1, content: '最终世界书条目', depth: 4, role: 0 }],
                            ['person', { world: '人物书', uid: 8, content: '人物定向条目', depth: 6, role: 0 }],
                        ]),
                    },
                });
                return { worldInfoString: '聚合文本不应被当成全量世界书' };
            },
        }),
    });

    const entries = await gateway.runDryRun({
        people: ['林知夏', '苏晚'],
        history: ['用户：在吗', '角色：在。'],
    });

    assert.deepEqual(calls, [{
        chat: ['苏晚', '林知夏', '角色：在。', '用户：在吗'],
        maxContext: 32768,
        dryRun: true,
    }]);
    assert.deepEqual(entries, [
        { bookName: '主书', uid: 1, content: '最终世界书条目', depth: 4, role: 0 },
        { bookName: '人物书', uid: 8, content: '人物定向条目', depth: 6, role: 0 },
    ]);
    assert.equal(emitter.count('worldinfo_scan_done'), 0);
}

async function testDirectedScanRequiresTavernWorldbookCapabilities() {
    const { createQQV2SillyTavernWorldbookContextGateway } = await importModule('modules/qq-v2/prompt/st-worldbook-context.js');
    const gateway = createQQV2SillyTavernWorldbookContextGateway({ getContext: () => ({}) });
    await assert.rejects(
        gateway.runDryRun({ people: ['林知夏'], history: [] }),
        (error) => error?.code === 'worldbook_context_unavailable',
    );
}

async function testQueuedScanRejectsStaleScopeSessionBeforeRunning() {
    const { createQQV2SillyTavernWorldbookContextGateway } = await importModule('modules/qq-v2/prompt/st-worldbook-context.js');
    const emitter = createEmitter();
    let releaseFirst;
    let scans = 0;
    const firstSession = { isCurrent: () => true };
    let secondCurrent = true;
    const secondSession = { isCurrent: () => secondCurrent };
    const gateway = createQQV2SillyTavernWorldbookContextGateway({
        getContext: () => ({
            eventSource: emitter,
            eventTypes: { WORLDINFO_SCAN_DONE: 'worldinfo_scan_done' },
            async getWorldInfoPrompt() {
                scans += 1;
                if (scans === 1) await new Promise((resolve) => { releaseFirst = resolve; });
                await emitter.emit('worldinfo_scan_done', { state: { next: 0 }, activated: { entries: [] } });
            },
        }),
    });

    const first = gateway.runDryRun({ scopeSession: firstSession });
    const second = gateway.runDryRun({ scopeSession: secondSession });
    while (!releaseFirst) await new Promise((resolve) => setTimeout(resolve, 0));
    secondCurrent = false;
    releaseFirst();
    await first;
    await assert.rejects(second, (error) => error?.code === 'worldbook_scope_inactive');
    assert.equal(scans, 1);
}

async function main() {
    await testDirectedScanUsesTavernDryRunAndFinalActivatedEntries();
    await testDirectedScanRequiresTavernWorldbookCapabilities();
    await testQueuedScanRejectsStaleScopeSessionBeforeRunning();
    console.log('[qq-v2-worldbook-context-gateway-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-worldbook-context-gateway-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
