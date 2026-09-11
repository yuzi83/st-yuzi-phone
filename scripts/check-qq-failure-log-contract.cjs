const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = file => import(pathToFileURL(path.resolve(file)).href);

async function main() {
    const { createQQFailureLog, QQ_FAILURE_LOG_LIMITS } = await load('modules/qq-v2/request/failure-log.js');
    const { createQQV2RequestService } = await load('modules/qq-v2/request/service.js');
    const { createQQV2ActionService } = await load('modules/qq-v2/protocol/action-service.js');
    const { createQQV2ProactiveService } = await load('modules/qq-v2/proactive/service.js');
    const { createSillyTavernQQV2Backend } = await load('modules/qq-v2/request/backend-proxy.js');
    const { buildFailureLogCard, formatFailureLog } = await load('modules/settings-app/pages/logs.js');
    const error = (code, message = code, name = 'Error') => Object.assign(new Error(message), { code, name });
    const log = createQQFailureLog();
    log.setScope('A');
    let notified = 0;
    const unsubscribe = log.subscribe(() => { notified += 1; });
    log.subscribe(() => { throw new Error('broken observer'); });
    const add = (details = {}, failure = error('protocol_invalid')) => {
        const attempt = log.begin({ scopeId: 'A', ...details });
        log.record(attempt, failure);
        return attempt;
    };
    const attempt = add({ response: '<script>alert(1)</script> api_key="hidden-secret"', apiKey: 'hidden-secret' });
    log.record(attempt, error('protocol_invalid'));
    assert.equal(log.getSnapshot().entries.length, 1, 'one entry per attempt');
    const entry = log.getSnapshot().entries[0];
    assert.ok(!entry.response.includes('hidden-secret'));
    assert.ok(buildFailureLogCard(entry).includes('&lt;script&gt;'));
    assert.ok(!buildFailureLogCard(entry).includes('<script>'));
    assert.ok(formatFailureLog(entry).includes('技术详情'));
    for (const response of ['', '短回复', '长'.repeat(1000)]) {
        const card = buildFailureLogCard({ ...entry, response });
        assert.equal((card.match(/<details>/g) || []).length, 4, 'all four sections are collapsible');
        assert.ok(!/<details\b[^>]*\bopen\b/.test(card), 'all sections start collapsed');
        for (const title of ['本次 AI 原始返回', '这次是什么问题', '你可以怎么做', '技术详情']) {
            assert.ok(card.includes(`<summary>${title}</summary>`));
        }
    }
    assert.ok(!JSON.stringify(entry).includes('哈吉米'));
    const pending = log.begin({ scopeId: 'A' });
    log.clear();
    log.record(pending, error('protocol_invalid'));
    assert.equal(log.getSnapshot().entries.length, 0, 'clear invalidates pending diagnostics');
    const old = log.begin({ scopeId: 'A' });
    log.setScope('B'); log.setScope('A');
    log.record(old, error('protocol_invalid'));
    assert.equal(log.getSnapshot().entries.length, 0, 'A -> B -> A cannot resurrect old requests');
    add({}, error('request_cancelled')); add({}, error('scope_inactive')); add({}, error('', '', 'AbortError'));
    assert.equal(log.getSnapshot().entries.length, 0, 'normal cancellations are not failures');
    log.clear();
    const completed = log.begin({ scopeId: 'A' }); completed.stage = 'completed';
    log.record(completed, error('projection_failed'));
    assert.equal(log.getSnapshot().entries.length, 0);
    for (let i = 0; i < 55; i += 1) add({ response: `response ${i}` });
    assert.equal(log.getSnapshot().entries.length, 50);
    assert.equal(log.getSnapshot().entries[0].response, 'response 54');
    assert.equal(log.getSnapshot().entries.at(-1).response, 'response 5');
    const revision = log.getSnapshot().revision;
    log.setScope('A'); assert.equal(log.getSnapshot().revision, revision, 'same scope retains logs');
    log.clear();
    for (let i = 0; i < 50; i += 1) add({ response: 'x'.repeat(50000) });
    assert.ok(log.getSnapshot().trimmed);
    assert.ok(log.getSnapshot().entries.length < 50);
    assert.ok(log.getSnapshot().entries[0].response.endsWith('[已截断]'));
    assert.ok(JSON.stringify(log.getSnapshot().entries).length < QQ_FAILURE_LOG_LIMITS.total + 100);
    unsubscribe();
    const n = notified; log.clear(); assert.equal(notified, n);
    assert.equal(createQQFailureLog().getSnapshot().entries.length, 0, 'new page runtime has no persisted log');

    const preset = { endpoint: 'https://example.com/v1', apiKey: 'private-api-key', model: 'test-model' };
    async function backendFailure(response) {
        const backend = createSillyTavernQQV2Backend({ fetchImpl: async () => response });
        try { await backend.generate({ preset, messages: [{ role: 'user', content: 'hello' }] }); }
        catch (failure) { return failure; }
        assert.fail('expected backend failure');
    }
    const empty = await backendFailure({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) });
    assert.equal(empty.failureKind, 'empty');
    const invalid = await backendFailure({ ok: false, status: 502, json() {}, text: async () => '<html>private-api-key gateway</html>' });
    assert.equal(invalid.status, 502);
    assert.ok(!invalid.responseText.includes(preset.apiKey));
    const malformed = await backendFailure({ ok: true, json: async () => ({ unexpected: 'payload' }) });
    assert.equal(malformed.failureKind, undefined, 'malformed API envelope is not an empty AI reply');
    const http = await backendFailure({ ok: false, status: 429, json: async () => ({ error: 'slow down' }) });
    assert.equal(http.status, 429); assert.equal(http.message, 'slow down');

    async function run({ kind = 'private', proactive = false, failure = 'protocol', mutate = null } = {}) {
        const logs = createQQFailureLog(); logs.setScope('scope');
        const controller = new AbortController();
        const session = { scopeId: 'scope', signal: controller.signal, isCurrent: () => !controller.signal.aborted, isReady: () => !controller.signal.aborted };
        const conversation = { conversationId: 'c', personId: 'p', groupId: 'g', kind, status: 'active', lastHandledUserSequence: 0 };
        const settings = { activeApiPresetId: failure === 'config' ? '' : 'api', privateReplyPresetId: 'prompt', groupReplyPresetId: 'prompt', privateProactivePresetId: 'prompt', groupProactivePresetId: 'prompt', proactive: { enabled: true } };
        const repository = {
            getScope: async () => ({ settings }), ensureScope: async () => ({ settings }),
            getConversation: async () => conversation,
            listConversations: async () => [conversation],
            getPerson: async () => ({ personId: 'p', formalName: '测试人物' }),
            getGroup: async () => ({ name: '测试群', status: 'active', memberIds: ['p'] }),
            listMessages: async () => [{ messageId: 'm', sequence: 1, senderType: 'self', senderId: '__self__', type: 'text', content: 'hello' }],
            appendMessages: async () => [],
            applyAIActions: async () => {
                if (failure === 'save') throw error('quota_exceeded', 'storage full');
                if (failure === 'domain') throw error('person_not_found', '人物不存在', 'QQV2DomainError');
                return { applied: [{ type: 'read' }] };
            },
        };
        const parseResponse = () => {
            if (failure === 'protocol') throw error('protocol_invalid', 'QQ XML 格式无效');
            return [{ type: 'read', conversation: 'P1' }];
        };
        const actionService = createQQV2ActionService({ repository, parseResponse, validateActions: () => {
            if (failure === 'validation') throw error('protocol_invalid', '会话引用不存在');
        } });
        const backend = { generate: async () => {
            mutate?.({ logs, controller });
            if (failure === 'empty') throw empty;
            if (failure === 'http') throw http;
            if (failure === 'database') throw error('database_api_failed');
            return { content: '<bad>private-api-key</bad>', model: 'actual-model' };
        } };
        const deps = { repository, backend, apiPresetResolver: async () => preset, promptPresetResolver: async () => ({}), captureScopeSession: () => session };
        const requests = createQQV2RequestService({
            ...deps, failureLog: logs, parseResponse, validateActions: () => {},
            buildManualRequest: async () => [{ role: 'user', content: 'prompt not to log' }],
            commitManualActions: input => actionService.execute(input),
        });
        if (proactive) {
            const service = createQQV2ProactiveService({
                ...deps, requestService: requests, actionService,
                buildProactiveRequest: async () => [{ role: 'user', content: 'private context' }],
            });
            await service.enqueueProactiveCycle({ scopeId: 'scope', kind });
        } else await requests.retry({ scopeId: 'scope', conversationId: 'c' });
        await requests.waitForIdle();
        return logs.getSnapshot().entries;
    }
    for (const proactive of [false, true]) {
        for (const kind of ['private', 'group']) {
            for (const [failure, title] of Object.entries({ protocol: '格式错误', save: '回复保存失败', domain: '动作不合法', validation: '动作不合法', empty: '空回', config: '配置问题', http: 'API / 网络失败', database: '原因不明' })) {
                const entries = await run({ proactive, kind, failure });
                assert.equal(entries.length, 1, `${kind} ${proactive} ${failure}`);
                assert.equal(entries[0].title, title, `${kind} ${proactive} ${failure}`);
                assert.ok(!JSON.stringify(entries).includes(preset.apiKey));
                assert.ok(!JSON.stringify(entries).includes('prompt not to log'));
                if (failure === 'protocol') {
                    assert.equal(entries[0].model, 'actual-model');
                    assert.ok(entries[0].response.includes('<bad>'));
                    assert.ok(entries[0].conversation.includes(kind === 'private' ? '测试人物' : '测试群'));
                }
            }
            assert.equal((await run({ proactive, kind, failure: 'success' })).length, 0, 'read is success');
            assert.equal((await run({ proactive, kind, mutate: ({ logs }) => logs.clear() })).length, 0);
            assert.equal((await run({ proactive, kind, mutate: ({ logs }) => logs.setScope('other') })).length, 0);
            assert.equal((await run({ proactive, kind, mutate: ({ controller }) => controller.abort() })).length, 0);
        }
    }
    console.log('[qq-failure-log-contract] passed: limits, privacy, lifecycle, markup, manual/group/proactive diagnostics');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
