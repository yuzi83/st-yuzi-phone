const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
    const {
        resolveMessageQuoteSwipe,
    } = await import('../modules/qq-v2/ui/message-swipe.js');

    assert.equal(resolveMessageQuoteSwipe({ x: 180, y: 100 }, { x: 120, y: 104 }), 'quote');
    assert.equal(resolveMessageQuoteSwipe({ x: 120, y: 100 }, { x: 180, y: 104 }), 'ignore',
        'right swipe must not create a quote');
    assert.equal(resolveMessageQuoteSwipe({ x: 180, y: 100 }, { x: 170, y: 160 }), 'ignore',
        'vertical scrolling must not create a quote');
    assert.equal(resolveMessageQuoteSwipe({ x: 180, y: 100 }, { x: 160, y: 104 }), 'ignore',
        'a short horizontal movement must not create a quote');

    const app = await fs.readFile(path.join(__dirname, '../modules/qq-v2/ui/app.js'), 'utf8');
    const swipe = await fs.readFile(path.join(__dirname, '../modules/qq-v2/ui/message-swipe.js'), 'utf8');
    const css = await fs.readFile(path.join(__dirname, '../styles/phone-base/12-qq-app.css'), 'utf8');

    assert.match(app, /from '\.\/message-swipe\.js'/,
        'QQ chat must use a dedicated message swipe controller');
    assert.match(app, /conversation\?\.kind === 'group'[\s\S]{0,500}bindMessageQuoteSwipeGesture/,
        'only group message rows must bind the quote swipe');
    assert.match(app, /bindMessageQuoteSwipeGesture\(\{[\s\S]{0,500}quoteDrafts\.select\(conversationId, message\)/,
        'a completed left swipe must select the message as the quote draft');
    assert.match(app, /quoteDrafts\.select\(conversationId, message\)[\s\S]{0,180}void render\(\)/,
        'selecting a quote by swipe must refresh the composer preview');
    assert.match(app, /bindConversationSwipeGesture\(/,
        'conversation-list left swipe deletion must remain on its existing controller');
    assert.match(swipe, /event\.preventDefault\(\)/,
        'a horizontal message swipe must take ownership from native scrolling');
    assert.match(swipe, /addEventListener\('click', handleClick, true\)/,
        'a completed message swipe must suppress the synthetic message-menu click');
    assert.match(css, /\.yuzi-qq-message\.is-quote-swiping\s*\{[^}]*transform:/s,
        'the message row must provide visual feedback while it is being quoted');

    console.log('[qq-message-swipe-contract] passed');
})().catch((error) => {
    console.error('[qq-message-swipe-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
