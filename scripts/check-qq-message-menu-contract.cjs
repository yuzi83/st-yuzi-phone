const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
    const {
        createMessageMenuController,
        createQuoteDrafts,
        copyMessageText,
        quotePreviewText,
        submitQuotedTextMessage,
    } = await import('../modules/qq-v2/ui/message-menu.js');

    const source = Object.freeze({
        messageId: 'message-7',
        type: 'text',
        content: 'The original message',
        senderName: 'Alice',
        storyTime: '2042-05-01 10:00',
    });

    const copied = [];
    await copyMessageText(source, { writeText: async (value) => copied.push(value) });
    assert.deepEqual(copied, ['The original message']);
    assert.deepEqual(source, {
        messageId: 'message-7',
        type: 'text',
        content: 'The original message',
        senderName: 'Alice',
        storyTime: '2042-05-01 10:00',
    }, 'copy must not rewrite the message');

    const quotes = createQuoteDrafts();
    assert.equal(quotes.select('conversation-1', source), true);
    assert.deepEqual(quotes.get('conversation-1'), {
        messageId: 'message-7',
        content: 'The original message',
        senderName: 'Alice',
        storyTime: '2042-05-01 10:00',
    });
    assert.equal(quotePreviewText({ status: 'deleted', messageId: 'message-7', content: '' }), '原消息已删除');

    const sent = [];
    const facade = {
        intent: {
            async sendMessage(input) {
                sent.push(input);
                return { ok: true, status: 'accepted' };
            },
        },
    };
    const result = await submitQuotedTextMessage({
        facade,
        conversationId: 'conversation-1',
        content: 'Reply without copying the source',
        quotes,
        messageFields: { mentionIds: ['person-2'], mentionAll: false },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(sent, [{
        conversationId: 'conversation-1',
        message: {
            type: 'text',
            content: 'Reply without copying the source',
            mentionIds: ['person-2'],
            mentionAll: false,
            quoteMessageId: 'message-7',
        },
    }], 'quote must cross the public Facade as a stable message ID');
    assert.equal(quotes.get('conversation-1'), null, 'a successful send closes the quote preview');

    const opened = [];
    const scheduled = [];
    let timestamp = 0;
    const menu = createMessageMenuController({
        open: (payload) => opened.push(payload),
        now: () => timestamp,
        setTimeoutFn: (callback) => {
            scheduled.push(callback);
            return callback;
        },
        clearTimeoutFn: (callback) => {
            const index = scheduled.indexOf(callback);
            if (index >= 0) scheduled.splice(index, 1);
        },
    });
    menu.handlePointerDown({ pointerType: 'touch', pointerId: 3 }, { conversationId: 'conversation-1', message: source });
    assert.equal(scheduled.length, 1, 'touch starts a long-press timer');
    scheduled.shift()();
    assert.deepEqual(opened, [{ conversationId: 'conversation-1', message: source }]);

    let prevented = false;
    timestamp = 1000;
    menu.handleContextMenu({ preventDefault: () => { prevented = true; } }, { conversationId: 'conversation-1', message: source });
    assert.equal(prevented, true, 'desktop right-click must not open the browser menu');
    assert.equal(opened.length, 2, 'desktop right-click opens the same message menu');

    const appSource = await fs.readFile(path.join(__dirname, '../modules/qq-v2/ui/app.js'), 'utf8');
    const cssSource = await fs.readFile(path.join(__dirname, '../styles/phone-base/12-qq-app.css'), 'utf8');
    assert.match(appSource, /from '\.\/message-menu\.js'/, 'the QQ App must use the message menu controller');
    assert.match(appSource, /handleContextMenu\(/, 'the rendered message must support desktop right-click');
    assert.match(appSource, /handlePointerDown\(/, 'the rendered message must support touch long-press');
    assert.match(appSource, /conversation\?\.kind === 'group'[\s\S]*submitQuotedTextMessage\(/,
        'only group composer submissions attach quote IDs');
    assert.match(appSource, /yuzi-qq-quote-preview/, 'group chat exposes a removable quote preview');
    assert.match(appSource, /createButton\('引用'/, 'group chat message menus expose quote actions');
    assert.match(appSource, /yuzi-qq-mention-panel/, 'group @ suggestions render above the composer input');
    assert.match(appSource, /mentionAll/, 'group @全体成员 uses a structured mention flag');
    assert.match(appSource, /data-qq-group-member-mention/, 'long-pressing a group avatar has a dedicated mention target');
    assert.match(appSource, /const renderQuoteCard =/, 'message quotes and composer previews must share one quote-card renderer');
    assert.match(appSource, /message\.quote[\s\S]{0,500}renderQuoteCard\(/,
        'incoming group messages must render the shared quote card');
    assert.match(appSource, /quoteDrafts\.get\(conversation\.conversationId\)[\s\S]{0,500}renderQuoteCard\(/,
        'the composer must render the same quote card for the active draft');
    assert.match(cssSource, /\.yuzi-qq-quote-card\s*\{[^}]*border-inline-start:[^}]*background:/s,
        'quote cards must have the shared visual container rather than a bare text strip');
    assert.match(cssSource, /\.yuzi-qq-quote-card-meta[\s\S]*\.yuzi-qq-quote-card-content/,
        'quote cards must reserve separate sender/time and content rows');
    assert.match(appSource, /createElement\('input',\s*'yuzi-qq-group-picker-checkbox'\)/,
        'the create-group picker must use a QQ-scoped compact checkbox');
    assert.doesNotMatch(appSource, /row\.append\(checkbox,\s*avatar\(/,
        'the create-group picker must remain a clean text-only member list');
    assert.doesNotMatch(appSource, /button\.append\(avatar\(option\.member/,
        'the @ member picker must remain a clean text-only member list');
    assert.match(cssSource, /\.yuzi-qq-group-picker-checkbox\s*\{[^}]*flex:\s*0 0 1\.1em;[^}]*inline-size:\s*1\.1em;[^}]*block-size:\s*1\.1em;/s,
        'create-group checkboxes must not stretch into long form controls');
    assert.match(cssSource, /\.yuzi-qq-group-picker-checkbox\s*\{[^}]*border-radius:\s*50%;/s,
        'create-group checkboxes must use the rounded selection treatment');
    assert.match(cssSource, /\.yuzi-qq-group-picker-list\s*\{[^}]*scrollbar-width:\s*none;[^}]*-ms-overflow-style:\s*none;/s,
        'the create-group member list must scroll without showing a scrollbar');
    assert.match(cssSource, /\.yuzi-qq-mention-panel\s*\{[^}]*scrollbar-width:\s*none;[^}]*-ms-overflow-style:\s*none;/s,
        'the @ member list must scroll without showing a scrollbar');
    assert.match(cssSource, /\.yuzi-qq-group-avatar-member\s*\{[^}]*min-block-size:\s*0;[^}]*max-inline-size:\s*100%;[^}]*max-block-size:\s*100%;/s,
        'each group avatar must be constrained inside its own grid cell');
    assert.doesNotMatch(appSource, /drafts\.set\(conversationId, `> \$\{messageContent\(message\)\}/, 'quote must not paste source text into the draft');

    console.log('[qq-message-menu-contract] passed');
}

main().catch((error) => {
    console.error('[qq-message-menu-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
