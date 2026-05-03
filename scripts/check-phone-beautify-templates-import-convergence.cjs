const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    tableViewerRender: 'modules/table-viewer/render.js',
    beautifyPage: 'modules/settings-app/pages/beautify.js',
    editorBuilders: 'modules/settings-app/layout/page-builders/editor-builders.js',
};

const REMOVED_FACADE = 'modules/phone-beautify-templates.js';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function check(results, file, description, ok) {
    results.push({ file, description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, REMOVED_FACADE, 'phone-beautify-templates façade 已删除', !exists(REMOVED_FACADE));

    check(results, FILES.tableViewerRender, 'table-viewer render 改为直接从 matcher 导入模板识别能力', has(contents.tableViewerRender, "from '../phone-beautify-templates/matcher.js';"));
    check(results, FILES.tableViewerRender, 'table-viewer render 不再直接从 phone-beautify-templates façade 导入', !has(contents.tableViewerRender, "from '../phone-beautify-templates.js';"));

    check(results, FILES.beautifyPage, 'beautify 页面改为直接从 shared 导入模板常量', has(contents.beautifyPage, "from '../../phone-beautify-templates/shared.js';"));
    check(results, FILES.beautifyPage, 'beautify 页面改为直接从 repository 导入模板仓库能力', has(contents.beautifyPage, "from '../../phone-beautify-templates/repository.js';"));
    check(results, FILES.beautifyPage, 'beautify 页面改为直接从 import-export 导入模板导入导出能力', has(contents.beautifyPage, "from '../../phone-beautify-templates/import-export.js';"));
    check(results, FILES.beautifyPage, 'beautify 页面不再直接从 phone-beautify-templates façade 导入', !has(contents.beautifyPage, "from '../../phone-beautify-templates.js';"));

    check(results, FILES.editorBuilders, 'editor-builders 改为直接从 shared 导入模板常量', has(contents.editorBuilders, "from '../../../phone-beautify-templates/shared.js';"));
    check(results, FILES.editorBuilders, 'editor-builders 不再直接从 phone-beautify-templates façade 导入', !has(contents.editorBuilders, "from '../../../phone-beautify-templates.js';"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[phone-beautify-templates-import-convergence-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[phone-beautify-templates-import-convergence-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
