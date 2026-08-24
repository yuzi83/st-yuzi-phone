const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    phoneHomeIcons: 'modules/phone-home/icons.js',
    phoneHomeCss: 'styles/phone-base/02-page-home.css',
    settingsModernCss: 'styles/phone-base/07-settings-modern.css',
    appearanceBuilder: 'modules/settings-app/layout/page-builders/appearance-builders.js',
    buttonStylePage: 'modules/settings-app/pages/button-style.js',
    variableManager: 'modules/variable-manager/index.js',
    context: 'CONTEXT.md',
    architectureGuide: 'docs/architecture-guide.md',
};

const LEGACY_CUSTOM_PROPERTIES = [
    '--phone-toggle-preview-size',
    '--phone-dock-text-icon-start',
    '--phone-dock-text-icon-end',
    '--phone-app-icon-radius',
];

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function check(results, fileKey, description, ok) {
    results.push({
        file: FILES[fileKey] || fileKey,
        description,
        ok,
    });
}

function hasAll(content, snippets) {
    return snippets.every((snippet) => content.includes(snippet));
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
    );
    const sourceKeys = [
        'phoneHomeIcons',
        'phoneHomeCss',
        'settingsModernCss',
        'appearanceBuilder',
        'buttonStylePage',
        'variableManager',
    ];
    const results = [];

    for (const fileKey of sourceKeys) {
        check(
            results,
            fileKey,
            '不再使用无 Yuzi 命名空间的遗留 CSS 自定义变量',
            LEGACY_CUSTOM_PROPERTIES.every((property) => !contents[fileKey].includes(property)),
        );
    }

    check(results, 'phoneHomeIcons', 'Dock 文字图标写入 Yuzi 独占渐变变量', hasAll(contents.phoneHomeIcons, [
        '--yuzi-phone-dock-text-icon-start',
        '--yuzi-phone-dock-text-icon-end',
    ]));
    check(results, 'phoneHomeCss', 'Dock 文字图标消费 Yuzi 独占渐变变量', hasAll(contents.phoneHomeCss, [
        'var(--yuzi-phone-dock-text-icon-start)',
        'var(--yuzi-phone-dock-text-icon-end)',
    ]));
    check(results, 'settingsModernCss', '悬浮入口预览尺寸只消费 Yuzi 独占变量',
        contents.settingsModernCss.includes('--yuzi-phone-toggle-preview-size'));
    check(results, 'appearanceBuilder', '外观页预览写入 Yuzi 独占尺寸变量',
        contents.appearanceBuilder.includes('--yuzi-phone-toggle-preview-size'));
    check(results, 'buttonStylePage', '按钮样式页预览写入 Yuzi 独占尺寸变量',
        contents.buttonStylePage.includes('--yuzi-phone-toggle-preview-size'));
    check(results, 'variableManager', '变量管理器图标复用首页 Yuzi 圆角变量',
        contents.variableManager.includes('var(--yuzi-phone-home-app-icon-radius,12px)'));

    check(results, 'context', '领域文档登记 shell DOM/CSS 命名空间边界', hasAll(contents.context, [
        '.yuzi-phone-screen',
        '.yuzi-phone-home-indicator',
        '.phone-screen',
        '.phone-home-indicator',
        '不得暴露',
    ]));
    check(results, 'context', '领域文档登记 composer 每帧调度与 observer 边界', hasAll(contents.context, [
        'requestAnimationFrame',
        'MutationObserver',
        '输入框',
        '每帧',
    ]));
    check(results, 'architectureGuide', '架构文档登记 shell 独占选择器契约', hasAll(contents.architectureGuide, [
        '.yuzi-phone-screen',
        '.yuzi-phone-home-indicator',
        '.phone-screen',
        '.phone-home-indicator',
        '不得暴露',
    ]));
    check(results, 'architectureGuide', '架构文档登记 composer 性能契约', hasAll(contents.architectureGuide, [
        'requestAnimationFrame',
        'MutationObserver',
        'textarea',
        '每帧',
    ]));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[yuzi-css-variable-namespace-contract] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[yuzi-css-variable-namespace-contract] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
