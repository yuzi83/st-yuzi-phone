const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleBlock(source, selector) {
    const start = source.indexOf(selector);
    assert.notEqual(start, -1, `${selector} must exist`);
    const open = source.indexOf('{', start);
    assert.notEqual(open, -1, `${selector} must open a block`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`${selector} must close its block`);
}

function atRuleBlocks(source, atRule) {
    const blocks = [];
    let cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf(atRule, cursor);
        if (start < 0) break;
        const open = source.indexOf('{', start);
        if (open < 0) break;
        let depth = 0;
        let close = -1;
        for (let index = open; index < source.length; index += 1) {
            if (source[index] === '{') depth += 1;
            if (source[index] === '}') depth -= 1;
            if (depth === 0) {
                close = index;
                break;
            }
        }
        assert.notEqual(close, -1, `${atRule} must close its block`);
        blocks.push(source.slice(start, close + 1));
        cursor = close + 1;
    }
    return blocks;
}

function assertDeclaration(source, name, expected) {
    const pattern = new RegExp(`${escapeRegExp(name)}\\s*:\\s*([^;]+);`, 'g');
    let match;
    let actual = '';
    while ((match = pattern.exec(source))) actual = match[1].trim();
    assert.equal(actual, expected, `${name} must resolve to ${expected}`);
}

function assertSnippets(source, file, snippets) {
    for (const snippet of snippets) {
        assert.ok(source.includes(snippet), `${file} must consume shared navigation via ${snippet}`);
    }
}

