const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function scope(scopeId, overrides = {}) {
    return {
        scopeId,
        chatId: overrides.chatId || scopeId,
        chatFile: overrides.chatFile || `${scopeId}.jsonl`,
        hostType: overrides.hostType || 'character',
        hostId: overrides.hostId || 'character-a',
    };
}

async function createCoordinator(options = {}) {
    const { createQQV2ScopeCoordinator } = await importModule('modules/qq-v2/runtime/scope-coordinator.js');
    return createQQV2ScopeCoordinator(options);
}

async function testFirstRefreshPublishesBeforeTransitionAndBecomesReadyAfterward() {
    const transitionStarted = deferred();
    const releaseTransition = deferred();
    let coordinator;
    coordinator = await createCoordinator({
        readScope: () => scope('scope-a'),
        async onTransition({ previous, current }) {
            assert.equal(previous, null);
            assert.equal(coordinator.getCurrentSession(), current);
            assert.equal(current.isCurrent(), true);
            assert.equal(current.isReady(), false);
            transitionStarted.resolve(current);
            await releaseTransition.promise;
        },
    });

    const refreshing = coordinator.refresh();
    const published = await transitionStarted.promise;
    assert.equal(Object.isFrozen(published), true);
    assert.equal(Object.isFrozen(published.scope), true);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'transitioning', scopeId: 'scope-a', generation: 1, ready: false,
    });

    releaseTransition.resolve();
    assert.equal(await refreshing, published);
    assert.equal(published.isReady(), true);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'ready', scopeId: 'scope-a', generation: 1, ready: true,
    });
    assert.equal(published.assertCurrent(), published);
}

async function testSameScopeRefreshPublishesNewSession() {
    let currentScope = scope('scope-a', { chatFile: 'old.jsonl' });
    const transitionPrevious = [];
    const coordinator = await createCoordinator({
        readScope: () => currentScope,
        onTransition: async ({ previous }) => { transitionPrevious.push(previous); },
    });
    const first = await coordinator.refresh();

    currentScope = scope('scope-a', { chatId: 'renamed-chat', chatFile: 'renamed.jsonl' });
    const second = await coordinator.refresh();
    assert.notEqual(second, first);
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(first.isReady(), false);
    assert.equal(second.generation, 2);
    assert.equal(second.scope.chatId, 'renamed-chat');
    assert.equal(second.scope.chatFile, 'renamed.jsonl');
    assert.equal(Object.isFrozen(second.scope), true);
    assert.equal(transitionPrevious.length, 2);
    assert.equal(transitionPrevious[0], null);
    assert.equal(transitionPrevious[1], first);
    assert.equal(transitionPrevious[1].signal.aborted, true);
    assert.equal(coordinator.capture('scope-a'), second);
    assert.equal(coordinator.capture('scope-b'), null);
}

async function testScopeSwitchAbortsBeforePublishingAndRejectsAba() {
    let currentScope = scope('scope-a', { chatId: 'a1' });
    let coordinator;
    const transitionChecks = [];
    coordinator = await createCoordinator({
        readScope: () => currentScope,
        onTransition: async ({ previous, current }) => {
            if (previous) {
                transitionChecks.push({
                    previousAborted: previous.signal.aborted,
                    previousCurrent: previous.isCurrent(),
                    published: coordinator.getCurrentSession() === current,
                });
            }
        },
    });

    const a1 = await coordinator.refresh();
    currentScope = scope('scope-b');
    const b = await coordinator.refresh();
    currentScope = scope('scope-a', { chatId: 'a2' });
    const a2 = await coordinator.refresh();

    assert.deepEqual(transitionChecks, [
        { previousAborted: true, previousCurrent: false, published: true },
        { previousAborted: true, previousCurrent: false, published: true },
    ]);
    assert.equal(a1.signal.aborted, true);
    assert.equal(b.signal.aborted, true);
    assert.equal(a1.isCurrent(), false);
    assert.equal(a2.isCurrent(), true);
    assert.equal(a1.scopeId, a2.scopeId);
    assert.notEqual(a1, a2);
    assert.equal(a1.generation, 1);
    assert.equal(a2.generation, 3);
    assert.throws(() => a1.assertCurrent(), (error) => error?.code === 'scope_inactive');
}

async function testHostUnavailableRevokesBeforeCallbackAndPreservesHostError() {
    const hostError = Object.assign(new Error('host unavailable'), { code: 'host_unavailable' });
    let unavailable = false;
    let readFails = false;
    let coordinator;
    coordinator = await createCoordinator({
        readScope() {
            if (readFails) throw hostError;
            return scope('scope-a');
        },
        onUnavailable: async ({ error, previous }) => {
            unavailable = true;
            assert.equal(error, hostError);
            assert.equal(previous.signal.aborted, true);
            assert.equal(previous.isCurrent(), false);
            assert.equal(coordinator.getCurrentSession(), null);
            assert.equal(coordinator.getStatus().phase, 'unavailable');
            throw new Error('observer failure');
        },
    });
    const active = await coordinator.refresh();
    readFails = true;

    await assert.rejects(coordinator.refresh(), (error) => error === hostError);
    assert.equal(unavailable, true);
    assert.equal(active.signal.aborted, true);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'unavailable', scopeId: '', generation: 1, ready: false,
    });
}

