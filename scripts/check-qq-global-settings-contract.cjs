const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function deferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function scopeSession(scopeId) {
    const controller = new AbortController();
    let current = true;
    const session = Object.freeze({
        scopeId,
        signal: controller.signal,
        isCurrent() {
            return current && !controller.signal.aborted;
        },
        assertCurrent() {
            if (session.isCurrent()) return session;
            const error = new Error(`QQ scope ${scopeId} is no longer current`);
            error.code = 'scope_inactive';
            throw error;
        },
    });
    return {
        session,
        revoke() {
            current = false;
            controller.abort('scope-changed');
        },
    };
}

async function testGlobalRuntimeStorage() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2GlobalRuntimeSettings } = await import('../modules/qq-v2/application/global-runtime-settings.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    await repository.ensureScope('scope-a');
    await repository.ensureScope('scope-b');
    await stateStore.transact((state) => {
        Object.assign(state.scopes['scope-a'].settings, {
            activeApiPresetId: 'legacy-api',
            privateReplyPresetId: 'legacy-reply',
            privateProactivePresetId: 'legacy-proactive',
            hostContextTurns: 0,
            conversationHistoryLimit: 0,
            proactive: { enabled: true, everyTurns: 4 },
            worldbook: {
                bookName: 'scope-a-book',
                timeWindow: { mode: 'relative', value: 2, unit: 'day' },
                light: 'green',
                depth: 0,
                keywords: ['Legacy', 'legacy', ' dawn '],
            },
        });
        state.sharedResources.worldbookInjectionEnabled = true;
    });
    const runtimeSettings = createQQV2GlobalRuntimeSettings({ stateStore });

    assert.deepEqual(await runtimeSettings.get('scope-a'), {
        activeApiPresetId: 'legacy-api',
        privateReplyPresetId: 'legacy-reply',
        privateProactivePresetId: 'legacy-proactive',
        hostContextTurns: 0,
        conversationHistoryLimit: 0,
        hostContextExtractTag: 'content',
        hostContextExcludeTags: [],
        worldbook: {
            enabled: true,
            timeWindow: { mode: 'relative', value: 2, unit: 'day' },
            injectionCount: 30,
            light: 'green',
            depth: 0,
            keywords: ['Legacy', 'dawn'],
        },
        proactive: { enabled: true, everyTurns: 4 },
    }, 'the first shared read migrates the current scope without losing selections or explicit zeroes');
    const migratedFromOtherScope = await runtimeSettings.get('scope-b');
    assert.equal(migratedFromOtherScope.activeApiPresetId, 'legacy-api',
        'all scopes read the same migrated runtime selections');
    assert.equal(migratedFromOtherScope.worldbook.bookName, undefined,
        'a scope-specific worldbook selection never enters shared runtime settings');

    await runtimeSettings.update('scope-b', {
        activeApiPresetId: 'api-global',
        privateReplyPresetId: 'reply-global',
        privateProactivePresetId: 'proactive-global',
        hostContextTurns: 7,
        conversationHistoryLimit: 21,
        worldbook: {
            enabled: false,
            bookName: 'must-stay-in-scope',
            timeWindow: { mode: 'all' },
            injectionCount: 30,
            light: 'blue',
            depth: 13,
            keywords: ['north', 'North', 'dawn'],
        },
        proactive: { enabled: true, everyTurns: 2 },
    });
    const scopeASettings = await runtimeSettings.get('scope-a');
    assert.equal(scopeASettings.activeApiPresetId, 'api-global');
    assert.equal(scopeASettings.hostContextTurns, 7);
    assert.equal(scopeASettings.conversationHistoryLimit, 21);
    assert.deepEqual(scopeASettings.worldbook, {
        enabled: false,
        timeWindow: { mode: 'all' },
        injectionCount: 30,
        light: 'blue',
        depth: 13,
        keywords: ['north', 'dawn'],
    });
    assert.equal(scopeASettings.worldbook.bookName, undefined,
        'an explicit bookName patch is ignored by shared runtime settings');
    assert.equal((await runtimeSettings.get('scope-b')).privateReplyPresetId, 'reply-global');
    assert.deepEqual(scopeASettings.proactive, { enabled: true, everyTurns: 2 });
    assert.deepEqual((await runtimeSettings.get('scope-b')).proactive, { enabled: true, everyTurns: 2 },
        '主动消息设置在所有聊天 scope 间共享');
    await runtimeSettings.update('scope-a', { worldbook: { injectionCount: 0 } });
    assert.equal((await runtimeSettings.get('scope-b')).worldbook.injectionCount, 0,
        'worldbook injection count is shared across chat scopes');
    await assert.rejects(
        () => runtimeSettings.update('scope-a', { worldbook: { injectionCount: -1 } }),
        /worldbook\.injectionCount must be a non-negative integer/,
    );
    await runtimeSettings.update('scope-a', { worldbook: { injectionCount: 30 } });
    const migratedState = await stateStore.read();
    assert.equal(Object.hasOwn(migratedState.scopes['scope-a'].settings, 'proactive'), false,
        '首次读取共享设置会删除旧 scope 主动消息字段');
    assert.equal(Object.hasOwn(migratedState.scopes['scope-b'].settings, 'proactive'), false,
        '迁移会删除其他聊天 scope 的旧主动消息字段');

    await runtimeSettings.update('scope-a', { proactive: { everyTurns: 3 } });
    assert.deepEqual((await runtimeSettings.get('scope-a')).proactive, { enabled: true, everyTurns: 3 });
    assert.deepEqual((await runtimeSettings.get('scope-b')).proactive, { enabled: true, everyTurns: 3 });
    assert.equal(await runtimeSettings.clearPresetReferences('scope-a', 'api-global', ['activeApiPresetId']), 1);
    assert.equal((await runtimeSettings.get('scope-b')).activeApiPresetId, '');
}

