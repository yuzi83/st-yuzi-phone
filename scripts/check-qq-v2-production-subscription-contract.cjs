const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

async function waitUntil(predicate, label, timeoutMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`等待${label}超时`);
}

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

    const failureScopeId = 'scope-manual-failure';
    const failureRuntime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId: failureScopeId,
                    chatId: failureScopeId,
                    chatFile: failureScopeId,
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: {
            async generate() {
                throw new Error('invalid QQ response');
            },
            async loadModels() { return []; },
        },
    });
    await failureRuntime.initialize();
    const failureApiPreset = await failureRuntime.saveApiPreset({
        preset: {
            name: 'Failure API',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'failure-secret',
            model: 'failure-model',
        },
    });
    await failureRuntime.updateGlobalSettings({
        scopeId: failureScopeId,
        settings: {
            activeApiPresetId: failureApiPreset.id,
            privateReplyPresetId: 'builtin-private-reply',
        },
    });
    const failureFriend = await failureRuntime.createPrivateConversation({
        scopeId: failureScopeId,
        name: 'Failure friend',
    });
    const failureEvents = [];
    const stopFailureRuntime = failureRuntime.subscribe((event) => failureEvents.push(event));

    await failureRuntime.sendManual({
        scopeId: failureScopeId,
        conversationId: failureFriend.conversation.conversationId,
        message: { type: 'text', content: '触发失败' },
    });
    await waitUntil(
        () => failureEvents.some((event) => event.reason === 'request-failed'),
        '手动请求失败通知',
        5000,
    );
    assert.deepEqual(
        failureEvents.find((event) => event.reason === 'request-failed'),
        {
            status: 'changed',
            scopeId: failureScopeId,
            reason: 'request-failed',
            conversationId: failureFriend.conversation.conversationId,
        },
    );
    assert.equal(
        (await failureRuntime.getRequestState({
            scopeId: failureScopeId,
            conversationId: failureFriend.conversation.conversationId,
        })).phase,
        'failed',
    );

    stopFailureRuntime();
    failureRuntime.destroy();
}

main().then(() => console.log('[qq-v2-production-subscription-contract] passed')).catch((error) => {
    console.error('[qq-v2-production-subscription-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
