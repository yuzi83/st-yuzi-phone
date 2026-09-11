import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  checkWorkflowProject,
  createProject,
  getProjectStatus,
  importProjectTables,
} from '../tools/project-lib.mjs';
import { buildBundle, readJson, serializeBundle } from '../tools/lib.mjs';
import { readbackPreset } from '../tools/readback-preset.mjs';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('..', import.meta.url));
const scratchRoot = fileURLToPath(new URL('../.tmp-tests/', import.meta.url));
await fs.mkdir(scratchRoot, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(scratchRoot, 'display-workflow-'));

try {
  const project = await createProject({
    projectsDir: path.join(runRoot, 'projects'),
    id: 'inline-only',
    name: '只做正文展示',
  });
  await importProjectTables({
    projectFile: project.projectFile,
    inputFile: path.join(root, 'tables', 'generated', '纪要.json'),
  });

  const mountPath = path.join(project.projectDir, 'displays', 'summary-inline', 'mount.js');
  await fs.mkdir(path.dirname(mountPath), { recursive: true });
  await fs.writeFile(mountPath, 'export function mount(context){ context.root.textContent = context.getState().tableName; return () => {}; }\n', 'utf8');

  const addDisplayCli = path.join(root, 'tools', 'project-add-display.mjs');
  await execFile(process.execPath, [
    addDisplayCli,
    '--project', project.projectFile,
    '--table', '纪要表',
    '--id', 'summary-inline',
    '--name', '纪要正文卡片',
    '--kind', 'inline',
    '--field', '编码索引',
    '--field', '概览',
    '--mount', 'displays/summary-inline/mount.js',
    '--json',
  ]);

  const sourceProject = await readJson(project.projectFile);
  assert.deepEqual(sourceProject.manifest.items, [], '展示-only 不得伪造手机页面 item');
  assert.equal(sourceProject.manifest.displays.length, 1);
  assert.deepEqual(sourceProject.manifest.displays[0], {
    id: 'summary-inline',
    name: '纪要正文卡片',
    kind: 'inline',
    targets: [{ tableName: '纪要表', fields: ['编码索引', '概览'] }],
    entry: { mount: 'displays/summary-inline/mount.js' },
    assets: [],
  });

  const status = await getProjectStatus({ projectFile: project.projectFile });
  assert.equal(status.queue[0].itemId, null, '正文展示不应占用页面应用槽');
  assert.equal(status.queue[0].display.id, 'summary-inline');
  assert.equal(status.queue[0].status, 'completed');
  assert.equal((await checkWorkflowProject(project.projectFile, { mode: 'draft' })).ok, true);

  const bundle = await buildBundle(project.projectFile);
  assert.equal(bundle.formatVersion, 3);
  assert.equal(bundle.apiVersion, 2);
  assert.equal(bundle.manifest.displays[0].id, 'summary-inline');

  await getProjectStatus({ projectFile: project.projectFile, confirm: true });
  const bundleFile = path.join(runRoot, 'inline-only-preset.json');
  await fs.writeFile(bundleFile, serializeBundle(bundle), 'utf8');
  const readback = await readbackPreset({ projectFile: project.projectFile, file: bundleFile });
  assert.equal(readback.itemCount, 0, '展示-only 回读不应伪造页面 item');
} finally {
  await fs.rm(runRoot, { recursive: true, force: true });
}

console.log('[display-workflow-tests] 通过');
