const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function createFixture({
    removeProjection = async () => ({ status: 'removed' }),
    restoreProjection = async () => ({ status: 'restored' }),
    deleteConversation = null,
} = {}) {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');

    const scopeId = 'st:conversation-delete-contract';
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const repository = deleteConversation
        ? Object.freeze({
            ...baseRepository,
            deleteConversation: (targetScopeId, conversationId) => deleteConversation({
                repository: baseRepository,
                scopeId: targetScopeId,
                conversationId,
            }),
        })
        : baseRepository;
    const events = [];
    const runtime = createQQV2ProductionRuntime({
        stateStore,
        repository,
        host: {
            readScope: () => ({ scopeId, chatId: 'delete-contract', chatFile: 'delete-contract', hostType: 'character', hostId: 'alice' }),
            readUserIdentity: () => ({ name: 'Traveler', avatar: '' }),
            readStoryTime: () => '2042-05-20 09:30',
            readStoryMessages: () => [],
            readRawContext: () => ({ getRequestHeaders: () => ({}) }),
        },
        requestService: {
            handleScopeChanged() {},
            getConversationState: () => ({ phase: 'idle', pendingUserMessageCount: 0, error: '' }),
            async sendManual(input) { events.push(`late-write:${input.conversationId}`); return { message: input.message }; },
            async cancelConversation() { events.push('manual-cancelled'); },
            handleConversationDeleted() { events.push('manual-forgotten'); },
        },
        proactiveService: {
            cancelScope() { events.push('private-proactive-cancelled'); },
            async getState() { return { enabled: false, everyTurns: 5 }; },
        },
        projectionService: {
            async removeConversationProjection() {
                events.push('worldbook-removed');
                const result = await removeProjection();
                return {
                    ...result,
                    rollback: async () => {
                        events.push('worldbook-restored');
                        return restoreProjection();
                    },
                };
            },
            async syncConversation() {
                events.push('worldbook-restored');
                return restoreProjection();
            },
        },
    });
    await runtime.initialize();
    return { facade: runtime.getFacade(), repository, events, runtime, scopeId };
}

async function testDeletionRejectsLateConversationWrites() {
    let beginProjectionRemoval;
    let finishProjectionRemoval;
    const projectionStarted = new Promise((resolve) => { beginProjectionRemoval = resolve; });
    const projectionFinished = new Promise((resolve) => { finishProjectionRemoval = resolve; });
    const { facade, runtime } = await createFixture({
        removeProjection: async () => {
            beginProjectionRemoval();
            await projectionFinished;
            return { status: 'removed' };
        },
    });
    const created = await facade.intent.createPrivateConversation({ name: 'Alice' });
    const conversationId = created.result.conversation.conversationId;
    const deleting = facade.intent.deleteConversation({ conversationId });
    await projectionStarted;

    assert.deepEqual(await facade.intent.sendMessage({
        conversationId,
        message: { type: 'text', content: 'This late write must be rejected.' },
    }), {
        ok: false,
        status: 'failed',
        error: { code: 'conversation_deleting', message: 'QQ conversation is being deleted' },
    });

    finishProjectionRemoval();
    assert.equal((await deleting).result.deleted, true);
    runtime.destroy();
}

async function testProtectedHardDeleteCancelsWritesBeforeProjectionRemoval() {
    const { facade, repository, events, runtime, scopeId } = await createFixture();
    const created = await facade.intent.createPrivateConversation({ name: 'Alice' });
    const conversationId = created.result.conversation.conversationId;
    await repository.appendMessages(scopeId, conversationId, [{
        senderId: '__self__', senderType: 'self', type: 'text', content: 'History is permanent until explicitly deleted.',
    }]);
    await repository.incrementConversationUnread(scopeId, conversationId, 3);
    assert.equal((await facade.query.unread()).unread.total, 3);

    events.length = 0;
    assert.deepEqual(await facade.intent.deleteConversation({ conversationId }), {
        ok: true,
        status: 'accepted',
        result: { deleted: true, mode: 'private' },
    });
    assert.deepEqual(events, [
        'manual-cancelled',
        'private-proactive-cancelled',
        'worldbook-removed',
        'manual-forgotten',
    ]);
    assert.deepEqual((await facade.query.messages({ conversationId })).page.items, []);
    assert.equal((await facade.query.unread()).unread.total, 0);
    assert.deepEqual((await facade.query.conversations()).conversations.map((item) => item.status), ['contact']);

    const restored = await facade.intent.createPrivateConversation({ name: 'Alice' });
    assert.equal(restored.result.restored, true, 'hard deletion must retain the independent friend relation');
    assert.equal(restored.result.conversation.conversationId, conversationId);
    runtime.destroy();
}

