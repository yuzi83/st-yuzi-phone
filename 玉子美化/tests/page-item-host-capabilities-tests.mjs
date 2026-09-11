import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  createProject,
  importProjectTables,
} from '../tools/project-lib.mjs';
import { buildBundle, readJson, validateBundle } from '../tools/lib.mjs';
import { buildPreviewSession } from '../tools/preview-preset.mjs';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('..', import.meta.url));
const scratchRoot = fileURLToPath(new URL('../.tmp-tests/', import.meta.url));
await fs.mkdir(scratchRoot, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(scratchRoot, 'page-item-host-capabilities-'));

async function writeMount(projectDir, id) {
  const relative = `pages/${id}/mount.js`;
  const file = path.join(projectDir, ...relative.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'export function mount(context) { context.root.textContent = context.getState().tableName; return () => {}; }\n', 'utf8');
  return relative;
}

async function runAddItem(args) {
  return execFile(process.execPath, [path.join(root, 'tools', 'project-add-item.mjs'), ...args]);
}

try {
  const legacy = await createProject({
    projectsDir: path.join(runRoot, 'projects'),
    id: 'legacy-page-item',
    name: '旧页面 item',
  });
  const tables = await readJson(path.join(root, 'tables', 'generated', '纪要.json'));
  const tablesFile = path.join(runRoot, 'tables.json');
  await fs.writeFile(tablesFile, `${JSON.stringify(tables, null, 2)}\n`, 'utf8');
  await importProjectTables({ projectFile: legacy.projectFile, inputFile: tablesFile });
  const legacyMount = await writeMount(legacy.projectDir, 'legacy');
  await runAddItem([
    '--project', legacy.projectFile,
    '--table', '纪要表',
    '--id', 'legacy-item',
    '--field', '编码索引',
    '--mount', legacyMount,
    '--json',
  ]);
  const legacyBundle = await buildBundle(legacy.projectFile);
  assert.equal(legacyBundle.formatVersion, 2, '没有宿主能力的页面 item 必须继续产出 v2');
  assert.equal(legacyBundle.apiVersion, 1);
  assert.equal('displays' in legacyBundle.manifest, false, '旧页面 Bundle 不得伪造空 displays');

  const enabled = await createProject({
    projectsDir: path.join(runRoot, 'projects'),
    id: 'page-item-host-capabilities',
    name: '页面 item 宿主能力',
  });
  await importProjectTables({ projectFile: enabled.projectFile, inputFile: tablesFile });
  const enabledMount = await writeMount(enabled.projectDir, 'enabled');
  await runAddItem([
    '--project', enabled.projectFile,
    '--table', '纪要表',
    '--id', 'summary-item',
    '--field', '编码索引',
    '--field', '概览',
    '--mount', enabledMount,
    '--theme',
    '--font',
    '--canvas', '{"tableName":"纪要表","stableIdentityFields":["编码索引"],"canvas":"cover","promptFields":["概览"],"promptSuffix":"正方形构图；用户补充：柔和光线"}',
    '--canvas', '{"tableName":"纪要表","stableIdentityFields":["编码索引"],"canvas":"thumbnail","promptFields":["概览"]}',
    '--json',
  ]);

  const sourceProject = await readJson(enabled.projectFile);
  const item = sourceProject.manifest.items[0];
  assert.deepEqual(item.integrations, { theme: true, font: true }, 'CLI 必须把主题与字体声明写入页面 item');
  assert.deepEqual(item.imageGeneration, {
    canvases: [
      {
        tableName: '纪要表',
        stableIdentityFields: ['编码索引'],
        canvas: 'cover',
        promptFields: ['概览'],
        promptSuffix: '正方形构图；用户补充：柔和光线',
      },
      {
        tableName: '纪要表',
        stableIdentityFields: ['编码索引'],
        canvas: 'thumbnail',
        promptFields: ['概览'],
      },
    ],
  }, 'CLI 必须支持重复 --canvas，并只保留页面 item 合同字段');
  assert.equal('interactions' in item, false, '页面 item 不得产生 interactions 字段');

  const bundle = await buildBundle(enabled.projectFile);
  assert.equal(bundle.formatVersion, 3, '页面 item 声明宿主能力时必须升级为 v3');
  assert.equal(bundle.apiVersion, 2);
  assert.deepEqual(bundle.manifest.displays, [], '页面 item 专用 v3 Bundle 必须显式保留空 displays');
  assert.deepEqual(bundle.manifest.items[0].imageGeneration, item.imageGeneration);
  const invalidSuffix = structuredClone(bundle);
  invalidSuffix.manifest.items[0].imageGeneration.canvases[0].promptSuffix = 42;
  assert.equal(validateBundle(invalidSuffix, { strict: true }).ok, false);
  const invalidInteraction = structuredClone(bundle);
  invalidInteraction.manifest.items[0].interactions = ['tabs'];
  assert.equal(validateBundle(invalidInteraction, { strict: true }).ok, false, '页面 item 合同不得接受 interactions');

  const preview = await buildPreviewSession(enabled.projectFile, { item: 'summary-item' });
  assert.deepEqual(preview.bundle.manifest.items[0].integrations, item.integrations, '预览必须使用包含页面能力声明的 Bundle');
  assert.deepEqual(preview.bundle.manifest.items[0].imageGeneration, item.imageGeneration);
  assert.deepEqual(preview.itemMock.imageGeneration, item.imageGeneration, '预览 item Mock 必须向制作期页面暴露作者声明的画布');

  await assert.rejects(
    () => runAddItem([
      '--project', enabled.projectFile,
      '--table', '纪要表',
      '--id', 'bad-item',
      '--field', '编码索引',
      '--mount', enabledMount,
      '--canvas', '{"tableName":"其他表","stableIdentityFields":["编码索引"],"canvas":"invalid","promptFields":["概览"]}',
    ]),
    /tableName|归属表|目标表/,
    '页面画布必须只能归属自身 target.tableName',
  );
  await assert.rejects(
    () => runAddItem([
      '--project', enabled.projectFile,
      '--table', '纪要表',
      '--id', 'bad-field-item',
      '--field', '编码索引',
      '--mount', enabledMount,
      '--replace',
      '--canvas', '{"tableName":"纪要表","stableIdentityFields":["编码索引"],"canvas":"invalid-field","promptFields":["概览"]}',
    ]),
    /不存在字段|字段合同/,
    '页面画布字段必须是 item.target.fields 的子集',
  );
} finally {
  await fs.rm(runRoot, { recursive: true, force: true });
}

console.log('[page-item-host-capabilities-tests] 通过');
