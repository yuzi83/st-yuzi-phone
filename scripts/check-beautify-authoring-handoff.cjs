const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
async function main() {
    const root = path.resolve(__dirname, '..');
    const workshop = path.join(root, '玉子美化');
    const canvas = JSON.parse(fs.readFileSync(path.join(workshop, 'examples/image-avatar/canvas.json'), 'utf8'));
    const { normalizePageItemHostCapabilities } = await import(pathToFileURL(path.join(root, 'modules/content-presets/display-contract.js')).href);
    const target = { tableName: canvas.tableName, fields: [...new Set([...canvas.stableIdentityFields, ...canvas.promptFields])] };
    // The host receives the same author declaration that ships in the standalone kit.
    const normalized = normalizePageItemHostCapabilities({ target, imageGeneration: { canvases: [canvas] } });
    assert.deepEqual(normalized.imageGeneration.canvases[0], canvas);
    assert.throws(() => normalizePageItemHostCapabilities({ target, imageGeneration: { canvases: [{ ...canvas, promptSuffix: 1 }] } }));
    const { createContentPresetImageActions } = await import(pathToFileURL(path.join(root, 'modules/content-presets/image-actions.js')).href);
    const actions = createContentPresetImageActions({ declaration: { imageGeneration: { canvases: [canvas] } }, imageGenerationService: { async generate() {}, async read() {} } });
    const docs = fs.readFileSync(path.join(workshop, 'docs/runtime/host-capabilities.md'), 'utf8');
    const types = fs.readFileSync(path.join(workshop, 'docs/runtime/host-capabilities.d.ts'), 'utf8');
    for (const name of Object.keys(actions)) {
        assert.ok(docs.includes(name), `作者文档缺少宿主动作：${name}`);
        assert.ok(types.includes(name + '('), `作者类型缺少宿主动作：${name}`);
    }
    console.log('[beautify-authoring-handoff] 通过；示例声明、宿主动作和随包文档一致');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
