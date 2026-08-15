const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

async function main() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');
    let scopeId = 'scope-a';
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId, chatId: scopeId, chatFile: scopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookContextGateway: { async runDryRun() { return []; } },
    });
    await runtime.initialize();

    const runtimeEvents = [];
    const stopRuntime = runtime.subscribe((event) => runtimeEvents.push(event));
    const oldFacadeEvents = [];
    const stopOldFacade = await runtime.getFacade().subscribe((event) => oldFacadeEvents.push(event));

    scopeId = 'scope-b';
    await runtime.handleChatChanged();
    assert.deepEqual(runtimeEvents, [{ status: 'changed', scopeId: 'scope-b' }]);
    assert.deepEqual(oldFacadeEvents, []);

    const currentFacadeEvents = [];
    const stopCurrentFacade = await runtime.getFacade().subscribe((event) => currentFacadeEvents.push(event));
    const beryl = await runtime.createPrivateConversation({ scopeId: 'scope-b', name: 'Beryl' });
    assert.deepEqual(currentFacadeEvents, [{ status: 'changed', scopeId: 'scope-b' }]);

    await runtime.openConversation({ scopeId: 'scope-b', conversationId: beryl.conversation.conversationId });
    await runtime.updatePrivateProfile({
        scopeId: 'scope-b',
        conversationId: beryl.conversation.conversationId,
        profile: { remark: 'Beryl B.' },
    });
    await runtime.updateGlobalSettings({
        scopeId: 'scope-b',
        settings: { hostContextTurns: 3 },
    });
    assert.deepEqual(currentFacadeEvents, [
        { status: 'changed', scopeId: 'scope-b' },
        {
            status: 'changed',
            scopeId: 'scope-b',
            reason: 'conversation-opened',
            conversationId: beryl.conversation.conversationId,
        },
        { status: 'changed', scopeId: 'scope-b' },
        { status: 'changed', scopeId: 'scope-b' },
    ]);

    stopCurrentFacade();
    await runtime.createPrivateConversation({ scopeId: 'scope-b', name: 'Cora' });
    assert.deepEqual(currentFacadeEvents, [
        { status: 'changed', scopeId: 'scope-b' },
        {
            status: 'changed',
            scopeId: 'scope-b',
            reason: 'conversation-opened',
            conversationId: beryl.conversation.conversationId,
        },
        { status: 'changed', scopeId: 'scope-b' },
        { status: 'changed', scopeId: 'scope-b' },
    ]);

    stopOldFacade();
    stopRuntime();
    runtime.destroy();
}

main().then(() => console.log('[qq-v2-production-subscription-contract] passed')).catch((error) => {
    console.error('[qq-v2-production-subscription-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
