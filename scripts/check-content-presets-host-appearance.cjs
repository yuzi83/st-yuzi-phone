const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

async function load(relativePath) {
    return import(`${pathToFileURL(path.join(ROOT, relativePath)).href}?t=${Date.now()}`);
}

function createSettingsHarness() {
    let settings = {
        phoneThemeMode: 'light',
        appearanceFontLibrary: { activeFontId: 'builtin.system-ui' },
    };
    let activeFont = { cssFamily: 'system-ui' };
    const listeners = new Set();

    return {
        getPhoneSettings() { return settings; },
        getAppearanceFontFamily() { return activeFont.cssFamily; },
        subscribeSettings(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        update(nextSettings, nextFont) {
            settings = nextSettings;
            activeFont = nextFont;
            for (const listener of [...listeners]) listener();
        },
        get listenerCount() { return listeners.size; },
    };
}

function testReadsOnlyCurrentHostAppearance(factory) {
    const host = createSettingsHarness();
    const appearance = factory(host);

    assert.deepEqual(appearance.theme.getState(), { mode: 'light' }, '主题源必须从小手机主设置读取当前模式');
    assert.deepEqual(appearance.font.getState(), { family: 'system-ui' }, '字体源必须读取当前生效的 CSS family');
    assert.equal(typeof appearance.theme.subscribe, 'function', '主题源必须暴露订阅 seam');
    assert.equal(typeof appearance.font.subscribe, 'function', '字体源必须暴露订阅 seam');
    assert.equal(Object.isFrozen(appearance), true, '宿主桥只读公开对象必须冻结');
}

function testSubscribesAndStopsWithoutDom(factory) {
    const host = createSettingsHarness();
    const appearance = factory(host);
    const modes = [];
    const families = [];
    const stopTheme = appearance.theme.subscribe(state => modes.push(state.mode));
    const stopFont = appearance.font.subscribe(state => families.push(state.family));

    assert.equal(host.listenerCount, 2, '两个只读源可分别按需订阅宿主设置变更');
    host.update(
        { phoneThemeMode: 'dark', appearanceFontLibrary: { activeFontId: 'user.font' } },
        { cssFamily: '"Custom Font", sans-serif' },
    );
    assert.deepEqual(modes, ['dark'], '主题变更必须交付新的模式快照');
    assert.deepEqual(families, ['"Custom Font", sans-serif'], '字体变更必须交付新的 family 快照');

    stopTheme();
    stopFont();
    assert.equal(host.listenerCount, 0, '取消订阅必须释放宿主事件监听');
}

function testSafeFallbackForMissingOrBrokenHost(factory) {
    const appearance = factory({
        getPhoneSettings() { throw new Error('host unavailable'); },
        getAppearanceFontFamily() { throw new Error('font unavailable'); },
        subscribeSettings() { throw new Error('events unavailable'); },
    });

    assert.deepEqual(appearance.theme.getState(), { mode: 'light' }, '无宿主时主题必须安全降级到白天模式');
    assert.deepEqual(appearance.font.getState(), { family: '' }, '无宿主时字体必须安全降级为空 family');
    assert.doesNotThrow(() => appearance.theme.subscribe(() => {})(), '无事件时订阅和取消必须安全降级');
    assert.doesNotThrow(() => appearance.font.subscribe(null)(), '无效订阅者也必须安全降级');
}

async function main() {
    const { createContentPresetHostAppearance } = await load('modules/content-presets/host-appearance.js');
    assert.equal(typeof createContentPresetHostAppearance, 'function', '宿主外观桥必须暴露公开工厂 seam');
    testReadsOnlyCurrentHostAppearance(createContentPresetHostAppearance);
    testSubscribesAndStopsWithoutDom(createContentPresetHostAppearance);
    testSafeFallbackForMissingOrBrokenHost(createContentPresetHostAppearance);
    console.log('[content-presets-host-appearance-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-host-appearance-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});