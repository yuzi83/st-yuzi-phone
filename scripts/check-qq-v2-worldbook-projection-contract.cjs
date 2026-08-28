const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createWorldbookGateway(initialBooks = {}) {
    const books = new Map(Object.entries(initialBooks).map(([name, data]) => [name, clone(data)]));
    let failNextSave = false;
    let failingBookName = '';
    const savedBookNames = [];
    return {
        async loadBook(name) {
            return books.has(name) ? clone(books.get(name)) : null;
        },
        async saveBook(name, data) {
            if (failNextSave || name === failingBookName) {
                failNextSave = false;
                failingBookName = '';
                throw new Error('模拟世界书保存失败');
            }
            books.set(name, clone(data));
            savedBookNames.push(name);
        },
        failNextSave() {
            failNextSave = true;
        },
        failSaveFor(name) {
            failingBookName = name;
        },
        removeBook(name) {
            books.delete(name);
        },
        getBook(name) {
            return books.has(name) ? clone(books.get(name)) : null;
        },
        setBook(name, data) {
            books.set(name, clone(data));
        },
        clearSavedBookNames() {
            savedBookNames.length = 0;
        },
        getSavedBookNames() {
            return [...savedBookNames];
        },
    };
}

async function createRepository() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    return createQQV2Repository({ stateStore: createMemoryQQV2StateStore() });
}

async function createPrivateFixture(repository) {
    const scopeId = 'scope-a';
    const { conversation, person } = await repository.createPrivateConversation(scopeId, { name: '林知夏' });
    const messages = await repository.appendMessages(scopeId, conversation.conversationId, [
        {
            senderId: '__self__',
            senderType: 'self',
            type: 'text',
            content: '早安',
            storyTime: '2042-05-01 08:00',
        },
        {
            senderId: person.personId,
            senderType: 'person',
            type: 'image',
            content: '一张日出照片',
            storyTime: '2042-05-01 08:01',
        },
        {
            senderId: '__self__',
            senderType: 'self',
            type: 'text',
            content: '昨天的旧消息',
            storyTime: '2042-04-28 08:00',
        },
    ]);
    return { scopeId, conversation, person, messages };
}

async function createGroupFixture(repository, { scopeId = 'scope-group', name = '同名群' } = {}) {
    const alice = await repository.createPrivateConversation(scopeId, { name: '林知夏' });
    const bob = await repository.createPrivateConversation(scopeId, { name: '周屿' });
    const { group, conversation } = await repository.createGroupConversation(scopeId, {
        name,
        memberIds: [alice.person.personId, bob.person.personId],
    });
    await repository.appendMessages(scopeId, conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: `${conversation.conversationId} 的群消息`,
        storyTime: '2042-05-01 09:00',
    }]);
    return { scopeId, group, conversation, alice, bob };
}

function qqEntries(book) {
    return Object.values(book?.entries || {}).filter((entry) => entry.extensions?.yuziPhoneQQV2?.version === 2);
}

function qqEntriesForScope(book, scopeId) {
    return qqEntries(book).filter((entry) => entry.extensions.yuziPhoneQQV2.scopeId === scopeId);
}

function qqEntriesForConversation(book, scopeId, conversationId) {
    return qqEntriesForScope(book, scopeId).filter((entry) => (
        entry.extensions.yuziPhoneQQV2.conversationId === conversationId
    ));
}

function yuziQQEntriesForConversation(book, conversationId) {
    const suffix = `｜${conversationId}`;
    return Object.values(book?.entries || {}).filter((entry) => (
        String(entry?.comment || '').startsWith('YuziQQ｜')
        && String(entry.comment).endsWith(suffix)
    ));
}

async function testProjectionUsesRealEntryAndGlobalGateKeepsConversationIntent() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    const entry = qqEntries(gateway.getBook('主书'))[0];
    assert.equal(entry.comment, `YuziQQ｜私聊｜林知夏｜${fixture.conversation.conversationId}`);
    assert.equal(entry.constant, true);
    assert.equal(entry.position, 4);
    assert.equal(entry.depth, 999);
    assert.equal(entry.role, 0);
    assert.deepEqual(entry.extensions.yuziPhoneQQV2, {
        version: 2,
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
    });
    assert.match(entry.content, /【QQ 私聊：林知夏】/);
    assert.match(entry.content, /\[2042-05-01\]/);
    assert.match(entry.content, /玩家：早安/);
    assert.match(entry.content, /林知夏：图片：一张日出照片/);

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(qqEntries(gateway.getBook('主书')).length, 0);
    assert.equal((await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.enabled, true);
}

