const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function createPersistentMemoryStore() {
    const records = new Map();
    const calls = [];
    return {
        calls,
        async read(key) {
            calls.push(['read', key]);
            const record = records.get(key);
            return record ? structuredClone(record) : null;
        },
        async write(record) {
            calls.push(['write', record.key]);
            records.set(record.key, structuredClone(record));
        },
        async remove(key) {
            calls.push(['remove', key]);
            records.delete(key);
        },
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
}

function canvas(overrides = {}) {
    return {
        id: 'post-cover',
        tableName: 'sheet_square',
        stableIdentityFields: ['帖子 ID'],
        promptFields: ['标题', '描述'],
        ...overrides,
    };
}

function request(overrides = {}) {
    return {
        canvas: canvas(),
        chatScope: 'chat:alpha',
        rowValues: {
            '帖子 ID': 'post-42',
            标题: '深夜咖啡店',
            描述: '窗边的热咖啡和雨夜',
            不应交给提示词拼接器: 'secret',
        },
        candidateRows: [
            { '帖子 ID': 'post-42', 标题: '深夜咖啡店', 描述: '窗边的热咖啡和雨夜' },
            { '帖子 ID': 'post-43', 标题: '另一条', 描述: '晴天' },
        ],
        ...overrides,
    };
}

async function createFixture(overrides = {}) {
    const store = overrides.store || createPersistentMemoryStore();
    const [repositoryModule, ownershipModule, tableServiceModule] = await Promise.all([
        importModule('modules/image-generation/stable-image-ownership-repository.js'),
        importModule('modules/image-generation/stable-image-ownership.js'),
        importModule('modules/image-generation/table-display-image-generation-service.js'),
    ]);
    const repository = repositoryModule.createStableImageOwnershipRepository({ store });
    const ownership = ownershipModule.createStableImageOwnershipService({
        store: repository,
        now: () => 1_800_000_000_000,
    });
    const calls = { enabled: [], generated: [], rechecks: [], composed: [] };
    const orchestrator = overrides.orchestrator || {
        async generate(input) {
            calls.generated.push(input);
            return {
                ok: true,
                status: 'generated',
                path: 'user/images/yuzi-phone-generated/post-42.png',
            };
        },
    };
    const service = tableServiceModule.createTableDisplayImageGenerationService({
        ownershipService: ownership,
        orchestrator,
        async isTableEnabled(input) {
            calls.enabled.push(input);
            return overrides.enabled ?? true;
        },
        async isCurrentTarget(input) {
            calls.rechecks.push(input);
            return overrides.current ?? true;
        },
        composePrompt: overrides.composePrompt || (async input => {
            calls.composed.push(input);
            return `${input.promptValues.标题}；${input.promptValues.描述}`;
        }),
    });
    return { store, repository, ownership, service, calls, ...ownershipModule };
}

async function testRepositoryPersistsOwnershipAcrossFreshRepositoryAndServiceInstances() {
    const store = createPersistentMemoryStore();
    const first = await createFixture({ store });
    const result = await first.service.generate(request());
    assert.equal(result.ok, true);

    const [repositoryModule, ownershipModule] = await Promise.all([
        importModule('modules/image-generation/stable-image-ownership-repository.js'),
        importModule('modules/image-generation/stable-image-ownership.js'),
    ]);
    const reloadedRepository = repositoryModule.createStableImageOwnershipRepository({ store });
    const reloadedOwnership = ownershipModule.createStableImageOwnershipService({ store: reloadedRepository });
    const record = await reloadedOwnership.read(result.target);

    assert.equal(record.imagePath, 'user/images/yuzi-phone-generated/post-42.png');
    record.identityValues[0] = 'tampered';
    assert.equal((await reloadedOwnership.read(result.target)).identityValues[0], 'post-42', '仓储回读必须不泄露可变持久记录');
    assert.equal(store.calls.some(([operation]) => operation === 'remove'), false, 'repository 默认不得删除已生成文件归属');
}

async function testPersistsTheExactGeneratedPathWithoutCanonicalizingIt() {
    const pathWithFullWidthPunctuation = 'user/images/yuzi-phone-generated/帖子；42.png';
    const fixture = await createFixture({
        orchestrator: {
            async generate() {
                return { ok: true, status: 'generated', path: pathWithFullWidthPunctuation };
            },
        },
    });
    const result = await fixture.service.generate(request());

    assert.equal(result.imagePath, pathWithFullWidthPunctuation);
    assert.equal((await fixture.service.read(request())).imagePath, pathWithFullWidthPunctuation);
}

async function testGeneratesOnlyFromDeclaredCanvasFieldsAndFixedFolder() {
    const fixture = await createFixture();
    const result = await fixture.service.generate(request({
        generation: {
            timeoutMs: 90_000,
            folder: 'not-allowed',
            filename: 'author-cover',
        },
    }));

    assert.equal(result.ok, true);
    assert.equal(result.status, 'generated');
    assert.equal(result.imagePath, 'user/images/yuzi-phone-generated/post-42.png');
    assert.deepEqual(fixture.calls.composed, [{
        canvas: canvas(),
        chatScope: 'chat:alpha',
        promptValues: {
            标题: '深夜咖啡店',
            描述: '窗边的热咖啡和雨夜',
        },
    }]);
    assert.deepEqual(fixture.calls.generated, [{
        timeoutMs: 90_000,
        folder: 'yuzi-phone-generated',
        filename: 'author-cover',
        naturalPrompt: '深夜咖啡店；窗边的热咖啡和雨夜',
    }]);
    assert.deepEqual(fixture.calls.enabled, [{
        chatScope: 'chat:alpha',
        tableName: 'sheet_square',
        canvas: canvas(),
    }]);
    assert.equal(fixture.calls.rechecks.length, 1);
    assert.equal(fixture.calls.rechecks[0].target.physicalTable, 'sheet_square');
    assert.equal(fixture.calls.rechecks[0].target.identityValues[0], 'post-42');
}

async function testDisabledTableAndDuplicateIdentityNeverCallSharedOrchestrator() {
    const disabled = await createFixture({ enabled: false });
    const disabledResult = await disabled.service.generate(request());
    assert.deepEqual(disabledResult, { ok: false, status: 'disabled', reason: 'table-disabled' });
    assert.equal(disabled.calls.generated.length, 0);
    assert.equal(disabled.store.calls.some(([operation]) => operation === 'write'), false);

    const duplicate = await createFixture();
    const duplicateResult = await duplicate.service.generate(request({
        candidateRows: [
            { '帖子 ID': 'post-42', 标题: '第一条', 描述: 'A' },
            { '帖子 ID': ' post-42 ', 标题: '第二条', 描述: 'B' },
        ],
    }));
    assert.deepEqual(duplicateResult, { ok: false, status: 'invalid-target', reason: 'identity-duplicate' });
    assert.equal(duplicate.calls.generated.length, 0);
}

async function testFailureRetainsOldImageAndSuccessfulRegenerationReplacesIt() {
    const store = createPersistentMemoryStore();
    const first = await createFixture({ store });
    const initial = await first.service.generate(request());
    assert.equal(initial.ok, true);

    const failing = await createFixture({
        store,
        orchestrator: {
            async generate() {
                return { ok: false, status: 'failed', error: { code: 'provider-offline' } };
            },
        },
    });
    const failed = await failing.service.generate(request());
    assert.deepEqual(failed, {
        ok: false,
        status: 'failed',
        reason: 'image-generation-failed',
        previousImagePath: 'user/images/yuzi-phone-generated/post-42.png',
        generation: { ok: false, status: 'failed', error: { code: 'provider-offline' } },
    });
    assert.equal((await failing.service.read(request())).imagePath, 'user/images/yuzi-phone-generated/post-42.png');

    const regenerated = await createFixture({
        store,
        orchestrator: {
            async generate() {
                return {
                    ok: true,
                    status: 'generated',
                    path: 'user/images/yuzi-phone-generated/post-42-regenerated.png',
                };
            },
        },
    });
    const replacement = await regenerated.service.generate(request());
    assert.equal(replacement.ok, true);
    assert.equal(replacement.previousImagePath, 'user/images/yuzi-phone-generated/post-42.png');
    assert.equal((await regenerated.service.read(request())).imagePath, 'user/images/yuzi-phone-generated/post-42-regenerated.png');
    assert.equal(store.calls.some(([operation]) => operation === 'remove'), false);
}

async function testAcceptsDirectNaturalPromptButRejectsChangedOwnershipBeforeWriting() {
    const fixture = await createFixture({
        current: false,
        composePrompt: async () => {
            throw new Error('提供 naturalPrompt 时不应再调用拼接器');
        },
    });
    const result = await fixture.service.generate(request({
        naturalPrompt: '保留这条作者已准备好的自然提示词；不做身份字段规范化。',
    }));

    assert.deepEqual(fixture.calls.generated, [{
        naturalPrompt: '保留这条作者已准备好的自然提示词；不做身份字段规范化。',
        folder: 'yuzi-phone-generated',
    }]);
    assert.deepEqual(result, {
        ok: false,
        status: 'stale',
        reason: 'ownership-changed',
        previousImagePath: '',
    });
    assert.equal(await fixture.service.read(request()), null, '归属复核失败不得把晚到图片写进旧内容');
}

async function testPreventsDuplicateRequestsAndRejectsInvalidatedLateResultsWithoutHurtingOtherChats() {
    const alphaWait = deferred();
    const betaWait = deferred();
    const generated = [];
    const fixture = await createFixture({
        orchestrator: {
            async generate(input) {
                generated.push(input);
                return input.naturalPrompt.includes('beta') ? betaWait.promise : alphaWait.promise;
            },
        },
        composePrompt: async input => input.chatScope === 'chat:beta' ? 'beta prompt' : 'alpha prompt',
    });

    const alphaRequest = request();
    const alphaPending = fixture.service.generate(alphaRequest);
    const duplicate = await fixture.service.generate(alphaRequest);
    assert.deepEqual(duplicate, { ok: false, status: 'busy', reason: 'generation-in-progress' });
    await new Promise(resolve => setImmediate(resolve)); // busy now rejects before async prompt composition finishes.
    assert.equal(generated.length, 1, '同一稳定归属生成中必须防重复');

    const betaPending = fixture.service.generate(request({ chatScope: 'chat:beta' }));
    fixture.service.invalidateChatScope('chat:alpha');
    alphaWait.resolve({ ok: true, status: 'generated', path: 'user/images/yuzi-phone-generated/alpha-late.png' });
    betaWait.resolve({ ok: true, status: 'generated', path: 'user/images/yuzi-phone-generated/beta.png' });

    const [alpha, beta] = await Promise.all([alphaPending, betaPending]);
    assert.deepEqual(alpha, {
        ok: false,
        status: 'stale',
        reason: 'ticket-invalid',
        previousImagePath: '',
    });
    assert.equal(beta.ok, true, '一个聊天切换/撤销后，其他聊天的合法请求必须仍可提交');
    assert.equal(await fixture.service.read(alphaRequest), null);
    assert.equal((await fixture.service.read(request({ chatScope: 'chat:beta' }))).imagePath, 'user/images/yuzi-phone-generated/beta.png');
}

async function main() {
    await testRepositoryPersistsOwnershipAcrossFreshRepositoryAndServiceInstances();
    await testPersistsTheExactGeneratedPathWithoutCanonicalizingIt();
    await testGeneratesOnlyFromDeclaredCanvasFieldsAndFixedFolder();
    await testDisabledTableAndDuplicateIdentityNeverCallSharedOrchestrator();
    await testFailureRetainsOldImageAndSuccessfulRegenerationReplacesIt();
    await testAcceptsDirectNaturalPromptButRejectsChangedOwnershipBeforeWriting();
    await testPreventsDuplicateRequestsAndRejectsInvalidatedLateResultsWithoutHurtingOtherChats();
    console.log('[image-generation-table-display] passed');
}

main().catch((error) => {
    console.error('[image-generation-table-display] failed');
    console.error(error);
    process.exitCode = 1;
});
