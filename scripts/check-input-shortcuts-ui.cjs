const assert = require('node:assert/strict');

async function main() {
    const { buildInputShortcutsPageHtml } = await import('../modules/settings-app/pages/input-shortcuts.js');
    const empty = buildInputShortcutsPageHtml({ enabled: false, rules: [] });
    assert.match(empty, /输入快捷键/);
    assert.match(empty, /data-action="add"/);
    assert.doesNotMatch(empty, /data-field="enabled"[^>]*checked/);
    assert.match(empty, /phone-app-body phone-settings-scroll/);
    const html = buildInputShortcutsPageHtml({ enabled: true, rules: [{ id: 'one', enabled: true, shortcut: { key: 'l', ctrl: true }, action: 'wrap', text: '', left: '</textarea><script>bad()</script>', right: '」' }] });
    assert.match(html, /phone-settings-select/);
    assert.match(html, /phone-settings-textarea/);
    assert.match(html, /data-action="save"/);
    assert.match(html, /data-action="record"/);
    assert.match(html, /Ctrl \+ L/);
    assert.doesNotMatch(html, /<script>|黑名单|冲突提示|占用/);
    assert.match(html, /&lt;\/textarea&gt;/);
    const { buildSettingsHomePageHtml } = await import('../modules/settings-app/layout/page-builders/overview-builders.js');
    assert.match(buildSettingsHomePageHtml(), /data-entry="input_shortcuts"/);
    const { createPersonalizationPageRenderers } = await import('../modules/settings-app/page-renderers/personalization-renderers.js');
    assert.equal(typeof createPersonalizationPageRenderers().pages.input_shortcuts.createPage, 'function');
    console.log('[通过] 输入快捷键设置入口、共享表单控件与用户文本转义');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
