const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const CSS_PATH = path.join(ROOT, 'styles', 'phone-base', '12-qq-app.css');
const MARKER = '/* QQ Figma refinement: profile, settings, and media library. */';

function layer(source) {
    const offset = source.indexOf(MARKER);
    assert.notEqual(offset, -1, 'refinement layer must be present');
    return source.slice(offset);
}

function expectRule(source, selector, declaration) {
    const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*${declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 's');
    assert.match(source, rule, `${selector} must include ${declaration}`);
}

function finalDeclaration(source, selector, property) {
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const propertyPattern = new RegExp(`(?:^|;)\\s*${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+)`, 'g');
    let value = '';
    for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = match[1].split(',').map((item) => item.trim());
        if (!selectors.includes(selector)) continue;
        for (const declaration of match[2].matchAll(propertyPattern)) value = declaration[1].trim();
    }
    return value;
}

function main() {
    const source = fs.readFileSync(CSS_PATH, 'utf8');
    const refinement = layer(source);

    expectRule(refinement, '.yuzi-qq-nav-item', 'color: var(--yuzi-qq-icon)');
    expectRule(refinement, '.yuzi-qq-profile-content-sheet', 'background: var(--yuzi-qq-list-surface)');
    expectRule(refinement, '.yuzi-qq-secondary-page', 'overflow: hidden');
    expectRule(refinement, '.yuzi-qq-secondary-top', 'position: relative');
    expectRule(refinement, '.yuzi-qq-secondary-scroll', 'overflow-y: auto');
    expectRule(refinement, '.yuzi-qq-secondary-scroll', 'min-block-size: 0');
    expectRule(refinement, '.yuzi-qq-field-row', 'background: var(--yuzi-qq-secondary-row-surface)');
    expectRule(refinement, '.yuzi-qq-field-row', 'border-radius: var(--yuzi-qq-secondary-group-radius)');
    expectRule(refinement, '.yuzi-qq-field-control', 'justify-self: end');
    expectRule(refinement, '.yuzi-qq-current-profile-view .yuzi-qq-profile-portrait', 'background: var(--yuzi-qq-accent)');
    assert.equal(
        finalDeclaration(source, '.yuzi-qq-identity-avatar', 'padding'),
        '0',
        'the root identity avatar button must not let user-agent padding squeeze its image',
    );
    assert.match(
        refinement,
        /\.yuzi-qq-current-profile-view \.yuzi-qq-profile-portrait\.has-image,[^{]*\{[^}]*background:\s*transparent;/s,
        'uploaded transparent profile avatars must not retain the blue fallback surface',
    );
    assert.match(
        refinement,
        /:is\(\.yuzi-qq-profile-backdrop,\s*\.yuzi-qq-profile-top\)\s*\{[^}]*background-size:\s*cover;/s,
        'profile background media must stay scoped to the top cover region',
    );
    expectRule(
        refinement,
        ':is(.yuzi-qq-profile-backdrop, .yuzi-qq-profile-top)',
        'min-block-size: calc(var(--yuzi-qq-profile-cover-height) - var(--yuzi-qq-inline-gap))',
    );
    expectRule(
        refinement,
        '.yuzi-qq-profile-page.yuzi-qq-profile-view > .yuzi-qq-profile-sheet.yuzi-qq-profile-content-sheet:not(.yuzi-qq-profile-editor-sheet)',
        'margin: 0',
    );
    expectRule(refinement, '.yuzi-qq-profile-details > .yuzi-qq-profile-summary-row', 'padding-block: var(--yuzi-qq-profile-action-padding-top)');
    expectRule(refinement, '.yuzi-qq-profile-details > .yuzi-qq-profile-summary-row', 'gap: var(--yuzi-qq-row-gap)');
    expectRule(refinement, '.yuzi-qq-profile-details > .yuzi-qq-profile-signature-row', 'padding-block: var(--yuzi-qq-profile-action-padding-top)');
    expectRule(refinement, '.yuzi-qq-profile-details > .yuzi-qq-profile-signature-row', 'gap: 0');
    expectRule(refinement, '.yuzi-qq-profile-signature-pencil', 'inline-size: var(--yuzi-qq-profile-copy-line-height)');
    assert.match(
        refinement,
        /:is\(\s*\.yuzi-qq-profile-asset-control,\s*\.yuzi-qq-conversation-background-actions,\s*\.yuzi-qq-current-profile-asset-actions\s*\)\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*row;/s,
        'QQ media upload/delete actions must share one inline action layout',
    );
    expectRule(refinement, '.yuzi-qq-profile-editor-row.is-control-stacked', 'grid-template-columns: minmax(0, 1fr)');
    assert.doesNotMatch(
        refinement,
        /\.yuzi-qq-profile-editor-row\s*>\s*:last-child\s*\{/,
        'profile editor values and media actions must not inherit the old chevron-only geometry',
    );
    expectRule(refinement, '.yuzi-qq-profile-edit-view', 'background: var(--yuzi-qq-deep-page)');
    expectRule(source, '.yuzi-qq-group-avatar', 'grid-template-columns: repeat(3, minmax(0, 1fr))');
    expectRule(source, '.yuzi-qq-group-avatar', 'grid-template-rows: repeat(3, minmax(0, 1fr))');
    expectRule(source, '.yuzi-qq-group-avatar-member', 'grid-column: span 1');
    expectRule(source, '.yuzi-qq-group-avatar-member', 'grid-row: span 1');
    expectRule(refinement, '.yuzi-qq-profile-edit-card', 'background: var(--yuzi-qq-content-surface)');
    expectRule(refinement, '.yuzi-qq-image-library-view.is-selection-mode .yuzi-qq-image-library-delete-action', 'display: inline-grid');
    expectRule(refinement, '.yuzi-qq-settings-root-title', 'margin: 0');
    expectRule(refinement, '.yuzi-qq-settings-root-sheet', 'margin-inline: 0');
    expectRule(refinement, '.yuzi-qq-settings-detail-view', 'padding-inline: 0');
    expectRule(refinement, '.yuzi-qq-profile-editor-view', 'background: var(--yuzi-qq-deep-page)');
    expectRule(refinement, '.yuzi-qq-profile-editor-sheet', 'margin-block-start: var(--yuzi-qq-page-padding)');
    expectRule(refinement, '.yuzi-qq-conversation-settings-view', 'background: var(--yuzi-qq-deep-page)');
    expectRule(refinement, '.yuzi-qq-conversation-settings-form', 'margin-block-start: var(--yuzi-qq-page-padding)');
    expectRule(refinement, '.yuzi-qq-image-library-view', 'background: var(--yuzi-qq-settings-page)');
    expectRule(refinement, '.yuzi-qq-image-library-group', 'background: var(--yuzi-qq-content-surface)');
    expectRule(refinement, '.yuzi-qq-image-library-item.is-selected', 'outline: var(--yuzi-qq-focus-ring-width) solid var(--yuzi-qq-accent)');

    assert.equal(
        finalDeclaration(refinement, '.yuzi-qq-secondary-top', 'padding-block-start'),
        'var(--yuzi-qq-safe-top)',
        'the fixed secondary-page top must consume the status safe area exactly once',
    );
    assert.match(
        refinement,
        /\.yuzi-qq-field-row\.is-checkbox\s+[^{}]*\.yuzi-qq-field-control[^{}]*\{[^}]*inline-size:\s*var\([^)]*checkbox[^)]*\);[^}]*block-size:\s*var\([^)]*checkbox[^)]*\);/s,
        'checkbox controls must use one fixed square size at the right edge of their row',
    );
    assert.doesNotMatch(
        refinement,
        /\.yuzi-qq-field-row\.is-checkbox\s+[^{}]*\.yuzi-qq-field-control[^{}]*\{[^}]*inline-size:\s*100%/s,
        'checkbox controls must not inherit full-width text input geometry',
    );

    assert.equal(
        finalDeclaration(source, '.yuzi-qq-dialog-menu.yuzi-qq-message-add-menu', 'background'),
        'var(--yuzi-qq-dialog-surface)',
        'the message add menu must finish on the Figma dialog surface',
    );
    assert.equal(
        finalDeclaration(source, '.yuzi-qq-message-add-menu-item', 'background'),
        'transparent',
        'the message add menu rows must finish transparent',
    );

    const rawColor = /(?:#[0-9a-f]{3,8}\b|rgba?\()/i;
    assert.doesNotMatch(refinement, rawColor, 'refinement layer must keep consuming semantic QQ tokens');
    assert.doesNotMatch(refinement, /\b(?:\d+(?:\.\d+)?)(?:px|rem|em)\b/, 'refinement layer must not add raw geometry literals');

    console.log('[qq-figma-refinement-css-contract] passed');
}

try {
    main();
} catch (error) {
    console.error('[qq-figma-refinement-css-contract] failed');
    console.error(error);
    process.exitCode = 1;
}
