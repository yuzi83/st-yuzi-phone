const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
    const root = path.resolve(__dirname, '..');
    const source = await fs.readFile(path.join(root, 'modules/qq-v2/ui/app.js'), 'utf8');
    const uploadDialogSource = await fs.readFile(path.join(root, 'modules/qq-v2/ui/sticker-upload-dialog.js'), 'utf8');
    const facadeSource = await fs.readFile(path.join(root, 'modules/qq-v2/application/facade.js'), 'utf8');
    const runtimeSource = await fs.readFile(path.join(root, 'modules/qq-v2/application/production-runtime.js'), 'utf8');
    const css = await fs.readFile(path.join(root, 'styles/phone-base/12-qq-app.css'), 'utf8');
    const tokens = await fs.readFile(path.join(root, 'styles/phone-base/00-phone-tokens.css'), 'utf8');
    const { createEmojiPanelTemporaryLayerController } = await import('../modules/qq-v2/ui/emoji-panel.js');

    let open = true;
    let closeCount = 0;
    const controller = createEmojiPanelTemporaryLayerController({
        isOpen: () => open,
        close: () => {
            open = false;
            closeCount += 1;
        },
        isPanelTarget: (target) => target === 'panel',
        isToggleTarget: (target) => target === 'toggle',
    });

    let escapePrevented = false;
    assert.equal(controller.handleKeyDown({ key: 'Escape', preventDefault: () => { escapePrevented = true; } }), true,
        'Escape closes an open emoji temporary layer');
    assert.equal(escapePrevented, true, 'Escape prevents the browser default only when it closes the panel');
    assert.equal(open, false);

    open = true;
    assert.equal(controller.handlePointerDown({ target: 'panel' }), false, 'a panel interaction keeps the panel open');
    assert.equal(controller.handlePointerDown({ target: 'toggle' }), false, 'the toolbar toggle remains responsible for its own open/close action');
    assert.equal(controller.handlePointerDown({ target: 'outside' }), true, 'a pointer interaction outside the panel closes it');
    assert.equal(open, false);

    open = true;
    assert.equal(controller.handleNavigation(), true, 'navigation/system back closes an open emoji temporary layer');
    assert.equal(open, false);
    assert.equal(closeCount, 3);

    assert.match(source, /data-qq-sticker/, 'QQ app must keep sticker panel controls');
    assert.match(source, /target\.dataset\.qqSticker[\s\S]{0,700}facade\.intent\.sendMessage/, 'sticker selection must use the existing single-message contract');
    assert.match(source, /target\.dataset\.qqSticker[\s\S]{0,900}render\(\{ preserveEmoji: true \}\)/,
        'successful sticker sends must re-render without closing the emoji panel');
    assert.doesNotMatch(source, /composerSendPlan|pendingAttachments/, 'Q49-1 forbids pending attachment batches');
    const panelStart = source.indexOf('const renderEmojiPanel = async');
    const panelEnd = source.indexOf('const renderChat = async', panelStart);
    const panelSource = source.slice(panelStart, panelEnd);
    assert.match(panelSource, /renderEmojiPanel = async \(token, chatKind\)/,
        'the shared emoji renderer must receive the current chat kind');
    assert.match(panelSource, /yuzi-qq-\$\{chatKind\}-emoji-panel/,
        'private and group chats must receive their own shared emoji panel class');
    assert.match(source, /await renderEmojiPanel\(token,\s*chatKind\)/,
        'group chat rendering must use the same emoji panel path as private chat');
    const stickerImageStart = source.indexOf('const stickerImage =');
    const stickerImageEnd = source.indexOf('const createIcon =', stickerImageStart);
    const stickerImageSource = source.slice(stickerImageStart, stickerImageEnd);
    assert.match(panelSource, /sticker\.stickerId/, 'emoji cells must consume the Facade stickerId field');
    assert.doesNotMatch(panelSource, /sticker\.id/, 'emoji cells must not read the retired sticker.id shape');
    assert.match(panelSource, /stickerImage\(stickerId,\s*description/, 'emoji cells must use the shared sticker image renderer');
    assert.match(stickerImageSource, /createElement\('img'/, 'the shared sticker renderer must render the stored image');
    assert.match(stickerImageSource, /stickerSession\.load\(stickerId\)/,
        'emoji images must load their object URL through the render-lease session');
    assert.match(source, /createRenderLeaseCoordinator\(\{[\s\S]{0,260}facade\.query\.stickerRender\?\.\(\{ stickerId \}\)/,
        'the sticker render-lease coordinator must acquire object URLs through the Facade');
    assert.match(panelSource, /sticker\.description/, 'emoji image failures must retain the saved description as fallback text');
    assert.doesNotMatch(panelSource, /sticker\.name/, 'emoji cells must use the single sticker-description model');
    const uploadStart = source.indexOf('const openStickerUploadDialog =');
    const uploadEnd = source.indexOf('const uploadSticker =', uploadStart);
    const uploadSource = source.slice(uploadStart, uploadEnd);
    assert.match(uploadSource, /createStickerUploadDialog\(/,
        'both sticker upload entries must use the shared batch dialog module');
    assert.match(uploadSource, /facade\.intent\.saveStickers\(\{ stickers \}\)/,
        'the shared dialog must save all selected stickers in one batch');
    assert.match(uploadSource, /render\(\{ preserveEmoji: reopenPanel \}\)/,
        'chat uploads must restore the emoji panel after a successful batch save');
    assert.equal((source.match(/data-qq-sticker-upload/g) || []).length, 2,
        'the chat plus button and sticker repository must expose the same upload action');
    assert.match(uploadDialogSource, /files\.map\(\(record, index\) =>/,
        'the batch dialog must render rows in file-selection order');
    assert.match(uploadDialogSource, /description\.value = defaultDescription\(record\?\.name, index\)/,
        'each sticker description must default from its own file name');
    assert.match(uploadDialogSource, /descriptions\.findIndex\(\(description\) => !description\)/,
        'empty descriptions must prevent the batch save');
    assert.match(uploadDialogSource, /URL\.createObjectURL\(file\)/,
        'the batch dialog must preview each selected file');
    assert.match(uploadDialogSource, /URL\.revokeObjectURL\(previewUrl\)/,
        'closing the batch dialog must release every preview URL');
    assert.match(css, /\.yuzi-qq-sticker-upload-preview\s*\{[^}]*object-fit:\s*contain;/s,
        'batch sticker previews must retain the complete image');
    assert.match(source, /facade\.intent\.releaseStickerRender\?\.\(\{ leaseId: render\.leaseId \}\)/,
        'QQ render cleanup must release sticker object URL leases');
    assert.match(facadeSource, /async stickerRender\(input = \{\}\)[\s\S]{0,500}runtime\.acquireStickerRender\(\{ stickerId \}\)/,
        'the Facade must expose sticker image acquisition by stickerId');
    assert.match(facadeSource, /async releaseStickerRender\(input = \{\}\)[\s\S]{0,400}runtime\.releaseStickerRender\(\{ leaseId \}\)/,
        'the Facade must expose sticker image lease release');
    assert.match(runtimeSource, /async acquireStickerRender\(\{ stickerId \}\)[\s\S]{0,700}resources\.getStickerBlob\(normalizedStickerId\)/,
        'the production runtime must acquire the stored sticker Blob');
    assert.match(runtimeSource, /async releaseStickerRender\(\{ leaseId \}\)[\s\S]{0,160}revokeStickerRenderLease/,
        'the production runtime must revoke released sticker object URLs');
    assert.match(css, /\.yuzi-qq-private-emoji-panel\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*var\(--yuzi-qq-private-emoji-column-min\)\),\s*1fr\)\)/s,
        'the private emoji panel must retain empty slots while deriving responsive columns from one track token');
    assert.match(css, /\.yuzi-qq-group-emoji-panel\s*\{[^}]*position:\s*absolute;[^}]*block-size:\s*var\(--yuzi-qq-private-emoji-panel-height\)/s,
        'the group emoji grid must reuse the private bottom-panel geometry');
    assert.match(css, /\.yuzi-qq-group-chat-view\.has-emoji-panel[\s\S]*\.yuzi-qq-group-chat-composer[\s\S]*inset-block-end:\s*var\(--yuzi-qq-private-emoji-panel-height\)/s,
        'the group composer must rise above the open emoji grid');
    assert.match(tokens, /--yuzi-qq-private-emoji-column-min:\s*63px;/,
        'the track token must yield five baseline columns and naturally collapse to four or three');
    assert.match(source, /from '\.\/emoji-panel\.js'/, 'QQ app uses the emoji temporary-layer event controller');
    assert.match(source, /viewport\.addEventListener\('keydown', handleEmojiPanelKeyDown\)/, 'QQ app routes Escape through the emoji panel controller');
    assert.match(source, /viewport\.addEventListener\('pointerdown', handleEmojiPanelPointerDown\)/, 'QQ app closes the panel from pointer events outside it');
    assert.match(source, /const go = \(next\) => \{[\s\S]{0,240}closeEmojiPanel\(\)/, 'QQ navigation closes the emoji temporary layer');
    assert.match(source, /const back = \(\) => \{[\s\S]{0,160}closeEmojiPanel\(\)/, 'QQ system-back path closes the emoji temporary layer');
    console.log('[qq-emoji-panel-contract] passed');
})().catch((error) => {
    console.error('[qq-emoji-panel-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