async function testExistingSharedRuntimeMigration() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2GlobalRuntimeSettings } = await import('../modules/qq-v2/application/global-runtime-settings.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    await repository.ensureScope('scope-a');
    await repository.ensureScope('scope-b');
    await stateStore.transact((state) => {
        Object.assign(state.scopes['scope-b'].settings, {
            hostContextTurns: 0,
            conversationHistoryLimit: 0,
            worldbook: {
                bookName: 'scope-b-book',
                timeWindow: { mode: 'relative', value: 6, unit: 'hour' },
                light: 'green',
                depth: 0,
                keywords: ['scope-b'],
            },
        });
        state.sharedResources['qq-v2.runtime-settings'] = {
            activeApiPresetId: 'existing-api',
            privateReplyPresetId: 'existing-reply',
            privateProactivePresetId: 'existing-proactive',
            proactive: { enabled: false, everyTurns: 8 },
        };
        state.sharedResources.worldbookInjectionEnabled = true;
    });
    const runtimeSettings = createQQV2GlobalRuntimeSettings({ stateStore });

    const migrated = await runtimeSettings.get('scope-b');
    assert.deepEqual(migrated, {
        activeApiPresetId: 'existing-api',
        privateReplyPresetId: 'existing-reply',
        privateProactivePresetId: 'existing-proactive',
        hostContextTurns: 0,
        conversationHistoryLimit: 0,
        hostContextExtractTag: 'content',
        hostContextExcludeTags: [],
        worldbook: {
            enabled: true,
            timeWindow: { mode: 'relative', value: 6, unit: 'hour' },
            injectionCount: 30,
            light: 'green',
            depth: 0,
            keywords: ['scope-b'],
        },
        proactive: { enabled: false, everyTurns: 8 },
    }, 'missing fields in an existing shared record migrate from the current scope and legacy enabled key');
    assert.equal(migrated.worldbook.bookName, undefined);
    assert.deepEqual(await runtimeSettings.get('scope-a'), migrated,
        'the migrated shared record remains stable after switching scopes');
}