async function testFailedCommitRestoresProjectionAndAllowsRetry() {
    let failCommit = true;
    const { facade, repository, events, runtime, scopeId } = await createFixture({
        async deleteConversation({ repository: realRepository, scopeId: targetScopeId, conversationId }) {
            if (failCommit) {
                failCommit = false;
                throw new Error('simulated repository failure');
            }
            return realRepository.deleteConversation(targetScopeId, conversationId);
        },
    });
    const created = await facade.intent.createPrivateConversation({ name: 'Alice' });
    const conversationId = created.result.conversation.conversationId;
    await repository.appendMessages(scopeId, conversationId, [{
        senderId: '__self__', senderType: 'self', type: 'text', content: 'Keep this message after rollback.',
    }]);
    await repository.incrementConversationUnread(scopeId, conversationId, 2);
    const background = await repository.saveScopeAsset(scopeId, {
        conversationId,
        kind: 'background',
        mimeType: 'image/webp',
        blob: new Blob(['background'], { type: 'image/webp' }),
    });
    await repository.updatePrivateProfile(scopeId, conversationId, { backgroundAssetId: background.assetId });

    events.length = 0;
    assert.deepEqual(await facade.intent.deleteConversation({ conversationId }), {
        ok: false,
        status: 'failed',
        error: { code: 'conversation_delete_failed', message: 'QQ conversation deletion failed' },
    });
    assert.deepEqual(events, [
        'manual-cancelled',
        'private-proactive-cancelled',
        'worldbook-removed',
        'worldbook-restored',
    ]);
    assert.equal((await facade.query.messages({ conversationId })).page.items.length, 1);
    assert.equal((await facade.query.unread()).unread.total, 2);
    assert.equal((await repository.listScopeAssets(scopeId, conversationId)).length, 1);
    assert.equal((await facade.query.conversation({ conversationId })).conversation.status, 'active');

    assert.deepEqual(await facade.intent.deleteConversation({ conversationId }), {
        ok: true,
        status: 'accepted',
        result: { deleted: true, mode: 'private' },
    });
    assert.equal((await facade.query.unread()).unread.total, 0);
    assert.equal((await repository.listScopeAssets(scopeId, conversationId)).length, 0);
    runtime.destroy();
}