async function testOrdinaryReadFailureRetiresSessionAndRetriesFresh() {
    const readError = new Error('temporary scope read failure');
    let readFails = false;
    const coordinator = await createCoordinator({
        readScope() {
            if (readFails) throw readError;
            return scope('scope-a');
        },
    });

    const first = await coordinator.refresh();
    readFails = true;
    await assert.rejects(coordinator.refresh(), (error) => error === readError);
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(first.isReady(), false);
    assert.equal(coordinator.capture('scope-a'), null);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'error', scopeId: '', generation: 1, ready: false,
    });

    readFails = false;
    const retried = await coordinator.refresh();
    assert.notEqual(retried, first);
    assert.equal(retried.generation, 2);
    assert.equal(retried.isReady(), true);
}

async function testStaleHostUnavailableDoesNotResetNewerRefresh() {
    const hostError = Object.assign(new Error('host unavailable'), { code: 'host_unavailable' });
    const delayedFailureStarted = deferred();
    const delayedFailure = deferred();
    let currentScope = scope('scope-a');
    let readCount = 0;
    let delayFailure = false;
    let unavailableCount = 0;
    const coordinator = await createCoordinator({
        readScope() {
            readCount += 1;
            if (delayFailure) {
                delayedFailureStarted.resolve();
                return delayedFailure.promise;
            }
            return currentScope;
        },
        onUnavailable() {
            unavailableCount += 1;
        },
    });

    const first = await coordinator.refresh();
    delayFailure = true;
    const staleRefresh = coordinator.refresh();
    await delayedFailureStarted.promise;
    currentScope = scope('scope-b');
    delayFailure = false;
    const newerRefresh = coordinator.refresh();

    assert.equal(first.signal.aborted, true);
    delayedFailure.reject(hostError);
    assert.equal(await staleRefresh, null);
    const second = await newerRefresh;
    assert.equal(readCount, 3);
    assert.equal(unavailableCount, 0);
    assert.equal(second.scopeId, 'scope-b');
    assert.equal(second.isReady(), true);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'ready', scopeId: 'scope-b', generation: 2, ready: true,
    });
}

async function testRapidRefreshReadsFreshScopeInsideTheSerializedMutation() {
    let currentScope = scope('scope-a');
    let readCount = 0;
    const firstTransitionStarted = deferred();
    const releaseFirstTransition = deferred();
    const coordinator = await createCoordinator({
        readScope() {
            readCount += 1;
            return currentScope;
        },
        async onTransition({ current }) {
            if (current.scopeId !== 'scope-a') return;
            firstTransitionStarted.resolve(current);
            await releaseFirstTransition.promise;
        },
    });

    const firstRefresh = coordinator.refresh();
    const first = await firstTransitionStarted.promise;
    currentScope = scope('scope-b');
    const secondRefresh = coordinator.refresh();
    await Promise.resolve();
    assert.equal(readCount, 1, 'the queued refresh must not read host facts early');
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(first.isReady(), false);
    assert.equal(coordinator.capture('scope-a'), null);

    releaseFirstTransition.resolve();
    assert.equal(await firstRefresh, null);
    const second = await secondRefresh;
    assert.equal(readCount, 2);
    assert.equal(first.signal.aborted, true);
    assert.equal(second.scopeId, 'scope-b');
    assert.equal(second.isReady(), true);
}

async function testReadyObserverCompletesBeforeTheNextHostMutation() {
    let currentScope = scope('scope-a');
    let readCount = 0;
    const firstReadyStarted = deferred();
    const releaseFirstReady = deferred();
    const events = [];
    const coordinator = await createCoordinator({
        readScope() {
            readCount += 1;
            return currentScope;
        },
        onTransition({ current }) {
            events.push(`transition:${current.scopeId}`);
        },
        async onReady(current) {
            events.push(`ready:${current.scopeId}`);
            assert.equal(current.isReady(), true);
            if (current.scopeId === 'scope-a') {
                firstReadyStarted.resolve(current);
                await releaseFirstReady.promise;
            }
        },
    });

    const firstRefresh = coordinator.refresh();
    const first = await firstReadyStarted.promise;
    currentScope = scope('scope-b');
    const secondRefresh = coordinator.refresh();
    await Promise.resolve();

    assert.equal(readCount, 1, 'ready observer must stay inside the host mutation lane');
    assert.deepEqual(events, ['transition:scope-a', 'ready:scope-a']);
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(first.isReady(), false);
    assert.equal(coordinator.capture('scope-a'), null);

    releaseFirstReady.resolve();
    assert.equal(await firstRefresh, null);
    const second = await secondRefresh;
    assert.equal(first.signal.aborted, true);
    assert.equal(second.scopeId, 'scope-b');
    assert.deepEqual(events, [
        'transition:scope-a',
        'ready:scope-a',
        'transition:scope-b',
        'ready:scope-b',
    ]);
}

