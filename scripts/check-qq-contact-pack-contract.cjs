const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function load(relativePath) {
    return import(`${pathToFileURL(path.join(ROOT, relativePath)).href}?contract=${Date.now()}-${Math.random()}`);
}

async function createRepository() {
    const { createMemoryQQV2StateStore } = await load('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await load('modules/qq-v2/domain/repository.js');
    return createQQV2Repository({ stateStore: createMemoryQQV2StateStore() });
}

async function saveContactAsset(repository, scopeId, conversationId, kind, text) {
    return repository.saveScopeAsset(scopeId, {
        conversationId,
        kind,
        mimeType: 'image/png',
        blob: new Blob([text], { type: 'image/png' }),
    });
}

async function main() {
    const { createQQContactPackService, QQ_CONTACT_PACK_FORMAT } = await load('modules/qq-v2/resources/contact-pack.js');
    const repository = await createRepository();
    const packs = createQQContactPackService({ repository });
    const sourceScopeId = 'scope-contact-pack-source';
    const targetScopeId = 'scope-contact-pack-target';
    const created = await repository.createPrivateConversation(sourceScopeId, { name: '  林知夏  ' });
    const conversationId = created.conversation.conversationId;
    const [avatar, profileBackground, chatBackground] = await Promise.all([
        saveContactAsset(repository, sourceScopeId, conversationId, 'avatar', 'avatar-image'),
        saveContactAsset(repository, sourceScopeId, conversationId, 'profile-background', 'profile-background-image'),
        saveContactAsset(repository, sourceScopeId, conversationId, 'background', 'chat-background-image'),
    ]);
    await repository.updatePrivateProfile(sourceScopeId, conversationId, {
        signature: '海风会记得',
        gender: '女',
        birthday: '2000-01-01',
        avatarAssetId: avatar.assetId,
        profileBackgroundAssetId: profileBackground.assetId,
        backgroundAssetId: chatBackground.assetId,
    });

    const pack = await packs.exportPack({ scopeId: sourceScopeId });
    assert.equal(pack.format, QQ_CONTACT_PACK_FORMAT);
    assert.equal(pack.contacts.length, 1);
    assert.deepEqual(
        {
            name: pack.contacts[0].name,
            signature: pack.contacts[0].signature,
            gender: pack.contacts[0].gender,
            birthday: pack.contacts[0].birthday,
        },
        {
            name: '  林知夏  ',
            signature: '海风会记得',
            gender: '女',
            birthday: '2000-01-01',
        },
        'contact packs must only preserve the requested text profile fields',
    );
    for (const field of ['avatar', 'profileBackground', 'chatBackground']) {
        assert.equal(pack.contacts[0][field].mimeType, 'image/png');
        assert.match(pack.contacts[0][field].dataUrl, /^data:image\/png;base64,/u);
    }
    assert.deepEqual(packs.previewPack(JSON.stringify(pack)), { contacts: 1 });

    await repository.ensureScope(targetScopeId);
    assert.deepEqual(
        await packs.importPack({ scopeId: targetScopeId, source: JSON.stringify(pack) }),
        { contacts: 1 },
    );
    let importedConversations = (await repository.listConversations(targetScopeId))
        .filter((conversation) => conversation.kind === 'private');
    assert.equal(importedConversations.length, 1);
    assert.equal(importedConversations[0].status, 'contact', 'imported contacts stay out of the Messages page');
    let importedPerson = await repository.getPerson(targetScopeId, importedConversations[0].personId);
    assert.deepEqual(
        {
            formalName: importedPerson.formalName,
            signature: importedPerson.signature,
            gender: importedPerson.gender,
            birthday: importedPerson.birthday,
        },
        {
            formalName: '  林知夏  ',
            signature: '海风会记得',
            gender: '女',
            birthday: '2000-01-01',
        },
    );
    for (const [assetId, text] of [
        [importedPerson.avatarAssetId, 'avatar-image'],
        [importedPerson.profileBackgroundAssetId, 'profile-background-image'],
        [importedConversations[0].backgroundAssetId, 'chat-background-image'],
    ]) {
        const asset = await repository.getMediaAsset(targetScopeId, assetId);
        assert.equal(await asset.blob.text(), text);
    }

    await packs.importPack({ scopeId: targetScopeId, source: JSON.stringify(pack) });
    importedConversations = (await repository.listConversations(targetScopeId))
        .filter((conversation) => conversation.kind === 'private');
    assert.equal(importedConversations.length, 2, 'repeated imports must create duplicate contacts');
    assert.notEqual(importedConversations[0].personId, importedConversations[1].personId);
    assert.notEqual(importedConversations[0].conversationId, importedConversations[1].conversationId);

    const removedContact = importedConversations[0];
    const removedPerson = await repository.getPerson(targetScopeId, removedContact.personId);
    const removedAssetIds = [
        removedPerson.avatarAssetId,
        removedPerson.profileBackgroundAssetId,
        removedContact.backgroundAssetId,
    ];
    const removal = await repository.removePrivateFriend(targetScopeId, removedContact.conversationId, {
        userName: '玩家',
        storyTime: '2042-05-01 10:00',
    });
    assert.equal(removal.removed, true, 'an unactivated imported contact must still be removable');
    assert.equal(await repository.getConversation(targetScopeId, removedContact.conversationId), null,
        'removing an unactivated contact must remove its empty conversation instead of creating a readonly one');
    assert.equal(await repository.getPerson(targetScopeId, removedContact.personId), null);
    for (const assetId of removedAssetIds) {
        assert.equal(await repository.getMediaAsset(targetScopeId, assetId), null,
            'removing an unactivated contact must release its imported images');
    }

    const targetConversation = importedConversations[1];
    await repository.activatePrivateContact(targetScopeId, targetConversation.conversationId, {
        userName: '玩家',
        storyTime: '2042-05-01 10:00',
    });
    const afterActivation = new Map((await repository.listConversations(targetScopeId))
        .map((conversation) => [conversation.conversationId, conversation]));
    assert.equal(afterActivation.get(targetConversation.conversationId).status, 'active');
    assert.equal(afterActivation.has(removedContact.conversationId), false,
        'activating one duplicate contact must not restore a separately removed duplicate');

    const countBeforeInvalidImport = (await repository.listConversations(targetScopeId)).length;
    const invalidPack = structuredClone(pack);
    invalidPack.contacts[0].avatar.dataUrl = 'data:image/png;base64,***';
    await assert.rejects(
        () => packs.importPack({ scopeId: targetScopeId, source: JSON.stringify(invalidPack) }),
        /Base64/u,
    );
    assert.equal((await repository.listConversations(targetScopeId)).length, countBeforeInvalidImport,
        'an invalid contact pack must not persist a partial import');

    const uiSource = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(uiSource, /data-qq-contact-pack-menu/u,
        'contacts root must expose the import/export menu');
    assert.match(uiSource, /const preview = await facade\.query\.contactPackPreview\(\{ source \}\);/u,
        'contact imports must validate the full pack before confirmation');
    assert.match(uiSource, /facade\.intent\.importContactPack\(\{ source \}\)/u,
        'confirmed contact imports must use the facade intent');
    assert.match(uiSource, /shell\.showToast\?\.\('文件错误', true\);/u,
        'all contact-pack file errors must use the fixed toast copy');
    assert.match(uiSource, /if \(target\?\.status === 'contact'\) \{[\s\S]*?facade\.intent\.activatePrivateContact/u,
        'opening a resolved contact snapshot must activate that exact conversation');
    const cssSource = fs.readFileSync(path.join(ROOT, 'styles/phone-base/12-qq-app.css'), 'utf8');
    assert.match(cssSource, /\.yuzi-qq-image-library-pack-menu,\s*\.yuzi-qq-contact-pack-menu\s*\{/u,
        'contact pack menu must reuse the positioned image-library menu surface');
    assert.match(cssSource, /\.yuzi-qq-image-library-pack-menu-item,\s*\.yuzi-qq-contact-pack-menu-item\s*\{/u,
        'contact pack menu rows must reuse the image-library menu rows');

    console.log('[qq-contact-pack-contract] passed');
}

main().catch((error) => {
    console.error('[qq-contact-pack-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
