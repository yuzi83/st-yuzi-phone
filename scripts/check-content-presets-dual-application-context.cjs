const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

async function main() {
    const { buildBeautifyTemplatePageContext } = await load('modules/settings-app/page-renderers/page-context-builders.js');
    const pageMethods = {
        setPageActive() {},
        clearPageActive() {},
        clearAllPageActive() {},
        setPopupActive() {},
        clearPopupActive() {},
        clearAllPopupActive() {},
    };
    const services = {
        common: {}, navigation: {},
        scroll: { rerenderBeautifyKeepScroll() {} },
        feedback: { showToast() {} },
        appearance: {}, qqV2Presets: {}, buttonStyle: {},
        contentPresetWorkshop: {
            getSnapshot() {}, subscribe() {}, getViewModel() {}, prepareImport() {}, importPrepared() {},
            exportPreset() {}, deletePreset() {}, ...pageMethods,
        },
        worldbookReading: {}, imageGeneration: {}, tableContentReplacement: {}, fullscreenOverlay: {},
    };
    const context = buildBeautifyTemplatePageContext(services);
    const exposed = context.contentPresetWorkshopService;
    for (const [name, method] of Object.entries(pageMethods)) {
        assert.equal(exposed[name], method, `模板工坊页面上下文必须暴露 ${name}`);
    }
    console.log('[content-presets-dual-application-context-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-dual-application-context-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});