async function testQueuedGlobalRuntimeUpdateRejectsRevokedScopeSession() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2GlobalRuntimeSettings } = await import('../modules/qq-v2/application/global-runtime-settings.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    await repository.ensureScope('scope-a');
    const runtimeSettings = createQQV2GlobalRuntimeSettings({ stateStore });
    await runtimeSettings.update('scope-a', { activeApiPresetId: 'baseline-api' });

    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    const blocker = stateStore.transact(async () => {
        blockerStarted.resolve();
        await releaseBlocker.promise;
    });
    await blockerStarted.promise;

    const lease = scopeSession('scope-a');
    const update = runtimeSettings.update(
        'scope-a',
        { activeApiPresetId: 'stale-api' },
        { scopeSession: lease.session },
    );
    const rejected = assert.rejects(update, (error) => error?.code === 'scope_inactive');
    lease.revoke();
    releaseBlocker.resolve();
    await blocker;

    await rejected;
    const state = await stateStore.read();
    assert.equal(state.sharedResources['qq-v2.runtime-settings'].activeApiPresetId, 'baseline-api',
        'a global settings update queued by a revoked scope session cannot commit');
}

async function testStaleGlobalRuntimeGetDoesNotCommitInitialMigration() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2GlobalRuntimeSettings } = await import('../modules/qq-v2/application/global-runtime-settings.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    await repository.ensureScope('scope-a');
    const runtimeSettings = createQQV2GlobalRuntimeSettings({ stateStore });
    const lease = scopeSession('scope-a');
    lease.revoke();

    const result = await runtimeSettings.get('scope-a', { scopeSession: lease.session }).then(
        (value) => ({ value }),
        (error) => ({ error }),
    );
    const state = await stateStore.read();
    assert.equal(Object.hasOwn(state.sharedResources, 'qq-v2.runtime-settings'), false,
        'a stale scope session cannot persist the first shared runtime settings migration');
    assert.equal(result.error?.code, 'scope_inactive',
        'a stale migration read rejects with the shared scope-inactive error');
}

function settings(label) {
    return {
        activeApiPresetId: `api-${label}`,
        privateReplyPresetId: `reply-${label}`,
        privateProactivePresetId: `proactive-${label}`,
        groupReplyPresetId: `hidden-group-reply-${label}`,
        groupProactivePresetId: `hidden-group-proactive-${label}`,
        hostContextTurns: 4,
        conversationHistoryLimit: 12,
        proactive: { enabled: true, everyTurns: 3 },
        worldbook: {
            enabled: true,
            bookName: `book-${label}`,
            timeWindow: { mode: 'relative', value: 2, unit: 'day' },
            injectionCount: 30,
            light: 'green',
            depth: 8,
            keywords: [`key-${label}`],
        },
    };
}

