const fs = require('fs');
const assert = require('assert/strict');

const legacyRepository = fs.readFileSync('modules/phone-beautify-templates/repository.js', 'utf8');
const contentRepository = fs.readFileSync('modules/content-presets/repository.js', 'utf8');
const workshop = fs.readFileSync('modules/content-presets/workshop-service.js', 'utf8');
const behavior = fs.readFileSync('modules/settings-app/pages/beautify-behavior.js', 'utf8');

assert.ok(legacyRepository.includes('export function deletePhoneBeautifyUserTemplate(templateId)'));
assert.ok(legacyRepository.includes('createBeautifyUserTemplateWriteDisabledResult()'));
assert.ok(!legacyRepository.includes('cleanupActiveSettingsForDeletedTemplate'));

for (const operation of ['replacePresetRecord', 'deletePresetRecord']) {
    const start = contentRepository.indexOf(`export async function ${operation}`);
    assert.notEqual(start, -1, `${operation} 必须存在`);
    const body = contentRepository.slice(start, contentRepository.indexOf('\n}', start) + 2);
    assert.ok(
        body.includes('[CONTENT_PRESET_STORES.presets, CONTENT_PRESET_STORES.activeByTable, CONTENT_PRESET_STORES.popupByTable]'),
        `${operation} 必须在同一事务覆盖预设、页面应用与弹窗应用 store`,
    );
    assert.ok(body.includes('removeAllPresetBindings(tx,'), `${operation} 必须在事务内清理页面和弹窗两类引用绑定`);
}
assert.ok(workshop.includes('deletePreset: presetId => withCommittedMutation('));
assert.ok(workshop.includes('() => runtimeDeps.deletePresetRecord(presetId)'));
assert.ok(workshop.includes('metadata.delete(result.presetId)'));
assert.ok(workshop.includes('pageByTable: clearAffected(pageBindings(current), result.affectedSheetKeys)'));
assert.ok(workshop.includes('popupByTable: clearAffected(popupBindings(current), result.affectedSheetKeys)'));
assert.ok(behavior.includes('service.deletePreset(presetId)'));
assert.ok(behavior.includes('并原子清除所有引用它的表绑定'));

console.log('[beautify-template-delete-active-cleanup-check] 新工坊原子删除、双应用清理与旧禁写边界检查通过');
