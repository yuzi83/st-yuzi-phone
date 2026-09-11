import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { checkPresetItem } from '../tools/check-item.mjs';
import { assertProjectRelease, checkPresetFile } from '../tools/check-preset.mjs';
import { packPreset, parsePackArguments } from '../tools/pack-preset.mjs';
import {
  addProjectItem,
  createProject,
  getProjectStatus,
  importProjectTables,
  workflowSummaryHash,
} from '../tools/project-lib.mjs';
import { readbackPreset } from '../tools/readback-preset.mjs';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const temporaryBase = path.join(projectRoot, '.tmp-tests');
const fixtureTables = path.join(projectRoot, 'tables', 'generated', '纪要.json');
const packTool = path.join(projectRoot, 'tools', 'pack-preset.mjs');
const readbackTool = path.join(projectRoot, 'tools', 'readback-preset.mjs');
const checkTool = path.join(projectRoot, 'tools', 'check-preset.mjs');
const checkItemTool = path.join(projectRoot, 'tools', 'check-item.mjs');

// Adding support for optional displays must not invalidate an unchanged legacy confirmation.
const legacyProject = JSON.parse(await fs.readFile(path.join(projectRoot, 'examples/project.json'), 'utf8'));
const legacyState = JSON.parse(await fs.readFile(path.join(projectRoot, 'examples/workflow-state.json'), 'utf8'));
assert.equal(workflowSummaryHash(legacyProject, legacyState), legacyState.confirmation.summaryHash);
const changedLegacy = structuredClone(legacyState);
changedLegacy.queue[0].preview.status = 'not-run';
assert.notEqual(workflowSummaryHash(legacyProject, changedLegacy), legacyState.confirmation.summaryHash, '真实模拟状态变化仍使确认失效');
const withDisplay = structuredClone(legacyState);
withDisplay.queue[0].displays = [{ id: 'new-display', fields: ['姓名'] }];
assert.notEqual(workflowSummaryHash(legacyProject, withDisplay), legacyState.confirmation.summaryHash, '新增展示仍使确认失效');