async function testProjectionContentUsesYuziEnvelopeAndPreciseMessageTimes() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');

    {
        const repository = await createRepository();
        const fixture = await createPrivateFixture(repository);
        await repository.appendMessages(fixture.scopeId, fixture.conversation.conversationId, [
            {
                senderId: '__self__',
                senderType: 'self',
                type: 'text',
                content: '缺失时间消息',
                storyTime: '',
            },
            {
                senderId: fixture.person.personId,
                senderType: 'person',
                type: 'text',
                content: '无效时间消息',
                storyTime: '2042-05-01 08:99',
            },
            {
                senderId: fixture.person.personId,
                senderType: 'person',
                type: 'text',
                content: '只有日期消息',
                storyTime: '2042-05-02',
            },
        ]);
        const gateway = createWorldbookGateway({ 主书: { entries: {} } });
        const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
            userName: '玩家',
            storyTime: '2042-05-02 12:00',
        });
        await service.setConversationInjection({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime: '2042-05-02 12:00',
        });

        const [entry] = yuziQQEntriesForConversation(
            gateway.getBook('主书'),
            fixture.conversation.conversationId,
        );
        assert.equal(entry.content, [
            '<yuzi>',
            '【QQ 私聊：林知夏】',
            '参与者：玩家、林知夏',
            '',
            '[2042-05-01]',
            '[08:00] 玩家：早安',
            '[08:01] 林知夏：图片：一张日出照片',
            '[2042-04-28]',
            '[08:00] 玩家：昨天的旧消息',
            '[未知故事时间]',
            '玩家：缺失时间消息',
            '林知夏：无效时间消息',
            '[2042-05-02]',
            '林知夏：只有日期消息',
            '</yuzi>',
        ].join('\n'));
        assert.doesNotMatch(entry.content, /\[00:00\]/);
        assert.doesNotMatch(entry.content, /\[09:39\]/);
    }

    {
        const repository = await createRepository();
        const fixture = await createGroupFixture(repository, { name: '原群名' });
        await repository.appendMessages(fixture.scopeId, fixture.conversation.conversationId, [{
            senderId: fixture.alice.person.personId,
            senderType: 'person',
            type: 'image',
            content: '群聊照片',
            storyTime: '2042-05-01 09:01',
        }]);
        await repository.manageGroup(fixture.scopeId, {
            groupId: fixture.group.groupId,
            action: 'rename',
            value: '时间测试群',
            storyTime: '2042-05-01 09:02',
        });
        const gateway = createWorldbookGateway({ 群书: { entries: {} } });
        const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { enabled: true, bookName: '群书', timeWindow: { mode: 'all' } },
            userName: '玩家',
            storyTime: '2042-05-01 09:02',
        });
        await service.setConversationInjection({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime: '2042-05-01 09:02',
        });

        const [entry] = yuziQQEntriesForConversation(
            gateway.getBook('群书'),
            fixture.conversation.conversationId,
        );
        assert.equal(entry.content, [
            '<yuzi>',
            '【QQ群聊：时间测试群】',
            '当前成员：林知夏、周屿',
            '',
            '[2042-05-01]',
            `[09:00] 玩家：${fixture.conversation.conversationId} 的群消息`,
            '[09:01] 林知夏：图片：群聊照片',
            '[09:02] 系统：__self__修改了群名称',
            '</yuzi>',
        ].join('\n'));
    }
}

async function testStableCommentIdentitySurvivesMarkerStrippingWithoutDuplicateEntries() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '',
    });

    const initialEntries = yuziQQEntriesForConversation(
        gateway.getBook('主书'),
        fixture.conversation.conversationId,
    );
    assert.equal(initialEntries.length, 1);
    const originalUid = initialEntries[0].uid;

    for (let round = 0; round < 3; round += 1) {
        const externallySavedBook = gateway.getBook('主书');
        for (const entry of Object.values(externallySavedBook.entries)) delete entry.extensions;
        gateway.setBook('主书', externallySavedBook);

        const result = await service.syncConversation({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            userName: '玩家',
            storyTime: '',
        });
        assert.equal(result.status, 'synced');

        const entries = yuziQQEntriesForConversation(
            gateway.getBook('主书'),
            fixture.conversation.conversationId,
        );
        assert.equal(entries.length, 1, `第 ${round + 1} 轮同步后仍应只有一条投影`);
        assert.equal(entries[0].uid, originalUid, `第 ${round + 1} 轮同步后应原 UID 更新`);
        assert.deepEqual(entries[0].extensions?.yuziPhoneQQV2, {
            version: 2,
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
        });
    }

    await repository.updatePrivateProfile(
        fixture.scopeId,
        fixture.conversation.conversationId,
        { formalName: '林知秋' },
    );
    const externallySavedBook = gateway.getBook('主书');
    for (const entry of Object.values(externallySavedBook.entries)) delete entry.extensions;
    gateway.setBook('主书', externallySavedBook);
    await service.syncConversation({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        userName: '玩家',
        storyTime: '',
    });
    const renamedEntries = yuziQQEntriesForConversation(
        gateway.getBook('主书'),
        fixture.conversation.conversationId,
    );
    assert.equal(renamedEntries.length, 1);
    assert.equal(renamedEntries[0].uid, originalUid);
    assert.equal(
        renamedEntries[0].comment,
        `YuziQQ｜私聊｜林知秋｜${fixture.conversation.conversationId}`,
    );
}

async function testLegacyQQEntriesAreIgnoredWhileCurrentProjectionUsesItsOwnLifecycle() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    const legacyEntry = {
        uid: 41,
        comment: 'QQ｜私聊｜林知夏',
        content: '旧格式内容必须由用户手工处理',
        disable: false,
        extensions: {
            yuziPhoneQQV2: {
                version: 2,
                scopeId: fixture.scopeId,
                conversationId: fixture.conversation.conversationId,
            },
        },
    };
    gateway.setBook('主书', { entries: { 41: clone(legacyEntry) } });

    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.deepEqual(gateway.getBook('主书').entries['41'], legacyEntry);
    assert.equal(yuziQQEntriesForConversation(
        gateway.getBook('主书'),
        fixture.conversation.conversationId,
    ).length, 1);
    const externallySavedBook = gateway.getBook('主书');
    for (const entry of yuziQQEntriesForConversation(
        externallySavedBook,
        fixture.conversation.conversationId,
    )) delete entry.extensions;
    gateway.setBook('主书', externallySavedBook);

    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.deepEqual(gateway.getBook('主书').entries['41'], legacyEntry);
    assert.equal(yuziQQEntriesForConversation(
        gateway.getBook('主书'),
        fixture.conversation.conversationId,
    ).length, 0);

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.deepEqual(gateway.getBook('主书').entries['41'], legacyEntry);

    await service.removeScopeProjections({ scopeId: fixture.scopeId });
    assert.deepEqual(gateway.getBook('主书').entries['41'], legacyEntry);
}

