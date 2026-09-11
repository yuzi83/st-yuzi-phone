const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function createMemoryStore() {
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
            return structuredClone(record);
        },
        // 领域服务默认不应调用删除；故意暴露它来保证黑盒契约可观察。
        async remove(key) {
            calls.push(['remove', key]);
            records.delete(key);
        },
    };
}

function targetInput(overrides = {}) {
    return {
        chatScope: 'chat:alpha',
        physicalTable: 'sheet_square',
        identityFields: ['帖子 ID', '作者'],
        identityValues: ['  post-42 ', ' Alice '],
        canvas: 'cover',
        ...overrides,
    };
}

async function createService(store) {
    const module = await importModule('modules/image-generation/stable-image-ownership.js');
    return {
        ...module,
        service: module.createStableImageOwnershipService({ store, now: () => 1_800_000_000_000 }),
    };
}

async function testCreatesStableOwnershipByScopePhysicalTableIdentityRuleValuesAndCanvas() {
    const store = createMemoryStore();
    const { createStableImageOwnershipTarget, service } = await createService(store);
    const target = createStableImageOwnershipTarget(targetInput());

    assert.deepEqual(target, {
        chatScope: 'chat:alpha',
        physicalTable: 'sheet_square',
        identityRule: ['帖子 ID', '作者'],
        identityValues: ['post-42', 'Alice'],
        canvas: 'cover',
        key: '["yuzi-stable-image-ownership/v1","chat:alpha","sheet_square",["帖子 ID","作者"],["post-42","Alice"],"cover"]',
    });

    const begun = await service.beginReplacement({
        target,
        identityCandidates: [
            ['post-42', 'Alice'],
            ['post-42', 'Bob'],
            ['duplicated-elsewhere', 'Same'],
            ['duplicated-elsewhere', 'Same'],
        ],
    });
    assert.equal(begun.ok, true);
    assert.equal(begun.previousImagePath, '');

    const saved = await service.commitReplacement({
        ticket: begun.ticket,
        imagePath: 'user/images/yuzi-phone-generated/post-42-cover.png',
        async recheckOwnership(rechecked) {
            assert.deepEqual(rechecked, target);
            return true;
        },
    });
    assert.deepEqual(saved, {
        ok: true,
        status: 'replaced',
        previousImagePath: '',
        record: {
            ...target,
            imagePath: 'user/images/yuzi-phone-generated/post-42-cover.png',
            savedAt: 1_800_000_000_000,
        },
    });

    const reread = await service.read(targetInput({ identityValues: ['post-42', 'Alice'] }));
    assert.deepEqual(reread, saved.record);
    assert.equal(store.calls.some(([operation]) => operation === 'remove'), false, '成功保存默认不删除文件或旧归属');
}

async function testRetainsOldImageUntilSuccessfulReplacementAndThenReplacesIt() {
    const store = createMemoryStore();
    const { createStableImageOwnershipTarget, service } = await createService(store);
    const target = createStableImageOwnershipTarget(targetInput());
    const first = await service.beginReplacement({ target, identityCandidates: [target.identityValues] });
    await service.commitReplacement({
        ticket: first.ticket,
        imagePath: 'user/images/yuzi-phone-generated/old.png',
        recheckOwnership: async () => true,
    });

    const next = await service.beginReplacement({ target, identityCandidates: [target.identityValues] });
    assert.equal(next.previousImagePath, 'user/images/yuzi-phone-generated/old.png');
    assert.equal((await service.read(target)).imagePath, 'user/images/yuzi-phone-generated/old.png', '开始新请求不能提前丢弃旧图');

    const failed = await service.commitReplacement({
        ticket: next.ticket,
        imagePath: '',
        recheckOwnership: async () => true,
    });
    assert.equal(failed.ok, false);
    assert.equal((await service.read(target)).imagePath, 'user/images/yuzi-phone-generated/old.png', '失败不能覆盖旧图');

    const retry = await service.beginReplacement({ target, identityCandidates: [target.identityValues] });
    const replaced = await service.commitReplacement({
        ticket: retry.ticket,
        imagePath: 'user/images/yuzi-phone-generated/new.png',
        recheckOwnership: async () => true,
    });
    assert.equal(replaced.previousImagePath, 'user/images/yuzi-phone-generated/old.png');
    assert.equal((await service.read(target)).imagePath, 'user/images/yuzi-phone-generated/new.png');
    assert.equal(store.calls.some(([operation]) => operation === 'remove'), false, '替换成功默认也不删除原文件');
}

