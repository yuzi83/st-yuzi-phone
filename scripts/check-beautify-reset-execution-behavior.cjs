const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
const url = file => pathToFileURL(path.join(ROOT, file)).href;
const clone = value => structuredClone(value);

function createLegacySpecialTemplate() {
    return {
        id: 'user.legacy.special',
        name: '旧消息记录表模板',
        templateType: 'special_app_template',
        source: 'user',
        readOnly: false,
        exportable: true,
        enabled: true,
        matcher: {},
        render: { rendererKey: 'special_message' },
        meta: {},
    };
}

async function runFaultCase(mode) {
    const ctx = { extensionSettings: {}, saveSettingsDebounced() {} };
    global.window = { getContext: () => ctx, setTimeout: () => 1, clearTimeout() {} };
    // 故障注入针对运行时读取，不再假定运行时与宿主持久化对象是同一对象。
    const fs = require('node:fs');
    let source = fs.readFileSync(path.join(ROOT, 'modules/phone-beautify-templates/reset.js'), 'utf8');
    source = source.replace(/from '([^']+)'/g, (_match, relative) =>
        `from '${pathToFileURL(path.resolve(ROOT, 'modules/phone-beautify-templates', relative)).href}'`);
    if (mode === 'verify-failed') {
        source = source.replace('getPhoneSettings, savePhoneSettingsPatch', 'getPhoneSettings as getActualPhoneSettings, savePhoneSettingsPatch');
        source += `\nfunction getPhoneSettings() { return { ...getActualPhoneSettings(), beautifyActiveTemplateIdGeneric: 'stale.generic.template' }; }`;
    } else {
        source = source.replace('import { readTemplateStore }', 'import { readTemplateStore as _readTemplateStore }');
        source += `\nfunction readTemplateStore() { throw new Error('fixture template store read failure'); }`;
    }
    const reset = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const result = reset.restorePhoneBeautifyTemplatesToBuiltinDefaults();
    assert.equal(result.success, false);
    if (mode === 'verify-failed') {
        assert.equal(result.code, reset.BEAUTIFY_RESTORE_DEFAULTS_VERIFY_FAILED);
        assert.equal(result.verification.ok, false);
        assert.equal(result.verification.checks.genericActiveExact, false);
    } else {
        assert.equal(result.code, reset.BEAUTIFY_RESTORE_DEFAULTS_UNEXPECTED_ERROR);
    }
}