async function testDuplicateCurrentProjectionFailsClosedAndMarksPending() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    const duplicatedBook = gateway.getBook('主书');
    const [existing] = yuziQQEntriesForConversation(
        duplicatedBook,
        fixture.conversation.conversationId,
    );
    const duplicate = clone(existing);
    duplicate.uid = existing.uid + 100;
    duplicate.content = '用户需要手工判断并删除的重复新版投影';
    delete duplicate.extensions;
    duplicatedBook.entries[String(duplicate.uid)] = duplicate;
    gateway.setBook('主书', duplicatedBook);
    gateway.clearSavedBookNames();
    const beforeSync = gateway.getBook('主书');

    const result = await service.syncConversation({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    assert.equal(result.status, 'pending');
    assert.equal(result.reason, 'projection-conflict');
    assert.equal(result.code, 'worldbook_projection_conflict');
    assert.match(result.message, /手工删除到只剩一条/);
    assert.deepEqual(gateway.getBook('主书'), beforeSync, '重复新版投影必须保持原样等待用户手工处理');
    assert.deepEqual(gateway.getSavedBookNames(), [], 'fail-closed 不得保存世界书');
    const projection = (await repository.getConversation(
        fixture.scopeId,
        fixture.conversation.conversationId,
    )).injection.projection;
    assert.equal(projection.pending, true);
    assert.deepEqual(projection.managedBookNames, ['主书']);

    gateway.clearSavedBookNames();
    const beforeDisable = gateway.getBook('主书');
    const disabled = await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(disabled.status, 'pending');
    assert.equal(disabled.reason, 'projection-conflict');
    assert.equal(disabled.code, 'worldbook_projection_conflict');
    assert.match(disabled.message, /手工删除到只剩一条/);
    assert.deepEqual(gateway.getBook('主书'), beforeDisable);
    assert.deepEqual(gateway.getSavedBookNames(), []);
    assert.equal((await repository.getConversation(
        fixture.scopeId,
        fixture.conversation.conversationId,
    )).injection.projection.pending, true);

    gateway.clearSavedBookNames();
    const beforeGlobalDisable = gateway.getBook('主书');
    const globalDisabled = await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(globalDisabled.status, 'pending');
    assert.equal(globalDisabled.reason, 'projection-conflict');
    assert.equal(globalDisabled.code, 'worldbook_projection_conflict');
    assert.match(globalDisabled.message, /手工删除到只剩一条/);
    assert.deepEqual(gateway.getBook('主书'), beforeGlobalDisable);
    assert.deepEqual(gateway.getSavedBookNames(), []);
}

async function testSyncPreflightsDuplicateTargetAndHistoricalBooksBeforeAnySave() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');

    {
        const repository = await createRepository();
        const fixture = await createPrivateFixture(repository);
        const gateway = createWorldbookGateway({ 主书: { entries: {} } });
        const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
        await service.setConversationInjection({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
        const duplicateBook = gateway.getBook('主书');
        const source = yuziQQEntriesForConversation(
            duplicateBook,
            fixture.conversation.conversationId,
        )[0];
        const duplicate = clone(source);
        duplicate.uid = source.uid + 100;
        delete duplicate.extensions;
        duplicateBook.entries[String(duplicate.uid)] = duplicate;
        gateway.setBook('主书', duplicateBook);
        await repository.updateWorldbookSettings(fixture.scopeId, {
            timeWindow: { mode: 'relative', value: 1, unit: 'day' },
        });
        gateway.clearSavedBookNames();
        const beforeSync = gateway.getBook('主书');

        const result = await service.syncConversation({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            userName: '玩家',
            storyTime: '',
        });

        assert.equal(result.status, 'pending');
        assert.equal(result.reason, 'projection-conflict');
        assert.deepEqual(gateway.getBook('主书'), beforeSync);
        assert.deepEqual(gateway.getSavedBookNames(), []);
    }

    {
        const repository = await createRepository();
        const fixture = await createPrivateFixture(repository);
        const gateway = createWorldbookGateway({
            旧书: { entries: {} },
            新书: { entries: {} },
        });
        const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { enabled: true, bookName: '旧书', timeWindow: { mode: 'all' } },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
        await service.setConversationInjection({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { bookName: '新书' },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
        const source = yuziQQEntriesForConversation(
            gateway.getBook('新书'),
            fixture.conversation.conversationId,
        )[0];
        const first = clone(source);
        const second = clone(source);
        first.uid = 81;
        second.uid = 82;
        delete first.extensions;
        delete second.extensions;
        gateway.setBook('旧书', { entries: { 81: first, 82: second } });
        await repository.setConversationProjection(fixture.scopeId, fixture.conversation.conversationId, {
            bookName: '新书',
            entryUid: source.uid,
            managedBookNames: ['新书', '旧书'],
            pending: true,
        });
        gateway.clearSavedBookNames();
        const oldBookBefore = gateway.getBook('旧书');
        const newBookBefore = gateway.getBook('新书');

        const result = await service.syncConversation({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });

        assert.equal(result.status, 'pending');
        assert.equal(result.reason, 'projection-conflict');
        assert.deepEqual(gateway.getBook('旧书'), oldBookBefore);
        assert.deepEqual(gateway.getBook('新书'), newBookBefore);
        assert.deepEqual(gateway.getSavedBookNames(), []);
    }
}

async function testGroupProjectionIdentitySupportsSameNamesRenameAndGlobalCleanup() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const first = await createGroupFixture(repository);
    const second = await repository.createGroupConversation(first.scopeId, {
        name: '同名群',
        memberIds: [first.alice.person.personId, first.bob.person.personId],
    });
    await repository.appendMessages(first.scopeId, second.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: '第二个同名群的消息',
        storyTime: '2042-05-01 09:01',
    }]);
    const gateway = createWorldbookGateway({ 群书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: first.scopeId,
        settings: { enabled: true, bookName: '群书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 09:01',
    });
    for (const conversationId of [
        first.conversation.conversationId,
        second.conversation.conversationId,
    ]) {
        await service.setConversationInjection({
            scopeId: first.scopeId,
            conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime: '2042-05-01 09:01',
        });
    }

    const firstEntry = yuziQQEntriesForConversation(
        gateway.getBook('群书'),
        first.conversation.conversationId,
    )[0];
    const secondEntry = yuziQQEntriesForConversation(
        gateway.getBook('群书'),
        second.conversation.conversationId,
    )[0];
    assert.equal(firstEntry.comment, `YuziQQ｜群聊｜同名群｜${first.conversation.conversationId}`);
    assert.equal(secondEntry.comment, `YuziQQ｜群聊｜同名群｜${second.conversation.conversationId}`);
    assert.notEqual(firstEntry.uid, secondEntry.uid);

    const externallySavedBook = gateway.getBook('群书');
    for (const entry of Object.values(externallySavedBook.entries)) delete entry.extensions;
    gateway.setBook('群书', externallySavedBook);
    await repository.manageGroup(first.scopeId, {
        groupId: first.group.groupId,
        action: 'rename',
        value: '改名群',
        storyTime: '2042-05-01 09:02',
    });
    await service.syncConversation({
        scopeId: first.scopeId,
        conversationId: first.conversation.conversationId,
        userName: '玩家',
        storyTime: '2042-05-01 09:02',
    });

    const renamedEntry = yuziQQEntriesForConversation(
        gateway.getBook('群书'),
        first.conversation.conversationId,
    )[0];
    assert.equal(renamedEntry.uid, firstEntry.uid);
    assert.equal(renamedEntry.comment, `YuziQQ｜群聊｜改名群｜${first.conversation.conversationId}`);
    assert.equal(yuziQQEntriesForConversation(
        gateway.getBook('群书'),
        second.conversation.conversationId,
    )[0].uid, secondEntry.uid);

    await service.setGlobalSettings({
        scopeId: first.scopeId,
        settings: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 09:02',
    });
    assert.equal(yuziQQEntriesForConversation(
        gateway.getBook('群书'),
        first.conversation.conversationId,
    ).length, 0);
    assert.equal(yuziQQEntriesForConversation(
        gateway.getBook('群书'),
        second.conversation.conversationId,
    ).length, 0);
}

async function testInjectedWorldbookSettingsOverrideRepositoryProjectionSettings() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    await repository.updateWorldbookSettings(fixture.scopeId, {
        enabled: false,
        bookName: '仓储旧书',
        timeWindow: { mode: 'all' },
        light: 'blue',
        depth: 999,
        keywords: [],
    });
    await repository.updateConversationInjection(fixture.scopeId, fixture.conversation.conversationId, { enabled: true });

    let settings = {
        enabled: true,
        bookName: '接口新书',
        timeWindow: { mode: 'all' },
        light: 'green',
        depth: 12,
        keywords: ['共享关键词'],
    };
    const updates = [];
    const worldbookSettings = {
        async get() {
            return clone(settings);
        },
        async update(scopeId, patch) {
            updates.push([scopeId, clone(patch)]);
            settings = { ...settings, ...clone(patch) };
            return clone(settings);
        },
    };
    const gateway = createWorldbookGateway({
        仓储旧书: { entries: {} },
        接口新书: { entries: {} },
    });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway, worldbookSettings });

    await service.syncConversation({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    let entry = qqEntries(gateway.getBook('接口新书'))[0];
    assert.ok(entry);
    assert.equal(qqEntries(gateway.getBook('仓储旧书')).length, 0);
    assert.equal(entry.constant, false);
    assert.equal(entry.depth, 12);
    assert.ok(entry.key.includes('共享关键词'));

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { depth: 8 },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    entry = qqEntries(gateway.getBook('接口新书'))[0];
    assert.equal(entry.depth, 8);
    assert.deepEqual(updates, [[fixture.scopeId, { depth: 8 }]]);
    assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).bookName, '仓储旧书');
    assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).enabled, false);
}

