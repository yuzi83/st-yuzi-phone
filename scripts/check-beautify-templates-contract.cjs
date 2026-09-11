const fs = require('fs');
const assert = require('assert/strict');

const read = file => fs.readFileSync(file, 'utf8');
const files = {
    cache: read('modules/phone-beautify-templates/cache.js'),
    repository: read('modules/phone-beautify-templates/repository.js'),
    matcher: read('modules/phone-beautify-templates/matcher.js'),
    policy: read('modules/phone-beautify-templates/policy.js'),
    reset: read('modules/phone-beautify-templates/reset.js'),
    page: read('modules/settings-app/pages/beautify.js'),
    behavior: read('modules/settings-app/pages/beautify-behavior.js'),
    builder: read('modules/settings-app/layout/page-builders/editor-builders.js'),
    workshop: read('modules/content-presets/workshop-service.js'),
    types: read('types.d.ts'),
};

assert.ok(files.cache.includes('invalidatePhoneBeautifyTemplateCache'));
assert.ok(files.repository.includes('getBeautifyTemplateSourceModeRuntime'));
assert.ok(files.matcher.includes("reason: 'manual_binding'"), '历史 binding 读取必须保留');
assert.ok(files.matcher.includes('store.bindings?.[safeSheetKey]'));
assert.ok(files.policy.includes('BEAUTIFY_USER_TEMPLATE_WRITE_DISABLED'));
assert.ok(files.reset.includes('restorePhoneBeautifyTemplatesToBuiltinDefaults'));
assert.ok(!files.page.includes('phone-beautify-templates/'), '新模板工坊不得重新耦合旧 Beautify store');
assert.ok(files.page.includes('contentPresetWorkshopService.getViewModel()'));
assert.ok(files.page.includes('contentPresetWorkshopService.subscribe('));
assert.ok(files.behavior.includes('service.prepareImport(await file.text())'));
for (const method of ['importPrepared', 'exportPreset']) {
    assert.ok(files.workshop.includes(`async ${method}(`), `工坊 service 必须提供 ${method}()`);
}
for (const property of [
    'deletePreset:',
    'setPageActive,',
    'clearPageActive,',
    'clearAllPageActive:',
    'setPopupActive,',
    'clearPopupActive,',
    'clearAllPopupActive:',
]) {
    assert.ok(files.workshop.includes(property), `工坊 service 必须提供双应用接口：${property}`);
}
assert.ok(files.workshop.includes('setActive: setPageActive'), '旧 setActive 兼容别名必须固定为页面应用');
assert.ok(files.workshop.includes('clearActive: clearPageActive'), '旧 clearActive 兼容别名必须固定为页面应用');
for (const action of ['import', 'export', 'delete', 'clear-all-page', 'clear-all-popup']) {
    assert.ok(files.builder.includes(`data-action="${action}"`), `页面必须提供 ${action} action`);
}
assert.ok(files.builder.includes("application: 'page'"), '页面必须提供表格美化应用下拉框');
assert.ok(files.builder.includes("application: 'popup'"), '页面必须提供弹窗应用下拉框');
assert.ok(!files.builder.includes('phone-beautify-restore-defaults-btn'));
assert.ok(files.types.includes('PhoneBeautifyTemplateResetResult'));
assert.ok(files.types.includes('SettingsContentPresetWorkshopService'));
console.log('[beautify-templates-contract-check] 新工坊双应用与旧页面兼容合同检查通过');