async function testRejectsOnlyTheTargetWhoseIdentityIsEmptyOrDuplicated() {
    const store = createMemoryStore();
    const {
        createStableImageOwnershipTarget,
        validateStableImageOwnershipTarget,
        service,
    } = await createService(store);
    const normalTarget = createStableImageOwnershipTarget(targetInput());
    assert.deepEqual(
        validateStableImageOwnershipTarget({
            target: normalTarget,
            identityCandidates: [
                normalTarget.identityValues,
                ['other', 'same'],
                ['other', 'same'],
            ],
        }),
        { ok: true, target: normalTarget },
        '作者设置期可先独立验证当前内容，而不受其他内容重复影响',
    );
    const unrelatedDuplicate = await service.beginReplacement({
        target: normalTarget,
        identityCandidates: [
            normalTarget.identityValues,
            ['other', 'same'],
            ['other', 'same'],
        ],
    });
    assert.equal(unrelatedDuplicate.ok, true, '其他内容的重复标识不应禁用当前目标');

    const empty = await service.beginReplacement({
        target: targetInput({ identityValues: ['post-43', '   '] }),
        identityCandidates: [['post-43', '']],
    });
    assert.deepEqual(empty, { ok: false, status: 'invalid-target', reason: 'identity-empty' });

    const duplicated = await service.beginReplacement({
        target: targetInput({ identityValues: ['post-44', 'Alice'] }),
        identityCandidates: [
            ['post-44', 'Alice'],
            [' post-44 ', ' Alice '],
            ['post-42', 'Alice'],
        ],
    });
    assert.deepEqual(duplicated, { ok: false, status: 'invalid-target', reason: 'identity-duplicate' });
    assert.equal(store.calls.some(([operation]) => operation === 'write'), false, '无效目标不能写入或干扰其他归属');
}

async function testSeparatesCanvasesAndRejectsLateWritesAfterInvalidationOrNewerTicket() {
    const store = createMemoryStore();
    const { createStableImageOwnershipTarget, service } = await createService(store);
    const cover = createStableImageOwnershipTarget(targetInput({ canvas: 'cover' }));
    const gallery = createStableImageOwnershipTarget(targetInput({ canvas: 'gallery' }));
    assert.notEqual(cover.key, gallery.key, '同一内容的不同画布必须拥有独立归属');

    const first = await service.beginReplacement({ target: cover, identityCandidates: [cover.identityValues] });
    const later = await service.beginReplacement({ target: cover, identityCandidates: [cover.identityValues] });
    const stale = await service.commitReplacement({
        ticket: first.ticket,
        imagePath: 'user/images/yuzi-phone-generated/late.png',
        recheckOwnership: async () => true,
    });
    assert.deepEqual(stale, { ok: false, status: 'stale', reason: 'ticket-invalid' });

    service.invalidate(cover);
    const invalidated = await service.commitReplacement({
        ticket: later.ticket,
        imagePath: 'user/images/yuzi-phone-generated/invalidated.png',
        recheckOwnership: async () => true,
    });
    assert.deepEqual(invalidated, { ok: false, status: 'stale', reason: 'ticket-invalid' });

    const galleryTicket = await service.beginReplacement({ target: gallery, identityCandidates: [gallery.identityValues] });
    const recheckRejected = await service.commitReplacement({
        ticket: galleryTicket.ticket,
        imagePath: 'user/images/yuzi-phone-generated/gallery.png',
        recheckOwnership: async () => false,
    });
    assert.deepEqual(recheckRejected, { ok: false, status: 'stale', reason: 'ownership-changed' });
    assert.equal(await service.read(cover), null);
    assert.equal(await service.read(gallery), null);
}

async function testRejectsLateWritesForAnEntireChatScopeWithoutTouchingOtherChats() {
    const store = createMemoryStore();
    const { createStableImageOwnershipTarget, service } = await createService(store);
    const alpha = createStableImageOwnershipTarget(targetInput());
    const beta = createStableImageOwnershipTarget(targetInput({ chatScope: 'chat:beta' }));
    const alphaTicket = await service.beginReplacement({ target: alpha, identityCandidates: [alpha.identityValues] });
    const betaTicket = await service.beginReplacement({ target: beta, identityCandidates: [beta.identityValues] });

    service.invalidateChatScope('chat:alpha');
    const alphaResult = await service.commitReplacement({
        ticket: alphaTicket.ticket,
        imagePath: 'user/images/yuzi-phone-generated/alpha.png',
        recheckOwnership: async () => true,
    });
    const betaResult = await service.commitReplacement({
        ticket: betaTicket.ticket,
        imagePath: 'user/images/yuzi-phone-generated/beta.png',
        recheckOwnership: async () => true,
    });

    assert.deepEqual(alphaResult, { ok: false, status: 'stale', reason: 'ticket-invalid' });
    assert.equal(betaResult.ok, true, '切换/销毁一个聊天不得误伤其他聊天的进行中请求');
}

async function main() {
    await testCreatesStableOwnershipByScopePhysicalTableIdentityRuleValuesAndCanvas();
    await testRetainsOldImageUntilSuccessfulReplacementAndThenReplacesIt();
    await testRejectsOnlyTheTargetWhoseIdentityIsEmptyOrDuplicated();
    await testSeparatesCanvasesAndRejectsLateWritesAfterInvalidationOrNewerTicket();
    await testRejectsLateWritesForAnEntireChatScopeWithoutTouchingOtherChats();
    console.log('[image-generation-stable-ownership] passed');
}

main().catch((error) => {
    console.error('[image-generation-stable-ownership] failed');
    console.error(error);
    process.exitCode = 1;
});
