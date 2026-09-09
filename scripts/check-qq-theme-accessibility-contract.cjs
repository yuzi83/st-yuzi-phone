const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declarationPattern(name, value) {
    return new RegExp(`${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(value)}\\s*;`);
}

function selectorBlock(source, selector) {
    const start = source.indexOf(selector);
    assert.notEqual(start, -1, `${selector} must exist`);
    const open = source.indexOf('{', start);
    assert.notEqual(open, -1, `${selector} must open a declaration block`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`${selector} must close its declaration block`);
}

function main() {
    const tokens = read('styles/phone-base/00-phone-tokens.css');
    const css = read('styles/phone-base/12-qq-app.css');
    const variables = read('docs/phone-ui-variables.md');
    const darkTheme = selectorBlock(tokens, '[data-yuzi-phone-theme="dark"]');

    const themeMappings = [
        ['--yuzi-qq-surface', '--yuzi-qq-light-surface', '--yuzi-qq-dark-surface'],
        ['--yuzi-qq-elevated', '--yuzi-qq-light-elevated', '--yuzi-qq-dark-elevated'],
        ['--yuzi-qq-text', '--yuzi-qq-light-text', '--yuzi-qq-dark-text'],
        ['--yuzi-qq-muted', '--yuzi-qq-light-muted', '--yuzi-qq-dark-muted'],
        ['--yuzi-qq-line', '--yuzi-qq-light-line', '--yuzi-qq-dark-line'],
        ['--yuzi-qq-bubble-self', '--yuzi-qq-light-bubble-self', '--yuzi-qq-dark-bubble-self'],
        ['--yuzi-qq-bubble-other', '--yuzi-qq-light-bubble-other', '--yuzi-qq-dark-bubble-other'],
        ['--yuzi-qq-subtle', '--yuzi-qq-light-subtle', '--yuzi-qq-dark-subtle'],
        ['--yuzi-qq-control', '--yuzi-qq-light-control', '--yuzi-qq-dark-control'],
        ['--yuzi-qq-input', '--yuzi-qq-light-input', '--yuzi-qq-dark-input'],
        ['--yuzi-qq-dialog-surface', '--yuzi-qq-light-dialog', '--yuzi-qq-dark-dialog'],
        ['--yuzi-qq-dialog-muted', '--yuzi-qq-light-dialog-muted', '--yuzi-qq-dark-dialog-muted'],
        ['--yuzi-qq-icon', '--yuzi-qq-light-icon', '--yuzi-qq-dark-icon'],
        ['--yuzi-qq-avatar-surface', '--yuzi-qq-light-avatar', '--yuzi-qq-dark-avatar'],
        ['--yuzi-qq-avatar-ink', '--yuzi-qq-light-avatar-ink', '--yuzi-qq-dark-avatar-ink'],
        ['--yuzi-qq-overlay', '--yuzi-qq-light-overlay', '--yuzi-qq-dark-overlay'],
        ['--yuzi-qq-background-overlay', '--yuzi-qq-light-background-overlay', '--yuzi-qq-dark-background-overlay'],
    ];

    for (const [semantic, light, dark] of themeMappings) {
        assert.match(tokens, declarationPattern(semantic, `var(${light})`), `${semantic} must default to the global light theme token`);
        assert.match(darkTheme, declarationPattern(semantic, `var(${dark})`), `${semantic} must switch with the global dark theme token`);
    }

    assert.match(tokens, declarationPattern('--yuzi-qq-readable-text-scale', 'var(--yuzi-phone-readable-text-scale, 1)'),
        'QQ readable text must inherit the phone-wide text scale');
    for (const token of [
        '--yuzi-qq-title-size',
        '--yuzi-qq-body-size',
        '--yuzi-qq-caption-size',
        '--yuzi-qq-nav-label-size',
        '--yuzi-qq-composer-line-height',
        '--yuzi-qq-composer-input-max-height',
    ]) {
        assert.match(tokens, new RegExp(`${escapeRegExp(token)}\\s*:[^;]*var\\(--yuzi-qq-readable-text-scale\\)`),
            `${token} must accommodate the 160% readable-text setting`);
    }

    assert.match(css, /\.yuzi-qq-view\s*\{[\s\S]*?inline-size:\s*100%;[\s\S]*?max-inline-size:\s*none;[\s\S]*?margin-inline:\s*0;/,
        'QQ root pages must fill the resized phone width without scaling their controls');
    assert.match(css, /\.yuzi-qq-nav-item\s*\{[\s\S]*?min-inline-size:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;/,
        'the fixed root navigation must stay reachable without forcing horizontal overflow at narrow widths');
    assert.match(css, /\.yuzi-qq-tool-bar\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;/,
        'the required composer tools must remain on one horizontally scrollable row');
    assert.match(css, /\.yuzi-qq-tool-button\s*\{[\s\S]*?flex:\s*0 0 var\(--yuzi-qq-tool-size\);/,
        'composer tools must not shrink out of reach at the narrow-width boundary');

    assert.match(css, /\.yuzi-qq-app button:focus-visible,[\s\S]*?outline:\s*var\(--yuzi-qq-focus-ring-width\) solid var\(--yuzi-qq-accent\);/,
        'keyboard controls must retain a visible semantic focus ring');
    assert.match(css, /#yuzi-phone-standalone \.yuzi-phone-shell \.yuzi-qq-app :is\(input, textarea, select\):focus-visible\s*\{[\s\S]*?outline:\s*none !important;/u,
        'QQ form fields must override the shell blue focus outline');
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.yuzi-qq-app\s*\{[\s\S]*?--yuzi-qq-transition:\s*var\(--yuzi-qq-reduced-transition\);/,
        'reduced-motion users must force QQ motion through the semantic immediate-transition token');
    assert.match(tokens, /--yuzi-qq-reduced-transition:\s*0ms;/,
        'the immediate transition value must be declared as a token, not in component CSS');

    for (const documented of [
        '--yuzi-qq-readable-text-scale',
        '--yuzi-qq-reduced-transition',
        '200-400px',
        '800-1200px',
        '超窄',
    ]) {
        assert.ok(variables.includes(documented), `Variable documentation must describe ${documented}`);
    }
}

try {
    main();
    console.log('[qq-theme-accessibility-contract] passed');
} catch (error) {
    console.error('[qq-theme-accessibility-contract] failed');
    console.error(error);
    process.exitCode = 1;
}