async function testWindowSelectionGreenSettingsAndSafeTargetMigration() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({
        主书: {
            entries: {
                400: {
                    uid: 400,
                    content: '同作用域另一会话的历史 QQ 投影',
                    extensions: {
                        yuziPhoneQQV2: { version: 2, scopeId: fixture.scopeId, conversationId: 'other-conversation' },
                    },
                },
                401: {
                    uid: 401,
                    content: '其他作用域的历史 QQ 投影',
                    extensions: {
                        yuziPhoneQQV2: { version: 2, scopeId: 'scope-b', conversationId: 'foreign-conversation' },
                    },
                },
            },
        },
        新书: { entries: {} },
        失败新书: { entries: {} },
    });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: {
            enabled: true,
            bookName: '主书',
            timeWindow: { mode: 'relative', value: 1, unit: 'day' },
            light: 'green',
            depth: 7,
            keywords: ['全局词'],
        },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setMessageSelected({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        messageId: fixture.messages[2].messageId,
        selected: true,
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true, keywords: ['会话词'] },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    const oldEntry = qqEntriesForScope(gateway.getBook('主书'), fixture.scopeId)
        .find((entry) => entry.extensions.yuziPhoneQQV2.conversationId === fixture.conversation.conversationId);
    assert.equal(oldEntry.constant, false);
    assert.equal(oldEntry.depth, 7);
    assert.deepEqual(oldEntry.key, ['林知夏', '全局词', '会话词']);
    assert.match(oldEntry.content, /昨天的旧消息/);

    gateway.clearSavedBookNames();
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { bookName: '新书' },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.deepEqual(gateway.getSavedBookNames(), ['新书', '主书']);
    assert.equal(qqEntries(gateway.getBook('主书')).length, 2);
    assert.equal(qqEntriesForScope(gateway.getBook('主书'), fixture.scopeId).length, 1);
    assert.equal(qqEntries(gateway.getBook('新书')).length, 1);

    gateway.failNextSave();
    await assert.rejects(() => service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { bookName: '失败新书' },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    }));
    assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).bookName, '新书');
    assert.equal(qqEntries(gateway.getBook('新书')).length, 1);
}