async function main() {
    const navigationPath = 'modules/phone-core/navigation-ui.js';
    const iconsPath = 'modules/phone-home/icons.js';
    const tokensPath = 'styles/phone-base/00-phone-tokens.css';
    const shellPath = 'styles/phone-base/01-shell-system.css';
    const navCssPath = 'styles/phone-base/06-layout-nav-core.css';
    const navigationSource = read(navigationPath);
    const tokens = read(tokensPath);
    const shell = read(shellPath);
    const navCss = read(navCssPath);
    const rootTokens = ruleBlock(tokens, ':root');

    const navigation = await import(pathToFileURL(path.join(ROOT, navigationPath)).href);
    const { PHONE_ICONS } = await import(pathToFileURL(path.join(ROOT, iconsPath)).href);
    const expectedBackGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16 19L8 12L16 5"/></svg>';
    const expectedForwardGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 19L16 12L8 5"/></svg>';

    assert.equal(PHONE_ICONS.back, expectedBackGlyph, 'back must use the exact Figma 177:1532 chevron');
    assert.equal(PHONE_ICONS.forward, expectedForwardGlyph, 'forward must mirror the shared Figma chevron');
    assertSnippets(navigationSource, navigationPath, [
        'export function buildPhoneBackButton(',
        'export function buildPhoneSwitchButton(',
        'export function buildPhoneNavTitleSwitcher(',
        'export function buildPhoneNavBar(',
        'export function createPhoneNavIconElement(',
    ]);

    const backHtml = navigation.buildPhoneBackButton();
    const backInner = backHtml.match(/<button[^>]*>([\s\S]*)<\/button>/)?.[1] || '';
    assert.match(backHtml, /class="[^"]*phone-nav-icon-button[^"]*phone-nav-back/);
    assert.match(backHtml, /aria-label="返回"/);
    assert.equal(backInner, expectedBackGlyph, 'back control must be icon-only');
    assert.doesNotMatch(backInner, /返回|[←‹›«»❮❯◀▶]/, 'back control must not render text or character arrows');

    for (const [direction, glyph, label] of [
        ['previous', expectedBackGlyph, '上一项'],
        ['next', expectedForwardGlyph, '下一项'],
    ]) {
        const html = navigation.buildPhoneSwitchButton(direction);
        const inner = html.match(/<button[^>]*>([\s\S]*)<\/button>/)?.[1] || '';
        assert.match(html, new RegExp(`aria-label="${label}"`));
        assert.equal(inner, glyph, `${direction} control must be icon-only`);
        assert.doesNotMatch(inner, /[←‹›«»❮❯◀▶]/, `${direction} control must not render character arrows`);
    }

    const titleSwitcher = navigation.buildPhoneNavTitleSwitcher({
        title: 'A very long centered title',
        previousHtml: navigation.buildPhoneSwitchButton('previous'),
        nextHtml: navigation.buildPhoneSwitchButton('next'),
    });
    const titleIndex = titleSwitcher.indexOf('<span class="phone-nav-title">');
    assert.ok(
        titleSwitcher.indexOf('is-previous') < titleIndex
        && titleIndex < titleSwitcher.indexOf('is-next'),
        'title switcher must preserve previous/title/next order',
    );

    const bar = navigation.buildPhoneNavBar({
        leadingHtml: 'leading',
        centerHtml: 'center',
        trailingHtml: 'trailing',
    });
    assert.ok(
        bar.indexOf('phone-nav-leading') < bar.indexOf('phone-nav-center')
        && bar.indexOf('phone-nav-center') < bar.indexOf('phone-nav-trailing'),
        'navigation bar must preserve the three-slot structure',
    );

    const expectedTokens = {
        '--yuzi-phone-nav-content-height': '54px',
        '--yuzi-phone-nav-padding-inline-start': '10px',
        '--yuzi-phone-nav-padding-inline-end': '12px',
        '--yuzi-phone-nav-control-size': '32px',
        '--yuzi-phone-nav-icon-size': '24px',
        '--yuzi-phone-nav-side-slot-width': 'clamp(44px, 15cqi, 60px)',
        '--yuzi-phone-nav-title-gap': '4px',
        '--yuzi-phone-nav-title-padding-inline': '4px',
        '--yuzi-phone-nav-title-font-size': '17px',
        '--yuzi-phone-nav-title-line-height': '24px',
        '--yuzi-phone-nav-title-font-weight': '500',
        '--yuzi-phone-nav-control-radius': 'var(--yuzi-phone-radius-sm)',
        '--yuzi-phone-nav-action-color': 'var(--yuzi-phone-color-accent-secondary)',
        '--yuzi-phone-nav-title-color': 'var(--yuzi-phone-color-text-secondary)',
        '--yuzi-phone-nav-background': 'var(--yuzi-phone-bg-overlay)',
        '--yuzi-phone-nav-border-color': 'var(--yuzi-phone-border-subtle)',
        '--yuzi-phone-nav-control-hover-background': 'var(--yuzi-phone-bg-surface-hover)',
        '--yuzi-phone-nav-focus-ring-color': 'var(--yuzi-phone-color-accent)',
        '--yuzi-phone-nav-focus-ring-width': '2px',
        '--yuzi-phone-nav-disabled-opacity': '0.38',
        '--yuzi-phone-nav-secondary-actions-gap': '6px',
        '--yuzi-phone-nav-secondary-actions-padding-inline': '10px',
        '--yuzi-phone-nav-secondary-actions-padding-block-end': '10px',
        '--yuzi-phone-nav-inline-actions-side-slot-width': 'clamp(76px, 27cqi, 108px)',
        '--yuzi-phone-nav-inline-actions-gap': 'clamp(4px, 1.5cqi, 6px)',
        '--yuzi-phone-nav-inline-action-padding-inline': 'clamp(4px, 2cqi, 8px)',
    };
    assertDeclaration(rootTokens, '--yuzi-phone-app-nav-top-padding', 'var(--yuzi-phone-status-safe-height)');
    for (const [token, value] of Object.entries(expectedTokens)) assertDeclaration(rootTokens, token, value);

    const phoneScreen = ruleBlock(shell, '#yuzi-phone-standalone .yuzi-phone-screen');
    assert.match(phoneScreen, /container-name:\s*yuzi-phone-screen;/);
    assert.match(phoneScreen, /container-type:\s*inline-size;/);
    assert.match(navCss, /grid-template-columns:\s*var\(--yuzi-phone-nav-side-slot-width\)\s*minmax\(0, 1fr\)\s*var\(--yuzi-phone-nav-side-slot-width\);/);
    assert.match(navCss, /min-height:\s*calc\(var\(--yuzi-phone-app-nav-top-padding\) \+ var\(--yuzi-phone-nav-content-height\)\);/);
    assert.match(navCss, /\.phone-nav-icon-button,[\s\S]*?width:\s*var\(--yuzi-phone-nav-control-size\);[\s\S]*?height:\s*var\(--yuzi-phone-nav-control-size\);/);
    assert.match(navCss, /background:\s*transparent;/);
    assert.match(navCss, /width:\s*var\(--yuzi-phone-nav-icon-size\);[\s\S]*?height:\s*var\(--yuzi-phone-nav-icon-size\);/);
    assert.match(navCss, /\.phone-nav-icon-button :is\(svg, img\),[\s\S]*?pointer-events:\s*none;/);
    assert.match(navCss, /\.phone-nav-title-switcher\s*\{[\s\S]*?display:\s*inline-grid;[\s\S]*?minmax\(0, max-content\)[\s\S]*?width:\s*max-content;[\s\S]*?max-width:\s*100%;/);
    assert.match(navCss, /\.phone-nav-title\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
    assert.match(navCss, /\.phone-nav-bar\.has-secondary-actions\s*\{[\s\S]*?grid-template-rows:\s*var\(--yuzi-phone-nav-content-height\) auto;[\s\S]*?row-gap:\s*var\(--yuzi-phone-nav-secondary-actions-gap\);/);
    assert.match(navCss, /\.phone-nav-secondary-actions\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?gap:\s*var\(--yuzi-phone-nav-secondary-actions-gap\);/);
    assert.match(navCss, /\.phone-nav-bar\.has-inline-actions\s*\{[\s\S]*?--yuzi-phone-nav-side-slot-width:\s*var\(--yuzi-phone-nav-inline-actions-side-slot-width\);/);
    assert.match(navCss, /\.phone-nav-inline-actions\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?gap:\s*var\(--yuzi-phone-nav-inline-actions-gap\);[\s\S]*?white-space:\s*nowrap;/);

    const consumers = {
        'modules/settings-app/layout/primitives.js': [
            "from '../../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
        ],
        'modules/table-viewer/list-page-template.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
            "buildPhoneSwitchButton('previous'",
            "buildPhoneSwitchButton('next'",
        ],
        'modules/table-viewer/detail-page-template.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
            "buildPhoneSwitchButton('previous'",
            "buildPhoneSwitchButton('next'",
        ],
        'modules/phone-theater/templates.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
            "buildPhoneSwitchButton('previous'",
            "buildPhoneSwitchButton('next'",
        ],
        'modules/variable-manager/templates.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'phone-nav-title',
        ],
        'modules/phone-fusion/templates.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
        ],
        'modules/table-update-review/templates.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
        ],
        'modules/content-presets/shell.js': [
            "from '../phone-core/navigation-ui.js'",
            'buildPhoneBackButton(',
            'buildPhoneNavBar(',
            'buildPhoneNavTitleSwitcher(',
            "buildPhoneSwitchButton('previous'",
            "buildPhoneSwitchButton('next'",
        ],
        'modules/qq-v2/ui/app.js': [
            "from '../../phone-core/navigation-ui.js'",
            "createPhoneNavIconElement('back')",
            'phone-nav-bar is-embedded',
            'phone-nav-leading',
            'phone-nav-center',
            'phone-nav-trailing',
            'phone-nav-title',
        ],
    };

    for (const [file, snippets] of Object.entries(consumers)) {
        const source = read(file);
        assertSnippets(source, file, snippets);
        assert.doesNotMatch(
            source,
            /<button\b(?=[^>]*(?:phone-nav-back|phone-nav-switch-button))[^>]*>(?:(?!<\/button>)[\s\S])*?(?:返回|[←‹›«»❮❯◀▶])(?:(?!<\/button>)[\s\S])*?<\/button>/,
            `${file} must not render visible back text or character arrows in the app header`,
        );
    }
    assert.doesNotMatch(read('modules/qq-v2/ui/app.js'), /createButton\(\s*['"][←‹›«»❮❯◀▶]/,
        'QQ headers must create empty icon-only buttons before appending the shared glyph');

    for (const file of [
        'styles/05-phone-generic-template.css',
        'styles/phone-theater/00-core.css',
        'styles/12-variable-manager.css',
        'styles/phone-base/07-settings-modern.css',
        'styles/phone-base/12-table-update-review.css',
        'styles/13-content-presets.css',
        'styles/phone-base/12-qq-app.css',
    ]) {
        for (const mediaBlock of atRuleBlocks(read(file), '@media')) {
            assert.doesNotMatch(
                mediaBlock,
                /\.phone-nav-|\.phone-generic-slot-nav|\.phone-theater-nav|\.vm-navbar|\.tur-nav|\.yuzi-qq-(?:header|chat-header|private-chat-header)/,
                `${file} must not adapt phone headers with viewport media queries`,
            );
        }
    }

    for (const file of [
        'styles/12-variable-manager.css',
        'styles/phone-base/12-table-update-review.css',
    ]) {
        assert.match(read(file), /@container\s+yuzi-phone-screen\s*\(/,
            `${file} must use the phone inline-size container for compact layout`);
    }
}

main()
    .then(() => console.log('[phone-navigation-ui-contract] passed'))
    .catch((error) => {
        console.error('[phone-navigation-ui-contract] failed');
        console.error(error);
        process.exitCode = 1;
    });
