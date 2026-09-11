const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
async function main() {
    const { buildAppearancePageHtml, buildButtonStylePageHtml } = await import(pathToFileURL(path.join(ROOT, 'modules/settings-app/layout/page-builders/appearance-builders.js')));
    for (const currentShape of ['circle', 'rounded']) for (const currentCover of ['', 'data:image/png;base64,AA==']) for (const floatingToggleEnabled of [true, false]) {
        const html = buildButtonStylePageHtml({ currentSize: 48, currentShape, currentCover, floatingToggleEnabled });
        assert.doesNotMatch(html, /phone-settings-hero|phone-settings-chip|建议范围|触达体验|悬浮窗开关|圆形（仅显示图标）/);
        for (const text of ['悬浮入口', '显示悬浮按钮', '重置位置', '隐藏按钮不影响已打开的手机。', '按钮大小', '32–72 px，默认 40。', '按钮形状', '按钮封面', '按按钮形状裁剪。']) assert.ok(html.includes(text), text);
        for (const id of ['phone-floating-toggle-enabled', 'phone-toggle-position-reset-btn', 'phone-toggle-style-size-range', 'phone-toggle-style-size-input', 'phone-toggle-shape-list', 'phone-toggle-cover-upload-btn', 'phone-toggle-cover-clear-btn', 'phone-toggle-cover-preview']) {
            assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
        }
        const toggle = html.match(/<input[^>]*id="phone-floating-toggle-enabled"[^>]*>/)[0];
        assert.equal(/checked/.test(toggle), floatingToggleEnabled);
        const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(m => m[0]);
        assert.equal(radios.filter(r => /checked/.test(r)).length, 1);
        assert.ok(radios.find(r => r.includes(`value="${currentShape}"`)).includes('checked'));
        const clear = html.match(/<button[^>]*id="phone-toggle-cover-clear-btn"[^>]*>/)[0];
        assert.equal(/disabled/.test(clear), !currentCover);
        assert.ok(html.includes(`is-${currentShape}`));
        assert.ok(html.includes(currentCover ? 'has-cover' : 'no-cover'));
        assert.match(html, /--yuzi-phone-toggle-preview-size:48px/);
        assert.equal((html.match(/min="32" max="72"/g) || []).length, 2);
    }
    const options = {
        layoutValues: { appGridColumns: 4, appIconSize: 52, appIconRadius: 12, appGridGap: 16, dockIconSize: 48 },
        fontLibrary: {
            activeFont: { id: 'builtin.system-ui', name: '系统字体', builtin: true },
            stats: { userFontCount: 1, totalBytes: 1024 },
            limits: { maxFonts: 12, totalFontBytes: 30 * 1024 * 1024, singleFontBytes: 15 * 1024 * 1024 },
        },
    };
    for (const phoneThemeMode of ['light', 'dark']) for (const homeAppLabelColorMode of ['white', 'black']) {
        const html = buildAppearancePageHtml({ ...options, phoneThemeMode, homeAppLabelColorMode });
        assert.doesNotMatch(html, /phone-bg-preview|phone-bg-thumb|建议选择浅色|导入会先保存|undefined|通过图标数量|不影响返回标题栏/);
        for (const text of ['上传背景图。', '导入官方美化包。', '选择或导入字体。', '保存网络字体', '仅支持 HTTPS 字体 CSS 地址，需联网加载。', '1/12 个 · 1KB/30.0MB · 单文件 ≤15.0MB', '勾选后在首页隐藏。']) assert.ok(html.includes(text), text);
        for (const id of ['phone-upload-bg', 'phone-clear-bg', 'phone-theme-mode-select', 'phone-home-app-label-color-mode', 'phone-import-appearance-pack', 'phone-export-appearance-pack', 'phone-appearance-pack-file', 'phone-font-select', 'phone-font-preview', 'phone-import-font-btn', 'phone-delete-font-btn', 'phone-font-file', 'phone-font-url-name', 'phone-font-css-url', 'phone-font-url-family', 'phone-import-font-url-btn', 'phone-readable-text-scale-range', 'phone-readable-text-scale-input', 'phone-hide-table-count-badge', 'phone-hidden-table-apps', 'phone-icon-upload-list']) {
            assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} must remain exactly once`);
        }
        const themeGroup = html.match(/<div class="phone-settings-layout-grid">([\s\S]*?)<\/div>/)[1];
        assert.ok(themeGroup.includes('id="phone-theme-mode-select"'));
        assert.ok(themeGroup.includes('id="phone-home-app-label-color-mode"'));
        assert.ok(themeGroup.includes(`value="${phoneThemeMode}" selected`));
        assert.ok(themeGroup.includes(`value="${homeAppLabelColorMode}" selected`));
        assert.match(html, /min="80" max="160"/, 'text scale bounds remain enforced by controls');
    }
    // 背景上传不再依赖预览 DOM；仅测试替身，不访问真实设置或文件。
    const listeners = new Map();
    const buttons = Object.fromEntries(['#phone-upload-bg', '#phone-clear-bg'].map(id => [id, {
        addEventListener(type, fn) { listeners.set(id, fn); },
        removeEventListener() { listeners.delete(id); },
    }]));
    const container = { querySelector(id) { assert.ok(id in buttons, `unexpected DOM dependency: ${id}`); return buttons[id]; } };
    let saved = true, picked, pickOptions, bytes = 1;
    const writes = [], toasts = [], invalidations = [];
    const sandbox = {
        savePhoneSetting: (...args) => { writes.push(args); return saved; },
        cacheRemove: (...args) => { invalidations.push(args); return Promise.resolve(); },
        CACHE_STORES: { images: 'images' }, Logger: { withScope: () => ({ warn() {} }) },
        STORAGE_BUDGETS: { backgroundImageBytes: 10 },
        estimateBase64Bytes: () => bytes,
        pickImageFile: (callback, opts) => { picked = callback; pickOptions = opts; },
        showToast: (...args) => toasts.push(args),
    };
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(ROOT, 'modules/settings-app/services/appearance-settings/background-service.js'), 'utf8');
    vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('export function setupBgUpload', 'function setupBgUpload'), sandbox);
    const runtime = {};
    const cleanup = sandbox.setupBgUpload(container, { runtime });
    listeners.get('#phone-upload-bg')();
    assert.equal(pickOptions.runtime, runtime); assert.equal(pickOptions.cropPreset, 'background');
    await picked('data:test');
    assert.deepEqual(writes.pop(), ['backgroundImage', 'data:test']);
    assert.equal(toasts.at(-1)[1], '背景已更新');
    assert.equal(invalidations.length, 1);
    saved = false; await picked('data:failed');
    assert.equal(toasts.at(-1)[1], '背景保存失败，请稍后重试');
    assert.equal(invalidations.length, 1);
    bytes = 11; const beforeOversize = writes.length; await picked('data:large');
    assert.equal(writes.length, beforeOversize);
    saved = true; listeners.get('#phone-clear-bg')();
    assert.deepEqual(writes.pop(), ['backgroundImage', null]);
    assert.equal(toasts.at(-1)[1], '背景已清除');
    cleanup(); assert.equal(listeners.size, 0);
    bytes = 1; const beforeDisposed = writes.length; await picked('data:late');
    assert.equal(writes.length, beforeDisposed, 'disposed pages must not save late uploads');
}
main().then(() => console.log('[appearance-ui-simplification] passed')).catch(error => { console.error(error); process.exitCode = 1; });
