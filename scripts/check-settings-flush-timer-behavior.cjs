const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function installFakeWindow() {
    const timers = new Map();
    let nextId = 1;
    global.window = {
        setTimeout(callback, delay) {
            const id = nextId++;
            timers.set(id, { callback, delay, cleared: false });
            return id;
        },
        clearTimeout(id) {
            const timer = timers.get(id);
            if (timer) timer.cleared = true;
        },
    };
    return { timers };
}

async function main() {
    const { timers } = installFakeWindow();
    const { createSettingsPersistenceTools } = await import(toModuleUrl('modules/settings/persistence.js'));

    let saveCalls = 0;
    const ctx = { extensionSettings: {}, saveSettingsDebounced: () => { saveCalls += 1; } };
    const tools = createSettingsPersistenceTools({
        getContext: () => ctx,
        ensureNamespace: () => ({}),
        validateSetting: (_key, value) => ({ valid: true, value }),
        defaultSettings: {},
        extensionName: 'YuziPhone',
        clone: value => ({ ...value }),
        showNotification: () => {},
    });

    assert.equal(tools.savePhoneSetting('enabled', true), true);
    assert.equal(timers.size, 2, 'schedule 必须创建 debounce 与 maxWait timer');
    const [debounceTimer, maxWaitTimer] = [...timers.values()];

    tools.flushPhoneSettingsSave();
    assert.equal(saveCalls, 1, 'flush 应触发一次宿主保存请求');
    assert.equal(debounceTimer.cleared, true, 'flush 必须 clear debounce timer');
    assert.equal(maxWaitTimer.cleared, true, 'flush 必须 clear maxWait timer');

    maxWaitTimer.callback();
    assert.equal(saveCalls, 1, 'flush 后旧 maxWait callback 不得二次保存旧 ctx');

    const unavailableTools = createSettingsPersistenceTools({
        getContext: () => null,
        ensureNamespace: () => ({}),
        validateSetting: (_key, value) => ({ valid: true, value }),
        defaultSettings: {},
        extensionName: 'YuziPhone',
        clone: value => ({ ...value }),
        showNotification: () => {},
    });
    unavailableTools.flushPhoneSettingsSave();

    console.log('[settings-flush-timer-behavior-check] 检查通过');
}

main().catch((error) => {
    console.error('[settings-flush-timer-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
