const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

class FakeElement {
    constructor(name = 'element') {
        this.name = name;
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientHeight = 0;
        this.value = '';
        this.files = [];
        this.listeners = new Map();
        this.clickCount = 0;
    }

    addEventListener(type, handler) {
        this.listeners.set(type, handler);
    }

    trigger(type) {
        const handler = this.listeners.get(type);
        if (typeof handler === 'function') {
            handler();
        }
    }

    click() {
        this.clickCount += 1;
    }
}

function createContainer(initialMap = {}) {
    let nodes = { ...initialMap };
    return {
        querySelector(selector) {
            return nodes[selector] || null;
        },
        replaceNodes(nextMap) {
            nodes = { ...nextMap };
        },
    };
}

function createBehaviorHarness(overrides = {}) {
    const logs = {
        captureScroll: [],
        restoreScroll: [],
        renderCount: 0,
        toasts: [],
        downloads: [],
        confirms: [],
        imports: [],
        exports: [],
        deletes: [],
        fileReads: [],
    };

    const initialSpecial = new FakeElement('special-initial');
    initialSpecial.scrollTop = 120;
    initialSpecial.scrollHeight = 800;
    initialSpecial.clientHeight = 300;

    const initialGeneric = new FakeElement('generic-initial');
    initialGeneric.scrollTop = 60;
    initialGeneric.scrollHeight = 500;
    initialGeneric.clientHeight = 200;

    const trigger = new FakeElement('import-trigger');
    const input = new FakeElement('import-input');

    const container = createContainer({
        '#phone-beautify-list-special': initialSpecial,
        '#phone-beautify-list-generic': initialGeneric,
        '#trigger': trigger,
        '#input': input,
    });

    const renderPage = () => {
        logs.renderCount += 1;
        const nextSpecial = new FakeElement('special-next');
        nextSpecial.scrollHeight = 90;
        nextSpecial.clientHeight = 40;

        const nextGeneric = new FakeElement('generic-next');
        nextGeneric.scrollHeight = 400;
        nextGeneric.clientHeight = 100;

        container.replaceNodes({
            '#phone-beautify-list-special': nextSpecial,
            '#phone-beautify-list-generic': nextGeneric,
            '#trigger': trigger,
            '#input': input,
        });
    };

    const requestAnimationFrameImpl = (callback) => {
        if (typeof callback === 'function') {
            callback();
        }
        return 1;
    };

    const deps = {
        setActiveBeautifyTemplateIdByType: (...args) => {
            logs.activationArgs = args;
            return { success: true, message: '模板已启用（测试）' };
        },
        importPhoneBeautifyPackFromData: (...args) => {
            logs.imports.push(args);
            return { success: true, imported: 2, warnings: [] };
        },
        exportPhoneBeautifyPack: (...args) => {
            logs.exports.push(args);
            return {
                success: true,
                count: 2,
                pack: { packMeta: { exportMode: 'annotated' } },
            };
        },
        deletePhoneBeautifyUserTemplate: (...args) => {
            logs.deletes.push(args);
            return { success: true, message: '模板已删除（测试）' };
        },
        downloadTextFile: (...args) => {
            logs.downloads.push(args);
        },
        showConfirmDialog: (...args) => {
            logs.confirms.push(args);
            const onConfirm = args[3];
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
        },
        showToast: (_container, message, isError = false) => {
            logs.toasts.push({ message, isError });
        },
        requestAnimationFrameImpl,
        createFileReader: () => ({
            result: '',
            onload: null,
            onerror: null,
            readAsText(file, encoding) {
                logs.fileReads.push({ file, encoding });
                this.result = overrides.fileReaderResult || 'imported text';
                if (typeof this.onload === 'function') {
                    this.onload();
                }
            },
        }),
        annotatedExportMode: 'annotated',
        ...(overrides.deps || {}),
    };

    const ctx = {
        captureScroll: (key) => logs.captureScroll.push(key),
        restoreScroll: (key) => logs.restoreScroll.push(key),
    };

    const params = {
        container,
        ctx,
        getTemplateById: (templateId) => ({ id: templateId, name: `模板-${templateId}` }),
        renderPage,
        ...(overrides.params || {}),
    };

    return {
        logs,
        params,
        deps,
        container,
        trigger,
        input,
        initialSpecial,
        initialGeneric,
    };
}

