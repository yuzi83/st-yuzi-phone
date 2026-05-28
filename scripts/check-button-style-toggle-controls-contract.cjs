const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    appearanceBuilder: 'modules/settings-app/layout/page-builders/appearance-builders.js',
    buttonStylePage: 'modules/settings-app/pages/button-style.js',
    settingsPanel: 'modules/settings-panel.js',
    eventRegistry: 'modules/bootstrap/event-registry.js',
    primitives: 'modules/settings-app/layout/primitives.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function pushCheck(results, fileKey, description, ok) {
    results.push({
        file: FILES[fileKey],
        description,
        ok,
    });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    pushCheck(results, 'appearanceBuilder', 'button-style builder 扩展 floatingToggleEnabled 参数',
        has(contents.appearanceBuilder, 'buildButtonStylePageHtml({ currentSize, currentShape, currentCover, floatingToggleEnabled = true })'));
    pushCheck(results, 'appearanceBuilder', 'button-style builder 声明内部页悬浮开关 DOM ID',
        has(contents.appearanceBuilder, 'id="phone-floating-toggle-enabled"'));
    pushCheck(results, 'appearanceBuilder', 'button-style builder 声明内部页重置位置按钮 DOM ID',
        has(contents.appearanceBuilder, 'id="phone-toggle-position-reset-btn"'));
    pushCheck(results, 'appearanceBuilder', 'button-style builder 包含“悬浮窗开关”文案',
        has(contents.appearanceBuilder, '悬浮窗开关'));
    pushCheck(results, 'appearanceBuilder', 'button-style builder 包含“重置悬浮按钮位置”文案',
        has(contents.appearanceBuilder, '重置悬浮按钮位置'));

    pushCheck(results, 'buttonStylePage', 'button-style 页面兼容旧配置读取 floatingToggleEnabled',
        has(contents.buttonStylePage, 'const floatingToggleEnabled = settings.floatingToggleEnabled !== false;'));
    pushCheck(results, 'buttonStylePage', 'button-style 页面保存 floatingToggleEnabled 设置键',
        has(contents.buttonStylePage, "savePhoneSetting('floatingToggleEnabled', floatingToggleCheckbox.checked);"));
    pushCheck(results, 'buttonStylePage', 'button-style 页面继续派发 yuzi-phone-toggle-style-updated',
        has(contents.buttonStylePage, "new CustomEvent('yuzi-phone-toggle-style-updated')"));
    pushCheck(results, 'buttonStylePage', 'button-style 页面派发 yuzi-phone-toggle-position-reset',
        has(contents.buttonStylePage, "new CustomEvent('yuzi-phone-toggle-position-reset')"));
    pushCheck(results, 'buttonStylePage', 'button-style 页面新增控件绑定继续走 addListener',
        has(contents.buttonStylePage, "addListener(floatingToggleCheckbox, 'change'")
        && has(contents.buttonStylePage, "addListener(resetPositionBtn, 'click'"));
    pushCheck(results, 'buttonStylePage', 'button-style 页面不复用扩展页旧 DOM ID',
        !has(contents.buttonStylePage, 'yuzi-phone-floating-toggle-enabled')
        && !has(contents.buttonStylePage, 'yuzi-phone-reset-position'));
    pushCheck(results, 'buttonStylePage', 'button-style 页面不直接写 phoneToggleX/Y',
        !has(contents.buttonStylePage, "savePhoneSetting('phoneToggleX'")
        && !has(contents.buttonStylePage, "savePhoneSetting('phoneToggleY'"));

    pushCheck(results, 'settingsPanel', '扩展页原悬浮开关 DOM ID 仍保留',
        has(contents.settingsPanel, "'yuzi-phone-floating-toggle-enabled'"));
    pushCheck(results, 'settingsPanel', '扩展页原重置按钮 DOM ID 仍保留',
        has(contents.settingsPanel, "'yuzi-phone-reset-position'"));
    pushCheck(results, 'eventRegistry', 'bootstrap 仍消费悬浮样式刷新事件',
        has(contents.eventRegistry, "eventManager.add(window, 'yuzi-phone-toggle-style-updated', handleToggleStyleUpdated);"));
    pushCheck(results, 'eventRegistry', 'bootstrap 仍消费悬浮位置重置事件',
        has(contents.eventRegistry, "eventManager.add(window, 'yuzi-phone-toggle-position-reset', handleTogglePositionReset);"));

    pushCheck(results, 'primitives', 'settings 入口文案覆盖显示与位置职责',
        has(contents.primitives, "description: '管理悬浮入口显示、位置、尺寸、形态与封面'"));

    const failed = results.filter((item) => !item.ok);

    if (failed.length > 0) {
        console.error('[button-style-toggle-controls-contract-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[button-style-toggle-controls-contract-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
