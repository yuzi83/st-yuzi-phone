const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(href + '?contract=' + Date.now() + '-' + Math.random());
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
    const { createApiPresetsPage } = await importModule('modules/settings-app/pages/api-presets.js');
    const container = {
        innerHTML: '',
        querySelector() {
            return { value: '', addEventListener() {} };
        },
    };
    let page;
    const ctx = {
        container,
        render() { page.update(); },
        pageRuntime: { addEventListener() {} },
        qqV2PresetService: {
            async readSharedResources() {
                return {
                    ok: true,
                    apiPresets: [{
                        presetId: 'qq-v2.database-current-api',
                        name: '数据库当前 API',
                        readOnly: true,
                    }],
                    promptPresets: [],
                    stickers: [],
                };
            },
        },
    };

    page = createApiPresetsPage(ctx);
    page.mount();
    await flush();
    await flush();

    assert.match(container.innerHTML, /数据库当前 API（只读）/);
    assert.match(
        container.innerHTML,
        /<option value="qq-v2\.database-current-api"[^>]*disabled[^>]*>/,
    );
    console.log('[api-presets-readonly-contract] passed');
}

main().catch((error) => {
    console.error('[api-presets-readonly-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
