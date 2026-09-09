const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');
const load = file => import(pathToFileURL(path.join(process.cwd(), file)).href);
const data = (text, mime = 'image/png') => `data:${mime};base64,${Buffer.from(text).toString('base64')}`;
const clone = structuredClone;
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

global.crypto ??= webcrypto;
global.FileReader = class {
    readAsDataURL(blob) {
        blob.arrayBuffer().then(bytes => {
            this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
            this.onload?.();
        }).catch(error => { this.error = error; this.onerror?.(); });
    }
};

async function main() {
    const { createAppearanceAssetCodec } = await load('modules/settings/appearance-asset-repository.js');
    const { createAppearanceSettingsContext } = await load('modules/settings/appearance-context.js');
    const { createSettingsPersistenceTools } = await load('modules/settings/persistence.js');
    const { createSettingsRepository } = await load('modules/settings/repository.js');
    const { validateSettings, validateSetting, defaultSettings } = await load('modules/settings/schema.js');
    const entries = new Map();
    let fail = false;
    let pause;
    let writes = 0;
    const codec = () => createAppearanceAssetCodec({
        read: async id => entries.get(id),
        write: async rows => {
            if (!rows.length) return;
            if (pause) await pause;
            if (fail) throw new Error('QuotaExceededError');
            writes += rows.length;
            rows.forEach(([key, value]) => entries.set(key, clone(value)));
        },
    });
    const original = {
        enabled: true,
        backgroundImage: data('wallpaper'),
        appIcons: { a: data('icon'), b: data('icon') },
        phoneToggleCoverImage: data('wallpaper'),
        appearanceFontLibrary: { userFonts: [{ dataUrl: data('font', 'font/woff2') }] },
        appearanceResourcePool: { icons: [{ dataUrl: data('icon') }] },
        other: { untouched: '外观以外的设置保持原样' },
    };
    const errors = [];
    let saves = 0;
    const host = { extensionSettings: { YuziPhone: clone(original) }, saveSettingsDebounced: () => { saves++; } };
    const bridge = createAppearanceSettingsContext({
        getHostContext: () => host, extensionName: 'YuziPhone', codec: codec(), onError: e => errors.push(e),
    });
    let resume;
    pause = new Promise(resolve => { resume = resolve; });
    const initialization = bridge.initialize();
    await nextTurn();
    assert.deepEqual(host.extensionSettings.YuziPhone, original, '迁移事务完成前不能动宿主原设置');
    resume(); pause = null;
    await initialization;
    assert.equal(writes, 3, '壁纸、图标和字体按内容复用，重复图标只写一份');
    assert.equal(saves, 1);
    assert.doesNotMatch(JSON.stringify(host.extensionSettings.YuziPhone), /data:|base64/);
    assert.deepEqual(bridge.getContext().extensionSettings.YuziPhone, original, '运行时和导出仍得到完整 Data URL');
    assert.deepEqual(host.extensionSettings.YuziPhone.other, original.other);
    for (const asset of entries.values()) {
        assert.ok(asset.blob instanceof Blob);
        assert.ok(asset.blob.size > 0);
        assert.equal(Object.hasOwn(asset, 'dataUrl'), false, 'IndexedDB 存 Blob 而非 Base64 字符串');
    }
    const refs = clone(host.extensionSettings.YuziPhone);
    await bridge.getContext().saveSettingsDebounced();
    assert.equal(writes, 3, '普通设置保存不重新写图片');
    assert.deepEqual(host.extensionSettings.YuziPhone, refs, '不变资源保持相同引用');

    const reload = createAppearanceSettingsContext({ getHostContext: () => host, extensionName: 'YuziPhone', codec: codec() });
    await reload.initialize();
    assert.deepEqual(reload.getContext().extensionSettings.YuziPhone, original, '刷新后无损恢复壁纸、封面、图标、字体和旧资源池');
    assert.equal(writes, 3, '刷新也不会重复存储资源');
    const runtime = reload.getContext().extensionSettings.YuziPhone;
    runtime.backgroundImage = data('replacement');
    assert.deepEqual(host.extensionSettings.YuziPhone, refs, '即使别的扩展保存整份设置，也读不到运行时 Base64');
    await reload.getContext().saveSettingsDebounced();
    assert.equal(writes, 4);
    assert.notEqual(host.extensionSettings.YuziPhone.backgroundImage, refs.backgroundImage);

    runtime.backgroundImage = original.backgroundImage;
    await reload.getContext().saveSettingsDebounced();
    assert.equal(writes, 4, '切换回来复用磁盘资源，不因反复应用皮肤而膨胀');
    assert.equal(host.extensionSettings.YuziPhone.backgroundImage, refs.backgroundImage);

    // 失败保留旧版 Base64，重试成功才剥离；队列失败不会毒化后续保存。
    const failedOriginal = { ...clone(original), backgroundImage: data('quota-test') };
    const failureHost = { extensionSettings: { YuziPhone: clone(failedOriginal) }, saveSettingsDebounced: () => {} };
    const retry = createAppearanceSettingsContext({ getHostContext: () => failureHost, extensionName: 'YuziPhone', codec: codec(), onError: e => errors.push(e) });
    fail = true;
    await retry.initialize();
    assert.deepEqual(failureHost.extensionSettings.YuziPhone, failedOriginal);
    assert.equal(await retry.whenSaved(), false);
    assert.equal(errors.length, 1);
    fail = false;
    assert.equal(await retry.getContext().saveSettingsDebounced(), true);
    assert.doesNotMatch(JSON.stringify(failureHost.extensionSettings.YuziPhone), /base64/);

    // 连续应用 / 清除按请求顺序提交，旧异步写入不能覆盖新状态。
    const ctx = retry.getContext();
    ctx.extensionSettings.YuziPhone.backgroundImage = data('slow');
    pause = new Promise(resolve => { resume = resolve; });
    const first = ctx.saveSettingsDebounced();
    ctx.extensionSettings.YuziPhone.backgroundImage = null;
    const second = ctx.saveSettingsDebounced();
    resume(); pause = null;
    await Promise.all([first, second]);
    assert.equal(failureHost.extensionSettings.YuziPhone.backgroundImage, null);

    // 资源缺失时 UI 回退，保存其他设置不破坏另一台设备的引用。
    const missingHost = { extensionSettings: { YuziPhone: clone(refs) }, saveSettingsDebounced: () => {} };
    let warnings = 0;
    const missing = createAppearanceSettingsContext({
        getHostContext: () => missingHost, extensionName: 'YuziPhone',
        codec: createAppearanceAssetCodec({ read: async () => undefined, write: async () => {} }),
        onMissing: () => { warnings++; },
    });
    await missing.initialize();
    assert.equal(warnings, 1);
    assert.equal(missing.getContext().extensionSettings.YuziPhone.backgroundImage, '');
    assert.deepEqual(missingHost.extensionSettings.YuziPhone, refs);
    global.window = { setTimeout, clearTimeout };
    const repo = createSettingsRepository({ getContext: missing.getContext, extensionName: 'YuziPhone', defaultSettings, clone, validateSettings });
    const tools = createSettingsPersistenceTools({
        getContext: missing.getContext, ensureNamespace: repo.ensureNamespace,
        defaultSettings, extensionName: 'YuziPhone', clone, validateSetting,
        onSettingChanged: missing.markChanged,
    });
    tools.savePhoneSetting('enabled', false);
    tools.flushPhoneSettingsSave(); await missing.whenSaved();
    assert.equal(missingHost.extensionSettings.YuziPhone.enabled, false);
    assert.equal(missingHost.extensionSettings.YuziPhone.backgroundImage, refs.backgroundImage);
    assert.deepEqual(missingHost.extensionSettings.YuziPhone.appearanceFontLibrary, refs.appearanceFontLibrary, 'schema 归一化不得丢失缺失字体的引用');
    tools.savePhoneSetting('backgroundImage', null);
    tools.flushPhoneSettingsSave(); await missing.whenSaved();
    assert.equal(missingHost.extensionSettings.YuziPhone.backgroundImage, null, '明确清除背景才删除引用');
    tools.resetPhoneSettingsToDefault(); tools.flushPhoneSettingsSave(); await missing.whenSaved();
    assert.equal(missingHost.extensionSettings.YuziPhone.backgroundImage, null);
    assert.deepEqual(missingHost.extensionSettings.YuziPhone.appIcons, {});

    // 原生仓库边界：请求成功之后事务中止，不能返回已经落库的假成功。
    let abort = true;
    const disk = new Map();
    global.indexedDB = {
        open() {
            const request = {};
            queueMicrotask(() => {
                request.result = {
                    createObjectStore() {}, close() {},
                    transaction() {
                        const tx = { error: new Error('transaction aborted'), abort() { tx.onabort?.(); } };
                        const staged = new Map();
                        tx.objectStore = () => ({
                            add(asset, id) { staged.set(id, clone(asset)); },
                            get(id) {
                                const read = {};
                                queueMicrotask(() => { read.result = disk.get(id); read.onsuccess?.(); });
                                return read;
                            },
                        });
                        setImmediate(() => {
                            if (abort && staged.size) { tx.onabort?.(); return; }
                            staged.forEach((v, k) => disk.set(k, v));
                            tx.oncomplete?.();
                        });
                        return tx;
                    },
                };
                request.onupgradeneeded?.(); request.onsuccess?.();
            });
            return request;
        },
    };
    const native = createAppearanceAssetCodec();
    await assert.rejects(native.serialize({ backgroundImage: data('native') }), /transaction aborted/);
    assert.equal(disk.size, 0);
    abort = false;
    const nativeRefs = await native.serialize({ backgroundImage: data('native') });
    assert.equal(disk.size, 1, '失败事务不能污染内存去重索引，重试必须实际写库');
    assert.equal((await native.hydrate(nativeRefs)).settings.backgroundImage, data('native'));

    const index = fs.readFileSync('index.js', 'utf8');
    assert.ok(index.indexOf('await initializePhoneSettings();') < index.indexOf('await initializeQQV2Runtime();'), '启动时先恢复资源，再启动任何 UI / QQ');
    console.log('[appearance-asset-storage-check] 迁移、Blob、去重、刷新、故障重试、串行保存、缺失回退、重置和事务提交检查通过');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
