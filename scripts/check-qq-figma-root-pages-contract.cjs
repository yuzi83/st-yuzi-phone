const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

async function main() {
    const app = read('modules/qq-v2/ui/app.js');
    const css = read('styles/phone-base/12-qq-app.css');
    const tokens = read('styles/phone-base/00-phone-tokens.css');
    const { __test__ } = await import(pathToFileURL(path.join(ROOT, 'modules/qq-v2/ui/app.js')).href);

    const tabs = app.match(/const TABS = Object\.freeze\(\[([\s\S]*?)\]\);/);
    assert.ok(tabs, 'QQ root tabs must be declared as one fixed list');
    assert.match(tabs[1], /\['messages', '\u6d88\u606f'\]/, 'messages stays first');
    assert.match(tabs[1], /\['contacts', '\u8054\u7cfb\u4eba'\]/, 'contacts stays second');
    assert.match(tabs[1], /\['assistant', '\u52a9\u624b'\]/, 'assistant stays third');
    assert.match(tabs[1], /\['settings', '\u8bbe\u7f6e'\]/, 'settings stays fourth');
    assert.doesNotMatch(tabs[1], /\u9891\u9053|\u52a8\u6001/, 'Figma source labels cannot replace the agreed QQ tabs');

    assert.match(app, /data-qq-current-profile/, 'all root identity avatars expose the current-profile route seam');
    assert.match(app, /target\.dataset\.qqCurrentProfile[\s\S]{0,120}type:\s*'current-profile'/,
        'the current-profile avatar enters the route owned by the profile task');
    assert.match(app, /statusText\.textContent\s*=\s*'\\u5728\\u7ebf - WIFI'/,
        'message and assistant identity headers show the Figma WIFI presence label');

    assert.match(app, /\['创建群聊',\s*'message'\][\s\S]{0,500}\['创建频道',\s*'hashtag'\][\s\S]{0,500}\['加好友\/群',\s*'user-plus'\]/,
        'the message plus menu keeps the three Figma rows in order');
    assert.match(app, /yuzi-qq-message-add-contact-action[\s\S]{0,140}data-qq-add-contact-menu/,
        'only the final plus-menu row is wired to add a contact');
    assert.match(app, /yuzi-qq-swipe-delete[\s\S]{0,160}data-qq-delete-conversation/,
        'conversation deletion remains behind the swipe-reveal action');

    assert.doesNotMatch(app, /createIcon\(iconName, 'yuzi-qq-contact-utility-icon'\)/,
        'new-friend and group-notice utilities have no left-side icon');
    assert.equal(__test__.contactDirectoryBucket('7号'), '#', 'numbers live in the # contact section');
    assert.equal(__test__.contactDirectoryBucket('Amy'), 'A', 'Latin contacts use their uppercase initial');
    assert.equal(__test__.contactDirectoryBucket('张三'), 'Z', 'Chinese contacts use the pinyin initial');
    assert.equal(__test__.contactDirectoryBucket('阿明'), 'A', 'Chinese pinyin sections use their Figma initial');
    const mixedContactSections = __test__.groupContactsForDirectory([
        { formalName: '7号' },
        { formalName: 'Yuki' },
        { formalName: 'Amy' },
        { formalName: 'Zed' },
    ]);
    assert.deepEqual(mixedContactSections.map(section => section.letter), ['A', 'Y', 'Z', '#'],
        'letter contact sections stay alphabetical and # is always last');
    const fallbackOnlySections = __test__.groupContactsForDirectory([
        { formalName: '7号' },
        { formalName: '!公告' },
    ]);
    assert.deepEqual(fallbackOnlySections.map(section => section.letter), ['#'],
        'a directory containing only fallback contacts keeps one # section');

    assert.match(app, /const renderAssistant = async \(token\) =>[\s\S]{0,150}renderMessagesRoot\(token, true\)/,
        '助手列表复用消息页的完整布局');
    assert.match(app, /createIcon\('bars'\)/, 'private-chat detail control uses the Figma three-line menu icon');
    assert.doesNotMatch(app, /yuzi-qq-private-chat-profile-trigger/,
        'private-chat header does not add a second profile avatar control');

    const stickerBranch = app.slice(app.indexOf('if (target.dataset.qqSticker)'), app.indexOf('if (target.dataset.qqSettings)'));
    assert.match(stickerBranch, /facade\.intent\.sendMessage/, 'selecting an emoji sends an independent message immediately');
    assert.match(stickerBranch, /stickerId:\s*target\.dataset\.qqSticker/,
        'sticker messages must preserve the selected Facade stickerId');
    assert.match(stickerBranch, /render\(\{ preserveEmoji: true \}\)/,
        'an emoji send preserves the emoji layer for consecutive selections');
    assert.match(css, /\.yuzi-qq-search\s*\{[\s\S]*?justify-content:\s*center;/,
        'Figma root searches center the icon and label as one visual unit');
    assert.match(css, /\.yuzi-qq-message-add-menu-item\s*\{[\s\S]*?min-block-size:\s*var\(--yuzi-qq-dialog-menu-row-height\);/,
        'plus-menu rows use the documented Figma menu row token');
    assert.match(css, /\.yuzi-qq-app\s*\{[\s\S]*?font-family:\s*var\(--yuzi-phone-font-family\);/,
        'QQ consumes the selectable phone font instead of the host font');
    assert.match(css, /\.yuzi-qq-contact-utilities\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*var\(--yuzi-qq-contact-utility-gap\);/,
        'contact utilities stack vertically with their dedicated gap token');
    assert.match(css, /\.yuzi-qq-contact-utility\s*\{[\s\S]*?min-block-size:\s*var\(--yuzi-qq-contact-utility-row-height\);/,
        'contact utility rows use their dedicated Figma height token');
    assert.match(tokens, /--yuzi-qq-contact-utility-row-height:\s*58px;/,
        'contact utility rows keep the measured 58px Figma height');
    assert.match(tokens, /--yuzi-qq-contact-utility-gap:\s*0px;/,
        'two contact utility rows form the measured 116px stack');
    for (const [token, value] of [
        ['--yuzi-qq-contact-title-size', 'calc(17px * var(--yuzi-qq-readable-text-scale))'],
        ['--yuzi-qq-contact-title-weight', '500'],
        ['--yuzi-qq-contact-search-size', 'calc(14px * var(--yuzi-qq-readable-text-scale))'],
        ['--yuzi-qq-contact-search-weight', '400'],
        ['--yuzi-qq-contact-primary-size', 'calc(16px * var(--yuzi-qq-readable-text-scale))'],
        ['--yuzi-qq-contact-primary-weight', '500'],
        ['--yuzi-qq-contact-index-size', 'calc(11px * var(--yuzi-qq-readable-text-scale))'],
        ['--yuzi-qq-contact-index-weight', '400'],
        ['--yuzi-qq-contact-secondary-size', 'calc(13px * var(--yuzi-qq-readable-text-scale))'],
        ['--yuzi-qq-contact-secondary-weight', '400'],
    ]) {
        assert.ok(tokens.includes(`${token}: ${value};`), `${token} must keep its measured Figma value`);
    }
    assert.match(css, /\.yuzi-qq-contact-root-title\s*\{[\s\S]*?font-size:\s*var\(--yuzi-qq-contact-title-size\);[\s\S]*?font-weight:\s*var\(--yuzi-qq-contact-title-weight\);/,
        'contact title uses its measured typography role');
    assert.match(css, /\.yuzi-qq-contact-root-search\s*\{[\s\S]*?font-size:\s*var\(--yuzi-qq-contact-search-size\);[\s\S]*?font-weight:\s*var\(--yuzi-qq-contact-search-weight\);/,
        'contact search uses its measured typography role');
    assert.match(css, /\.yuzi-qq-contact-utility-label\s*\{[\s\S]*?font-size:\s*var\(--yuzi-qq-contact-primary-size\);[\s\S]*?font-weight:\s*var\(--yuzi-qq-contact-primary-weight\);/,
        'contact utility labels use the measured primary typography role');
    assert.match(css, /\.yuzi-qq-contact-name\s*\{[\s\S]*?font-size:\s*var\(--yuzi-qq-contact-primary-size\);[\s\S]*?font-weight:\s*var\(--yuzi-qq-contact-primary-weight\);/,
        'contact names use the measured primary typography role');
    assert.match(css, /\.yuzi-qq-contact-section-label\s*\{[\s\S]*?font-size:\s*var\(--yuzi-qq-contact-index-size\);[\s\S]*?font-weight:\s*var\(--yuzi-qq-contact-index-weight\);/,
        'contact directory labels use the measured index typography role');
    assert.match(css, /\.yuzi-qq-contact-presence\s*\{[\s\S]*?font-size:\s*var\(--yuzi-qq-contact-secondary-size\);[\s\S]*?font-weight:\s*var\(--yuzi-qq-contact-secondary-weight\);/,
        'contact presence uses the measured secondary typography role');

    console.log('[qq-figma-root-pages-contract] passed');
}

main().catch((error) => {
    console.error('[qq-figma-root-pages-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
