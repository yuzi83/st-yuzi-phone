const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function sourceSlice(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return '';
    const end = source.indexOf(endMarker, start + startMarker.length);
    return source.slice(start, end < 0 ? source.length : end);
}

async function main() {
    const { __test__ } = await import('../modules/qq-v2/ui/app.js');
    const app = read('modules/qq-v2/ui/app.js');
    const css = read('styles/phone-base/12-qq-app.css');

    const chatHeader = sourceSlice(app, 'const makeChatHeader =', 'const makeNav =');
    assert.match(chatHeader, /yuzi-qq-chat-header[^'`]*is-left-aligned|is-left-aligned[^'`]*yuzi-qq-chat-header/,
        'private-chat title/status must use the shared left-aligned header state');

    const messageNode = sourceSlice(app, 'const messageNode =', 'const renderMessageStream =');
    assert.match(messageNode, /const\s+\w+\s*=\s*avatar\([^;]+yuzi-qq-message-avatar/,
        'private-chat message rendering must build the shared avatar node for every non-system message');
    assert.match(messageNode, /message\.senderAvatarAssetId/, 'private-chat avatars must prefer the sender captured on each message');
    assert.match(messageNode, /item\.append\(\w+,\s*stack\)/,
        'all messages must keep one avatar-first DOM order so row-reverse places the self avatar on the right');
    assert.doesNotMatch(messageNode, /if\s*\(!own\)\s*item\.append\(avatar\(/,
        'avatar rendering must not remain NPC-only');

    const composer = sourceSlice(app, 'const renderComposer =', 'const renderEmojiPanel =');
    assert.match(composer, /data-phone-bottom-bar/, 'the chat composer must opt into the shared Home Indicator safe-area contract');

    const render = sourceSlice(app, 'const render = async', 'const submitComposer =');
    assert.match(render, /immediateSnapshot\.scrollSnapshot\s*\|\|\s*\(page\?\.type\s*===\s*'chat'[\s\S]*state:\s*\{\s*mode:\s*'bottom'\s*\}/,
        'entering a chat without a saved scroll anchor must start at the latest message');

    assert.match(
        css,
        /\.yuzi-qq-composer-input\s*\{[^}]*inline-size:\s*100%;[^}]*min-inline-size:\s*0;[^}]*max-inline-size:\s*100%;/s,
        'the private-chat input must absorb the available width while the phone resizes',
    );

    assert.equal(__test__.chatTitle({ remark: '  小夏  ', title: '林知夏' }), '小夏');
    assert.equal(__test__.chatTitle({ remark: '', title: '林知夏' }), '林知夏');
    assert.equal(__test__.chatTitle({ title: '', person: { formalName: '林知夏' } }), '林知夏');

    const firstPage = {
        items: Array.from({ length: 50 }, (_, index) => ({ messageId: `m-${index + 1}`, sequence: index + 1 })),
        hasMore: true,
        nextBeforeSequence: 1,
    };
    const secondPage = {
        items: [
            { messageId: 'm-0', sequence: 0 },
            { messageId: 'm-1', sequence: 1 },
        ],
        hasMore: false,
        nextBeforeSequence: null,
    };
    const merged = __test__.mergeMessagePage(firstPage, secondPage, { prepend: true });
    assert.equal(merged.items.length, 51);
    assert.deepEqual(merged.items.slice(0, 3).map((item) => item.messageId), ['m-0', 'm-1', 'm-2']);
    assert.equal(merged.hasMore, false);
    assert.equal(merged.nextBeforeSequence, null);

    assert.equal(__test__.needsTimeDivider(null, { storyTime: '2042-05-20 09:00' }), true);
    assert.equal(__test__.needsTimeDivider({ storyTime: '2042-05-20 09:00' }, { storyTime: '2042-05-20 09:29' }), false);
    assert.equal(__test__.needsTimeDivider({ storyTime: '2042-05-20 09:00' }, { storyTime: '2042-05-20 09:30' }), true);
    assert.equal(__test__.needsTimeDivider({ storyTime: '2042-05-20 09:00' }, { storyTime: '2042-05-21 09:00' }), true);
    assert.equal(__test__.needsTimeDivider(null, { storyTime: '' }), false);

    assert.equal(__test__.isNearMessageBottom({ scrollTop: 600, clientHeight: 300, scrollHeight: 920 }), true);
    assert.equal(__test__.isNearMessageBottom({ scrollTop: 400, clientHeight: 300, scrollHeight: 920 }), false);
    assert.equal(__test__.isNearMessageBottom({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }), true);
}

main().then(() => console.log('[qq-private-chat-window-contract] passed')).catch((error) => {
    console.error('[qq-private-chat-window-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
