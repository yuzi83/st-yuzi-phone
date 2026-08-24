const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    return import(`${pathToFileURL(path.join(ROOT, relativePath)).href}?contract=${Date.now()}-${Math.random()}`);
}

function legacyConversation(scopeId) {
    return {
        conversationId: 'private-legacy',
        scopeId,
        kind: 'private',
        personId: 'person-legacy',
        groupId: '',
        status: 'active',
        remark: '',
        backgroundAssetId: '',
        unreadCount: 0,
        nextSequence: 1,
        lastSequence: 0,
        lastMessageId: '',
        injection: { enabled: false },
    };
}

async function main() {
    const scopeId = 'scope-legacy';
    const conversation = legacyConversation(scopeId);
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const stateStore = createMemoryQQV2StateStore({
        version: 2,
        sharedResources: {},
        scopes: {
            [scopeId]: {
                scopeId,
                selfProfile: {},
                people: {
                    'person-legacy': {
                        personId: 'person-legacy',
                        scopeId,
                        formalName: 'Legacy',
                        normalizedName: 'Legacy',
                    },
                },
                conversations: { [conversation.conversationId]: conversation },
                groups: {},
                messages: {},
                assets: {},
                settings: {
                    privateReplyPresetId: '',
                    privateProactivePresetId: '',
                    hostContextTurns: 0,
                    conversationHistoryLimit: 0,
                    proactive: {},
                    worldbook: { enabled: true },
                },
            },
        },
    });
    const repository = createQQV2Repository({ stateStore });

    const migrated = await repository.ensureScope(scopeId);
    assert.equal(migrated.settingsVersion, 1);
    assert.equal(migrated.settings.hostContextTurns, 3);
    assert.equal(migrated.settings.conversationHistoryLimit, 100);
    assert.equal(migrated.settings.privateReplyPresetId, 'builtin-private-reply');
    assert.equal(migrated.settings.privateProactivePresetId, 'builtin-private-proactive');
    assert.equal(migrated.conversations[conversation.conversationId].injection.enabled, true);

    await stateStore.transact((state) => {
        state.scopes['scope-legacy-explicit-zero'] = {
            scopeId: 'scope-legacy-explicit-zero',
            people: {},
            conversations: {},
            groups: {},
            messages: {},
            assets: {},
            settings: {
                hostContextTurns: 0,
                conversationHistoryLimit: 20,
                proactive: {},
                worldbook: {},
            },
        };
    });
    const preservedLegacyZero = await repository.ensureScope('scope-legacy-explicit-zero');
    assert.equal(preservedLegacyZero.settings.hostContextTurns, 0);
    assert.equal(preservedLegacyZero.settings.conversationHistoryLimit, 20);

    await repository.updateConversationInjection(scopeId, conversation.conversationId, { enabled: false });
    await repository.updateWorldbookSettings(scopeId, { enabled: false });
    await repository.updateWorldbookSettings(scopeId, { enabled: true });
    assert.equal((await repository.getConversation(scopeId, conversation.conversationId)).injection.enabled, false);

    await stateStore.transact((state) => {
        state.scopes[scopeId].settings.hostContextTurns = 0;
        state.scopes[scopeId].settings.conversationHistoryLimit = 0;
        state.scopes[scopeId].settings.privateReplyPresetId = '';
        state.scopes[scopeId].settings.privateProactivePresetId = '';
    });
    const explicitZeroes = await repository.getScope(scopeId);
    assert.equal(explicitZeroes.settings.hostContextTurns, 0);
    assert.equal(explicitZeroes.settings.conversationHistoryLimit, 0);
    assert.equal(explicitZeroes.settings.privateReplyPresetId, 'builtin-private-reply');
    assert.equal(explicitZeroes.settings.privateProactivePresetId, 'builtin-private-proactive');

    const created = await repository.createPrivateConversation('scope-new', { name: 'New contact' });
    assert.equal(created.conversation.injection.enabled, true);

    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope: () => ({ scopeId: 'scope-runtime', chatId: 'chat', chatFile: 'chat', hostType: 'character', hostId: 'host' }),
            readUserIdentity: () => ({ name: 'User', avatar: '' }),
            readStoryTime: () => '',
            readStoryMessages: () => [],
            readRawContext: () => ({}),
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: { async generate() { return { content: '' }; }, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    await runtime.initialize();
    const saved = await runtime.updateGlobalSettings({
        scopeId: 'scope-runtime',
        settings: { privateReplyPresetId: '', privateProactivePresetId: '' },
    });
    assert.equal(saved.privateReplyPresetId, 'builtin-private-reply');
    assert.equal(saved.privateProactivePresetId, 'builtin-private-proactive');
    runtime.destroy();

    console.log('[qq-settings-default-migration-contract] passed');
}

main().catch((error) => {
    console.error('[qq-settings-default-migration-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
