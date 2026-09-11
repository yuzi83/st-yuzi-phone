const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const WORKSHOP_ROOT = path.join(ROOT, '玉子美化');
const TOOLS_ROOT = path.join(WORKSHOP_ROOT, 'tools');

function runCli(toolName, args) {
    const result = spawnSync(process.execPath, [path.join(TOOLS_ROOT, toolName), ...args], {
        cwd: WORKSHOP_ROOT,
        encoding: 'utf8',
    });
    if (result.status === 0) return result.stdout;
    throw new Error([
        `玉子美化 CLI 失败：${toolName} ${args.join(' ')}`,
        result.stdout,
        result.stderr,
    ].filter(Boolean).join('\n'));
}

async function writeJson(file, value) {
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMount(projectDir, relative) {
    const file = path.join(projectDir, ...relative.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, [
        'export function mount(context) {',
        '  context.root.dataset.yuziHostContract = context.getState().tableName;',
        '  return () => {};',
        '}',
        '',
    ].join('\n'), 'utf8');
}

function displayTables() {
    const requiredSheetFields = {
        sourceData: {
            note: '交叉导入合同测试表。',
            initNode: '',
            deleteNode: '',
            updateNode: '',
            insertNode: '',
            ddl: 'CREATE TABLE contract_table (id TEXT);',
        },
        updateConfig: {},
        exportConfig: {},
    };
    return {
        mate: { type: 'chatSheets', version: 1 },
        sheet_summary: {
            ...requiredSheetFields,
            uid: 'sheet_summary',
            name: '纪要表',
            orderNo: 0,
            content: [
                ['编码索引', '概览'],
                ['summary-001', '交叉导入合同'],
            ],
        },
        sheet_tasks: {
            ...requiredSheetFields,
            uid: 'sheet_tasks',
            name: '任务表',
            orderNo: 1,
            content: [
                ['任务编号', '任务内容', '图片描述'],
                ['task-001', '验证真实工坊产物', '一部小手机与一张任务卡'],
            ],
        },
    };
}

function pageOnlyTables() {
    const requiredSheetFields = {
        sourceData: {
            note: '页面兼容合同测试表。',
            initNode: '',
            deleteNode: '',
            updateNode: '',
            insertNode: '',
            ddl: 'CREATE TABLE profile_table (id TEXT);',
        },
        updateConfig: {},
        exportConfig: {},
    };
    return {
        mate: { type: 'chatSheets', version: 1 },
        sheet_profile: {
            ...requiredSheetFields,
            uid: 'sheet_profile',
            name: '角色表',
            orderNo: 0,
            content: [
                ['角色ID', '姓名'],
                ['role-001', '玉子'],
            ],
        },
    };
}

async function createWorkshopProject({ root, id, name, tables }) {
    const projectsDir = path.join(root, 'projects');
    runCli('project-new.mjs', [
        '--projects-dir', projectsDir,
        '--id', id,
        '--name', name,
        '--json',
    ]);
    const projectDir = path.join(projectsDir, id);
    const projectFile = path.join(projectDir, 'project.json');
    const tablesFile = path.join(root, `${id}-tables.json`);
    await writeJson(tablesFile, tables);
    runCli('project-import-tables.mjs', [
        '--project', projectFile,
        '--input', tablesFile,
        '--json',
    ]);
    return { projectDir, projectFile };
}

function packProject(projectFile, outputFile) {
    runCli('project-check.mjs', ['--project', projectFile, '--release', '--json']);
    runCli('pack-preset.mjs', [projectFile, outputFile]);
}

async function main() {
    const { importContentPreset } = await import(pathToFileURL(
        path.join(ROOT, 'modules', 'content-presets', 'import-export.js'),
    ).href);
    const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yuzi-beautify-host-import-'));

    try {
        const displays = await createWorkshopProject({
            root: runRoot,
            id: 'host-display-contract',
            name: '宿主导入展示合同',
            tables: displayTables(),
        });
        await writeMount(displays.projectDir, 'displays/task-inline/mount.js');
        await writeMount(displays.projectDir, 'displays/summary-task-popup/mount.js');
        await writeMount(displays.projectDir, 'displays/summary-barrage/mount.js');

        runCli('project-add-display.mjs', [
            '--project', displays.projectFile,
            '--table', '任务表',
            '--field', '任务编号',
            '--field', '任务内容',
            '--field', '图片描述',
            '--id', 'task-inline',
            '--name', '任务正文卡片',
            '--kind', 'inline',
            '--mount', 'displays/task-inline/mount.js',
            '--theme',
            '--font',
            '--canvas', '{"canvas":"task-cover","table":"任务表","stableIdentityFields":["任务编号"],"promptFields":["任务内容","图片描述"]}',
            '--canvas', '{"canvas":"task-thumbnail","table":"任务表","stableIdentityFields":["任务编号"],"promptFields":["图片描述"]}',
            '--interaction', 'expand',
            '--interaction', 'tabs',
            '--interaction', 'append-input',
            '--interaction', 'image-generate',
            '--json',
        ]);
        runCli('project-add-display.mjs', [
            '--project', displays.projectFile,
            '--table', '纪要表',
            '--field', '编码索引',
            '--id', 'summary-task-popup',
            '--name', '纪要与任务浮窗',
            '--kind', 'popup',
            '--target', '{"table":"纪要表","fields":["编码索引","概览"]}',
            '--target', '{"table":"任务表","fields":["任务编号","任务内容"]}',
            '--mount', 'displays/summary-task-popup/mount.js',
            '--theme',
            '--font',
            '--json',
        ]);
        runCli('project-add-display.mjs', [
            '--project', displays.projectFile,
            '--table', '纪要表',
            '--field', '编码索引',
            '--id', 'summary-barrage',
            '--name', '纪要弹幕',
            '--kind', 'barrage',
            '--target', '{"table":"纪要表","fields":["编码索引","概览"]}',
            '--target', '{"table":"任务表","fields":["任务编号","任务内容"]}',
            '--mount', 'displays/summary-barrage/mount.js',
            '--json',
        ]);
        runCli('project-status.mjs', ['--project', displays.projectFile, '--confirm', '--json']);

        const displayBundleFile = path.join(runRoot, 'display-bundle.json');
        packProject(displays.projectFile, displayBundleFile);
        const displayBundleText = await fs.readFile(displayBundleFile, 'utf8');
        const displayBundle = JSON.parse(displayBundleText);
        assert.equal(displayBundle.formatVersion, 3, '含展示的真实工坊产物必须使用 v3 Bundle');
        assert.equal(displayBundle.apiVersion, 2, '含展示的真实工坊产物必须使用 api v2');

        const importedDisplay = importContentPreset(displayBundleText);
        const inline = importedDisplay.displays.find(display => display.id === 'task-inline');
        const popup = importedDisplay.displays.find(display => display.id === 'summary-task-popup');
        const barrage = importedDisplay.displays.find(display => display.id === 'summary-barrage');
        assert.ok(inline, '宿主必须直接导入真实工坊 inline 展示');
        assert.ok(popup, '宿主必须直接导入真实工坊组合 popup 展示');
        assert.ok(barrage, '宿主必须直接导入真实工坊组合 barrage 展示');
        assert.deepEqual(inline.integrations, { theme: true, font: true }, '宿主不得丢失 inline 顶层 integrations');
        assert.deepEqual(inline.imageGeneration, {
            canvases: [
                {
                    tableName: '任务表',
                    stableIdentityFields: ['任务编号'],
                    canvas: 'task-cover',
                    promptFields: ['任务内容', '图片描述'],
                },
                {
                    tableName: '任务表',
                    stableIdentityFields: ['任务编号'],
                    canvas: 'task-thumbnail',
                    promptFields: ['图片描述'],
                },
            ],
        }, '宿主不得丢失 inline 的多画布生图合同');
        assert.deepEqual(inline.interactions, ['expand', 'tabs', 'append-input', 'image-generate'], '宿主不得丢失 inline 顶层 interactions');
        assert.deepEqual(popup.targets, [
            { tableName: '纪要表', fields: ['编码索引', '概览'] },
            { tableName: '任务表', fields: ['任务编号', '任务内容'] },
        ], '宿主必须保留组合 popup 的全部表和字段合同');
        assert.deepEqual(popup.integrations, { theme: true, font: true }, '宿主不得丢失 popup 顶层 integrations');
        assert.deepEqual(barrage.targets, popup.targets, '宿主必须保留组合 barrage 的全部表和字段合同');

        const pageWithHostCapabilities = await createWorkshopProject({
            root: runRoot,
            id: 'host-page-capabilities-contract',
            name: '宿主导入页面宿主能力合同',
            tables: pageOnlyTables(),
        });
        await writeMount(pageWithHostCapabilities.projectDir, 'pages/profile/mount.js');
        runCli('project-add-item.mjs', [
            '--project', pageWithHostCapabilities.projectFile,
            '--table', '角色表',
            '--field', '角色ID',
            '--field', '姓名',
            '--id', 'profile-page',
            '--name', '角色页',
            '--mount', 'pages/profile/mount.js',
            '--theme',
            '--font',
            '--canvas', '{"tableName":"角色表","stableIdentityFields":["角色ID"],"canvas":"角色头像","promptFields":["姓名"]}',
            '--json',
        ]);
        runCli('project-status.mjs', ['--project', pageWithHostCapabilities.projectFile, '--confirm', '--json']);

        const pageBundleFile = path.join(runRoot, 'page-capabilities-bundle.json');
        packProject(pageWithHostCapabilities.projectFile, pageBundleFile);
        const pageBundleText = await fs.readFile(pageBundleFile, 'utf8');
        const pageBundle = JSON.parse(pageBundleText);
        assert.equal(pageBundle.formatVersion, 3, '声明页面宿主能力的真实工坊产物必须升级为 v3 Bundle');
        assert.equal(pageBundle.apiVersion, 2, '声明页面宿主能力的真实工坊产物必须升级为 api v2');
        assert.deepEqual(pageBundle.manifest.displays, [], '页面专用 v3 Bundle 必须显式保留空 displays');
        const importedPageWithHostCapabilities = importContentPreset(pageBundleText);
        assert.equal(importedPageWithHostCapabilities.formatVersion, 3, '宿主必须直接导入页面能力 v3 Bundle');
        assert.equal(importedPageWithHostCapabilities.apiVersion, 2, '宿主必须直接导入页面能力 api v2 Bundle');
        assert.deepEqual(importedPageWithHostCapabilities.displays, [], '宿主必须保留页面专用 Bundle 的空 displays');
        assert.deepEqual(importedPageWithHostCapabilities.manifest.items[0].integrations, {
            theme: true,
            font: true,
        }, '宿主不得丢失页面 item 的主题与字体接口');
        assert.deepEqual(importedPageWithHostCapabilities.manifest.items[0].imageGeneration, {
            canvases: [
                {
                    tableName: '角色表',
                    stableIdentityFields: ['角色ID'],
                    canvas: '角色头像',
                    promptFields: ['姓名'],
                },
            ],
        }, '宿主不得丢失页面 item 的生图画布合同');

        const pageOnly = await createWorkshopProject({
            root: runRoot,
            id: 'host-page-only-contract',
            name: '宿主导入页面兼容合同',
            tables: pageOnlyTables(),
        });
        await writeMount(pageOnly.projectDir, 'pages/profile/mount.js');
        runCli('project-add-item.mjs', [
            '--project', pageOnly.projectFile,
            '--table', '角色表',
            '--field', '角色ID',
            '--field', '姓名',
            '--id', 'profile-page',
            '--name', '角色页',
            '--mount', 'pages/profile/mount.js',
            '--json',
        ]);
        runCli('project-status.mjs', ['--project', pageOnly.projectFile, '--confirm', '--json']);

        const pageOnlyBundleFile = path.join(runRoot, 'page-only-bundle.json');
        packProject(pageOnly.projectFile, pageOnlyBundleFile);
        const pageOnlyBundleText = await fs.readFile(pageOnlyBundleFile, 'utf8');
        const pageOnlyBundle = JSON.parse(pageOnlyBundleText);
        assert.equal(pageOnlyBundle.formatVersion, 2, '纯页面真实工坊产物必须继续使用 v2 Bundle');
        assert.equal(pageOnlyBundle.apiVersion, 1, '纯页面真实工坊产物必须继续使用 api v1');
        assert.equal(Object.hasOwn(pageOnlyBundle.manifest, 'displays'), false, '纯页面 Bundle 不得伪造空 displays');
        const importedPageOnly = importContentPreset(pageOnlyBundleText);
        assert.equal(importedPageOnly.formatVersion, 2, '宿主必须继续直接导入纯页面 v2 Bundle');
        assert.equal(importedPageOnly.apiVersion, 1, '宿主必须继续直接导入纯页面 api v1 Bundle');
        assert.equal('displays' in importedPageOnly, false, '宿主不得为 v2 Bundle 伪造展示记录');
    } finally {
        await fs.rm(runRoot, { recursive: true, force: true });
    }
}

main()
    .then(() => console.log('[yuzi-beautify-host-import-contract] 检查通过'))
    .catch(error => {
        console.error(`[yuzi-beautify-host-import-contract] 检查失败：${error.message}`);
        process.exitCode = 1;
    });
