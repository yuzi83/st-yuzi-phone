const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 注：facade modules/phone-beautify-templates.js 已在阶段一清理篇删除，
// 本脚本不再读取该 façade，只校验「子模块 API 表面 + types.d.ts 接口 + 调用方直接从子模块导入」三段长期契约。
const FILES = {
    shared: 'modules/phone-beautify-templates/shared.js',
    cache: 'modules/phone-beautify-templates/cache.js',
    repository: 'modules/phone-beautify-templates/repository.js',
    importExport: 'modules/phone-beautify-templates/import-export.js',
    matcher: 'modules/phone-beautify-templates/matcher.js',
    types: 'types.d.ts',
    tableViewerRender: 'modules/table-viewer/render.js',
    beautifyPage: 'modules/settings-app/pages/beautify.js',
    editorBuilders: 'modules/settings-app/layout/page-builders/editor-builders.js',
};

const FACADE_RELATIVE_PATH = 'modules/phone-beautify-templates.js';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
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

    // façade 已删除：物理校验
    results.push({
        file: FACADE_RELATIVE_PATH,
        description: 'phone-beautify-templates façade 已删除',
        ok: !exists(FACADE_RELATIVE_PATH),
    });

    check(results, 'shared', 'shared 继续通过 pack-helpers re-export serializeTemplateForExport', has(contents.shared, 'serializeTemplateForExport,') && has(contents.shared, "from './pack-helpers.js';"));
    check(results, 'shared', 'shared 继续通过 matcher-helpers re-export scoreTemplateMatcher', has(contents.shared, 'scoreTemplateMatcher,') && has(contents.shared, "from './matcher-helpers.js';"));
    check(results, 'shared', 'shared 不再直接定义 exportPhoneBeautifyPack() 实现', !has(contents.shared, 'export function exportPhoneBeautifyPack('));
    check(results, 'shared', 'shared 不再直接定义 detectSpecialTemplateForTable() 实现', !has(contents.shared, 'export function detectSpecialTemplateForTable('));

    check(results, 'cache', 'cache 暴露 getCachedAllPhoneBeautifyTemplates()', has(contents.cache, 'export function getCachedAllPhoneBeautifyTemplates('));
    check(results, 'cache', 'cache 暴露 getCachedPhoneBeautifyTemplatesByType()', has(contents.cache, 'export function getCachedPhoneBeautifyTemplatesByType('));
    check(results, 'cache', 'cache 暴露 invalidatePhoneBeautifyTemplateCache()', has(contents.cache, 'export function invalidatePhoneBeautifyTemplateCache('));
    check(results, 'cache', 'cache 暴露 getCachedBeautifyTemplateSourceRuntime()', has(contents.cache, 'export function getCachedBeautifyTemplateSourceRuntime('));

    check(results, 'repository', 'repository 暴露 getPhoneBeautifyTemplatesByType()', has(contents.repository, 'export function getPhoneBeautifyTemplatesByType('));
    check(results, 'repository', 'repository 暴露 validatePhoneBeautifyTemplate()', has(contents.repository, 'export function validatePhoneBeautifyTemplate('));
    check(results, 'repository', 'repository 暴露 deletePhoneBeautifyUserTemplate()', has(contents.repository, 'export function deletePhoneBeautifyUserTemplate('));
    check(results, 'repository', 'repository 接入 cache 层', has(contents.repository, "from './cache.js';"));
    check(results, 'repository', 'repository 通过缓存提供 source runtime', has(contents.repository, 'getCachedBeautifyTemplateSourceRuntime('));
    check(results, 'repository', 'repository 写路径改为基于缓存 store 快照', has(contents.repository, 'const store = getCachedPhoneBeautifyTemplateStore();'));

    check(results, 'importExport', 'import-export 暴露 exportPhoneBeautifyPack()', has(contents.importExport, 'export function exportPhoneBeautifyPack('));
    check(results, 'importExport', 'import-export 暴露 importPhoneBeautifyPackFromData()', has(contents.importExport, 'export function importPhoneBeautifyPackFromData('));
    check(results, 'importExport', 'import-export 接入 cache 层', has(contents.importExport, "from './cache.js';"));

    check(results, 'matcher', 'matcher 暴露 detectSpecialTemplateForTable()', has(contents.matcher, 'export function detectSpecialTemplateForTable('));
    check(results, 'matcher', 'matcher 暴露 detectGenericTemplateForTable()', has(contents.matcher, 'export function detectGenericTemplateForTable('));
    check(results, 'matcher', 'matcher 暴露 bindSheetToBeautifyTemplate()', has(contents.matcher, 'export function bindSheetToBeautifyTemplate('));
    check(results, 'matcher', 'matcher 暴露 clearSheetBeautifyBinding()', has(contents.matcher, 'export function clearSheetBeautifyBinding('));
    check(results, 'matcher', 'matcher 接入 cache 层', has(contents.matcher, "from './cache.js';"));
    check(results, 'matcher', 'matcher 通过缓存按 id 读取模板', has(contents.matcher, 'getCachedPhoneBeautifyTemplateById('));

    check(results, 'types', 'types.d.ts 新增 PhoneBeautifyTemplate 接口', has(contents.types, 'export interface PhoneBeautifyTemplate {'));
    check(results, 'types', 'types.d.ts 新增 PhoneBeautifyTemplateStore 接口', has(contents.types, 'export interface PhoneBeautifyTemplateStore {'));
    check(results, 'types', 'types.d.ts 新增 PhoneBeautifyTemplatesModule 接口', has(contents.types, 'export interface PhoneBeautifyTemplatesModule {'));
    check(results, 'types', 'types.d.ts 新增 PhoneBeautifyTemplateQueryOptions 接口', has(contents.types, 'export interface PhoneBeautifyTemplateQueryOptions {'));
    check(results, 'types', 'types.d.ts 新增 PhoneBeautifyTemplateExportOptions 接口', has(contents.types, 'export interface PhoneBeautifyTemplateExportOptions {'));
    check(results, 'types', 'types.d.ts 新增 PhoneBeautifyTemplateActivationResult 接口', has(contents.types, 'export interface PhoneBeautifyTemplateActivationResult {'));
    check(results, 'types', 'types.d.ts 收紧 PhoneSettings beautifyTemplateSourceModeSpecial', has(contents.types, 'beautifyTemplateSourceModeSpecial: BeautifySourceMode;'));

    check(results, 'tableViewerRender', 'table-viewer render 改为直接从 matcher 导入模板匹配能力', has(contents.tableViewerRender, "from '../phone-beautify-templates/matcher.js';"));
    check(results, 'tableViewerRender', 'table-viewer render 不再直接从 phone-beautify-templates façade 导入', !has(contents.tableViewerRender, "from '../phone-beautify-templates.js';"));
    check(results, 'beautifyPage', 'beautify 页面改为直接从 shared 导入模板常量', has(contents.beautifyPage, "from '../../phone-beautify-templates/shared.js';"));
    check(results, 'beautifyPage', 'beautify 页面改为直接从 repository 导入模板仓库能力', has(contents.beautifyPage, "from '../../phone-beautify-templates/repository.js';"));
    check(results, 'beautifyPage', 'beautify 页面改为直接从 import-export 导入模板导入导出能力', has(contents.beautifyPage, "from '../../phone-beautify-templates/import-export.js';"));
    check(results, 'beautifyPage', 'beautify 页面不再直接从 phone-beautify-templates façade 导入', !has(contents.beautifyPage, "from '../../phone-beautify-templates.js';"));
    check(results, 'editorBuilders', 'editor-builders 改为直接从 shared 导入模板常量', has(contents.editorBuilders, "from '../../../phone-beautify-templates/shared.js';"));
    check(results, 'editorBuilders', 'editor-builders 不再直接从 phone-beautify-templates façade 导入', !has(contents.editorBuilders, "from '../../../phone-beautify-templates.js';"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[beautify-templates-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[beautify-templates-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
