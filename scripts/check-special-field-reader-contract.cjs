const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/table-viewer/special/field-reader.js',
    config: 'modules/table-viewer/special/field-reader-config.js',
    normalizers: 'modules/table-viewer/special/field-reader-normalizers.js',
    runtime: 'modules/table-viewer/special/field-reader-runtime.js',
    messageViewer: 'modules/table-viewer/special/message-viewer.js',
    specialRuntime: 'modules/table-viewer/special/runtime.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'facade', '继续 re-export DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE', has(contents.facade, 'DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE,'));
    check(results, 'facade', '继续 re-export normalizeSpecialStyleOptionsForViewer()', has(contents.facade, 'normalizeSpecialStyleOptionsForViewer,'));
    check(results, 'facade', '继续 re-export createSpecialFieldReader()', has(contents.facade, 'createSpecialFieldReader,'));
    check(results, 'facade', '继续 re-export buildHeaderIndexMap()', has(contents.facade, 'buildHeaderIndexMap,'));

    check(results, 'config', '存在 DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE', has(contents.config, 'export const DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE = Object.freeze({'));
    check(results, 'config', '存在 DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE', has(contents.config, 'export const DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE = Object.freeze({'));
    check(results, 'config', '存在 SPECIAL_STYLE_OPTION_TEXT_LIMITS', has(contents.config, 'export const SPECIAL_STYLE_OPTION_TEXT_LIMITS = Object.freeze({'));

    check(results, 'normalizers', '存在 normalizeFieldBindingCandidatesForViewer()', has(contents.normalizers, 'export function normalizeFieldBindingCandidatesForViewer('));
    check(results, 'normalizers', '存在 normalizeSpecialFieldBindingsForViewer()', has(contents.normalizers, 'export function normalizeSpecialFieldBindingsForViewer('));
    check(results, 'normalizers', '存在 normalizeSpecialStyleOptionsForViewer()', has(contents.normalizers, 'export function normalizeSpecialStyleOptionsForViewer('));

    check(results, 'runtime', '存在 createSpecialFieldReader()', has(contents.runtime, 'export function createSpecialFieldReader('));
    check(results, 'runtime', '存在 buildHeaderIndexMap()', has(contents.runtime, 'export function buildHeaderIndexMap('));
    check(results, 'runtime', '存在 getCellByHeaders()', has(contents.runtime, 'export function getCellByHeaders('));

    check(results, 'messageViewer', '继续从 façade 导入 createSpecialFieldReader 与 buildHeaderIndexMap', has(contents.messageViewer, "from './field-reader.js';"));
    check(results, 'specialRuntime', '继续从 façade 导入 normalizeSpecialStyleOptionsForViewer', has(contents.specialRuntime, "from './field-reader.js';"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[special-field-reader-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[special-field-reader-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
