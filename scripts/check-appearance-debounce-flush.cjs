const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    layout: 'modules/settings-app/services/appearance-settings/layout-settings.js',
    buttonStyle: 'modules/settings-app/pages/button-style.js',
    runtimeManager: 'modules/runtime-manager.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function normalize(value) {
    return String(value).replace(/\r\n?/g, '\n');
}

function has(content, snippet) {
    return normalize(content).includes(normalize(snippet));
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(
        results,
        'runtimeManager',
        'createDebouncedTask.cancel() 仍会清空 pendingArgs，说明 cleanup cancel 会丢待保存值',
        has(contents.runtimeManager, 'fn.cancel = () => {\n        if (timerId !== null) {')
            && has(contents.runtimeManager, 'pendingArgs = [];')
    );

    check(
        results,
        'runtimeManager',
        'createDebouncedTask.flush() 仍会执行 pendingArgs',
        has(contents.runtimeManager, 'fn.flush = () => {\n        if (timerId === null) return;\n        window.clearTimeout(timerId);\n        run();\n    };')
    );

    check(
        results,
        'layout',
        'Appearance 图标布局 cleanup flush 待保存输入',
        has(contents.layout, 'addCleanup(() => debouncedSave.flush?.());')
    );

    check(
        results,
        'layout',
        'Appearance 图标布局 cleanup 不再 cancel 待保存输入',
        !has(contents.layout, 'addCleanup(() => debouncedSave.cancel?.());')
    );

    check(
        results,
        'layout',
        'Appearance 图标布局 change 路径仍强制 flush 并同步规范化保存',
        has(contents.layout, "addListener(input, 'change', () => {\n            debouncedSave.flush?.();\n            const value = clampNumber(input.value, item.min, item.max, item.fallback);\n            input.value = String(value);\n            savePhoneSetting(item.key, value);")
    );

    check(
        results,
        'buttonStyle',
        'Button Style 尺寸 cleanup flush 待保存输入',
        has(contents.buttonStyle, 'addCleanup(() => saveToggleSizeDebounced.flush?.());')
    );

    check(
        results,
        'buttonStyle',
        'Button Style 尺寸 cleanup 不再 cancel 待保存输入',
        !has(contents.buttonStyle, 'addCleanup(() => saveToggleSizeDebounced.cancel?.());')
    );

    check(
        results,
        'buttonStyle',
        'Button Style immediate 路径仍 cancel pending 后同步保存并派发样式更新事件',
        has(contents.buttonStyle, "if (immediate) {\n            saveToggleSizeDebounced.cancel?.();\n            savePhoneSetting('phoneToggleStyleSize', next);\n            emitToggleStyleUpdated();\n        } else {")
    );

    check(
        results,
        'buttonStyle',
        'Button Style range input 仍走 debounced 保存路径',
        has(contents.buttonStyle, "addListener(sizeRange, 'input', () => {\n        setSizeValue(sizeRange.value, false, false);\n    });")
    );

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[appearance-debounce-flush-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[appearance-debounce-flush-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