function testActivation(behaviorFactory) {
    const successHarness = createBehaviorHarness();
    const successBehavior = behaviorFactory(successHarness.params, successHarness.deps);
    const successResult = successBehavior.handleTemplateActivation({ templateId: 'tpl-success', templateType: 'special' });

    assert.equal(successResult.success, true);
    assert.deepEqual(successHarness.logs.activationArgs, ['special', 'tpl-success']);
    assert.equal(successHarness.logs.toasts.at(-1).message, '模板已启用（测试）');
    assert.equal(successHarness.logs.toasts.at(-1).isError, false);
    assert.deepEqual(successHarness.logs.captureScroll, ['beautifyScrollTop']);
    assert.deepEqual(successHarness.logs.restoreScroll, ['beautifyScrollTop']);
    assert.equal(successHarness.logs.renderCount, 1);
    assert.equal(successHarness.container.querySelector('#phone-beautify-list-special').scrollTop, 50);
    assert.equal(successHarness.container.querySelector('#phone-beautify-list-generic').scrollTop, 60);

    const failHarness = createBehaviorHarness({
        deps: {
            setActiveBeautifyTemplateIdByType: () => ({ success: false, message: '启用失败（测试）' }),
        },
    });
    const failBehavior = behaviorFactory(failHarness.params, failHarness.deps);
    const failResult = failBehavior.handleTemplateActivation({ templateId: 'tpl-fail', templateType: 'generic' });

    assert.equal(failResult.success, false);
    assert.equal(failHarness.logs.toasts.at(-1).message, '启用失败（测试）');
    assert.equal(failHarness.logs.toasts.at(-1).isError, true);
    assert.equal(failHarness.logs.renderCount, 1);
}

function testExport(behaviorFactory) {
    const emptyHarness = createBehaviorHarness({
        deps: {
            exportPhoneBeautifyPack: () => ({ success: false, pack: null, count: 0 }),
        },
    });
    const emptyBehavior = behaviorFactory(emptyHarness.params, emptyHarness.deps);
    emptyBehavior.triggerExport({ templateType: 'special' }, 'none.json', '专属模板已导出');
    assert.equal(emptyHarness.logs.toasts.at(-1).message, '没有可导出的模板');
    assert.equal(emptyHarness.logs.toasts.at(-1).isError, true);
    assert.equal(emptyHarness.logs.downloads.length, 0);

    const successHarness = createBehaviorHarness();
    const successBehavior = behaviorFactory(successHarness.params, successHarness.deps);
    successBehavior.triggerExport({ templateType: 'generic' }, 'ok.json', '通用模板已导出');
    assert.equal(successHarness.logs.downloads.length, 1);
    assert.equal(successHarness.logs.downloads[0][0], 'ok.json');
    assert.equal(successHarness.logs.toasts.at(-1).message, '通用模板已导出（2项 / annotated）');
    assert.equal(successHarness.logs.toasts.at(-1).isError, false);

    const errorHarness = createBehaviorHarness({
        deps: {
            downloadTextFile: () => {
                throw new Error('磁盘异常');
            },
        },
    });
    const errorBehavior = behaviorFactory(errorHarness.params, errorHarness.deps);
    errorBehavior.triggerExport({ templateType: 'special' }, 'bad.json', '专属模板已导出');
    assert.equal(errorHarness.logs.toasts.at(-1).message, '导出失败：磁盘异常');
    assert.equal(errorHarness.logs.toasts.at(-1).isError, true);
}