async function main() {
    const faultMode = process.argv[2];
    if (faultMode === 'verify-failed' || faultMode === 'unexpected-error') {
        await runFaultCase(faultMode);
        return;
    }

    const timers = new Map();
    let nextTimerId = 1;
    let saveCalls = 0;
    const ctx = {
        extensionSettings: {},
        saveSettingsDebounced() { saveCalls += 1; },
    };
    global.window = {
        getContext: () => ctx,
        setTimeout(callback) {
            const id = nextTimerId++;
            timers.set(id, () => {
                timers.delete(id);
                callback();
            });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
    };

    const settingsModule = await import(url('modules/settings.js'));
    const repository = await import(url('modules/phone-beautify-templates/repository.js'));
    const matcher = await import(url('modules/phone-beautify-templates/matcher.js'));
    const cache = await import(url('modules/phone-beautify-templates/cache.js'));
    const store = await import(url('modules/phone-beautify-templates/store.js'));
    const reset = await import(url('modules/phone-beautify-templates/reset.js'));

    const genericUser = clone(repository.getBuiltinPhoneBeautifyTemplates()
        .find(item => item.id === 'builtin.generic.table.v1'));
    Object.assign(genericUser, { id: 'user.legacy.generic', source: 'user', readOnly: false });
    const legacySpecial = createLegacySpecialTemplate();

    ctx.extensionSettings[settingsModule.extensionName] = {
        ...clone(settingsModule.defaultSettings),
        enabled: false,
        yuziPhoneBeautifyTemplates: {
            schemaVersion: '1.0.0',
            updatedAt: 1,
            templates: [legacySpecial, genericUser],
            bindings: {
                legacy_special: legacySpecial.id,
                legacy_generic: genericUser.id,
            },
        },
        beautifyTemplateSourceModeSpecial: 'user',
        beautifyTemplateSourceModeGeneric: 'user',
        beautifyActiveTemplateIdsSpecial: { special_message: legacySpecial.id },
        beautifyActiveTemplateIdGeneric: genericUser.id,
    };
    cache.invalidatePhoneBeautifyTemplateCache();

    const normalizedStore = store.readTemplateStore();
    assert.deepEqual(normalizedStore.templates.map(item => item.id), [genericUser.id]);
    assert.deepEqual(normalizedStore.bindings, { legacy_generic: genericUser.id });
    assert.equal(cache.getCachedPhoneBeautifyTemplateById(legacySpecial.id), null, '旧 special 模板不得进入缓存');
    assert.equal(repository.getPhoneBeautifyTemplatesByType('special_app_template').length, 0);
    assert.equal(repository.getBeautifyTemplateSourceModeRuntime('special_app_template').templates.length, 0);

    const beforeGeneric = matcher.detectGenericTemplateForTable({
        sheetKey: 'legacy_generic', tableName: '历史通用表', headers: [],
    });
    assert.equal(beforeGeneric.template.id, genericUser.id, 'generic 绑定在清理 special 后仍必须生效');

    const result = reset.restorePhoneBeautifyTemplatesToBuiltinDefaults();
    assert.equal(result.success, true);
    assert.equal(result.code, reset.BEAUTIFY_RESTORE_DEFAULTS_OK);
    assert.equal(result.verification.ok, true);
    const actual = settingsModule.getPhoneSettings();
    assert.equal(actual.enabled, false, 'reset 不得修改无关设置');
    assert.deepEqual(actual.yuziPhoneBeautifyTemplates.templates, []);
    assert.deepEqual(actual.yuziPhoneBeautifyTemplates.bindings, {});
    assert.equal(actual.beautifyTemplateSourceModeGeneric, 'builtin');
    assert.equal(actual.beautifyActiveTemplateIdGeneric, 'builtin.generic.table.v1');
    assert.equal(Object.hasOwn(actual, 'beautifyTemplateSourceModeSpecial'), false);
    assert.equal(Object.hasOwn(actual, 'beautifyActiveTemplateIdsSpecial'), false);
    assert.equal(repository.getAllPhoneBeautifyTemplates().some(item => item.id === legacySpecial.id), false);
    assert.equal(matcher.detectGenericTemplateForTable({
        sheetKey: 'legacy_generic', tableName: '恢复默认验证表', headers: [],
    }).template.id, 'builtin.generic.table.v1');

    const second = reset.restorePhoneBeautifyTemplatesToBuiltinDefaults();
    assert.equal(second.success, true, '重复 reset 必须幂等');

    const savedNamespace = ctx.extensionSettings;
    ctx.extensionSettings = null;
    const failed = reset.restorePhoneBeautifyTemplatesToBuiltinDefaults();
    assert.equal(failed.success, false);
    assert.equal(failed.code, reset.BEAUTIFY_RESTORE_DEFAULTS_WRITE_FAILED);
    ctx.extensionSettings = savedNamespace;

    assert.equal(saveCalls, 0, '防抖持久化回调不应同步执行');
    assert.ok(timers.size > 0, '成功 reset 应调度宿主保存');
    const firstScheduledId = timers.keys().next().value;
    timers.get(firstScheduledId)();
    await settingsModule.waitForPhoneSettingsSave();
    assert.deepEqual(ctx.extensionSettings[settingsModule.extensionName], settingsModule.getPhoneSettings(), '资源落库后才发布宿主设置');
    assert.equal(saveCalls, 1, '触发防抖 timer 后必须调用一次宿主保存');
    assert.equal(timers.size, 0, '执行保存后必须清理 debounce 与 max-wait timer');

    const { spawnSync } = require('child_process');
    for (const mode of ['verify-failed', 'unexpected-error']) {
        const child = spawnSync(process.execPath, [__filename, mode], { cwd: ROOT, encoding: 'utf8' });
        assert.equal(child.status, 0, `${mode} fixture 失败\n${child.stdout}\n${child.stderr}`);
    }
    console.log('[beautify-reset-execution-behavior-check] 检查通过');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
