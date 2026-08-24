const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function sourceSlice(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    return source.slice(start, end < 0 ? source.length : end);
}

function cssRuleHas(source, selector, declaration) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${escaped}\\s*\\{[^}]*${declaration}`, 's').test(source);
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

function makeMessage(messageId, generatedImagePath = '') {
    return Object.freeze({
        messageId,
        conversationId: 'conversation-1',
        sequence: Number(messageId.replace(/\D+/gu, '')) || 0,
        senderId: 'person-1',
        senderType: 'contact',
        type: 'image',
        content: `图片 ${messageId}`,
        generatedImagePath,
    });
}

function makeHistoryPage() {
    return Object.freeze({
        items: Object.freeze(Array.from({ length: 75 }, (_, index) => makeMessage(`message-${index + 1}`))),
        hasMore: true,
        nextBeforeSequence: 1,
    });
}

async function flushAsyncWork() {
    await Promise.resolve();
    await Promise.resolve();
}

async function testConcurrentReverseCompletion(__test__) {
    const pages = new Map([['conversation-1', makeHistoryPage()]]);
    const requests = new Map();
    const renderCalls = [];
    const failures = [];
    let reloadCount = 0;

    const controller = __test__.createImageGenerationTaskController({
        request: ({ messageId }) => {
            const gate = deferred();
            requests.set(messageId, gate);
            return gate.promise;
        },
        readPage: (conversationId) => pages.get(conversationId),
        writePage: (conversationId, page) => pages.set(conversationId, page),
        render: async (options = {}) => {
            renderCalls.push(options);
            if (options.refreshMessages !== false) {
                reloadCount += 1;
                pages.set('conversation-1', Object.freeze({
                    items: Object.freeze(pages.get('conversation-1').items.slice(-50)),
                    hasMore: true,
                    nextBeforeSequence: 26,
                }));
            }
        },
        notifyFailure: () => failures.push('failed'),
        isConversationVisible: () => true,
    });

    const first = controller.generate({
        conversationId: 'conversation-1',
        messageId: 'message-5',
    });
    const second = controller.generate({
        conversationId: 'conversation-1',
        messageId: 'message-70',
    });
    await flushAsyncWork();

    assert.equal(controller.isLoading('message-5'), true, 'the first image owns an independent loading task');
    assert.equal(controller.isLoading('message-70'), true, 'the second image can generate concurrently');

    requests.get('message-70').resolve({
        ok: true,
        result: {
            message: makeMessage('message-70', 'user/images/yuzi-phone-generated/message-70.png'),
        },
    });
    await second;

    assert.equal(controller.isLoading('message-5'), true,
        'completing the second image must not clear the first image loading state');
    assert.equal(controller.isLoading('message-70'), false,
        'the completed image must leave loading state');
    assert.equal(
        pages.get('conversation-1').items.find((message) => message.messageId === 'message-70').generatedImagePath,
        'user/images/yuzi-phone-generated/message-70.png',
        'the second completion updates only its own message',
    );

    requests.get('message-5').resolve({
        ok: true,
        result: {
            message: makeMessage('message-5', 'user/images/yuzi-phone-generated/message-5.png'),
        },
    });
    await first;

    const finalPage = pages.get('conversation-1');
    assert.equal(controller.isLoading('message-5'), false);
    assert.equal(finalPage.items.length, 75,
        'image generation must preserve every prepended historical message');
    assert.equal(finalPage.hasMore, true, 'image generation must preserve historical pagination metadata');
    assert.equal(finalPage.nextBeforeSequence, 1,
        'image generation must preserve the next historical-page cursor');
    assert.equal(
        finalPage.items.find((message) => message.messageId === 'message-5').generatedImagePath,
        'user/images/yuzi-phone-generated/message-5.png',
        'an image outside the latest 50 messages remains present and receives its result',
    );
    assert.equal(reloadCount, 0,
        'loading and completion renders must not re-query and replace the current message window');
    assert.ok(renderCalls.length >= 4, 'each task exposes loading and completion through the existing render path');
    assert.ok(renderCalls.every((options) => options.refreshMessages === false),
        'image-task renders must explicitly reuse the current message collection');
    assert.deepEqual(failures, []);
}

async function testFailureRecovery(__test__) {
    const page = makeHistoryPage();
    const gate = deferred();
    const failures = [];
    const renderCalls = [];
    const controller = __test__.createImageGenerationTaskController({
        request: () => gate.promise,
        readPage: () => page,
        writePage: () => {
            throw new Error('a failed generation must not replace the message');
        },
        render: async (options) => renderCalls.push(options),
        notifyFailure: () => failures.push('图片生成失败'),
        isConversationVisible: () => true,
    });

    const pending = controller.generate({
        conversationId: 'conversation-1',
        messageId: 'message-8',
    });
    await flushAsyncWork();
    assert.equal(controller.isLoading('message-8'), true);

    gate.resolve({ ok: false, status: 'timeout' });
    const result = await pending;

    assert.equal(result.ok, false);
    assert.equal(controller.isLoading('message-8'), false,
        'failed and timed-out generation must always restore the per-message action');
    assert.deepEqual(failures, ['图片生成失败']);
    assert.equal(renderCalls.length, 2, 'failure renders once for loading and once for recovery');
    assert.ok(renderCalls.every((options) => options.refreshMessages === false),
        'failure recovery must not reload and truncate the message window');
}

function testGeneratedImagePathSafety(__test__) {
    const normalize = __test__.normalizeGeneratedImagePath;
    assert.equal(
        normalize('user/images/yuzi-phone-generated/qq-message-1.png'),
        'user/images/yuzi-phone-generated/qq-message-1.png',
    );
    assert.equal(normalize(' user/images/角色/图片.webp '), 'user/images/角色/图片.webp');

    [
        'https://attacker.example/tracker.png',
        'http://attacker.example/tracker.png',
        '//attacker.example/tracker.png',
        '/user/images/yuzi-phone-generated/image.png',
        'data:image/png;base64,AAAA',
        'javascript:alert(1)',
        'user/images/../secrets.png',
        'user\\images\\yuzi-phone-generated\\image.png',
        'user/images/yuzi-phone-generated/image.png?token=secret',
        'user/images/yuzi-phone-generated/image.svg',
        'user/images/yuzi-phone-generated/%2e%2e%2fsecret.png',
    ].forEach((unsafePath) => {
        assert.equal(normalize(unsafePath), '', `unsafe generated image path must be rejected: ${unsafePath}`);
    });
}

async function main() {
    const { __test__ } = await import('../modules/qq-v2/ui/app.js');
    const app = read('modules/qq-v2/ui/app.js');
    const css = read('styles/phone-base/12-qq-app.css');
    const messageNode = sourceSlice(app, 'const messageNode =', 'const renderMessageStream =');
    const clickHandler = sourceSlice(app, 'const handleClick = async', 'const handleEmojiPanelKeyDown =');

    await testConcurrentReverseCompletion(__test__);
    await testFailureRecovery(__test__);
    testGeneratedImagePathSafety(__test__);

    assert.match(messageNode, /message\.type === 'image'/,
        'image messages must have a dedicated rendering branch');
    assert.match(messageNode, /message\.type === 'video'[\s\S]*yuzi-qq-narrative-card is-video/,
        'video messages must remain on the existing narrative-card path');
    assert.match(messageNode, /normalizeGeneratedImagePath\(message\.generatedImagePath\)/,
        'generated image rendering must consume the validated local user-image path');
    assert.match(messageNode, /yuzi-qq-generated-image-description[\s\S]*descriptionText/,
        'generated image cards must preserve and render the original narrative description');
    assert.match(messageNode, /isImageGenerationEnabled\(\)[\s\S]*!isMessageSelectionMode\(conversationId\)/,
        'the circular action must render only when the global switch is on and message selection is off');
    assert.match(messageNode, /data-qq-generate-image/,
        'image cards must expose a stable delegated generate action');
    assert.match(messageNode, /yuzi-qq-image-regenerate-button/,
        'persisted images must expose a compact regenerate action');

    assert.match(messageNode, /yuzi-qq-generated-image-viewer-button/,
        'a generated image must be an explicit viewer trigger');
    assert.match(messageNode, /data-qq-view-image/,
        'the viewer trigger must use QQ delegated click handling');
    assert.match(messageNode, /const descriptionText =/,
        'the image copy must be prepared once for the image alt and placeholder');
    assert.match(messageNode, /body\.append\(media\);/,
        'an image card must end with the media itself instead of a caption row');
    assert.doesNotMatch(
        messageNode,
        /body\.append\(media,\s*description\)/u,
        'a generated image must not keep a separate caption below the picture',
    )
    assert.match(
        messageNode,
        /yuzi-qq-generated-image-placeholder[\s\S]*yuzi-qq-generated-image-description[\s\S]*descriptionText/u,
        'a pending image must show its narrative copy inside the centered placeholder',
    )

    assert.match(app, /const openGeneratedImageViewer =[\s\S]*showDialog\(/u,
        'QQ must open generated images with its own dialog system');
    assert.match(clickHandler, /target\.dataset\.qqViewImage/u,
        'QQ delegated clicks must recognize the image viewer trigger');
    assert.match(clickHandler, /openGeneratedImageViewer\(/u,
        'the image viewer trigger must open the QQ image viewer');

    assert.match(clickHandler, /imageGenerationController\.generate\(\{/,
        'QQ delegated clicks must run through the executable image-task controller');
    assert.match(clickHandler, /event\.preventDefault\(\)\s*;\s*event\.stopPropagation\(\)/,
        'the image action must not leak into message selection or long-press handling');

    assert.ok(cssRuleHas(css, '.yuzi-qq-generated-image-card', 'position:\\s*relative'),
        'generated image cards need a stable positioning surface');
    assert.ok(cssRuleHas(css, '.yuzi-qq-generated-image', 'object-fit:\\s*contain'),
        'generated images must remain fully visible instead of being cropped');
    assert.ok(cssRuleHas(css, '.yuzi-qq-generated-image-card.has-image', 'padding:\\s*0'),
        'a generated image card must remove bubble padding');
    assert.ok(cssRuleHas(css, '.yuzi-qq-generated-image-card.has-image', 'background:\\s*transparent'),
        'a generated image card must look like the picture itself');
    assert.ok(cssRuleHas(css, '.yuzi-qq-generated-image-viewer-button', 'cursor:\\s*zoom-in'),
        'a generated image must visibly support click-to-zoom');
    assert.ok(cssRuleHas(css, '.yuzi-qq-image-viewer-image', 'object-fit:\\s*contain'),
        'the QQ image viewer must show the whole picture');
    assert.ok(cssRuleHas(css, '.yuzi-qq-image-viewer-close', 'backdrop-filter:\\s*blur'),
        'the viewer close control must use a translucent glass treatment');
    assert.ok(cssRuleHas(
        css,
        '.yuzi-qq-generated-image-placeholder .yuzi-qq-generated-image-description',
        'text-align:\\s*center',
    ), 'a pending image must center its narrative copy');
    assert.ok(cssRuleHas(css, '.yuzi-qq-image-generate-button', 'inline-size:\\s*var\\(--yuzi-qq-image-action-size\\)'),
        'the generation action must be visibly smaller');
    assert.ok(cssRuleHas(
        css,
        '.yuzi-qq-image-generate-button',
        'background:\\s*color-mix\\(in srgb, var\\(--yuzi-qq-elevated\\) 18%, transparent\\)',
    ), 'the generation action must use a translucent glass background');
    assert.ok(cssRuleHas(css, '.yuzi-qq-image-generate-button', 'backdrop-filter:\\s*blur'),
        'the generation action must blur the image behind it');
    assert.ok(cssRuleHas(css, '.yuzi-qq-image-generate-button', 'border-radius:\\s*var\\(--yuzi-qq-radius-full\\)'),
        'the primary generation action must be circular');
    assert.match(css, /\.yuzi-qq-image-generate-button\.is-loading::after[\s\S]*animation:/,
        'the per-message loading state must visibly spin');
    assert.match(css, /\.yuzi-qq-image-regenerate-button/,
        'generated image cards must style the compact regenerate action separately');

    console.log('[qq-image-generation-ui-contract] passed');
}

main().catch((error) => {
    console.error('[qq-image-generation-ui-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
