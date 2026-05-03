const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createRuntimeStub({ disposed = false } = {}) {
    const cleanups = [];
    return {
        cleanups,
        registerCleanup(cleanup) {
            cleanups.push(cleanup);
            return () => {
                const index = cleanups.indexOf(cleanup);
                if (index >= 0) {
                    cleanups.splice(index, 1);
                }
            };
        },
        isDisposed() {
            return disposed;
        },
        setDisposed(value) {
            disposed = !!value;
        },
        dispose() {
            disposed = true;
            while (cleanups.length > 0) {
                const cleanup = cleanups.shift();
                cleanup();
            }
        },
    };
}

async function testTokenInvalidatesPreviousImport(createGuard) {
    const guard = createGuard();
    const firstToken = guard.createToken();
    assert.equal(guard.isActive(firstToken), true);

    const secondToken = guard.createToken();
    assert.equal(guard.isActive(firstToken), false);
    assert.equal(guard.isActive(secondToken), true);
}

async function testRuntimeCleanupInvalidatesImport(createGuard) {
    const runtime = createRuntimeStub();
    const guard = createGuard(runtime);
    const token = guard.createToken();

    assert.equal(guard.isActive(token), true);
    runtime.dispose();
    assert.equal(guard.isActive(token), false);
}

async function testRuntimeDisposedInvalidatesImport(createGuard) {
    const runtime = createRuntimeStub();
    const guard = createGuard(runtime);
    const token = guard.createToken();

    assert.equal(guard.isActive(token), true);
    runtime.setDisposed(true);
    assert.equal(guard.isActive(token), false);
}

async function testMissingRuntimeStillSupportsTokenOrdering(createGuard) {
    const guard = createGuard(null);
    const firstToken = guard.createToken();
    const secondToken = guard.createToken();

    assert.equal(guard.isActive(firstToken), false);
    assert.equal(guard.isActive(secondToken), true);
    guard.dispose();
    assert.equal(guard.isActive(secondToken), false);
}

function testPromptEditorUploadHandlerUsesLifecycleGuard() {
    const sourcePath = path.join(ROOT, 'modules/settings-app/pages/prompt-editor.js');
    const source = fs.readFileSync(sourcePath, 'utf8');

    assert.ok(source.includes('export function createPromptEditorImportLifecycleGuard('), '缺少导出的 prompt editor 导入生命周期 guard');
    assert.ok(source.includes('const importLifecycle = createPromptEditorImportLifecycleGuard(runtime);'), 'renderPromptEditorPage 未创建导入生命周期 guard');
    assert.ok(source.includes('const currentImportToken = importLifecycle.createToken();'), '文件 change handler 未为每次导入创建 token');
    assert.ok(source.includes('if (!importLifecycle.isActive(currentImportToken)) return;'), '文件导入 await 后缺少 active guard');
    assert.ok(source.includes('showToast(container, error?.message || \'文件读取失败\', true);'), '读取失败 toast 路径已意外变更');
}

async function main() {
    const { createPromptEditorImportLifecycleGuard } = await import(toModuleUrl('modules/settings-app/pages/prompt-editor.js'));

    const tests = [
        ['新导入 token 会使旧导入 token 失效', () => testTokenInvalidatesPreviousImport(createPromptEditorImportLifecycleGuard)],
        ['pageRuntime cleanup 会使当前导入失效', () => testRuntimeCleanupInvalidatesImport(createPromptEditorImportLifecycleGuard)],
        ['pageRuntime isDisposed=true 会阻止导入继续落地', () => testRuntimeDisposedInvalidatesImport(createPromptEditorImportLifecycleGuard)],
        ['缺失 runtime 时仍按 token 顺序阻止旧导入', () => testMissingRuntimeStillSupportsTokenOrdering(createPromptEditorImportLifecycleGuard)],
        ['prompt editor 上传 handler 接入生命周期 guard', () => testPromptEditorUploadHandlerUsesLifecycleGuard()],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[prompt-editor-import-lifecycle-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[prompt-editor-import-lifecycle-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