async function main() {
    await testGlobalRuntimeStorage();
    await testExistingSharedRuntimeMigration();
    await testQueuedGlobalRuntimeUpdateRejectsRevokedScopeSession();
    await testStaleGlobalRuntimeGetDoesNotCommitInitialMigration();
    const { __test__ } = await import('../modules/qq-v2/ui/app.js');
    const { loadQQSettingsModel, saveQQSettings, createSettingsSaveQueue } = __test__;
    assert.equal(typeof loadQQSettingsModel, 'function', 'settings pages need a Facade-only read seam');
    assert.equal(typeof saveQQSettings, 'function', 'settings pages need an immediate-save seam');
    assert.equal(typeof createSettingsSaveQueue, 'function', 'settings pages need a serial save seam');

    let scopeId = 'scope-a';
    let failNextSave = false;
    const settingsByScope = new Map([
        ['scope-a', settings('a')],
        ['scope-b', { ...settings('b'),
            activeApiPresetId: 'api-a',
            privateReplyPresetId: 'reply-a',
            privateProactivePresetId: 'proactive-a',
            proactive: { enabled: true, everyTurns: 3 },
        }],
    ]);
    const calls = [];
    const facade = {
        query: {
            async bootstrap() {
                calls.push(['bootstrap', scopeId]);
                return {
                    ok: true,
                    context: { scopeId },
                    globalSettings: settingsByScope.get(scopeId),
                };
            },
            async currentContext() {
                calls.push(['currentContext', scopeId]);
                return { ok: true, context: { scopeId } };
            },
        },
        intent: {
            async updateGlobalSettings(input) {
                calls.push(['updateGlobalSettings', input]);
                if (failNextSave) {
                    failNextSave = false;
                    return { ok: false, status: 'failed', error: { message: 'simulated save failure' } };
                }
                assert.equal(input.scopeId, scopeId, 'Facade writes are pinned to the rendered chat scope');
                settingsByScope.set(scopeId, { ...settingsByScope.get(scopeId), ...input.settings });
                return { ok: true, status: 'accepted', settings: settingsByScope.get(scopeId) };
            },
        },
    };

    const initial = await loadQQSettingsModel(facade);
    assert.equal(initial.ok, true);
    assert.equal(initial.scopeId, 'scope-a');
    assert.deepEqual(initial.groups, [
        { kind: 'reply', title: 'AI \u56de\u590d\u4e0e\u4e3b\u52a8\u6d88\u606f' },
        { kind: 'context', title: '\u4e0a\u4e0b\u6587' },
        { kind: 'worldbook', title: '\u4e16\u754c\u4e66\u6ce8\u5165' },
        { kind: 'image-library', title: '\u56fe\u7247\u8d44\u6599' },
    ]);
    assert.doesNotMatch(JSON.stringify(initial.groups), /group|theme/i, 'private-only QQ settings hide group and theme controls');
    assert.equal(initial.settings.groupReplyPresetId, undefined, 'read model never exposes hidden group configuration');
    assert.equal(initial.settings.groupProactivePresetId, undefined, 'read model never exposes hidden group configuration');

    const uiSource = fs.readFileSync(path.join(process.cwd(), 'modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(uiSource, /const settingTimeWindow =/, 'time range controls share one UI field');
    assert.match(uiSource, /settingTimeWindow\(timeWindow\)/, 'worldbook settings render the merged time range field');
    assert.match(uiSource, /'injectionCount'/, 'worldbook settings expose the injection count control');

    const worldbookSave = await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'worldbook',
        values: {
            enabled: true,
            bookName: 'book-next',
            timeWindowMode: 'relative',
            timeWindowValue: '6',
            timeWindowUnit: 'hour',
            injectionCount: '18',
            light: 'blue',
            depth: '11',
            keywords: 'north\u3001north\u3001 dawn ',
        },
    });
    assert.equal(worldbookSave.ok, true, 'a settings field change saves immediately');
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: {
            worldbook: {
                enabled: true,
                bookName: 'book-next',
                timeWindow: { mode: 'relative', value: 6, unit: 'hour' },
                injectionCount: 18,
                light: 'blue',
                depth: 11,
                keywords: ['north', 'dawn'],
            },
        },
    }]);

    const fieldSave = await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'reply',
        field: 'activeApiPresetId',
        values: {
            activeApiPresetId: 'api-next',
            privateReplyPresetId: 'must-not-overwrite',
            enabled: false,
        },
    });
    assert.equal(fieldSave.ok, true);
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: { activeApiPresetId: 'api-next' },
    }], 'reply changes persist only the field that actually changed');

    await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'context',
        field: 'hostContextTurns',
        values: { hostContextTurns: '9', conversationHistoryLimit: 'must-not-overwrite' },
    });
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: { hostContextTurns: 9 },
    }], 'context changes persist only the field that actually changed');

    await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'worldbook',
        field: 'bookName',
        values: {
            bookName: 'scope-a-manual-book',
            enabled: false,
            timeWindowMode: 'all',
            light: 'blue',
            depth: '999',
            keywords: 'must-not-overwrite',
        },
    });
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: { worldbook: { bookName: 'scope-a-manual-book' } },
    }], 'the chat-local worldbook selection never carries shared policy fields');

    await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'worldbook',
        field: 'light',
        values: { bookName: 'must-not-overwrite', light: 'green', depth: '777' },
    });
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: { worldbook: { light: 'green' } },
    }], 'shared worldbook policy changes never carry the chat-local book selection');

    await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'worldbook',
        field: 'timeWindowValue',
        values: { timeWindowMode: 'relative', timeWindowValue: '5', timeWindowUnit: 'day' },
    });
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: { worldbook: { timeWindow: { mode: 'relative', value: 5, unit: 'day' } } },
    }], 'a time-window control saves the complete nested value as one field');

    await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'worldbook',
        field: 'injectionCount',
        values: { injectionCount: '24', timeWindowMode: 'all' },
    });
    assert.deepEqual(calls.at(-1), ['updateGlobalSettings', {
        scopeId: 'scope-a',
        settings: { worldbook: { injectionCount: 24 } },
    }], 'injection count persists as a global worldbook policy field');

    const gate = deferred();
    const order = [];
    const enqueue = createSettingsSaveQueue();
    const firstSave = enqueue(async () => {
        order.push('first:start');
        await gate.promise;
        order.push('first:end');
    });
    const secondSave = enqueue(async () => {
        order.push('second:start');
        order.push('second:end');
    });
    await Promise.resolve();
    assert.deepEqual(order, ['first:start'], 'a later field save cannot overtake an older save');
    gate.resolve();
    await Promise.all([firstSave, secondSave]);
    assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);

    failNextSave = true;
    const failed = await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'reply',
        values: { enabled: true, everyTurns: '2', privateProactivePresetId: 'proactive-next' },
    });
    assert.equal(failed.ok, false, 'failed immediate saves preserve the error for the visible form');
    assert.equal(failed.error.message, 'simulated save failure');

    const writesBeforeScopeChange = calls.filter(([name]) => name === 'updateGlobalSettings').length;
    scopeId = 'scope-b';
    const stale = await saveQQSettings(facade, {
        scopeId: initial.scopeId,
        kind: 'context',
        values: { hostContextTurns: '9', conversationHistoryLimit: '18' },
    });
    assert.deepEqual(stale, { ok: false, status: 'stale', reason: 'scope-changed' },
        'a form rendered for an old scope cannot save into the current scope');
    assert.equal(calls.filter(([name]) => name === 'updateGlobalSettings').length, writesBeforeScopeChange,
        'stale settings forms do not call the Facade write intent');

    const switched = await loadQQSettingsModel(facade);
    assert.equal(switched.scopeId, 'scope-b');
    assert.equal(switched.settings.activeApiPresetId, 'api-a', 'runtime selections remain global after a scope refresh');

    const source = fs.readFileSync(path.join(process.cwd(), 'modules/qq-v2/ui/app.js'), 'utf8');
    for (const [guard, message] of [
        ["if (kind === 'reply' && !resourcesResult?.ok)", 'failed shared resource loading'],
        ["if (kind === 'worldbook' && !worldbooksResult?.ok)", 'failed worldbook resource loading'],
    ]) {
        const resourceFailureGuard = source.indexOf(guard);
        const settingsFormCreation = source.indexOf("const form = createElement('form'", resourceFailureGuard);
        assert.ok(resourceFailureGuard >= 0 && settingsFormCreation > resourceFailureGuard);
        assert.match(source.slice(resourceFailureGuard, settingsFormCreation), /return main;/,
            `${message} exits before a savable form is created`);
    }
    console.log('[qq-global-settings-contract] passed');
}

main().catch((error) => {
    console.error('[qq-global-settings-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
