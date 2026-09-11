import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  addProjectDisplay,
  checkWorkflowProject,
  createProject,
  getProjectStatus,
  importProjectTables,
} from '../tools/project-lib.mjs';
import { buildBundle, readJson, serializeBundle } from '../tools/lib.mjs';
import { buildPreviewSession } from '../tools/preview-preset.mjs';
import { readbackPreset } from '../tools/readback-preset.mjs';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('..', import.meta.url));
const scratchRoot = fileURLToPath(new URL('../.tmp-tests/', import.meta.url));
await fs.mkdir(scratchRoot, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(scratchRoot, 'display-authoring-'));

async function writeMount(projectDir, id) {
  const relative = `displays/${id}/mount.js`;
  const file = path.join(projectDir, ...relative.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'export function mount(context) { context.root.textContent = context.getState().tableName; return () => {}; }\n', 'utf8');
  return relative;
}

async function runAddDisplay(args) {
  return execFile(process.execPath, [path.join(root, 'tools', 'project-add-display.mjs'), ...args]);
}

try {
  const project = await createProject({
    projectsDir: path.join(runRoot, 'projects'),
    id: 'display-authoring',
    name: '展示制作合同',
  });
  const tables = await readJson(path.join(root, 'tables', 'generated', '纪要.json'));
  tables.sheet_tasks = {
    ...structuredClone(tables.sheet_summary),
    uid: 'sheet_tasks',
    name: '任务表',
    orderNo: 1,
    content: [['任务编号', '任务内容', '图片描述']],
  };
  const tablesFile = path.join(runRoot, 'tables.json');
  await fs.writeFile(tablesFile, `${JSON.stringify(tables, null, 2)}\n`, 'utf8');
  await importProjectTables({ projectFile: project.projectFile, inputFile: tablesFile });

  const popupMount = await writeMount(project.projectDir, 'summary-popup');
  const barrageMount = await writeMount(project.projectDir, 'summary-barrage');
  const inlineMount = await writeMount(project.projectDir, 'task-inline');

  await runAddDisplay([
    '--project', project.projectFile,
    '--table', '纪要表',
    '--field', '编码索引',
    '--id', 'summary-popup',
    '--name', '纪要浮窗',
    '--kind', 'popup',
    '--target', '{"table":"纪要表","fields":["编码索引","概览"]}',
    '--mount', popupMount,
    '--theme',
    '--font',
    '--json',
  ]);

  await runAddDisplay([
    '--project', project.projectFile,
    '--table', '纪要表',
    '--field', '概览',
    '--id', 'summary-barrage',
    '--name', '纪要弹幕',
    '--kind', 'barrage',
    '--mount', barrageMount,
    '--json',
  ]);

  await runAddDisplay([
    '--project', project.projectFile,
    '--table', '任务表',
    '--field', '任务编号',
    '--field', '任务内容',
    '--field', '图片描述',
    '--id', 'task-inline',
    '--name', '任务正文卡片',
    '--kind', 'inline',
    '--target', '{"table":"纪要表","fields":["编码索引","概览"]}',
    '--target', '{"table":"任务表","fields":["任务编号","任务内容","图片描述"]}',
    '--mount', inlineMount,
    '--theme',
    '--canvas', '{"canvas":"task-cover","table":"任务表","stableIdentityFields":["任务编号"],"promptFields":["任务内容","图片描述"]}',
    '--canvas', '{"canvas":"task-thumbnail","table":"任务表","stableIdentityFields":["任务编号"],"promptFields":["图片描述"]}',
    '--interaction', 'expand',
    '--interaction', 'tabs',
    '--interaction', 'append-input',
    '--interaction', 'image-generate',
    '--json',
  ]);

  await assert.rejects(
    () => runAddDisplay([
      '--project', project.projectFile,
      '--table', '任务表',
      '--field', '任务编号',
      '--id', 'blocked-popup-interaction',
      '--name', '不可点击浮窗',
      '--kind', 'popup',
      '--mount', popupMount,
      '--interaction', 'append-input',
    ]),
    /仅 inline 展示/,
  );
  await assert.rejects(
    () => runAddDisplay([
      '--project', project.projectFile,
      '--table', '纪要表',
      '--field', '编码索引',
      '--id', 'blocked-popup-image',
      '--name', '不可生图浮窗',
      '--kind', 'popup',
      '--mount', popupMount,
      '--canvas', '{"canvas":"blocked","table":"纪要表","stableIdentityFields":["编码索引"],"promptFields":["概览"]}',
    ]),
    /仅 inline 展示/,
  );

  const beforeProject = await fs.readFile(project.projectFile, 'utf8');
  const workflowFile = path.join(project.projectDir, 'workflow-state.json');
  const beforeState = await fs.readFile(workflowFile, 'utf8');
  for (const kind of ['popup', 'barrage']) {
    for (const mode of [[], ['--dry-run'], ['--replace']]) {
      await assert.rejects(() => runAddDisplay([
        '--project', project.projectFile, '--id', 'summary-popup', '--name', '不允许的组合弹窗',
        '--kind', kind, '--mount', popupMount,
        '--target', '{"table":"纪要表","fields":["编码索引"]}',
        '--target', '{"table":"任务表","fields":["任务编号"]}', ...mode,
      ]), /只有弹窗／插入正文可以多表组合/);
      assert.equal(await fs.readFile(project.projectFile, 'utf8'), beforeProject, '拒绝时不能改项目');
      assert.equal(await fs.readFile(workflowFile, 'utf8'), beforeState, '拒绝时不能改状态');
    }
  }
  await assert.rejects(() => addProjectDisplay({ projectFile: project.projectFile, table: '纪要表', id: 'missing-kind', fields: ['编码索引'], mount: popupMount }), /请先选择弹窗接口/, '不默认替用户选择插入正文');

  const sourceProject = await readJson(project.projectFile);
  const popup = sourceProject.manifest.displays.find(display => display.id === 'summary-popup');
  assert.deepEqual(popup.targets, [
    { tableName: '纪要表', fields: ['编码索引', '概览'] },
  ], '弹窗／浮窗只能绑定单表');
  assert.deepEqual(popup.integrations, {
    theme: true,
    font: true,
  }, '浮窗只能打包可选主题、字体接入声明');
  assert.equal('interfaces' in popup, false, '正式 display 合同不得保留 interfaces 包装');
  assert.equal('imageGeneration' in popup, false, '浮窗不得声明生图');
  const inline = sourceProject.manifest.displays.find(display => display.id === 'task-inline');
  assert.deepEqual(inline.targets.map(target => target.tableName), ['纪要表', '任务表'], '只有弹窗／插入正文制作多表组合');
  assert.deepEqual(inline.imageGeneration, {
    canvases: [
      {
        canvas: 'task-cover',
        tableName: '任务表',
        stableIdentityFields: ['任务编号'],
        promptFields: ['任务内容', '图片描述'],
      },
      {
        canvas: 'task-thumbnail',
        tableName: '任务表',
        stableIdentityFields: ['任务编号'],
        promptFields: ['图片描述'],
      },
    ],
  }, '正文展示必须保留多画布与稳定身份字段合同');
  assert.deepEqual(inline.interactions, ['expand', 'tabs', 'append-input', 'image-generate'], '只有正文展示可以声明局部交互能力');
  assert.deepEqual(inline.integrations, { theme: true }, '主题接入必须输出为顶层 integrations');

  const status = await getProjectStatus({ projectFile: project.projectFile });
  assert.equal(status.queue.find(entry => entry.tableName === '纪要表').displays.length, 3);
  assert.equal(status.queue.find(entry => entry.tableName === '任务表').displays.length, 1);
  assert.equal((await checkWorkflowProject(project.projectFile, { mode: 'draft' })).ok, true);

  const preview = await buildPreviewSession(project.projectFile, { display: 'task-inline', table: '任务表' });
  assert.equal(preview.selectedDisplayId, 'task-inline');
  assert.deepEqual(preview.displayMock.targets.map(target => target.tableName), ['纪要表', '任务表']);
  assert.equal(preview.displayMock.integrations.theme, true);

  const bundle = await buildBundle(project.projectFile);
  assert.equal(bundle.formatVersion, 3);
  assert.equal(bundle.apiVersion, 2);
  assert.deepEqual(bundle.manifest.displays.find(display => display.id === 'task-inline').imageGeneration.canvases[0].stableIdentityFields, ['任务编号']);

  await getProjectStatus({ projectFile: project.projectFile, confirm: true });
  const bundleFile = path.join(runRoot, 'display-authoring-preset.json');
  await fs.writeFile(bundleFile, serializeBundle(bundle), 'utf8');
  const readback = await readbackPreset({ projectFile: project.projectFile, file: bundleFile });
  assert.equal(readback.displayCount, 3, '回读必须保留三类展示而不伪造页面');
} finally {
  await fs.rm(runRoot, { recursive: true, force: true });
}

console.log('[display-authoring-tests] 通过');
