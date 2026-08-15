const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

/**
 * Public worldbook host seam under test:
 * createQQV2SillyTavernWorldbookGateway({ getContext })
 * Each operation must use the current SillyTavern context, never a stale one.
 */
async function testGatewayUsesFreshSillyTavernContextForLoadAndSave() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    const calls = [];
    const contexts = [
        {
            async loadWorldInfo(name) {
                calls.push(['load', 'first', name]);
                return { entries: { 1: { uid: 1, content: '原条目' } } };
            },
            async saveWorldInfo() {
                throw new Error('save must use the fresh second context');
            },
        },
        {
            async loadWorldInfo() {
                throw new Error('load must use the fresh first context');
            },
            async saveWorldInfo(name, data, immediate) {
                calls.push(['save', 'second', name, data, immediate]);
            },
        },
    ];
    let contextReads = 0;
    const gateway = createQQV2SillyTavernWorldbookGateway({
        getContext: () => contexts[contextReads++],
    });

    const book = await gateway.loadBook('主书');
    await gateway.saveBook('主书', { entries: { 2: { uid: 2, content: 'QQ 条目' } } });

    assert.deepEqual(book, { entries: { 1: { uid: 1, content: '原条目' } } });
    assert.deepEqual(calls, [
        ['load', 'first', '主书'],
        ['save', 'second', '主书', { entries: { 2: { uid: 2, content: 'QQ 条目' } } }, true],
    ]);
    assert.equal(contextReads, 2);
}

async function testGatewayRejectsMissingHostWorldbookMethods() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    const gateway = createQQV2SillyTavernWorldbookGateway({ getContext: () => ({}) });

    await assert.rejects(
        gateway.loadBook('主书'),
        (error) => error?.code === 'worldbook_host_unavailable',
    );
    await assert.rejects(
        gateway.saveBook('主书', { entries: {} }),
        (error) => error?.code === 'worldbook_host_unavailable',
    );
}

async function testGatewayNormalizesInjectedWorldbookProviders() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    const gateway = createQQV2SillyTavernWorldbookGateway({
        getWorldbookNames: async () => [' 主书 ', '', '副书', '主书', null, '副书'],
        getCurrentCharacterWorldbooks: async () => ({
            primary: ' 主书 ',
            additional: ['副书', '主书', ' ', '副书', '补充'],
        }),
    });

    assert.deepEqual(await gateway.listBookNames(), ['主书', '副书']);
    assert.deepEqual(await gateway.getCurrentCharacterBookNames(), {
        primary: '主书',
        additional: ['副书', '补充'],
    });
}

async function testGatewayGuardsAsyncProviderReadsAgainstScopeChanges() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    let activeScopeId = 'scope-a';
    const gateway = createQQV2SillyTavernWorldbookGateway({
        getActiveScopeId: () => activeScopeId,
        getWorldbookNames: async () => {
            activeScopeId = 'scope-b';
            return ['主书'];
        },
    });

    await assert.rejects(
        gateway.listBookNames('scope-a'),
        (error) => error?.code === 'worldbook_scope_inactive',
    );
}

async function testGatewayAllowsExplicitInactiveScopeCleanup() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    const calls = [];
    const book = {
        entries: {
            7: {
                uid: 7,
                content: 'QQ 条目',
                extensions: {
                    yuziPhoneQQV2: { version: 2, scopeId: 'scope-a', conversationId: 'conversation-a' },
                },
            },
        },
    };
    const gateway = createQQV2SillyTavernWorldbookGateway({
        getActiveScopeId: () => 'scope-b',
        getContext: () => ({
            async loadWorldInfo(name) {
                calls.push(['native-load', name]);
                return book;
            },
            async saveWorldInfo(name, data, immediate) {
                calls.push(['native-save', name, data, immediate]);
            },
        }),
    });

    await assert.rejects(
        gateway.loadBook('主书', 'scope-a'),
        (error) => error?.code === 'worldbook_scope_inactive',
    );
    const loaded = await gateway.loadBook('主书', 'scope-a', { allowInactiveScope: true });
    await gateway.saveBook('主书', loaded, 'scope-a', { allowInactiveScope: true });
    assert.deepEqual(loaded.entries[7].extensions.yuziPhoneQQV2, {
        version: 2,
        scopeId: 'scope-a',
        conversationId: 'conversation-a',
    });
    assert.deepEqual(calls, [
        ['native-load', '主书'],
        ['native-save', '主书', book, true],
    ]);
}

async function testGatewayUsesSessionIdentityToRejectAbaWrites() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    let current = null;
    const createSession = (scopeId) => {
        const session = { scopeId, isCurrent: () => current === session };
        return session;
    };
    const firstA = createSession('scope-a');
    current = firstA;
    const gateway = createQQV2SillyTavernWorldbookGateway({
        captureScopeSession: (scopeId) => current?.scopeId === scopeId ? current : null,
        getContext: () => ({
            async loadWorldInfo() {
                const secondA = createSession('scope-a');
                current = secondA;
                return { entries: {} };
            },
            async saveWorldInfo() {},
        }),
    });

    await assert.rejects(
        gateway.loadBook('主书', 'scope-a', { scopeSession: firstA }),
        (error) => error?.code === 'worldbook_scope_inactive',
    );
}

async function testGatewayDoesNotFlattenUnavailableCharacterBindingReads() {
    const { createQQV2SillyTavernWorldbookGateway } = await importModule('modules/qq-v2/worldbook/st-gateway.js');
    const gateway = createQQV2SillyTavernWorldbookGateway();

    await assert.rejects(gateway.getCurrentCharacterBookNames());
}

async function main() {
    await testGatewayUsesFreshSillyTavernContextForLoadAndSave();
    await testGatewayRejectsMissingHostWorldbookMethods();
    await testGatewayNormalizesInjectedWorldbookProviders();
    await testGatewayGuardsAsyncProviderReadsAgainstScopeChanges();
    await testGatewayAllowsExplicitInactiveScopeCleanup();
    await testGatewayUsesSessionIdentityToRejectAbaWrites();
    await testGatewayDoesNotFlattenUnavailableCharacterBindingReads();
    console.log('[qq-v2-worldbook-gateway-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-worldbook-gateway-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
