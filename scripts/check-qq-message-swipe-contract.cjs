const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
    const {
        resolveMessageQuoteSwipe,
        bindMessageQuoteSwipeGesture,
    } = await import('../modules/qq-v2/ui/message-swipe.js');

    assert.equal(resolveMessageQuoteSwipe({ x: 180, y: 100 }, { x: 120, y: 104 }), 'quote');
    assert.equal(resolveMessageQuoteSwipe({ x: 120, y: 100 }, { x: 180, y: 104 }), 'ignore',
        'right swipe must not create a quote');
    assert.equal(resolveMessageQuoteSwipe({ x: 180, y: 100 }, { x: 170, y: 160 }), 'ignore',
        'vertical scrolling must not create a quote');
    assert.equal(resolveMessageQuoteSwipe({ x: 180, y: 100 }, { x: 160, y: 104 }), 'ignore',
        'a short horizontal movement must not create a quote');

    class Row extends EventTarget {
        captured = null;
        classList = { add() {}, remove() {} };
        style = { setProperty() {}, removeProperty() {} };
        setPointerCapture(id) { this.captured = id; }
        hasPointerCapture(id) { return this.captured === id; }
        releasePointerCapture() { this.captured = null; }
    }
    globalThis.HTMLElement = Row;
    const row = new Row();
    let quotes = 0;
    const unbind = bindMessageQuoteSwipeGesture({ row, onQuote: () => quotes++ });
    const fire = (type, x = 100, y = 100) => {
        const event = new Event(type, { cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y });
        row.dispatchEvent(event);
        return event;
    };
    fire('pointerdown');
    assert.equal(row.captured, null, 'a tap must not retarget media/voice/transfer child buttons to the row');
    fire('pointerup');
    assert.equal(fire('click').defaultPrevented, false);
    fire('pointerdown');
    fire('pointermove', 98, 125);
    assert.equal(row.captured, null, 'vertical scroll must remain native');
    fire('pointercancel');
    fire('pointerdown');
    fire('pointermove', 70);
    assert.equal(row.captured, 1, 'capture starts only after a left drag');
    fire('pointerup', 40);
    assert.equal(quotes, 1);
    assert.equal(row.captured, null);
    assert.equal(fire('click').defaultPrevented, true, 'completed quote suppresses its trailing click');
    assert.equal(fire('click').defaultPrevented, false, 'later media clicks are not swallowed');
    fire('pointerdown');
    fire('pointermove', 90);
    fire('pointercancel');
    assert.equal(row.captured, null);
    unbind();
    fire('pointerdown');
    fire('pointermove', 40);
    assert.equal(row.captured, null, 'cleanup removes listeners');

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