function testImport(behaviorFactory) {
    const successHarness = createBehaviorHarness();
    const successBehavior = behaviorFactory(successHarness.params, successHarness.deps);
    successBehavior.handleImportText({
        text: '{"pack":true}',
        templateType: 'special',
        labelText: '专属模板',
    });
    assert.equal(successHarness.logs.imports.length, 1);
    assert.equal(successHarness.logs.toasts.at(-1).message, '专属模板导入成功：2项');
    assert.equal(successHarness.logs.renderCount, 1);

    const failHarness = createBehaviorHarness({
        deps: {
            importPhoneBeautifyPackFromData: () => ({ success: false, errors: ['格式损坏'], imported: 0, warnings: [] }),
        },
    });
    const failBehavior = behaviorFactory(failHarness.params, failHarness.deps);
    failBehavior.handleImportText({
        text: 'bad',
        templateType: 'generic',
        labelText: '通用模板',
    });
    assert.equal(failHarness.logs.toasts.at(-1).message, '通用模板导入失败：格式损坏');
    assert.equal(failHarness.logs.toasts.at(-1).isError, true);
    assert.equal(failHarness.logs.renderCount, 0);

    const bindHarness = createBehaviorHarness();
    const bindBehavior = behaviorFactory(bindHarness.params, bindHarness.deps);
    bindHarness.input.files = [{ name: 'sample.json' }];
    bindBehavior.bindImportByType('#trigger', '#input', 'special', '专属模板');
    bindHarness.trigger.trigger('click');
    bindHarness.input.trigger('change');
    assert.equal(bindHarness.trigger.clickCount, 0);
    assert.equal(bindHarness.input.value, '');
    assert.equal(bindHarness.logs.fileReads.length, 1);
    assert.equal(bindHarness.logs.toasts.at(-1).message, '专属模板导入成功：2项');
}

function testSingleExportAndDelete(behaviorFactory) {
    const exportHarness = createBehaviorHarness();
    const exportBehavior = behaviorFactory(exportHarness.params, exportHarness.deps);
    exportBehavior.handleSingleTemplateExport('tpl_single');
    assert.equal(exportHarness.logs.downloads.length, 1);
    assert.equal(exportHarness.logs.toasts.at(-1).message, '模板已导出');

    const exportFailHarness = createBehaviorHarness({
        deps: {
            exportPhoneBeautifyPack: () => ({ success: false, count: 0, pack: null }),
        },
    });
    const exportFailBehavior = behaviorFactory(exportFailHarness.params, exportFailHarness.deps);
    exportFailBehavior.handleSingleTemplateExport('tpl_missing');
    assert.equal(exportFailHarness.logs.toasts.at(-1).message, '导出失败：模板不存在');
    assert.equal(exportFailHarness.logs.toasts.at(-1).isError, true);

    const deleteHarness = createBehaviorHarness();
    const deleteBehavior = behaviorFactory(deleteHarness.params, deleteHarness.deps);
    deleteBehavior.handleDeleteTemplate('tpl_delete');
    assert.equal(deleteHarness.logs.confirms.length, 1);
    assert.equal(deleteHarness.logs.deletes.length, 1);
    assert.equal(deleteHarness.logs.toasts.at(-1).message, '模板「模板-tpl_delete」已删除');
    assert.equal(deleteHarness.logs.renderCount, 1);

    const deleteFailHarness = createBehaviorHarness({
        deps: {
            deletePhoneBeautifyUserTemplate: () => ({ success: false, message: '删除失败（测试）' }),
        },
    });
    const deleteFailBehavior = behaviorFactory(deleteFailHarness.params, deleteFailHarness.deps);
    deleteFailBehavior.handleDeleteTemplate('tpl_delete_fail');
    assert.equal(deleteFailHarness.logs.toasts.at(-1).message, '删除失败（测试）');
    assert.equal(deleteFailHarness.logs.toasts.at(-1).isError, true);
}

async function main() {
    const { createBeautifyPageBehavior } = await import(toModuleUrl('modules/settings-app/pages/beautify-behavior.js'));

    testActivation(createBeautifyPageBehavior);
    testExport(createBeautifyPageBehavior);
    testImport(createBeautifyPageBehavior);
    testSingleExportAndDelete(createBeautifyPageBehavior);

    console.log('[beautify-behavior-check] 检查通过');
    console.log('- OK | 模板启用成功 / 失败分支与滚动恢复成立');
    console.log('- OK | 导出成功 / 空结果 / 异常分支成立');
    console.log('- OK | 导入成功 / 失败与读文件链路成立');
    console.log('- OK | 单模板导出与删除确认分支成立');
}

main().catch((error) => {
    console.error('[beautify-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
