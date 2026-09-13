const assert = require('node:assert/strict');
async function main() {
    const { createInputShortcutsSettingsService } = await import('../modules/input-shortcuts/settings-service.js');
    const { defaultSettings, validateSetting, validateSettings } = await import('../modules/settings/schema.js');
    let host = {}; let fail = false;
    const service = createInputShortcutsSettingsService({
        getPhoneSettings: () => host,
        savePhoneSetting(key, value) { if (fail) return false; host[key] = structuredClone(value); return true; },
    });
    assert.deepEqual(service.readConfig(), { enabled: false, rules: [] });
    assert.deepEqual(defaultSettings.inputShortcuts, { enabled: false, rules: [] });
    const draft = { id: 'one', enabled: true, shortcut: { key: 'L', ctrl: true }, action: 'insert', text: '你好\n{{user}}' };
    assert.equal(service.readConfig().rules.length, 0);
    assert.equal(service.saveRule(draft).ok, true);
    draft.text = '未保存编辑';
    assert.equal(service.readConfig().rules[0].text, '你好\n{{user}}');
    assert.equal(service.setEnabled(true).ok, true);
    assert.equal(service.saveRule({ ...draft, id: 'two', shortcut: { key: 'l', ctrl: true } }).ok, false);
    assert.equal(service.readConfig().rules.length, 1);
    assert.equal(service.setRuleEnabled('one', false).ok, true);
    assert.equal(service.readConfig().rules[0].enabled, false);
    const reopened = createInputShortcutsSettingsService({ getPhoneSettings: () => host });
    assert.equal(reopened.readConfig().enabled, true);
    assert.equal(reopened.readConfig().rules[0].text, '你好\n{{user}}');
    const snapshot = service.readConfig(); snapshot.rules[0].text = '外部污染';
    assert.equal(service.readConfig().rules[0].text, '你好\n{{user}}');
    fail = true;
    assert.equal(service.removeRule('one').ok, false);
    assert.equal(service.readConfig().rules.length, 1);
    fail = false;
    for (const key of ['Enter', ' ', 'Control', 'Shift', 'Escape', 'F1']) {
        assert.equal(service.saveRule({ ...draft, id: key, shortcut: { key } }).ok, true, key);
    }
    assert.equal(service.saveRule({ ...draft, id: 'empty', shortcut: null }).ok, false);
    assert.equal(service.saveRule({ ...draft, id: 'empty', text: '' }).ok, false);
    assert.equal(validateSetting('inputShortcuts', host.inputShortcuts).valid, true);
    assert.deepEqual(validateSettings({ inputShortcuts: host.inputShortcuts }).inputShortcuts, service.readConfig());
    assert.deepEqual(validateSetting('inputShortcuts', null).value, { enabled: false, rules: [] });
    assert.equal(service.removeRule('one').ok, true);
    assert.equal(service.readConfig().rules.some(rule => rule.id === 'one'), false);
    console.log('[通过] 输入快捷键：保存、生效、重复校验、失败保留与全局设置规范化');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
