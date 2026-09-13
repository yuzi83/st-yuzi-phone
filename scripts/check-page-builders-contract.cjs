const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FILES = {
    facade: 'modules/settings-app/layout/page-builders.js',
    overview: 'modules/settings-app/layout/page-builders/overview-builders.js',
    primitives: 'modules/settings-app/layout/primitives.js',
    appearance: 'modules/settings-app/layout/page-builders/appearance-builders.js',
    editor: 'modules/settings-app/layout/page-builders/editor-builders.js',
    frame: 'modules/settings-app/layout/frame.js',
    home: 'modules/settings-app/pages/home.js',
    api: 'modules/settings-app/pages/api-presets.js',
    prompt: 'modules/settings-app/pages/ai-instruction-presets.js',
    presetRenderers: 'modules/settings-app/page-renderers/preset-renderers.js',
    styles: 'styles/phone-base/07-settings-modern.css',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
    const results = [];
    for (const name of ['buildSettingsHomePageHtml', 'buildAppearancePageHtml', 'buildButtonStylePageHtml', 'buildBeautifyTemplatePageHtml']) {
        check(results, 'facade', `设置 page-builder facade 暴露 ${name}()`, contents.facade.includes(`export function ${name}(`));
    }
    check(results, 'facade', '设置 page-builder facade 不再暴露数据库设置页 builder', !contents.facade.includes('buildDatabasePageHtml'));
    check(results, 'overview', '首页 builder 存在 API 预设入口', contents.overview.includes("'api_presets'"));
    check(results, 'overview', '首页 builder 保留 AI 指令预设入口', contents.overview.includes("'ai_instruction_presets'"));
    check(results, 'overview', '首页 builder 不再包含数据库快捷选择', !contents.overview.includes('phone-db-preset-quick-select'));
    check(results, 'overview', '首页 builder 不再包含手动更新按钮', !contents.overview.includes('phone-top-trigger-update') && !contents.overview.includes('手动更新'));
    check(results, 'overview', '首页入口按 2 + 3 分组', contents.overview.includes('entries.slice(0, 2)') && contents.overview.includes('entries.slice(2)'));
    check(results, 'overview', '首页入口使用 profile-action 变体', contents.overview.includes("variant: 'profile-action'"));
    check(results, 'primitives', 'profile-action 只渲染标题与箭头', contents.primitives.includes("variant === 'profile-action'") && contents.primitives.includes('phone-settings-profile-action-title') && contents.primitives.includes('phone-settings-profile-action-chevron'));
    check(results, 'styles', 'profile-action 分组使用 Figma 一级页尺寸', contents.styles.includes('border-radius: 14px;') && contents.styles.includes('padding: 13px 16px;') && contents.styles.includes('font-size: 16px;') && contents.styles.includes('line-height: 24px;'));
    check(results, 'appearance', '外观 builder 存在', contents.appearance.includes('export function buildAppearancePageHtml('));
    check(results, 'editor', '美化工坊 builder 存在', contents.editor.includes('export function buildBeautifyTemplatePageHtml('));
    check(results, 'frame', '设置 frame 从 page-builder facade 导入', contents.frame.includes("from './page-builders.js';"));
    check(results, 'home', '首页使用 settings home builder', contents.home.includes('buildSettingsHomePageHtml('));
    check(results, 'api', 'API 页面使用 Facade 预设服务', contents.api.includes('qqV2PresetService'));
    check(results, 'api', 'API 页面下拉与新建按钮分离', contents.api.includes('phone-api-preset-select') && contents.api.includes('phone-api-preset-new-btn'));
    check(results, 'prompt', 'AI 页面使用 Facade 预设服务', contents.prompt.includes('qqV2PresetService'));
    check(results, 'prompt', 'AI 页面下拉与新建按钮分离', contents.prompt.includes('phone-ai-instruction-preset-select') && contents.prompt.includes('phone-ai-instruction-new-btn'));
    check(results, 'presetRenderers', '预设 renderer 注册 API 和 AI 页面', contents.presetRenderers.includes('api_presets') && contents.presetRenderers.includes('ai_instruction_presets'));
    for (const legacyPath of [
        'modules/settings-app/layout/page-builders/data-builders.js',
        'modules/settings-app/pages/database.js',
        'modules/settings-app/page-renderers/data-config-renderers.js',
    ]) {
        results.push({ file: legacyPath, description: '旧数据库设置页链已删除', ok: !fs.existsSync(path.join(ROOT, legacyPath)) });
    }
    const failed = results.filter(item => !item.ok);
    if (failed.length) {
        console.error('[page-builders-contract-check] 检查失败：');
        failed.forEach(item => console.error(`- ${item.file}: ${item.description}`));
        process.exitCode = 1;
        return;
    }
    console.log('[page-builders-contract-check] 检查通过');
}

main();
