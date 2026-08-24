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
    const avatar = sourceSlice(app, 'const avatar =', 'const stickerImage =');
    const messageNode = sourceSlice(app, 'const messageNode =', 'const renderMessageStream =');

    assert.match(avatar, /interactive\s*=\s*false/, 'avatar rendering must support an explicit interactive mode');
    assert.match(avatar, /interactive[\s\S]*createButton\(/, 'interactive avatars must remain semantic buttons');
    assert.match(messageNode, /const own = message\.senderType === 'self';/, 'message rendering must distinguish self from the other participant');
    assert.match(messageNode, /interactive:\s*!own/, 'only the other participant avatar should open a profile');
    assert.match(messageNode, /data-qq-profile[\s\S]*conversationId/, 'the other avatar must reuse the current conversation profile target');
    assert.match(app, /if \(target\.dataset\.qqProfile\) return go\(\{ type: 'profile', conversationId: target\.dataset\.qqProfile \}\);/,
        'chat avatar clicks must reuse the existing contact profile route');
    assert.match(css, /\.yuzi-qq-avatar-button\s*\{[^}]*padding:\s*0;[^}]*appearance:\s*none;/s,
        'interactive avatars must not inherit native button padding or appearance');

    console.log('[qq-chat-avatar-profile-contract] passed');
}

try {
    main();
} catch (error) {
    console.error('[qq-chat-avatar-profile-contract] failed');
    console.error(error);
    process.exitCode = 1;
}