async function testDisablingConversationInjectionRemovesMarkersFromHistoricalTargetBooks() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({
        'old-book': {
            entries: {
                900: {
                    uid: 900,
                    content: 'Another conversation stays intact',
                    extensions: {
                        yuziPhoneQQV2: { version: 2, scopeId: fixture.scopeId, conversationId: 'other-conversation' },
                    },
                },
                901: {
                    uid: 901,
                    content: 'Another scope stays intact',
                    extensions: {
                        yuziPhoneQQV2: {
                            version: 2,
                            scopeId: 'scope-b',
                            conversationId: fixture.conversation.conversationId,
                        },
                    },
                },
            },
        },
        'new-book': { entries: {} },
    });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: 'old-book', timeWindow: { mode: 'all' } },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { bookName: 'new-book' },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });

    assert.equal(qqEntriesForConversation(
        gateway.getBook('old-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 0);
    assert.equal(qqEntriesForConversation(
        gateway.getBook('new-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 1);

    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: false },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });

    assert.equal(qqEntriesForConversation(
        gateway.getBook('old-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 0);
    assert.equal(qqEntriesForConversation(
        gateway.getBook('new-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 0);
    assert.equal(qqEntriesForConversation(gateway.getBook('old-book'), fixture.scopeId, 'other-conversation').length, 1);
    assert.equal(qqEntriesForConversation(
        gateway.getBook('old-book'), 'scope-b', fixture.conversation.conversationId,
    ).length, 1);
}

async function testDisablingGlobalInjectionRetriesEveryHistoricalTargetBook() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({
        'old-book': { entries: {} },
        'new-book': { entries: {} },
    });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: 'old-book', timeWindow: { mode: 'all' } },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { bookName: 'new-book' },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });

    gateway.failSaveFor('new-book');
    const disabled = await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: false },
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(disabled.status, 'pending');
    const pending = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(pending.injection.projection.pending, true);
    assert.deepEqual(pending.injection.projection.managedBookNames, ['new-book']);
    assert.equal(qqEntriesForConversation(
        gateway.getBook('old-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 0);
    assert.equal(qqEntriesForConversation(
        gateway.getBook('new-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 1);

    await service.retryPending({
        scopeId: fixture.scopeId,
        userName: 'Player',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(qqEntriesForConversation(
        gateway.getBook('old-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 0);
    assert.equal(qqEntriesForConversation(
        gateway.getBook('new-book'), fixture.scopeId, fixture.conversation.conversationId,
    ).length, 0);
    const removed = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(removed.injection.projection.pending, false);
    assert.deepEqual(removed.injection.projection.managedBookNames, []);
}

async function testMissingTargetBlocksEnableAndSyncWithoutCreatingOrFakingState() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await assert.rejects(
        service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { enabled: true, bookName: '不存在的世界书' },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        }),
        (error) => error?.code === 'worldbook_target_invalid',
    );
    assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).enabled, false);
    assert.equal(gateway.getBook('不存在的世界书'), null);

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    const before = (await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.projection;

    gateway.removeBook('主书');
    await assert.rejects(
        service.syncConversation({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        }),
        (error) => error?.code === 'worldbook_target_invalid',
    );
    assert.deepEqual(
        (await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.projection,
        before,
    );
    assert.equal(gateway.getBook('主书'), null);
}

async function testGlobalDisableReportsPendingUntilItsMarkerDeletionRecovers() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setMessageSelected({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        messageId: fixture.messages[2].messageId,
        selected: true,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true, followGlobal: false, light: 'green', depth: 12, keywords: ['会话词'] },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    gateway.failNextSave();
    const disabled = await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(disabled.status, 'pending');
    assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).enabled, false);
    const pendingConversation = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(pendingConversation.injection.enabled, true);
    assert.deepEqual(pendingConversation.injection.selectedMessageIds, []);
    assert.equal(pendingConversation.injection.followGlobal, false);
    assert.equal(pendingConversation.injection.light, 'green');
    assert.equal(pendingConversation.injection.depth, 12);
    assert.deepEqual(pendingConversation.injection.keywords, ['会话词']);
    assert.equal(pendingConversation.injection.projection.pending, true);

    await service.retryPending({
        scopeId: fixture.scopeId,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(qqEntriesForScope(gateway.getBook('主书'), fixture.scopeId).length, 0);
    assert.equal((await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.projection.pending, false);
}

async function testSingleConversationRemovalOnlyTouchesItsScopeV2Marker() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({
        主书: {
            entries: {
                80: {
                    uid: 80,
                    content: '其他作用域 QQ 投影',
                    extensions: {
                        yuziPhoneQQV2: { version: 2, scopeId: 'scope-b', conversationId: 'foreign-conversation' },
                    },
                },
                81: {
                    uid: 81,
                    content: '同作用域另一会话 QQ 投影',
                    extensions: {
                        yuziPhoneQQV2: { version: 2, scopeId: fixture.scopeId, conversationId: 'other-conversation' },
                    },
                },
                82: {
                    uid: 82,
                    content: '旧格式 QQ 条目',
                    extensions: {
                        yuziPhoneQQV2: { version: 1, scopeId: fixture.scopeId, conversationId: fixture.conversation.conversationId },
                    },
                },
            },
        },
    });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: false },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    const entries = gateway.getBook('主书').entries;
    assert.equal(qqEntriesForScope(gateway.getBook('主书'), fixture.scopeId).length, 1);
    assert.equal(entries[81].content, '同作用域另一会话 QQ 投影');
    assert.equal(entries[80].content, '其他作用域 QQ 投影');
    assert.equal(entries[82].content, '旧格式 QQ 条目');
}

async function testExplicitProjectionRemovalKeepsInjectionIntentUntilConversationDeletion() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setMessageSelected({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        messageId: fixture.messages[0].messageId,
        selected: true,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true, followGlobal: false, light: 'green', depth: 4, keywords: ['保留意愿'] },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await repository.setConversationProjection(fixture.scopeId, fixture.conversation.conversationId, {
        bookName: '',
        entryUid: null,
        pending: false,
    });
    const projectionBeforeRemoval = (await repository.getConversation(
        fixture.scopeId,
        fixture.conversation.conversationId,
    )).injection.projection;
    const externallySavedBook = gateway.getBook('主书');
    for (const entry of yuziQQEntriesForConversation(
        externallySavedBook,
        fixture.conversation.conversationId,
    )) delete entry.extensions;
    gateway.setBook('主书', externallySavedBook);

    gateway.failNextSave();
    const pending = await service.removeConversationProjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
    });
    assert.equal(pending.status, 'pending');
    const pendingConversation = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(pendingConversation.injection.enabled, true);
    assert.deepEqual(pendingConversation.injection.selectedMessageIds, [fixture.messages[0].messageId]);
    assert.equal(pendingConversation.injection.followGlobal, false);
    assert.equal(pendingConversation.injection.light, 'green');
    assert.equal(pendingConversation.injection.depth, 4);
    assert.deepEqual(pendingConversation.injection.keywords, ['保留意愿']);
    assert.deepEqual(pendingConversation.injection.projection, {
        ...projectionBeforeRemoval,
        pending: true,
    });

    const removed = await service.removeConversationProjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
    });
    assert.equal(removed.status, 'removed');
    assert.equal(yuziQQEntriesForConversation(
        gateway.getBook('主书'),
        fixture.conversation.conversationId,
    ).length, 0);
    const removedConversation = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(removedConversation.injection.enabled, true);
    assert.deepEqual(removedConversation.injection.selectedMessageIds, [fixture.messages[0].messageId]);
    assert.equal(removedConversation.injection.projection.pending, false);
}

async function testProjectionFailurePersistsPendingStateAndRetriesLater() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    gateway.failNextSave();
    const result = await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal(result.status, 'pending');
    assert.equal((await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.projection.pending, true);

    await service.retryPending({
        scopeId: fixture.scopeId,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    assert.equal((await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.projection.pending, false);
    assert.equal(qqEntries(gateway.getBook('主书')).length, 1);
}

async function testProjectionMessageUnionIsDeduplicatedAndSkipsNonDeletableSystemRows() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const projectionState = { bookName: '', entryUid: null, managedBookNames: [], pending: false };
    const conversation = {
        conversationId: 'conversation-union',
        kind: 'private',
        personId: 'person-a',
        injection: {
            enabled: true,
            followGlobal: true,
            selectedMessageIds: ['message-user'],
            projection: projectionState,
        },
    };
    const data = {
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' }, light: 'blue', depth: 999, keywords: [] },
        conversation,
        people: [{ personId: 'person-a', formalName: '林知夏' }],
        messages: [
            { messageId: 'message-user', sequence: 1, senderId: '__self__', senderType: 'self', type: 'text', content: '并集消息', storyTime: '2042-05-01 08:00', selectedForInjection: true },
            { messageId: 'message-user', sequence: 1, senderId: '__self__', senderType: 'self', type: 'text', content: '并集消息', storyTime: '2042-05-01 08:00', selectedForInjection: true },
            { messageId: 'message-npc', sequence: 2, senderId: 'person-a', senderType: 'person', type: 'text', content: 'NPC 消息', storyTime: '2042-05-01 08:01' },
            { messageId: 'message-system', sequence: 3, senderId: '__system__', senderType: 'system', type: 'system', content: '双方成为好友', storyTime: '2042-05-01 08:02' },
            { messageId: 'message-time', sequence: 4, senderId: '__system__', senderType: 'system', type: 'system', content: '08:03', storyTime: '2042-05-01 08:03', deletable: false },
        ],
    };
    const repository = {
        async getWorldbookProjectionData() { return clone(data); },
        async setConversationProjection(scopeId, conversationId, patch) { Object.assign(projectionState, patch); },
        async clearAllSelectedMessagesForInjection() {},
        async clearSelectedMessagesForInjection() {},
        async setMessagesSelectedForInjection() {},
    };
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.syncConversation({
        scopeId: 'scope-union',
        conversationId: conversation.conversationId,
        userName: '玩家',
        storyTime: '2042-05-01 08:03',
    });

    const entry = qqEntries(gateway.getBook('主书'))[0];
    assert.equal((entry.content.match(/并集消息/g) || []).length, 1);
    assert.match(entry.content, /林知夏：NPC 消息/);
    assert.match(entry.content, /系统：双方成为好友/);
    assert.doesNotMatch(entry.content, /系统：08:03/);
}

async function testInjectionCountLimitsAutomaticMessagesWithHistoryFallback() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    const syncSettings = async (timeWindow, injectionCount, storyTime) => {
        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: {
                enabled: true,
                bookName: '主书',
                timeWindow,
                injectionCount,
            },
            userName: '玩家',
            storyTime,
        });
        await service.setConversationInjection({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime,
        });
        return qqEntries(gateway.getBook('主书'))[0];
    };

    let entry = await syncSettings(
        { mode: 'relative', value: 1, unit: 'hour' },
        3,
        '2042-05-01 08:00',
    );
    assert.match(entry.content, /玩家：早安/);
    assert.doesNotMatch(entry.content, /林知夏：图片：一张日出照片/);
    assert.doesNotMatch(entry.content, /昨天的旧消息/);

    entry = await syncSettings(
        { mode: 'relative', value: 1, unit: 'day' },
        1,
        '2042-05-01 08:01',
    );
    assert.doesNotMatch(entry.content, /玩家：早安/);
    assert.match(entry.content, /林知夏：图片：一张日出照片/);
    assert.doesNotMatch(entry.content, /昨天的旧消息/);

    entry = await syncSettings(
        { mode: 'relative', value: 1, unit: 'day' },
        2,
        '2042-11-01 08:00',
    );
    assert.doesNotMatch(entry.content, /玩家：早安/);
    assert.match(entry.content, /林知夏：图片：一张日出照片/);
    assert.match(entry.content, /玩家：昨天的旧消息/);

    entry = await syncSettings(
        { mode: 'relative', value: 1, unit: 'day' },
        2,
        '',
    );
    assert.doesNotMatch(entry.content, /玩家：早安/);
    assert.match(entry.content, /林知夏：图片：一张日出照片/);
    assert.match(entry.content, /玩家：昨天的旧消息/);

    entry = await syncSettings(
        { mode: 'relative', value: 1, unit: 'hour' },
        1,
        '2042-05-01 08:00',
    );
    await service.setMessageSelected({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        messageId: fixture.messages[2].messageId,
        selected: true,
        userName: '玩家',
        storyTime: '2042-05-01 08:00',
    });
    entry = qqEntries(gateway.getBook('主书'))[0];
    assert.match(entry.content, /玩家：早安/);
    assert.match(entry.content, /玩家：昨天的旧消息/);
    assert.doesNotMatch(entry.content, /林知夏：图片：一张日出照片/);

    await repository.clearSelectedMessagesForInjection(
        fixture.scopeId,
        fixture.conversation.conversationId,
    );
    entry = await syncSettings({ mode: 'all' }, 1, '2042-05-01 08:01');
    assert.match(entry.content, /玩家：昨天的旧消息/);
    assert.doesNotMatch(entry.content, /玩家：早安/);
    assert.doesNotMatch(entry.content, /林知夏：图片：一张日出照片/);
}

async function testTargetMigrationRollsBackNewBookWhenOldBookDeletionFails() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 旧书: { entries: {} }, 新书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '旧书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    gateway.failSaveFor('旧书');
    await assert.rejects(service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { bookName: '新书' },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    }));

    assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).bookName, '旧书');
    assert.equal(qqEntriesForConversation(gateway.getBook('旧书'), fixture.scopeId, fixture.conversation.conversationId).length, 1);
    assert.equal(qqEntriesForConversation(gateway.getBook('新书'), fixture.scopeId, fixture.conversation.conversationId).length, 0);
}

