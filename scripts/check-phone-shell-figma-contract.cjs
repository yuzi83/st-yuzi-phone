const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorBlock(source, selector) {
    const blocks = [];
    const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{`, 'g');
    let match;
    while ((match = pattern.exec(source))) {
        const open = source.indexOf('{', match.index);
        let depth = 0;
        for (let index = open; index < source.length; index += 1) {
            if (source[index] === '{') depth += 1;
            if (source[index] === '}') depth -= 1;
            if (depth === 0) {
                blocks.push(source.slice(open + 1, index));
                pattern.lastIndex = index + 1;
                break;
            }
        }
    }
    assert.ok(blocks.length > 0, `${selector} must exist`);
    return blocks.join('\n');
}

function assertDeclaration(source, name, value, description) {
    const declaration = new RegExp(`${escapeRegExp(name)}\\s*:\\s*([^;]+);`, 'g');
    let match;
    let finalValue = '';
    while ((match = declaration.exec(source))) {
        finalValue = match[1].trim();
    }
    assert.equal(
        finalValue,
        value,
        description || `${name} must finally resolve to ${value}`,
    );
}

function main() {
    const tokens = read('styles/phone-base/00-phone-tokens.css');
    const shell = read('styles/phone-base/01-shell-system.css');
    const shellHtml = read('modules/phone-core/shell-ui.js');
    const qqApp = read('modules/qq-v2/ui/app.js');
    const root = selectorBlock(tokens, ':root');
    const dark = selectorBlock(tokens, '[data-yuzi-phone-theme="dark"]');

    assertDeclaration(root, '--yuzi-qq-max-content-width', '100%',
        'QQ must treat the 402px Figma screen as a reference rather than a content-width cap');
    assertDeclaration(root, '--yuzi-qq-light-system-foreground', 'var(--yuzi-phone-color-black)',
        'QQ light skin must use the Figma dark system foreground');
    assertDeclaration(root, '--yuzi-qq-dark-system-foreground', 'var(--yuzi-phone-color-white)',
        'QQ dark skin must use the Figma white system foreground');
    assertDeclaration(root, '--yuzi-phone-system-foreground', 'var(--yuzi-qq-light-system-foreground)',
        'QQ light skin must drive shell system foreground');
    assertDeclaration(root, '--yuzi-phone-status-icon-filter', 'brightness(0)',
        'light mode must turn the white status SVG assets black');
    assertDeclaration(root, '--yuzi-phone-home-indicator-color', 'var(--yuzi-phone-system-foreground)',
        'Home Indicator must consume the shell foreground role');
    assertDeclaration(root, '--yuzi-phone-home-indicator-width', '144px',
        'Home Indicator must preserve the 144px Figma leaf width');
    assertDeclaration(root, '--yuzi-phone-home-indicator-hit-height', '34px',
        'Home Indicator must preserve the 34px Figma tab/home hit area');
    assertDeclaration(root, '--yuzi-phone-home-indicator-bottom', '8px',
        'Home Indicator must preserve the Figma bottom inset');
    assertDeclaration(dark, '--yuzi-phone-system-foreground', 'var(--yuzi-qq-dark-system-foreground)',
        'QQ dark skin must switch shell system foreground');
    assertDeclaration(dark, '--yuzi-phone-status-icon-filter', 'none',
        'dark mode must preserve the white status SVG assets');

    for (const [token, light, darkValue] of [
        ['--yuzi-phone-form-surface', 'var(--yuzi-qq-light-search)', 'var(--yuzi-qq-dark-search)'],
        ['--yuzi-phone-form-text', 'var(--yuzi-qq-light-text)', 'var(--yuzi-qq-dark-text)'],
        ['--yuzi-phone-form-border', 'var(--yuzi-qq-light-line)', 'var(--yuzi-qq-dark-line)'],
        ['--yuzi-phone-form-placeholder', 'var(--yuzi-qq-light-muted)', 'var(--yuzi-qq-dark-muted)'],
    ]) {
        assertDeclaration(root, token, light, `${token} must map to the QQ light skin`);
        assertDeclaration(dark, token, darkValue, `${token} must map to the QQ dark skin`);
    }

    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-status-bar\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-system-foreground\);/,
        'the unique shell status bar must consume the QQ skin foreground role');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-status-icons img\s*\{[\s\S]*?filter:\s*var\(--yuzi-phone-status-icon-filter\);/,
        'the shell status icons must consume the same black-or-white appearance role');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell:has\(\.yuzi-phone-screen > \.phone-page:not\(\.phone-page-exit\):not\(\.phone-page-exit-back\) > \.phone-home\[data-home-app-label-color-mode="white"\]\) \.yuzi-phone-status-bar\s*\{[\s\S]*?--yuzi-phone-status-icon-filter:\s*none;[\s\S]*?color:\s*var\(--yuzi-phone-home-app-label-color-on-dark\);/,
        'the active home status bar must use the configured white App-label foreground and icon treatment');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell:has\(\.yuzi-phone-screen > \.phone-page:not\(\.phone-page-exit\):not\(\.phone-page-exit-back\) > \.phone-home\[data-home-app-label-color-mode="black"\]\) \.yuzi-phone-status-bar\s*\{[\s\S]*?--yuzi-phone-status-icon-filter:\s*brightness\(0\);[\s\S]*?color:\s*var\(--yuzi-phone-home-app-label-color-on-light\);/,
        'the active home status bar must use the configured black App-label foreground and icon treatment');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-home-indicator\s*>\s*span\s*\{[\s\S]*?background:\s*var\(--yuzi-phone-home-indicator-color\);/,
        'the unique shell Home Indicator must consume its semantic foreground role');
    assert.match(shell, /\.phone-page\.yuzi-qq-app\s*\{[\s\S]*?inline-size:\s*100%;[\s\S]*?block-size:\s*100%;/,
        'the QQ route root must fill the resized phone page');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell\s*:is\(input, select, textarea\)\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-form-text\);[\s\S]*?background-color:\s*var\(--yuzi-phone-form-surface\);[\s\S]*?border-color:\s*var\(--yuzi-phone-form-border\);/,
        'native phone form controls must consume readable semantic roles');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell\s*:is\(input, select, textarea\)::placeholder\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-form-placeholder\);/,
        'native phone form placeholders must remain readable in either QQ skin');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell\s*:is\(input, select, textarea\):focus-visible\s*\{[\s\S]*?outline:\s*var\(--yuzi-phone-form-focus-ring-width\) solid var\(--yuzi-phone-form-focus-ring\);/,
        'native phone form focus must use the semantic QQ-skin focus role');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell\s*:is\(input, select, textarea\):disabled\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-form-disabled-text\);[\s\S]*?background-color:\s*var\(--yuzi-phone-form-disabled-surface\);/,
        'native disabled form controls must remain readable in either QQ skin');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell \.yuzi-qq-app :is\([\s\S]*?input\[type="text"\][\s\S]*?select[\s\S]*?\)\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-form-text\) !important;[\s\S]*?-webkit-text-fill-color:\s*var\(--yuzi-phone-form-text\) !important;[\s\S]*?background-color:\s*var\(--yuzi-phone-form-surface\) !important;[\s\S]*?border-color:\s*var\(--yuzi-phone-form-border\) !important;[\s\S]*?color-scheme:\s*var\(--yuzi-phone-native-control-color-scheme\);/,
        'QQ text controls must defeat SillyTavern theme rules through shared form roles');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell \.yuzi-qq-app :is\(input, textarea\)::placeholder\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-form-placeholder\) !important;[\s\S]*?-webkit-text-fill-color:\s*var\(--yuzi-phone-form-placeholder\) !important;/,
        'QQ placeholders must consume the shared readable placeholder role');
    assert.match(shell, /#yuzi-phone-standalone \.yuzi-phone-shell \.yuzi-qq-app select option\s*\{[\s\S]*?color:\s*var\(--yuzi-phone-form-text\) !important;[\s\S]*?background-color:\s*var\(--yuzi-phone-form-surface\) !important;/,
        'QQ native options must not inherit the SillyTavern page palette');
    assert.doesNotMatch(shell, /\.yuzi-phone-shell \.yuzi-qq-app[^\{]*input\[type="(?:checkbox|radio|range|file|hidden)"\]/,
        'QQ host-theme isolation must not repaint non-text input controls');
    assert.doesNotMatch(shell, /SmartTheme|--ui-color-/,
        'the phone shell must not consume SillyTavern theme variables directly');

    assert.equal((shellHtml.match(/class="yuzi-phone-status-bar"/g) || []).length, 1,
        'the shell must render exactly one global status bar');
    assert.equal((shellHtml.match(/class="yuzi-phone-home-indicator"/g) || []).length, 1,
        'the shell must render exactly one Home Indicator control');
    assert.doesNotMatch(qqApp, /(?:yuzi-)?phone-status-bar|(?:yuzi-)?phone-home-indicator/,
        'QQ must not duplicate the global status bar or Home Indicator');
}

try {
    main();
    console.log('[phone-shell-figma-contract] passed');
} catch (error) {
    console.error('[phone-shell-figma-contract] failed');
    console.error(error);
    process.exitCode = 1;
}