async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createConfirmedProject(temporaryRoot) {
  const created = await createProject({
    projectsDir: path.join(temporaryRoot, 'projects'),
    id: 'publish-gate',
    name: '发布门禁测试',
    author: '测试作者',
  });
  await importProjectTables({ projectFile: created.projectFile, inputFile: fixtureTables });
  const imported = await getProjectStatus({ projectFile: created.projectFile });
  assert.equal(imported.queue.length, 1, '纪要夹具应只有一张表');
  const [table] = imported.queue;
  await fs.writeFile(
    path.join(created.projectDir, 'page.js'),
    [
      'export function mount(context) {',
      "  context.root.textContent = String(context.getState().rows.length);",
      "  return () => { context.root.textContent = ''; };",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  await addProjectItem({
    projectFile: created.projectFile,
    table: table.sheetKey,
    id: 'summary-panel',
    name: '纪要面板',
    fields: [table.headers[0]],
    mount: 'page.js',
    previewStatus: 'skipped',
    previewNotes: '测试中由用户明确跳过制作期模拟',
  });
  await getProjectStatus({ projectFile: created.projectFile, confirm: true });
  return created;
}

await fs.mkdir(temporaryBase, { recursive: true });
const temporaryRoot = await fs.mkdtemp(path.join(temporaryBase, 'publish-gates-'));

try {
  const created = await createConfirmedProject(temporaryRoot);
  const stateFile = path.join(created.projectDir, 'workflow-state.json');
  const originalFile = path.join(created.projectDir, 'tables', 'original', 'imported.json');
  const sourceMarkdownFile = path.join(created.projectDir, 'tables', 'source', '00-mate.md');
  const generatedFile = path.join(created.projectDir, 'tables', 'generated', 'tables.json');
  const pageSourceFile = path.join(created.projectDir, 'page.js');
  const notesFile = path.join(created.projectDir, 'notes', 'requirements.md');
  const confirmedStateRaw = await fs.readFile(stateFile, 'utf8');
  const confirmedProjectRaw = await fs.readFile(created.projectFile, 'utf8');
  const originalRaw = await fs.readFile(originalFile, 'utf8');
  const sourceMarkdownRaw = await fs.readFile(sourceMarkdownFile, 'utf8');
  const generatedRaw = await fs.readFile(generatedFile, 'utf8');
  const pageSourceRaw = await fs.readFile(pageSourceFile, 'utf8');
  const notesRaw = await fs.readFile(notesFile, 'utf8');

  const release = await assertProjectRelease(created.projectFile);
  assert.equal(release.ok, true);
  assert.equal(release.tablesFile, 'tables/generated/tables.json');

  assert.deepEqual(
    parsePackArguments(['--dry-run', created.projectFile, 'bundle.json', '--overwrite']),
    {
      projectFile: created.projectFile,
      outputFile: 'bundle.json',
      dryRun: true,
      overwrite: true,
    },
  );
  assert.throws(() => parsePackArguments(['a', 'b', '--dry-run', '--dry-run']), /参数重复/);
  assert.throws(() => parsePackArguments(['a', 'b', '--unknown']), /未知参数/);
  assert.throws(() => parsePackArguments(['a']), /用法/);

  const unconfirmed = JSON.parse(confirmedStateRaw);
  unconfirmed.confirmation = { confirmed: false, confirmedAt: null, summaryHash: null };
  await writeJson(stateFile, unconfirmed);
  const rejectedOutput = path.join(temporaryRoot, 'unconfirmed', 'bundle.json');
  await assert.rejects(
    () => packPreset({ projectFile: created.projectFile, outputFile: rejectedOutput }),
    /源码项目未通过发布门禁[\s\S]*用户确认/,
  );
  assert.equal(await exists(path.dirname(rejectedOutput)), false, '门禁失败不得创建输出目录');
  await fs.writeFile(stateFile, confirmedStateRaw);

  const expired = JSON.parse(confirmedStateRaw);
  expired.confirmation.summaryHash = '0'.repeat(64);
  await writeJson(stateFile, expired);
  await assert.rejects(
    () => assertProjectRelease(created.projectFile),
    /用户确认摘要已过期/,
  );
  await fs.writeFile(stateFile, confirmedStateRaw);

  const alternateTablesFile = path.join(created.projectDir, 'tables', 'not-generated.json');
  await fs.copyFile(generatedFile, alternateTablesFile);
  const nonGeneratedProject = JSON.parse(confirmedProjectRaw);
  nonGeneratedProject.tablesFile = 'tables/not-generated.json';
  const nonGeneratedState = JSON.parse(confirmedStateRaw);
  nonGeneratedState.tables.generatedFile = 'tables/not-generated.json';
  await writeJson(created.projectFile, nonGeneratedProject);
  await writeJson(stateFile, nonGeneratedState);
  await assert.rejects(
    () => assertProjectRelease(created.projectFile),
    /tables\/generated\//,
  );
  await fs.writeFile(created.projectFile, confirmedProjectRaw);
  await fs.writeFile(stateFile, confirmedStateRaw);
  await fs.rm(alternateTablesFile, { force: true });

  const invalidTables = JSON.parse(generatedRaw);
  invalidTables.mate.type = 'notChatSheets';
  await writeJson(generatedFile, invalidTables);
  await assert.rejects(
    () => assertProjectRelease(created.projectFile),
    /chatSheets/,
  );
  await fs.writeFile(generatedFile, generatedRaw);

  const dryOutput = path.join(temporaryRoot, 'dry-run-only', 'nested', 'bundle.json');
  const dryResult = await packPreset({
    projectFile: created.projectFile,
    outputFile: dryOutput,
    dryRun: true,
  });
  assert.equal(dryResult.dryRun, true);
  assert.equal(dryResult.itemCount, 1);
  assert.equal(await exists(path.join(temporaryRoot, 'dry-run-only')), false, '--dry-run 必须零写入');

  const cliDryOutput = path.join(temporaryRoot, 'cli-dry-run', 'bundle.json');
  const cliDry = await execFileAsync(
    process.execPath,
    [packTool, created.projectFile, cliDryOutput, '--dry-run'],
    { cwd: projectRoot, windowsHide: true },
  );
  assert.match(cliDry.stdout, /dry-run 通过/);
  assert.equal(await exists(path.dirname(cliDryOutput)), false, 'CLI --dry-run 必须零写入');

  const outputFile = path.join(temporaryRoot, 'delivery', 'bundle.json');
  const packed = await packPreset({ projectFile: created.projectFile, outputFile });
  assert.equal(packed.dryRun, false);
  assert.equal(packed.wouldOverwrite, false);
  const packedRaw = await fs.readFile(outputFile, 'utf8');
  assert.match(packedRaw, /"format": "yuzi-beautify-preset"/);
  assert.equal((await checkPresetFile({ file: outputFile })).ok, true);
  assert.equal((await checkPresetFile({ file: outputFile, tablesFile: fixtureTables })).ok, true);
  assert.equal((await checkPresetItem({ file: outputFile, itemId: 'summary-panel' })).ok, true);
  await assert.rejects(
    () => checkPresetItem({ file: outputFile, itemId: 'missing-item' }),
    /item 不存在/,
  );

  const standaloneDir = path.join(temporaryRoot, 'standalone-bundle');
  await fs.mkdir(standaloneDir, { recursive: true });
  const standaloneBundle = path.join(standaloneDir, 'bundle.json');
  await fs.copyFile(outputFile, standaloneBundle);
  const stateBackup = `${stateFile}.backup`;
  await fs.rename(stateFile, stateBackup);
  try {
    assert.equal((await checkPresetFile({ file: standaloneBundle })).ok, true, '纯 Bundle 检查不得依赖 workflow-state');
    await assert.rejects(() => assertProjectRelease(created.projectFile), /源码项目未通过发布门禁/);
    await assert.rejects(
      () => readbackPreset({ projectFile: created.projectFile, file: standaloneBundle }),
      /源码项目未通过发布门禁/,
    );
  } finally {
    await fs.rename(stateBackup, stateFile);
  }

  const checkCli = await execFileAsync(process.execPath, [checkTool, standaloneBundle], {
    cwd: standaloneDir,
    windowsHide: true,
  });
  assert.match(checkCli.stdout, /Bundle 检查通过/);
  const checkItemCli = await execFileAsync(process.execPath, [checkItemTool, standaloneBundle, 'summary-panel'], {
    cwd: standaloneDir,
    windowsHide: true,
  });
  assert.match(checkItemCli.stdout, /Bundle item 检查通过/);

  const cliOutput = path.join(temporaryRoot, 'cli-delivery', 'bundle.json');
  const cliPack = await execFileAsync(process.execPath, [packTool, created.projectFile, cliOutput], {
    cwd: projectRoot,
    windowsHide: true,
  });
  assert.match(cliPack.stdout, /已输出/);
  await assert.rejects(
    () => execFileAsync(process.execPath, [packTool, created.projectFile, cliOutput], {
      cwd: projectRoot,
      windowsHide: true,
    }),
    error => {
      assert.match(error.stderr, /输出已存在[\s\S]*--overwrite/);
      return true;
    },
  );
  const cliOverwrite = await execFileAsync(
    process.execPath,
    [packTool, created.projectFile, cliOutput, '--overwrite'],
    { cwd: projectRoot, windowsHide: true },
  );
  assert.match(cliOverwrite.stdout, /已输出/);
  const cliReadback = await execFileAsync(
    process.execPath,
    [readbackTool, created.projectFile, cliOutput],
    { cwd: projectRoot, windowsHide: true },
  );
  const cliReadbackReport = JSON.parse(cliReadback.stdout);
  assert.equal(cliReadbackReport.serializedBytesEqual, true);
  assert.equal(cliReadbackReport.itemCount, 1);

  await assert.rejects(
    () => packPreset({ projectFile: created.projectFile, outputFile }),
    /输出已存在[\s\S]*--overwrite/,
  );
  assert.equal(await fs.readFile(outputFile, 'utf8'), packedRaw, '默认覆盖拒绝不得修改原 Bundle');
  await assert.rejects(
    () => packPreset({ projectFile: created.projectFile, outputFile, dryRun: true }),
    /输出已存在[\s\S]*--overwrite/,
  );
  assert.equal(await fs.readFile(outputFile, 'utf8'), packedRaw, '冲突 dry-run 不得修改原 Bundle');

  await fs.writeFile(outputFile, '旧内容', 'utf8');
  const overwritten = await packPreset({
    projectFile: created.projectFile,
    outputFile,
    overwrite: true,
  });
  assert.equal(overwritten.wouldOverwrite, true);
  assert.equal((await checkPresetFile({ file: outputFile })).ok, true, '--overwrite 应安装完整有效 Bundle');
  const deliveryEntries = await fs.readdir(path.dirname(outputFile));
  assert.equal(deliveryEntries.some(name => /\.(?:tmp|backup)$/.test(name)), false, '成功写入后不得残留临时或备份文件');

  const directoryTarget = path.join(temporaryRoot, 'directory-target');
  await fs.mkdir(directoryTarget);
  await assert.rejects(
    () => packPreset({ projectFile: created.projectFile, outputFile: directoryTarget, overwrite: true }),
    /不是普通文件/,
  );

  const protectedProjectFiles = [
    { label: 'project.json', file: created.projectFile, content: confirmedProjectRaw },
    { label: 'workflow-state.json', file: stateFile, content: confirmedStateRaw },
    { label: '原始导入 JSON', file: originalFile, content: originalRaw },
    { label: 'Markdown 事实源', file: sourceMarkdownFile, content: sourceMarkdownRaw },
    { label: 'generated chatSheets', file: generatedFile, content: generatedRaw },
    { label: 'project.files 页面源码', file: pageSourceFile, content: pageSourceRaw },
    { label: '项目 notes 源文件', file: notesFile, content: notesRaw },
  ];
  for (const target of protectedProjectFiles) {
    await assert.rejects(
      () => packPreset({ projectFile: created.projectFile, outputFile: target.file, overwrite: true }),
      /Bundle 必须位于源码项目目录之外/,
      `${target.label} 不得被 Bundle 覆盖`,
    );
    assert.equal(await fs.readFile(target.file, 'utf8'), target.content, `${target.label} 在拒绝后必须保持原样`);
  }

  await assert.rejects(
    () => packPreset({ projectFile: created.projectFile, outputFile: created.projectDir, overwrite: true }),
    /Bundle 必须位于源码项目目录之外/,
    '源码项目根本身不得作为 Bundle 输出目标',
  );

  const nestedProjectOutput = path.join(created.projectDir, 'delivery', 'nested', 'bundle.json');
  await assert.rejects(
    () => packPreset({
      projectFile: created.projectFile,
      outputFile: nestedProjectOutput,
      dryRun: true,
      overwrite: true,
    }),
    /Bundle 必须位于源码项目目录之外/,
  );
  assert.equal(await exists(path.join(created.projectDir, 'delivery')), false, '项目内拒绝路径不得创建输出目录');

  const readback = await readbackPreset({ projectFile: created.projectFile, file: outputFile });
  assert.equal(readback.serializedBytesEqual, true);
  assert.equal(readback.itemCount, 1);
  assert.equal(readback.files.length > 0, true);
  assert.equal(readback.files.every(entry => entry.mimeType && entry.sha256.length === 64), true);

  const readbackUnconfirmed = JSON.parse(confirmedStateRaw);
  readbackUnconfirmed.confirmation = { confirmed: false, confirmedAt: null, summaryHash: null };
  await writeJson(stateFile, readbackUnconfirmed);
  await assert.rejects(
    () => readbackPreset({ projectFile: created.projectFile, file: outputFile }),
    /源码项目未通过发布门禁[\s\S]*用户确认/,
  );
  await fs.writeFile(stateFile, confirmedStateRaw);

  console.log('[publish-gates-tests] 通过');
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