async function testTargetMigrationFailsClosedBeforeSavingWhenEitherBookHasDuplicates() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');

    for (const duplicateLocation of ['旧书', '新书']) {
        const repository = await createRepository();
        const fixture = await createPrivateFixture(repository);
        const gateway = createWorldbookGateway({
            旧书: { entries: {} },
            新书: { entries: {} },
        });
        const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
        await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { enabled: true, bookName: '旧书', timeWindow: { mode: 'all' } },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
        await service.setConversationInjection({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversation.conversationId,
            injection: { enabled: true },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });

        const source = yuziQQEntriesForConversation(
            gateway.getBook('旧书'),
            fixture.conversation.conversationId,
        )[0];
        const duplicateBook = gateway.getBook(duplicateLocation);
        const first = clone(source);
        const second = clone(source);
        first.uid = 71;
        second.uid = 72;
        delete first.extensions;
        delete second.extensions;
        duplicateBook.entries = { 71: first, 72: second };
        gateway.setBook(duplicateLocation, duplicateBook);
        gateway.clearSavedBookNames();
        const oldBookBefore = gateway.getBook('旧书');
        const newBookBefore = gateway.getBook('新书');

        const result = await service.setGlobalSettings({
            scopeId: fixture.scopeId,
            settings: { bookName: '新书' },
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });

        assert.equal(result.status, 'pending', `${duplicateLocation} 重复时迁移应待同步`);
        assert.equal(result.reason, 'projection-conflict');
        assert.equal(result.code, 'worldbook_projection_conflict');
        assert.match(result.message, /手工删除到只剩一条/);
        assert.deepEqual(gateway.getBook('旧书'), oldBookBefore);
        assert.deepEqual(gateway.getBook('新书'), newBookBefore);
        assert.deepEqual(gateway.getSavedBookNames(), []);
        assert.equal((await repository.getWorldbookSettings(fixture.scopeId)).bookName, '旧书');
        const projection = (await repository.getConversation(
            fixture.scopeId,
            fixture.conversation.conversationId,
        )).injection.projection;
        assert.equal(projection.pending, true);
        assert.deepEqual(projection.managedBookNames, ['旧书', '新书']);
    }
}