async function testProjectionRollbackRestoresCurrentBook() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2WorldbookProjectionService } = await import('../modules/qq-v2/worldbook/projection-service.js');
    const scopeId = 'st:conversation-delete-projection-rollback';
    const repository = createQQV2Repository({ stateStore: createMemoryQQV2StateStore() });
    const books = new Map([
        ['QQ-old', { entries: {} }],
        ['QQ-new', { entries: {} }],
    ]);
    const copy = (value) => structuredClone(value);
    const service = createQQV2WorldbookProjectionService({
        repository,
        worldbookGateway: {
            async loadBook(name) { return copy(books.get(name)); },
            async saveBook(name, book) { books.set(name, copy(book)); },
        },
    });
    await repository.ensureScope(scopeId);
    const created = await repository.createPrivateConversation(scopeId, { name: 'Alice' });
    const conversationId = created.conversation.conversationId;
    await repository.appendMessages(scopeId, conversationId, [{
        senderId: '__self__', senderType: 'self', type: 'text', content: 'Keep both projections.', storyTime: '2042-05-20 09:30',
    }]);
    await service.setGlobalSettings({
        scopeId,
        settings: {
            enabled: true,
            bookName: 'QQ-old',
            timeWindow: { mode: 'all' },
        },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    await service.setConversationInjection({
        scopeId,
        conversationId,
        injection: { enabled: true },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    await service.setGlobalSettings({
        scopeId,
        settings: { bookName: 'QQ-new' },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    const projectionBefore = (await repository.getConversation(scopeId, conversationId)).injection.projection;
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 0);
    assert.equal(Object.keys(books.get('QQ-new').entries).length, 1);

    const removal = await service.removeConversationProjection({ scopeId, conversationId });
    assert.equal(removal.status, 'removed');
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 0);
    assert.equal(Object.keys(books.get('QQ-new').entries).length, 0);
    assert.deepEqual(await removal.rollback(), { status: 'restored' });
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 0);
    assert.equal(Object.keys(books.get('QQ-new').entries).length, 1);
    assert.deepEqual((await repository.getConversation(scopeId, conversationId)).injection.projection, projectionBefore);
}

async function testSwipeAndDeleteDialogContract() {
    const { __test__ } = await import('../modules/qq-v2/ui/app.js');
    const { clampConversationSwipeOffset } = await import('../modules/qq-v2/ui/conversation-swipe.js');
    assert.equal(__test__.resolveConversationSwipe(
        { x: 180, y: 100 },
        { x: 120, y: 104 },
    ), 'open');
    assert.equal(__test__.resolveConversationSwipe(
        { x: 120, y: 100 },
        { x: 180, y: 104 },
    ), 'close');
    assert.equal(__test__.resolveConversationSwipe(
        { x: 180, y: 100 },
        { x: 170, y: 160 },
    ), 'close', 'vertical scrolling must close an exposed delete action');
    assert.equal(__test__.resolveConversationSwipe(
        { x: 180, y: 100 },
        { x: 160, y: 104 },
    ), 'ignore');
    assert.equal(__test__.shouldCloseConversationSwipe('alice', '', ''), true);
    assert.equal(__test__.shouldCloseConversationSwipe('alice', 'bob', ''), true);
    assert.equal(__test__.shouldCloseConversationSwipe('alice', 'alice', ''), false);
    assert.equal(__test__.shouldCloseConversationSwipe('alice', 'alice', 'alice'), false);
    assert.equal(clampConversationSwipeOffset(-120, 76), -76);
    assert.equal(clampConversationSwipeOffset(-30, 76), -30);
    assert.equal(clampConversationSwipeOffset(20, 76), 0);

    const app = fs.readFileSync(path.resolve(__dirname, '../modules/qq-v2/ui/app.js'), 'utf8');
    const swipe = fs.readFileSync(path.resolve(__dirname, '../modules/qq-v2/ui/conversation-swipe.js'), 'utf8');
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/phone-base/12-qq-app.css'), 'utf8');
    assert.match(app, /bindConversationSwipeGesture\(\{[\s\S]{0,500}deleteAction: remove/,
        'conversation rows must use the shared swipe gesture controller');
    assert.match(swipe, /addEventListener\('pointermove', handlePointerMove\)/,
        'the swipe controller must update while the pointer moves');
    assert.match(swipe, /setProperty\('--yuzi-qq-swipe-offset'/,
        'the swipe controller must expose the live drag offset to CSS');
    assert.match(swipe, /addEventListener\('dragstart', preventNativeDrag\)/,
        'native avatar dragging must not steal the conversation gesture');
    assert.match(swipe, /addEventListener\('click', handleClick, true\)/,
        'a completed drag must suppress the synthetic conversation click');
    assert.match(app, /addEventListener\('scroll',\s*handleConversationListScroll,\s*true\)/,
        'scrolling anywhere in the conversation list must close the exposed row');
    assert.match(app, /copy\.textContent = '确定删除该会话吗？删除后不可恢复'/,
        'the confirmation copy must match the approved shared wording');
    assert.match(app, /cancel\.disabled = true;\s*confirm\.disabled = true;\s*confirm\.textContent = '删除中…'/,
        'deletion must lock both buttons and only change the confirm text');
    assert.match(app, /cancel\.disabled = false;\s*confirm\.disabled = false;\s*confirm\.textContent = '删除'/,
        'a failed deletion must unlock the same dialog for retry');
    assert.match(css, /\.yuzi-qq-swipe-delete\s*\{[^}]*visibility\s*:\s*hidden\s*;/s,
        'the delete action must be visually hidden before a conversation is swiped');
    assert.match(css, /\.yuzi-qq-swipe-delete\s*\{[^}]*pointer-events\s*:\s*none\s*;/s,
        'the hidden delete action must not receive pointer input');
    assert.match(css, /\.yuzi-qq-swipe-row\.is-swiped\s+\.yuzi-qq-swipe-delete\s*\{[^}]*visibility\s*:\s*visible\s*;/s,
        'swiping a conversation must reveal its delete action');
    assert.match(css, /\.yuzi-qq-swipe-row\.is-swiped\s+\.yuzi-qq-swipe-delete\s*\{[^}]*pointer-events\s*:\s*auto\s*;/s,
        'only the revealed delete action may receive pointer input');
    assert.match(css, /\.yuzi-qq-conversation-row\s*\{[^}]*touch-action\s*:\s*pan-y\s*;/s,
        'vertical list scrolling and horizontal conversation swiping must have separate gesture ownership');
    assert.match(css, /\.yuzi-qq-swipe-row\.is-dragging\.is-revealing\s+\.yuzi-qq-swipe-delete\s*\{[^}]*visibility\s*:\s*visible\s*;/s,
        'the delete action must be visible while the row follows the pointer');
}

async function main() {
    await testDeletionRejectsLateConversationWrites();
    await testProtectedHardDeleteCancelsWritesBeforeProjectionRemoval();
    await testFailedCommitRestoresProjectionAndAllowsRetry();
    await testProjectionRollbackRestoresCurrentBook();
    await testSwipeAndDeleteDialogContract();
}

main().then(() => console.log('[qq-conversation-delete-contract] passed')).catch((error) => {
    console.error('[qq-conversation-delete-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
