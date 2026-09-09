const assert = require('node:assert/strict');

async function main() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const repository = createQQV2Repository({ stateStore: createMemoryQQV2StateStore() });
    const scopeId = 'scope:add-contact';
    const rawName = '  Alice   Bob  ';

    const created = await repository.createPrivateConversation(scopeId, { name: rawName });
    assert.equal(created.created, true, 'the first literal name must create a contact');
    assert.equal(created.person.formalName, rawName, 'contact names must preserve the submitted literal text');

    const reused = await repository.createPrivateConversation(scopeId, { name: rawName });
    assert.equal(reused.created, false, 'only the same exact raw name must reuse an existing contact');
    assert.equal(reused.person.formalName, rawName, 'a reused contact must retain its original literal name');
    assert.equal(reused.conversation.conversationId, created.conversation.conversationId);

    const variants = [
        'Alice Bob',
        '  alice   bob  ',
        '  \uFF21lice   Bob  ',
    ];
    const createdVariants = [];
    for (const name of variants) {
        const result = await repository.createPrivateConversation(scopeId, { name });
        assert.equal(result.created, true, 'whitespace, case, and full-width variants must stay distinct contacts');
        assert.equal(result.person.formalName, name, 'distinct contact names must preserve their literal text');
        createdVariants.push(result);
    }
    assert.equal(new Set(createdVariants.map((result) => result.conversation.conversationId)).size, variants.length);

    for (const name of ['', ' \t\n', '\u3000']) {
        await assert.rejects(
            () => repository.createPrivateConversation(scopeId, { name }),
            'all-whitespace names must be rejected',
        );
    }

    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(source, /data-qq-add-contact/);
    const contactsRootSource = source.slice(source.indexOf('const renderContactsRoot'), source.indexOf('const renderProfile'));
    assert.match(contactsRootSource, /const contactPack = createButton\('', 'yuzi-qq-icon-button yuzi-qq-identity-action yuzi-qq-contact-root-pack-action'/,
        'contacts header must expose the real import/export entry');
    assert.match(contactsRootSource, /data-qq-contact-pack-menu/,
        'contacts header entry must open the contact import/export menu');
    assert.doesNotMatch(contactsRootSource, /data-qq-add-contact/,
        'contacts header must not reuse the Messages-only add-contact action');
}

main().then(() => console.log('[qq-add-contact] passed')).catch((error) => {
    console.error('[qq-add-contact] failed');
    console.error(error);
    process.exitCode = 1;
});