async function testInactiveScopeCleanupRemovesNativeMarkers() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const storage = createWorldbookGateway({ 主书: { entries: {} } });
    const inactiveOperations = [];
    const gateway = {
        ...storage,
        async loadBook(name, scopeId, options) {
            if (options?.allowInactiveScope === true) inactiveOperations.push(['load', name, scopeId]);
            return storage.loadBook(name);
        },
        async saveBook(name, data, scopeId, options) {
            if (options?.allowInactiveScope === true) inactiveOperations.push(['save', name, scopeId]);
            return storage.saveBook(name, data);
        },
    };
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });

    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    assert.equal(yuziQQEntriesForConversation(
        storage.getBook('主书'),
        fixture.conversation.conversationId,
    ).length, 1);
    const externallySavedBook = storage.getBook('主书');
    for (const entry of yuziQQEntriesForConversation(
        externallySavedBook,
        fixture.conversation.conversationId,
    )) delete entry.extensions;
    storage.setBook('主书', externallySavedBook);

    const result = await service.removeScopeProjections({ scopeId: fixture.scopeId });

    assert.equal(result.status, 'removed');
    assert.deepEqual(inactiveOperations, [
        ['load', '主书', fixture.scopeId],
        ['save', '主书', fixture.scopeId],
    ]);
    assert.equal(yuziQQEntriesForConversation(
        storage.getBook('主书'),
        fixture.conversation.conversationId,
    ).length, 0);
    const conversation = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.deepEqual(conversation.injection.projection, {
        bookName: '', entryUid: null, managedBookNames: [], pending: false,
    });
}

async function testScopeLifecycleRemovalPreservesDataAndReconcileRebuildsProjection() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await service.setMessageSelected({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        messageId: fixture.messages[0].messageId,
        selected: true,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    gateway.setBook('主书', { entries: {} });
    await service.reconcileScope({ scopeId: fixture.scopeId, userName: '玩家', storyTime: '2042-05-01 08:01' });
    assert.equal(qqEntries(gateway.getBook('主书')).length, 1);

    const removed = await service.removeScopeProjections({ scopeId: fixture.scopeId });
    assert.equal(removed.status, 'removed');
    assert.equal(qqEntries(gateway.getBook('主书')).length, 0);
    const conversation = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(conversation.injection.enabled, true);
    assert.deepEqual(conversation.injection.selectedMessageIds, [fixture.messages[0].messageId]);

    await service.reconcileScope({ scopeId: fixture.scopeId, userName: '玩家', storyTime: '2042-05-01 08:01' });
    assert.equal(qqEntries(gateway.getBook('主书')).length, 1);
}

async function testLifecycleCleanupTreatsDeletedTargetBookAsAlreadyRemoved() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const gateway = createWorldbookGateway({ 主书: { entries: {} } });
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    await service.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    gateway.removeBook('主书');

    const result = await service.removeScopeProjections({ scopeId: fixture.scopeId });
    assert.equal(result.status, 'removed');
    const conversation = await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId);
    assert.equal(conversation.injection.projection.pending, false);
    assert.equal(conversation.injection.projection.bookName, '');
}

