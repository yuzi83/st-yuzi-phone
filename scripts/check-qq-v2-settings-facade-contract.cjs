const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertDoesNotInclude(source, needle, label) {
    assert.equal(source.includes(needle), false, `${label} 不得保留 ${needle}`);
}

async function main() {
    const calls = [];
    const { createQQV2PresetSettingsService } = await import('../modules/settings-app/services/qq-v2-preset-facade.js');
    const resources = {
        ok: true,
        status: 'ready',
        apiPresets: [{ presetId: 'api-1', name: '主接口' }],
        promptPresets: [{ presetId: 'prompt-1', name: '私聊回复', isBuiltIn: true, messages: [] }],
        imageGenerationPresets: [{
            presetId: 'image-preset-1',
            name: '生图转换',
            entries: [{ role: 'system', content: '只转换', enabled: true }],
        }],
        stickers: [],
    };
    const facade = {
        query: {
            async sharedResources() {
                calls.push(['sharedResources']);
                return resources;
            },
        },
        intent: {},
    };
    for (const method of [
        'saveApiPreset',
        'deleteApiPreset',
        'loadModels',
        'savePromptPreset',
        'deletePromptPreset',
        'restoreBuiltInPromptPreset',
        'restoreAllBuiltInPromptPresets',
        'importPromptPresets',
        'exportPromptPreset',
        'exportAllPromptPresets',
        'importImageGenerationPresets',
        'exportImageGenerationPreset',
        'deleteImageGenerationPreset',
    ]) {
        facade.intent[method] = async (input) => {
            calls.push([method, input]);
            return { ok: true, status: 'accepted', method };
        };
    }

    const service = createQQV2PresetSettingsService({ getFacade: () => facade });
    assert.deepEqual(await service.readSharedResources(), resources);
    assert.deepEqual(calls, [['sharedResources']]);

    const operations = [
        ['saveApiPreset', { preset: { name: '备用接口' } }],
        ['deleteApiPreset', { apiPresetId: 'api-1' }],
        ['loadModels', { apiPresetId: 'api-1' }],
        ['savePromptPreset', { preset: { name: '群聊回复', messages: [] } }],
        ['deletePromptPreset', { promptPresetId: 'prompt-1' }],
        ['restoreBuiltInPromptPreset', { promptPresetId: 'prompt-1' }],
        ['restoreAllBuiltInPromptPresets', undefined],
        ['importPromptPresets', { source: { presets: [] } }],
        ['exportPromptPreset', { promptPresetId: 'prompt-1' }],
        ['exportAllPromptPresets', undefined],
        ['importImageGenerationPresets', {
            source: {
                '生图转换': {
                    entries: [{ role: 'system', content: '只转换' }],
                },
            },
        }],
        ['exportImageGenerationPreset', { imageGenerationPresetId: 'image-preset-1' }],
        ['deleteImageGenerationPreset', { imageGenerationPresetId: 'image-preset-1' }],
    ];
    for (const [method, input] of operations) {
        assert.deepEqual(await service[method](input), { ok: true, status: 'accepted', method });
    }
    assert.deepEqual(calls.slice(1), operations.map(([method, input]) => [method, input]));

    const home = read('modules/settings-app/layout/page-builders/overview-builders.js');
    const apiPage = read('modules/settings-app/pages/api-presets.js');
    const promptPage = read('modules/settings-app/pages/ai-instruction-presets.js');
    const settingsRender = read('modules/settings-app/render.js');
    const pageContexts = read('modules/settings-app/page-renderers/page-context-builders.js');
    const presetRenderers = read('modules/settings-app/page-renderers/preset-renderers.js');
    assert.match(home, /['"]api_presets['"]/, '设置首页必须保留 API 预设入口');
    assert.match(home, /['"]ai_instruction_presets['"]/, '设置首页必须保留 AI 指令预设入口');
    assertDoesNotInclude(home, "entry: 'database'", '设置首页');
    assertDoesNotInclude(home, 'phone-db-preset-quick-select', '设置首页');
    assertDoesNotInclude(home, 'phone-top-trigger-update', '设置首页');
    assertDoesNotInclude(home, '手动更新', '设置首页');
    assert.match(apiPage, /phone-api-preset-select/, 'API 页面必须提供预设下拉框');
    assert.match(apiPage, /phone-api-preset-new-btn/, 'API 页面必须提供独立新建按钮');
    assertDoesNotInclude(apiPage, 'phone-db-', 'API 页面');
    assert.match(promptPage, /phone-ai-instruction-preset-select/, 'AI 页面必须提供统一预设下拉框');
    assert.match(promptPage, /phone-ai-instruction-new-btn/, 'AI 页面必须提供独立新建按钮');
    assert.match(promptPage, /phone-ai-message-name/, 'AI 页面必须让消息块名称可见且可编辑');
    assertDoesNotInclude(promptPage, 'phone-ai-instruction-new-kind', 'AI 页面');
    assertDoesNotInclude(promptPage, 'private-reply', 'AI 页面');
    assertDoesNotInclude(promptPage, 'private-proactive', 'AI 页面');
    assertDoesNotInclude(promptPage, 'group-reply', 'AI 页面');
    assertDoesNotInclude(promptPage, 'group-proactive', 'AI 页面');
    assertDoesNotInclude(promptPage, '../../qq/data/', 'AI 页面');
    assertDoesNotInclude(promptPage, '__new__', 'AI 预设下拉框');
    assert.match(settingsRender, /qqV2PresetSettingsService/, '设置渲染入口必须注入 QQ v2 Facade 预设服务');
    assert.match(settingsRender, /api_presets/, '设置渲染入口必须注册 API 预设页');
    assertDoesNotInclude(settingsRender, "mode === 'database'", '设置渲染入口');
    assertDoesNotInclude(settingsRender, 'dataConfig:', '设置渲染入口');
    assert.match(pageContexts, /qqV2Presets/, '设置页面 context 必须传递 QQ v2 Facade 预设服务');
    assert.match(presetRenderers, /api_presets/, '预设 renderer 必须注册 API 预设页');
    for (const legacyPath of [
        'modules/settings-app/pages/database.js',
        'modules/settings-app/services/database-page-controller.js',
        'modules/settings-app/services/db-config-runtime.js',
        'modules/settings-app/services/db-presets.js',
        'modules/settings-app/layout/page-builders/data-builders.js',
        'modules/settings-app/page-renderers/data-config-renderers.js',
        'modules/settings-app/services/manual-update.js',
        'modules/phone-core/data-api/config-repository.js',
        'modules/phone-core/data-api/preset-repository.js',
    ]) {
        assert.equal(fs.existsSync(path.join(ROOT, legacyPath)), false, `旧数据库设置链必须删除：${legacyPath}`);
    }

    console.log('[qq-v2-settings-facade-contract] 检查通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
