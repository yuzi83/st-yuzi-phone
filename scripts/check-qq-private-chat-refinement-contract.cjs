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

function main() {
    const app = read('modules/qq-v2/ui/app.js');
    const css = read('styles/phone-base/12-qq-app.css');
    const tokens = read('styles/phone-base/00-phone-tokens.css');
    const rawPicker = read('modules/settings-app/services/media-upload/raw-picker.js');

    assert.match(app, /from '\.\.\/\.\.\/phone-core\/view-scroll-state\.js'/,
        'private chat must reuse the shared view-scroll state module');
    const render = sourceSlice(app, 'const render = async', 'const submitComposer = async');
    assert.match(render, /viewScrollState\.capture\(\)/, 'render must capture the mounted chat before rebuilding');
    assert.match(render, /viewport\.replaceChildren\(content\)[\s\S]*viewScrollState\.restore\(nextScrollSnapshot, \{ token, isCurrent: isActive \}\)/,
        'render must restore only after the new chat has mounted');

    const messageNode = sourceSlice(app, 'const messageNode =', 'const renderMessageStream =');
    assert.match(messageNode, /const groupChat = conversation\.kind === 'group'[\s\S]*if \(groupChat && message\.quote\)/,
        'quote rendering must stay guarded by the group conversation kind');
    const messageStream = sourceSlice(app, 'const renderMessageStream =', 'const renderComposer =');
    assert.match(messageStream, /conversation\.request\?\.phase === 'failed'[\s\S]*yuzi-qq-request-error[\s\S]*错误/,
        'a failed manual request must render one concise error badge without exposing backend details');
    assert.doesNotMatch(messageStream, /conversation\.request\?\.error/,
        'the chat stream must not expose the backend error message');
    const composer = sourceSlice(app, 'const renderComposer =', 'const renderEmojiPanel =');
    assert.match(composer, /if \(chatKind === 'group'\) \{[\s\S]*quoteDrafts\.get\([\s\S]*yuzi-qq-quote-preview/,
        'quote drafts and previews must stay inside the group composer branch');
    assert.match(composer, /data-qq-stop-generation/, 'queued or running manual requests expose a stop control');
    assert.match(app, /cancelManualRequest\(\{ conversationId: target\.dataset\.qqStopGeneration \}\)/,
        'the stop control must use the manual-request cancellation facade');

    const emoji = sourceSlice(app, 'const renderEmojiPanel = async', 'const renderChat = async');
    assert.match(emoji, /data-qq-sticker-upload/, 'the emoji grid must include an upload tile');
    assert.ok(emoji.indexOf('data-qq-sticker-upload') < emoji.indexOf('resources?.stickers'),
        'the upload tile must stay in the first emoji-grid cell');
    const stickerUpload = sourceSlice(app, 'const uploadSticker =', 'const confirmImageLibraryDeletion =');
    assert.match(app, /import \{ pickImageFiles \}/, 'QQ uploads must use the raw multi-file picker');
    assert.match(stickerUpload, /pickImageFiles\(/, 'sticker upload must preserve each original selected file');
    assert.doesNotMatch(stickerUpload, /skipCrop|cropPreset|compress\s*:/,
        'sticker upload must not enter a crop or compression path');
    assert.match(app, /title:\s*'\\u8868\\u60c5\\u4ed3\\u5e93'/, 'QQ image resources must include the global sticker repository');
    assert.match(rawPicker, /callback\(Object\.freeze\(files\.map\(imageFileRecord\)\)\)/,
        'the raw picker must expose ordered original files and filename metadata for sticker descriptions');

    assert.match(app, /jumpLabel\.textContent = formatUnreadBadge\(jumpCount\)/,
        'the jump bubble must render only the dynamic count');
    assert.match(css, /\.yuzi-qq-private-chat-jump-bubble::after/, 'the numeric bubble keeps the Figma tail');
    assert.match(css, /\.yuzi-qq-request-error\s*\{[\s\S]*border[^}]*var\(--yuzi-qq-danger\)/,
        'the manual request error badge must use the small red error treatment');
    assert.match(css, /\.yuzi-qq-private-message-stream::\-webkit-scrollbar[\s\S]*display:\s*none/,
        'the private message scrollbar must be visually hidden');
    assert.match(css, /\.yuzi-qq-private-chat-view\.has-chat-background::before/,
        'chat backgrounds must live on the fixed chat viewport layer');
    assert.match(css, /\.yuzi-qq-private-chat-tools[\s\S]*grid-template-columns:\s*repeat\(6,/,
        'the six composer tools must distribute across the available width');
    assert.match(css, /\.yuzi-qq-private-emoji-panel\s*\{[^}]*position:\s*absolute;[^}]*block-size:\s*var\(--yuzi-qq-private-emoji-panel-height\)/s,
        'the emoji grid must cover the chat bottom without resizing the message stream');
    assert.match(css, /\.yuzi-qq-private-chat-view\.has-emoji-panel\s+\.yuzi-qq-private-chat-composer\s*\{[^}]*inset-block-end:\s*var\(--yuzi-qq-private-emoji-panel-height\)/s,
        'the composer must rise above the open emoji grid');
    assert.match(css, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*var\(--yuzi-qq-private-emoji-column-min\)\),\s*1fr\)\)/,
        'the private emoji panel must retain empty slots while deriving responsive columns from one minimum track token');
    assert.match(tokens, /--yuzi-qq-composer-height:\s*88px/,
        'the docked Home Indicator must not be counted inside the composer twice');
    assert.match(tokens, /--yuzi-qq-private-emoji-panel-height:\s*min\(320px,\s*40%\)/,
        'the emoji grid must preserve its Figma height responsively');
    assert.match(tokens, /--yuzi-qq-private-emoji-column-min:\s*63px/,
        'the emoji grid must keep five baseline columns and naturally collapse on narrow phones');

    console.log('[qq-private-chat-refinement-contract] passed');
}

try {
    main();
} catch (error) {
    console.error('[qq-private-chat-refinement-contract] failed');
    console.error(error);
    process.exitCode = 1;
}