async function testSyncConversationKeepsTheOriginalScopeSessionAcrossGatewayCalls() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const storage = createWorldbookGateway({ 主书: { entries: {} } });
    const setupService = createQQV2WorldbookProjectionService({ repository, worldbookGateway: storage });
    await setupService.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await setupService.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    const gatewayCalls = [];
    const gateway = {
        async loadBook(name, scopeId, options) {
            gatewayCalls.push({ operation: 'load', scopeId, scopeSession: options?.scopeSession });
            return storage.loadBook(name);
        },
        async saveBook(name, data, scopeId, options) {
            gatewayCalls.push({ operation: 'save', scopeId, scopeSession: options?.scopeSession });
            return storage.saveBook(name, data);
        },
    };
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    let currentSession;
    const a1 = {
        scopeId: fixture.scopeId,
        generation: 1,
        isCurrent: () => currentSession === a1,
    };
    const a2 = {
        scopeId: fixture.scopeId,
        generation: 3,
        isCurrent: () => currentSession === a2,
    };
    currentSession = a1;

    const result = await service.syncConversation({
        scopeId: fixture.scopeId,
        scopeSession: a1,
        conversationId: fixture.conversation.conversationId,
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });

    assert.equal(result.status, 'synced');
    assert.ok(gatewayCalls.some((call) => call.operation === 'load'));
    assert.ok(gatewayCalls.some((call) => call.operation === 'save'));
    for (const call of gatewayCalls) {
        assert.equal(call.scopeId, fixture.scopeId);
        assert.strictEqual(call.scopeSession, a1);
        assert.notStrictEqual(call.scopeSession, a2);
    }
    currentSession = a2;
    assert.equal(a1.isCurrent(), false);
    assert.equal(a2.isCurrent(), true);
}

async function testInactiveScopeSessionDoesNotMarkProjectionPending() {
    const { createQQV2WorldbookProjectionService } = await importModule('modules/qq-v2/worldbook/projection-service.js');
    const repository = await createRepository();
    const fixture = await createPrivateFixture(repository);
    const storage = createWorldbookGateway({ 主书: { entries: {} } });
    const setupService = createQQV2WorldbookProjectionService({ repository, worldbookGateway: storage });
    await setupService.setGlobalSettings({
        scopeId: fixture.scopeId,
        settings: { enabled: true, bookName: '主书', timeWindow: { mode: 'all' } },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    await setupService.setConversationInjection({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversation.conversationId,
        injection: { enabled: true },
        userName: '玩家',
        storyTime: '2042-05-01 08:01',
    });
    const projectionBefore = clone((await repository.getConversation(
        fixture.scopeId,
        fixture.conversation.conversationId,
    )).injection.projection);

    let currentSession;
    const a1 = {
        scopeId: fixture.scopeId,
        generation: 1,
        isCurrent: () => currentSession === a1,
    };
    currentSession = a1;
    const gateway = {
        async loadBook(name) {
            return storage.loadBook(name);
        },
        async saveBook() {
            await Promise.resolve();
            currentSession = null;
            const error = new Error('作用域已切换');
            error.code = 'worldbook_scope_inactive';
            throw error;
        },
    };
    const service = createQQV2WorldbookProjectionService({ repository, worldbookGateway: gateway });
    let failure = null;
    try {
        await service.syncConversation({
            scopeId: fixture.scopeId,
            scopeSession: a1,
            conversationId: fixture.conversation.conversationId,
            userName: '玩家',
            storyTime: '2042-05-01 08:01',
        });
    } catch (error) {
        failure = error;
    }

    assert.equal(a1.isCurrent(), false);
    assert.deepEqual(
        (await repository.getConversation(fixture.scopeId, fixture.conversation.conversationId)).injection.projection,
        projectionBefore,
        '失效 Scope Session 不得恢复或标记 Repository projection 为 pending',
    );
    assert.equal(failure?.code, 'worldbook_scope_inactive');
}

async function main() {
    await testProjectionUsesRealEntryAndGlobalGateKeepsConversationIntent();
    await testProjectionContentUsesYuziEnvelopeAndPreciseMessageTimes();
    await testStableCommentIdentitySurvivesMarkerStrippingWithoutDuplicateEntries();
    await testLegacyQQEntriesAreIgnoredWhileCurrentProjectionUsesItsOwnLifecycle();
    await testDuplicateCurrentProjectionFailsClosedAndMarksPending();
    await testSyncPreflightsDuplicateTargetAndHistoricalBooksBeforeAnySave();
    await testGroupProjectionIdentitySupportsSameNamesRenameAndGlobalCleanup();
    await testInjectedWorldbookSettingsOverrideRepositoryProjectionSettings();
    await testWindowSelectionGreenSettingsAndSafeTargetMigration();
    await testDisablingConversationInjectionRemovesMarkersFromHistoricalTargetBooks();
    await testDisablingGlobalInjectionRetriesEveryHistoricalTargetBook();
    await testMissingTargetBlocksEnableAndSyncWithoutCreatingOrFakingState();
    await testGlobalDisableReportsPendingUntilItsMarkerDeletionRecovers();
    await testSingleConversationRemovalOnlyTouchesItsScopeV2Marker();
    await testExplicitProjectionRemovalKeepsInjectionIntentUntilConversationDeletion();
    await testProjectionFailurePersistsPendingStateAndRetriesLater();
    await testProjectionMessageUnionIsDeduplicatedAndSkipsNonDeletableSystemRows();
    await testTargetMigrationRollsBackNewBookWhenOldBookDeletionFails();
    await testTargetMigrationFailsClosedBeforeSavingWhenEitherBookHasDuplicates();
    await testInactiveScopeCleanupRemovesNativeMarkers();
    await testScopeLifecycleRemovalPreservesDataAndReconcileRebuildsProjection();
    await testLifecycleCleanupTreatsDeletedTargetBookAsAlreadyRemoved();
    await testSyncConversationKeepsTheOriginalScopeSessionAcrossGatewayCalls();
    await testInactiveScopeSessionDoesNotMarkProjectionPending();
    await testInjectionCountLimitsAutomaticMessagesWithHistoryFallback();
    console.log('[qq-v2-worldbook-projection-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-worldbook-projection-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