async function testQueuedAbaNeverRevivesTheOldSession() {
    let currentScope = scope('scope-a', { chatId: 'a1' });
    let readCount = 0;
    const firstReadyStarted = deferred();
    const releaseFirstReady = deferred();
    let secondTransitionPrevious = null;
    const coordinator = await createCoordinator({
        readScope() {
            readCount += 1;
            return currentScope;
        },
        onTransition({ previous, current }) {
            if (current.generation === 2) secondTransitionPrevious = previous;
        },
        async onReady(current) {
            if (current.generation !== 1) return;
            firstReadyStarted.resolve(current);
            await releaseFirstReady.promise;
        },
    });

    const firstRefresh = coordinator.refresh();
    const first = await firstReadyStarted.promise;
    currentScope = scope('scope-b');
    const middleRefresh = coordinator.refresh();
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(first.isReady(), false);

    currentScope = scope('scope-a', { chatId: 'a2' });
    const finalRefresh = coordinator.refresh();
    await Promise.resolve();
    assert.equal(readCount, 1, 'superseded B refresh must not read host facts');
    assert.equal(first.isCurrent(), false);

    releaseFirstReady.resolve();
    assert.equal(await firstRefresh, null);
    assert.equal(await middleRefresh, null);
    const second = await finalRefresh;
    assert.equal(readCount, 2);
    assert.notEqual(second, first);
    assert.equal(second.scopeId, 'scope-a');
    assert.equal(second.scope.chatId, 'a2');
    assert.equal(second.generation, 2);
    assert.equal(second.isCurrent(), true);
    assert.equal(secondTransitionPrevious, first);
    assert.equal(secondTransitionPrevious.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
}

async function testTransitionFailureRetiresSessionAndRetriesFresh() {
    let attempts = 0;
    let failed = null;
    const coordinator = await createCoordinator({
        readScope: () => scope('scope-a'),
        async onTransition({ current }) {
            attempts += 1;
            if (attempts === 1) {
                failed = current;
                throw new Error('temporary failure');
            }
        },
    });

    await assert.rejects(coordinator.refresh(), /temporary failure/);
    assert.equal(failed.signal.aborted, true);
    assert.equal(failed.isCurrent(), false);
    assert.equal(failed.isReady(), false);
    assert.equal(coordinator.getCurrentSession(), null);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'error', scopeId: '', generation: 1, ready: false,
    });

    const retried = await coordinator.refresh();
    assert.notEqual(retried, failed);
    assert.equal(retried.generation, 2);
    assert.equal(retried.isReady(), true);

    await assert.rejects(coordinator.runHostMutation(async () => {
        throw new Error('queue failure');
    }), /queue failure/);
    assert.equal(await coordinator.runHostMutation(() => 7), 7);
}

async function testDestroySynchronouslyRevokesAndSuppressesQueuedWork() {
    const transitionStarted = deferred();
    const releaseTransition = deferred();
    let destroyedCalls = 0;
    let lateMutationCalls = 0;
    const coordinator = await createCoordinator({
        readScope: () => scope('scope-a'),
        async onTransition({ current }) {
            transitionStarted.resolve(current);
            await releaseTransition.promise;
            assert.equal(current.isCurrent(), false);
        },
        onDestroy({ previous }) {
            destroyedCalls += 1;
            assert.equal(previous.signal.aborted, true);
        },
    });

    const refreshing = coordinator.refresh();
    const session = await transitionStarted.promise;
    const queuedMutation = coordinator.runHostMutation(() => {
        lateMutationCalls += 1;
    });
    coordinator.destroy();
    coordinator.destroy();

    assert.equal(session.signal.aborted, true);
    assert.equal(session.isCurrent(), false);
    assert.equal(session.isReady(), false);
    assert.equal(coordinator.getCurrentSession(), null);
    assert.deepEqual(coordinator.getStatus(), {
        phase: 'destroyed', scopeId: '', generation: 1, ready: false,
    });
    assert.equal(destroyedCalls, 1);

    releaseTransition.resolve();
    assert.equal(await refreshing, null);
    assert.equal(await queuedMutation, null);
    assert.equal(lateMutationCalls, 0);
    assert.equal(await coordinator.refresh(), null);
}

async function main() {
    await testFirstRefreshPublishesBeforeTransitionAndBecomesReadyAfterward();
    await testSameScopeRefreshPublishesNewSession();
    await testScopeSwitchAbortsBeforePublishingAndRejectsAba();
    await testHostUnavailableRevokesBeforeCallbackAndPreservesHostError();
    await testOrdinaryReadFailureRetiresSessionAndRetriesFresh();
    await testStaleHostUnavailableDoesNotResetNewerRefresh();
    await testRapidRefreshReadsFreshScopeInsideTheSerializedMutation();
    await testReadyObserverCompletesBeforeTheNextHostMutation();
    await testQueuedAbaNeverRevivesTheOldSession();
    await testTransitionFailureRetiresSessionAndRetriesFresh();
    await testDestroySynchronouslyRevokesAndSuppressesQueuedWork();
    console.log('[qq-v2-scope-coordinator-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-scope-coordinator-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
