import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAiWorkflow } from '../tools/verify-ai-workflow.mjs';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryRoot = path.join(projectRoot, '.tmp-tests', 'workflow-validator');
const createdRoots = [];
const fixtureExclusions = new Set([
  '.analysis-archive',
  '.analysis-cache.md',
  '.limcode',
  '.tmp-tests',
  'node_modules',
  'output',
]);

async function makeTemporaryRoot(prefix) {
  await fs.mkdir(temporaryRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporaryRoot, prefix));
  createdRoots.push(root);
  return root;
}

async function copyFixtureProject(destination) {
  const entries = await fs.readdir(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (fixtureExclusions.has(entry.name)) continue;
    await fs.cp(path.join(projectRoot, entry.name), path.join(destination, entry.name), {
      recursive: entry.isDirectory(),
      filter: source => !fixtureExclusions.has(path.basename(source)),
    });
  }
}

async function withFixture(run) {
  const root = await makeTemporaryRoot('fixture-');
  try {
    await copyFixtureProject(root);
    const workflowFile = path.join(root, 'data', 'workflow-index.json');
    const packageFile = path.join(root, 'package.json');
    const workflow = JSON.parse(await fs.readFile(workflowFile, 'utf8'));
    const packageJson = JSON.parse(await fs.readFile(packageFile, 'utf8'));
    await run({ root, workflowFile, packageFile, workflow, packageJson });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function expectInvalid(mutate, expected) {
  await withFixture(async fixture => {
    await mutate(fixture);
    await fs.writeFile(fixture.workflowFile, `${JSON.stringify(fixture.workflow, null, 2)}\n`);
    await fs.writeFile(fixture.packageFile, `${JSON.stringify(fixture.packageJson, null, 2)}\n`);
    let result;
    await assert.doesNotReject(async () => {
      result = await validateAiWorkflow(fixture.root);
    }, '畸形输入必须返回 errors，不能抛异常');
    assert.equal(result.ok, false, `变异必须失败：${expected}`);
    assert.match(result.errors.join('\n'), expected);
  });
}

try {
  const baseline = await validateAiWorkflow(projectRoot);
  assert.deepEqual(baseline.errors, [], `当前工作流必须有效：\n${baseline.errors.join('\n')}`);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.popupAuthoring.askInterfaceFirst = false;
  }, /popupAuthoring.askInterfaceFirst/);
  await expectInvalid(({ workflow }) => {
    workflow.processContract.popupAuthoring.multiTableKinds = ['inline', 'popup'];
  }, /popupAuthoring.multiTableKinds/);
  await expectInvalid(({ workflow }) => {
    workflow.processContract.popupAuthoring.interfaceNames[0] = '快速浏览';
  }, /popupAuthoring.interfaceNames/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.popupAuthoring.askInlineImageButton = false;
  }, /askInlineImageButton/);
  await expectInvalid(({ workflow }) => {
    workflow.processContract.hostCapabilities.requireUserImageIdentityChoice = false;
  }, /requireUserImageIdentityChoice/);
  await expectInvalid(({ workflow }) => {
    workflow.processContract.hostCapabilities.singleRowIdentityExemption = true;
  }, /singleRowIdentityExemption/);

  await expectInvalid(({ workflow }) => {
    workflow.schemaVersion = 1;
  }, /schemaVersion 必须为 2/);

  await expectInvalid(({ workflow }) => {
    workflow.commandContract.scripts['project:new'] = 'node tools/project-status.mjs';
  }, /commandContract\.scripts\.project:new 合同不匹配/);

  await expectInvalid(({ packageJson }) => {
    packageJson.scripts['project:new'] = 'node tools/project-status.mjs';
  }, /package\.json script 合同不匹配：project:new/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.phaseOrder = ['setup', 'release', 'per-table'];
  }, /processContract\.phaseOrder/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.guidance.neverChooseForUser = false;
  }, /processContract\.guidance\.neverChooseForUser/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.guidance.plainLanguageFirst = false;
  }, /processContract\.guidance\.plainLanguageFirst/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.guidance.recommendNextStepAtEveryDecisionGate = false;
  }, /processContract\.guidance\.recommendNextStepAtEveryDecisionGate/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.intake.splitBeforeClarification = false;
  }, /processContract\.intake\.splitBeforeClarification/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.intake.postSplitChoices = ['edit-markdown-first'];
  }, /processContract\.intake\.postSplitChoices/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.defaultCoverage = 'selected-tables';
  }, /processContract\.tableLoop\.defaultCoverage/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.oneTableAtATime = false;
  }, /processContract\.tableLoop\.oneTableAtATime/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.batchBypass = 'allowed';
  }, /processContract\.tableLoop\.batchBypass/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.skip.requiresExplicitUserDecision = false;
  }, /processContract\.tableLoop\.skip\.requiresExplicitUserDecision/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.skip.requiresReason = false;
  }, /processContract\.tableLoop\.skip\.requiresReason/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.preview.askEveryCompletedTable = false;
  }, /processContract\.tableLoop\.preview\.askEveryCompletedTable/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.tableLoop.preview.executionOptional = false;
  }, /processContract\.tableLoop\.preview\.executionOptional/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.schemaChange.explainImpactBeforeEdit = false;
  }, /processContract\.schemaChange\.explainImpactBeforeEdit/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.schemaChange.requiresExplicitUserConfirmation = false;
  }, /processContract\.schemaChange\.requiresExplicitUserConfirmation/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.schemaChange.preserveOriginal = 'tables/generated/tables.json';
  }, /processContract\.schemaChange\.preserveOriginal/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.schemaChange.removedTablesLeaveQueueOnRefresh = false;
  }, /processContract\.schemaChange\.removedTablesLeaveQueueOnRefresh/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.verification.routineTableEdit = ['full-verify'];
  }, /processContract\.verification\.routineTableEdit/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.releaseGate.requiresAllQueueTerminal = false;
  }, /processContract\.releaseGate\.requiresAllQueueTerminal/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.releaseGate.requiresExplicitUserConfirmation = false;
  }, /processContract\.releaseGate\.requiresExplicitUserConfirmation/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.releaseGate.orderedCapabilities = ['project-status', 'pack-bundle', 'confirm-project', 'release-check', 'readback-bundle'];
  }, /processContract\.releaseGate\.orderedCapabilities/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.releaseGate.bundleWritesTables = true;
  }, /processContract\.releaseGate\.bundleWritesTables/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.deliverables.pop();
  }, /processContract\.deliverables 合同不匹配：数组长度应为 3/);

  await expectInvalid(({ workflow }) => {
    workflow.processContract.deliverables[1].independent = false;
  }, /processContract\.deliverables\[1\]\.independent/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps.reverse();
  }, /workflow steps 必须严格按 setup → per-table → release 排列/);

  await expectInvalid(({ workflow }) => {
    const step = workflow.workflows[0].steps[1];
    step.requiredProjectCapabilities = step.requiredProjectCapabilities.filter(value => value !== 'preview');
    step.checks = step.checks.filter(check => check.capability !== 'preview');
  }, /step per-table requiredProjectCapabilities/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps[1].checks.find(check => check.capability === 'add-item').command = 'npm run project:add-item -- --project <project.json>';
  }, /capability add-item 命令合同不匹配/);

  await expectInvalid(({ workflow }) => {
    const checks = workflow.workflows[0].steps[2].checks;
    [checks[1], checks[3]] = [checks[3], checks[1]];
  }, /step release checks capability 顺序/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps[1].checks.find(check => check.capability === 'preview').optional = false;
  }, /step per-table projectCommand 非可选命令不能声明 condition/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps[0].requiredReads.push('docs/missing.md');
  }, /requiredReads 无效：docs\/missing\.md/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps[0].outputs[0].path = '..\\outside.json';
  }, /output\.path 必须是规范的项目内相对路径/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps[0].unexpected = true;
  }, /step setup 包含未知字段：unexpected/);

  await expectInvalid(({ workflow }) => {
    workflow.workflows[0].steps[0].checks[0].unexpected = true;
  }, /projectCommand 包含未知字段：unexpected/);

  await expectInvalid(({ workflow }) => {
    workflow.runtimeBoundary.requiredEvidence = workflow.runtimeBoundary.requiredEvidence.filter(value => value !== 'real-sillytavern-csp');
  }, /runtimeBoundary\.requiredEvidence/);

  await expectInvalid(async ({ root }) => {
    await fs.writeFile(path.join(root, 'prompts', '6-遗漏阶段.md'), '# 未登记阶段\n');
  }, /编号阶段 prompt 未登记/);

  await expectInvalid(async ({ root }) => {
    const readme = path.join(root, 'README.md');
    const content = await fs.readFile(readme, 'utf8');
    await fs.writeFile(readme, content.replaceAll('npm run project:new', 'npm run project:status'));
  }, /README\.md 缺少流程合同片段：npm run project:new/);

  await expectInvalid(async ({ root }) => {
    await fs.appendFile(path.join(root, 'README.md'), '\n`npm run missing-script`\n');
  }, /README\.md 引用未知 npm script：missing-script/);

  await expectInvalid(async ({ root }) => {
    await fs.appendFile(path.join(root, 'README.md'), '\n`node tools/missing-tool.mjs x`\n');
  }, /README\.md 引用工具 无效：tools\/missing-tool\.mjs/);

  await expectInvalid(async ({ root }) => {
    await fs.rename(path.join(root, 'prompts'), path.join(root, 'prompts-missing'));
  }, /无法读取 prompts 目录/);

  const symlinkRoot = await makeTemporaryRoot('symlink-project-');
  const outsideRoot = await makeTemporaryRoot('symlink-outside-');
  try {
    await copyFixtureProject(symlinkRoot);
    const workflowFile = path.join(symlinkRoot, 'data', 'workflow-index.json');
    const workflow = JSON.parse(await fs.readFile(workflowFile, 'utf8'));
    const outsidePrompt = path.join(outsideRoot, 'outside.md');
    await fs.writeFile(outsidePrompt, '# outside\n');
    let symlinkSupported = true;
    try {
      await fs.symlink(outsidePrompt, path.join(symlinkRoot, 'outside-link.md'), 'file');
      await fs.symlink(path.join(symlinkRoot, 'AGENTS.md'), path.join(symlinkRoot, 'inside-link.md'), 'file');
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
      symlinkSupported = false;
      console.warn(`[workflow-validator-tests] 跳过 symlink containment：${error.code}`);
    }
    if (symlinkSupported) {
      workflow.workflows[0].steps[0].requiredReads.push('outside-link.md');
      await fs.writeFile(workflowFile, `${JSON.stringify(workflow, null, 2)}\n`);
      const escaped = await validateAiWorkflow(symlinkRoot);
      assert.equal(escaped.ok, false);
      assert.match(escaped.errors.join('\n'), /requiredReads 无效：outside-link\.md（越出项目目录）/);

      workflow.workflows[0].steps[0].requiredReads = workflow.workflows[0].steps[0].requiredReads.filter(value => value !== 'outside-link.md');
      workflow.workflows[0].steps[0].requiredReads.push('inside-link.md');
      await fs.writeFile(workflowFile, `${JSON.stringify(workflow, null, 2)}\n`);
      assert.equal((await validateAiWorkflow(symlinkRoot)).ok, true, '指向项目内普通文件的 symlink 应允许');
    }
  } finally {
    await fs.rm(symlinkRoot, { recursive: true, force: true });
    await fs.rm(outsideRoot, { recursive: true, force: true });
  }

  assert.equal(createdRoots.every(root => root.startsWith(`${temporaryRoot}${path.sep}`)), true, '所有 workflow 测试临时目录必须位于项目内 .tmp-tests');
  console.log('[workflow-validator-tests] 通过');
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
