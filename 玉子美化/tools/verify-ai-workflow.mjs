import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const DRIVE_PATTERN = /^[a-z]:/i;
const ALLOWED_SCOPES = new Set(['bundle-source', 'read-only-audit', 'runtime-validation']);
const ALLOWED_RISKS = new Set(['low', 'medium', 'high']);

const EXPECTED_STAGE_PROMPTS = [
  'prompts/0-总览与启动.md',
  'prompts/1-建项导表与全表盘点.md',
  'prompts/2-逐表需求与字段合同.md',
  'prompts/3-逐表设计与实现.md',
  'prompts/4-单表检查与模拟.md',
  'prompts/5-汇总确认与交付.md',
];

const EXPECTED_SCRIPTS = {
  'project:add-display': 'node tools/project-add-display.mjs',
  'project:new': 'node tools/project-new.mjs',
  'project:import-tables': 'node tools/project-import-tables.mjs',
  'project:add-item': 'node tools/project-add-item.mjs',
  'project:skip-table': 'node tools/project-skip-table.mjs',
  'project:status': 'node tools/project-status.mjs',
  'project:check': 'node tools/project-check.mjs',
  preview: 'node tools/preview-preset.mjs',
  'tables:cli': 'node tools/table-source.cjs',
  'tables:check': 'node tools/verify-tables.mjs',
  'tables:test': 'node tests/table-source-tests.mjs',
};

const COMMAND_CONTRACTS = new Map([
  ['create-project', 'npm run project:new -- --projects-dir <projects-dir> --id <project-id> --name <project-name>'],
  ['import-tables', 'npm run project:import-tables -- --project <project.json> --input <chatSheets.json>'],
  ['project-status', 'npm run project:status -- --project <project.json> --json'],
  ['draft-check', 'npm run project:check -- --project <project.json>'],
  ['tables-roundtrip', 'npm run tables:cli -- roundtrip <chatSheets.json>'],
  ['add-item', 'npm run project:add-item -- --project <project.json> --table <sheet-key> --id <item-id> --mount <mount.js> --field <field-name>'],
  ['skip-table', 'npm run project:skip-table -- --project <project.json> --table <sheet-key> --reason <user-reason>'],
  ['preview', 'npm run preview -- <project.json> --table <sheet-key>'],
  ['tables-build', 'npm run tables:cli -- build <source-dir> <generated.json>'],
  ['refresh-project', 'npm run project:status -- --project <project.json> --refresh'],
  ['confirm-project', 'npm run project:status -- --project <project.json> --confirm'],
  ['release-check', 'npm run project:check -- --project <project.json> --release'],
  ['pack-bundle', 'node tools/pack-preset.mjs <project.json> <bundle.json>'],
  ['readback-bundle', 'node tools/readback-preset.mjs <project.json> <bundle.json>'],
]);

const STAGE_CAPABILITY_CONTRACTS = new Map([
  ['bundle-source:setup', ['create-project', 'import-tables', 'project-status', 'draft-check', 'tables-roundtrip']],
  ['bundle-source:per-table', ['project-status', 'add-item', 'skip-table', 'draft-check', 'preview', 'tables-build', 'refresh-project']],
  ['bundle-source:release', ['project-status', 'confirm-project', 'release-check', 'pack-bundle', 'readback-bundle']],
]);

const EXPECTED_PROCESS_CONTRACT = {
  popupAuthoring: {
  "terminology": "弹窗",
  "opening": "小手机有三个弹窗接口",
  "interfaceNames": [
    "弹幕",
    "弹窗／浮窗",
    "弹窗／插入正文"
  ],
  "askInterfaceFirst": true,
  "multiTableKinds": [
    "inline"
  ],
  "singleTableKinds": [
    "barrage",
    "popup"
  ],
  "askCombinationOnlyAfterInline": true,
  "askInlineImageButton": true,
  "repeatConfirmedChoices": false,
  "combinationUnit": "one-popup",
  "currentDataSelection": {
    "providedBy": "host-current-snapshot",
    "doNotAskUser": [
      "which-row",
      "whether-latest",
      "which-record-triggers",
      "how-host-filters"
    ],
    "historyOrRowPickerOnlyWhenExplicitlyRequested": true
  },
  "document": "docs/runtime/popup-authoring-workflow.md"
},
  hostCapabilities: {
  "readBeforeDiscussion": [
    "docs/runtime/authoring-workflow.md",
    "docs/runtime/host-capabilities.md",
    "docs/runtime/host-capabilities.d.ts"
  ],
  "hostSourceRequired": false,
  "userVersionGate": false,
  "batchRelatedQuestions": true,
  "requireUserImageIdentityChoice": true,
  "singleRowIdentityExemption": false,
  "imageDiscussion": [
    "display-size-and-responsive-ratio",
    "composed-field-and-framing-prompt",
    "ask-optional-user-prompt"
  ],
  "previewRealGeneration": false,
  "previewCredentials": false,
  "allowDeferredPreview": true
},
  phaseOrder: ['setup', 'per-table', 'release'],
  guidance: {
    role: 'guide-not-decision-maker',
    decisionOwner: 'user',
    audience: 'non-technical-beginner',
    plainLanguageFirst: true,
    explainNecessaryTermsInline: true,
    recommendNextStepAfterEachResult: true,
    recommendNextStepAtEveryDecisionGate: true,
    presentOptionsWithConsequences: true,
    neverChooseForUser: true,
  },
  intake: {
    validChatSheetsInput: 'auto-create-and-import',
    deriveProjectIdentity: true,
    dryRunBeforeWrite: true,
    splitBeforeClarification: true,
    postSplitChoices: ['start-beautification', 'choose-beautification-target', 'edit-markdown-first'],
    markdownEditOutput: 'rebuild-generated-tables',
  },
  externalApiDocs: {
    readOnlyWhenExplicitlyRequested: true,
    tavernDocuments: ['docs/architecture-notes.md', 'docs/sillytavern-api.txt'],
    triggerExamples: ['酒馆接口', 'SillyTavern', 'TavernHelper', '酒馆输入框'],
    hostDomAllowedWhenExplicitlyRequested: true,
  },
  tableLoop: {
    scope: 'page-items',
    queueSource: 'workflow-state.json#queue',
    currentSource: 'workflow-state.json#currentTable',
    defaultCoverage: 'all-imported-tables',
    oneTableAtATime: true,
    batchBypass: 'forbidden',
    advanceStates: ['completed', 'skipped'],
    iterationOrder: ['requirements', 'field-contract', 'design', 'implementation', 'add-item', 'static-check', 'preview-decision', 'result-confirmation'],
    skip: {
      requiresExplicitUserDecision: true,
      requiresReason: true,
      capability: 'skip-table',
    },
    preview: {
      askEveryCompletedTable: true,
      executionOptional: true,
      simulationLabel: '制作期模拟',
      recordStatuses: ['not-run', 'passed', 'skipped', 'failed'],
    },
  },
  schemaChange: {
    explainImpactBeforeEdit: true,
    requiresExplicitUserConfirmation: true,
    editSource: 'tables/source/*.md',
    preserveOriginal: 'tables/original/imported.json',
    rebuildGenerated: 'tables/generated/tables.json',
    refreshInvalidatesAffectedItems: true,
    removedTablesLeaveQueueOnRefresh: true,
    skipKeepsTableInGenerated: true,
  },
  verification: {
    routineTableEdit: ['source-check', 'build-dry-run', 'build', 'refresh-project', 'draft-check'],
    toolOrWorkflowChange: ['targeted-check', 'full-verify-before-delivery'],
    releaseUsesActualProject: true,
  },
  releaseGate: {
    requiresAllQueueTerminal: true,
    terminalStates: ['completed', 'skipped'],
    summaryFields: ['completed', 'skipped', 'preview-not-run', 'preview-skipped', 'preview-failed'],
    requiresExplicitUserConfirmation: true,
    orderedCapabilities: ['project-status', 'confirm-project', 'release-check', 'pack-bundle', 'readback-bundle'],
    bundleWritesTables: false,
  },
  deliverables: [
    { id: 'tables-json', kind: 'chatSheets-json', path: 'projects/*/tables/generated/tables.json', independent: true },
    { id: 'beautify-bundle', kind: 'yuzi-beautify-preset', path: 'output/*.json', independent: true },
    { id: 'editable-source', kind: 'source-project', path: 'projects/*/project.json', independent: true },
  ],
};

const EXPECTED_RUNTIME_BOUNDARY = {
  status: 'external-required',
  requiredEvidence: [
    'real-sillytavern-blob-esm',
    'real-sillytavern-csp',
    'real-sillytavern-routing',
    'real-sillytavern-resource-blob-url',
    'real-sillytavern-page-lifecycle',
    'real-sillytavern-database',
    'real-sillytavern-indexeddb',
    'real-sillytavern-theme-overlay',
    'real-sillytavern-scroll-restore',
  ],
  prohibitedClaimsWithoutEvidence: ['runtime-verified', 'database-verified', 'p8-completed', 'p9-completed'],
};

const REQUIRED_DOCUMENT_FRAGMENTS = new Map([
  ['docs/runtime/authoring-workflow.md', ['普通用户', '先检查，再讨论', '用户选择图片的稳定标识字段', '即使只有一行也不能省略', '显示尺寸', '完整拼接提示词', '要不要再补充自己的提示词内容', '模拟永远只测试', 'not-run', '当前显示哪一行']],
  ['docs/runtime/host-capabilities.md', ['generateImage', 'readImage', 'getImageGenerationState', 'subscribeImageGeneration', 'promptSuffix', 'context.apiVersion', 'width/height/aspectRatio', 'tables', 'events', 'settings', '当前显示哪一行']],
  ['docs/runtime/popup-authoring-workflow.md', ['小手机有三个弹窗接口', '**弹幕**', '**弹窗／浮窗**', '**弹窗／插入正文**', '先问选择哪个弹窗接口', '只能单表', '当前数据由小手机运行时提供', '不得询问用户显示哪条', '要不要加生图按钮？', '图片标识也必须问', '历史记录列表', '组合弹窗是一份作品', 'project:add-display']],
  ['README.md', ['npm run project:new', 'npm run project:import-tables', 'npm run project:add-item', 'npm run project:skip-table', 'npm run project:status', 'npm run project:check', 'npm run preview', 'npm run tables:cli', 'npm run tables:check', 'npm run tables:test', '制作期模拟', '直接自动派生', '逐表 Markdown', '引导者', '没有编程基础', '主动建议下一步', '直接移除', '不需要运行全仓 `npm run verify`', '当前显示哪一行']],
  ['AGENTS.md', ['一次只处理当前表', '用户明确', '不得批量', '完成、跳过和未模拟', 'Bundle 不创建、修改或迁移数据库表', '表格输入本身就是执行授权', '不得先要求用户用自然语言说明如何拆表', '流程引导者', '不替用户作决定', '大白话', '建议下一步', '直接从 generated 和制作队列移除', '不要为删表、改字段等日常操作运行全仓', '当前显示哪一行']],
  ['prompts/1-建项导表与全表盘点.md', ['空白草稿', '完整 chatSheets', '全部表', 'project:import-tables', '不得停在只读检查', '先修改 `tables/source/*.md`']],
  ['prompts/2-逐表需求与字段合同.md', ['当前表', '字段合同', '用户确认', 'project:skip-table', '大白话', '主动提出具体美化建议']],
  ['prompts/3-逐表设计与实现.md', ['当前表', 'project:add-item', '不进入下一张表', '用户实际会看到', '由用户确认']],
  ['prompts/4-单表检查与模拟.md', ['制作期模拟', '可以跳过', 'preview-status', '当前表', '给出是否建议模拟', '由用户决定']],
  ['prompts/5-汇总确认与交付.md', ['完成、跳过和未模拟', 'project:status', 'project:check', 'pack-preset.mjs', 'readback-preset.mjs', '大白话', '最终确认必须由用户作出']],
]);

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const unique = values => Array.isArray(values) && new Set(values).size === values.length;

function rejectUnknownKeys(value, allowed, label, errors) {
  if (!isObject(value)) return;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) errors.push(`${label} 包含未知字段：${key}`);
}

function requireNonEmptyString(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} 必须是非空字符串`);
    return '';
  }
  return value;
}

function requireStringArray(value, label, errors, { nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0) || value.some(item => typeof item !== 'string' || !item.trim())) {
    errors.push(`${label} 必须是${nonEmpty ? '非空' : ''}字符串数组`);
    return [];
  }
  return value;
}

function compareContract(actual, expected, label, errors) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${label} 合同不匹配：应为数组`);
      return;
    }
    if (actual.length !== expected.length) errors.push(`${label} 合同不匹配：数组长度应为 ${expected.length}`);
    const length = Math.min(actual.length, expected.length);
    for (let index = 0; index < length; index += 1) compareContract(actual[index], expected[index], `${label}[${index}]`, errors);
    return;
  }
  if (isObject(expected)) {
    if (!isObject(actual)) {
      errors.push(`${label} 合同不匹配：应为对象`);
      return;
    }
    rejectUnknownKeys(actual, Object.keys(expected), label, errors);
    for (const [key, value] of Object.entries(expected)) {
      if (!Object.hasOwn(actual, key)) errors.push(`${label} 缺失字段：${key}`);
      else compareContract(actual[key], value, `${label}.${key}`, errors);
    }
    return;
  }
  if (!Object.is(actual, expected)) errors.push(`${label} 合同不匹配：应为 ${JSON.stringify(expected)}`);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeRelative(value, label, errors, { allowGlob = false } = {}) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.includes('\\') || value.includes('\0') || value.startsWith('/') || DRIVE_PATTERN.test(value) || SCHEME_PATTERN.test(value)) {
    errors.push(`${label} 必须是规范的项目内相对路径：${String(value)}`);
    return false;
  }
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || (!allowGlob && /[*?\[\]]/.test(segment)))) {
    errors.push(`${label} 包含无效路径段：${value}`);
    return false;
  }
  return true;
}

async function resolveProjectFile(root, relative, label, errors) {
  if (!safeRelative(relative, label, errors)) return null;
  try {
    const rootReal = await fs.realpath(root);
    const candidate = path.resolve(rootReal, relative);
    if (!isInside(rootReal, candidate)) throw new Error('越出项目目录');
    const fileReal = await fs.realpath(candidate);
    if (!isInside(rootReal, fileReal)) throw new Error('越出项目目录');
    if (!(await fs.stat(fileReal)).isFile()) throw new Error('不是普通文件');
    return fileReal;
  } catch (error) {
    errors.push(`${label} 无效：${relative}（${error.message}）`);
    return null;
  }
}

function validateOutput(output, stepId, errors) {
  if (!isObject(output)) {
    errors.push(`step ${stepId} output 必须是对象`);
    return;
  }
  if (['artifact', 'report'].includes(output.type)) {
    rejectUnknownKeys(output, ['type', 'name'], `step ${stepId} output`, errors);
    requireNonEmptyString(output.name, `step ${stepId} ${output.type} output.name`, errors);
    return;
  }
  if (output.type === 'file' || output.type === 'fileGlob') {
    rejectUnknownKeys(output, ['type', 'path'], `step ${stepId} output`, errors);
    safeRelative(output.path, `step ${stepId} output.path`, errors, { allowGlob: output.type === 'fileGlob' });
    return;
  }
  errors.push(`step ${stepId} output.type 无效：${String(output.type)}`);
}

async function validateCommandTool(root, command, label, errors) {
  const nodeTool = command.match(/^node (tools\/[a-zA-Z0-9._/-]+\.(?:mjs|cjs))(?:\s|$)/);
  if (nodeTool) await resolveProjectFile(root, nodeTool[1], label, errors);
}

async function validateCheck(check, stepId, root, scripts, errors) {
  if (!isObject(check)) {
    errors.push(`step ${stepId} check 必须是对象`);
    return null;
  }
  if (check.type === 'repositoryScript') {
    rejectUnknownKeys(check, ['type', 'script', 'scope'], `step ${stepId} repositoryScript`, errors);
    if (typeof check.script !== 'string' || !Object.hasOwn(scripts, check.script)) errors.push(`step ${stepId} 引用未知 npm script：${String(check.script)}`);
    return null;
  }
  if (check.type !== 'projectCommand') {
    errors.push(`step ${stepId} check.type 无效：${String(check.type)}`);
    return null;
  }
  rejectUnknownKeys(check, ['type', 'capability', 'command', 'evidence', 'optional', 'condition'], `step ${stepId} projectCommand`, errors);
  if (check.evidence !== 'actual-project') errors.push(`step ${stepId} projectCommand.evidence 必须为 actual-project`);
  const capability = requireNonEmptyString(check.capability, `step ${stepId} projectCommand.capability`, errors);
  const expectedCommand = COMMAND_CONTRACTS.get(capability);
  if (!expectedCommand) errors.push(`step ${stepId} projectCommand capability 无效：${capability}`);
  if (typeof check.command !== 'string' || !check.command.trim()) errors.push(`step ${stepId} projectCommand.command 缺失`);
  else {
    if (expectedCommand && check.command !== expectedCommand) errors.push(`step ${stepId} capability ${capability} 命令合同不匹配`);
    await validateCommandTool(root, check.command, `step ${stepId} projectCommand 工具`, errors);
  }
  if (check.optional !== undefined && typeof check.optional !== 'boolean') errors.push(`step ${stepId} projectCommand.optional 必须是 boolean`);
  if (check.optional === true) requireNonEmptyString(check.condition, `step ${stepId} 可选命令 condition`, errors);
  if (check.optional !== true && check.condition !== undefined) errors.push(`step ${stepId} projectCommand 非可选命令不能声明 condition`);
  return capability || null;
}

async function validateScriptContract(root, workflowScripts, packageScripts, errors) {
  compareContract(workflowScripts, EXPECTED_SCRIPTS, 'commandContract.scripts', errors);
  for (const [name, command] of Object.entries(EXPECTED_SCRIPTS)) {
    if (packageScripts[name] !== command) errors.push(`package.json script 合同不匹配：${name}`);
    await validateCommandTool(root, command, `npm script ${name} 工具`, errors);
    const testTool = command.match(/^node (tests\/[a-zA-Z0-9._/-]+\.mjs)(?:\s|$)/);
    if (testTool) await resolveProjectFile(root, testTool[1], `npm script ${name} 工具`, errors);
  }
}

export async function validateAiWorkflow(root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const errors = [];
  let workflow;
  let packageJson;
  try {
    workflow = JSON.parse(await fs.readFile(path.join(root, 'data/workflow-index.json'), 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`无法读取 data/workflow-index.json：${error.message}`] };
  }
  try {
    packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`无法读取 package.json：${error.message}`] };
  }
  if (!isObject(workflow)) return { ok: false, errors: ['workflow-index 顶层必须是对象'] };
  const scripts = isObject(packageJson?.scripts) ? packageJson.scripts : {};

  rejectUnknownKeys(workflow, ['schemaVersion', 'stagePrompts', 'commandContract', 'processContract', 'runtimeBoundary', 'workflows'], 'workflow-index', errors);
  if (workflow.schemaVersion !== 2) errors.push('schemaVersion 必须为 2');
  compareContract(workflow.stagePrompts, EXPECTED_STAGE_PROMPTS, 'stagePrompts', errors);
  rejectUnknownKeys(workflow.commandContract, ['scripts'], 'commandContract', errors);
  await validateScriptContract(root, workflow.commandContract?.scripts, scripts, errors);
  compareContract(workflow.processContract, EXPECTED_PROCESS_CONTRACT, 'processContract', errors);
  compareContract(workflow.runtimeBoundary, EXPECTED_RUNTIME_BOUNDARY, 'runtimeBoundary', errors);

  const workflows = Array.isArray(workflow.workflows) ? workflow.workflows : [];
  if (workflows.length !== 1) errors.push('workflows 必须且只能包含一个独立制作流程');
  const referencedPrompts = new Set();
  for (const current of workflows) {
    if (!isObject(current)) {
      errors.push('workflow 必须是对象');
      continue;
    }
    rejectUnknownKeys(current, ['id', 'title', 'entryPrompt', 'scope', 'steps'], `workflow ${String(current.id)}`, errors);
    if (!ID_PATTERN.test(current.id || '')) errors.push(`workflow.id 无效：${String(current.id)}`);
    if (current.id !== 'independent-project-workbench') errors.push('workflow.id 必须为 independent-project-workbench');
    requireNonEmptyString(current.title, `workflow ${String(current.id)} title`, errors);
    if (!ALLOWED_SCOPES.has(current.scope)) errors.push(`workflow ${current.id} scope 无效`);
    if (await resolveProjectFile(root, current.entryPrompt, `workflow ${current.id} entryPrompt`, errors)) referencedPrompts.add(current.entryPrompt);
    const steps = Array.isArray(current.steps) ? current.steps : [];
    const phaseOrder = workflow.processContract?.phaseOrder;
    if (!Array.isArray(phaseOrder) || steps.length !== phaseOrder.length || steps.some((step, index) => step?.id !== phaseOrder[index])) {
      errors.push('workflow steps 必须严格按 setup → per-table → release 排列');
    }
    const knownSteps = new Set(steps.filter(isObject).map(step => step.id));
    for (const step of steps) {
      if (!isObject(step)) {
        errors.push(`workflow ${current.id} 的 step 必须是对象`);
        continue;
      }
      rejectUnknownKeys(step, ['id', 'title', 'prompt', 'requiredReads', 'dependsOn', 'inputs', 'requiredProjectCapabilities', 'outputs', 'checks', 'risk', 'deliveryRequirements'], `step ${String(step.id)}`, errors);
      requireNonEmptyString(step.title, `step ${String(step.id)} title`, errors);
      if (await resolveProjectFile(root, step.prompt, `step ${step.id} prompt`, errors)) referencedPrompts.add(step.prompt);
      const requiredReads = requireStringArray(step.requiredReads, `step ${step.id} requiredReads`, errors);
      for (const read of requiredReads) {
        if (await resolveProjectFile(root, read, `step ${step.id} requiredReads`, errors) && EXPECTED_STAGE_PROMPTS.includes(read)) referencedPrompts.add(read);
      }
      const dependencies = requireStringArray(step.dependsOn, `step ${step.id} dependsOn`, errors, { nonEmpty: false });
      for (const dependency of dependencies) if (!knownSteps.has(dependency) || dependency === step.id) errors.push(`step ${step.id} 依赖无效：${dependency}`);
      const expectedDependencies = step.id === 'setup' ? [] : step.id === 'per-table' ? ['setup'] : step.id === 'release' ? ['per-table'] : null;
      if (expectedDependencies) compareContract(dependencies, expectedDependencies, `step ${step.id} dependsOn`, errors);
      requireStringArray(step.inputs, `step ${step.id} inputs`, errors);
      const requiredCapabilities = requireStringArray(step.requiredProjectCapabilities, `step ${step.id} requiredProjectCapabilities`, errors);
      const stageCapabilities = STAGE_CAPABILITY_CONTRACTS.get(`${current.scope}:${step.id}`);
      if (!stageCapabilities) errors.push(`step ${step.id} 缺少阶段能力合同`);
      else compareContract(requiredCapabilities, stageCapabilities, `step ${step.id} requiredProjectCapabilities`, errors);
      const checks = Array.isArray(step.checks) ? step.checks : [];
      if (!checks.length) errors.push(`step ${step.id} checks 必须是非空数组`);
      const actualCapabilities = [];
      for (const check of checks) {
        const capability = await validateCheck(check, step.id, root, scripts, errors);
        if (capability) actualCapabilities.push(capability);
      }
      if (!unique(actualCapabilities)) errors.push(`step ${step.id} projectCommand capability 不得重复`);
      if (stageCapabilities) compareContract(actualCapabilities, stageCapabilities, `step ${step.id} checks capability 顺序`, errors);
      if (!ALLOWED_RISKS.has(step.risk)) errors.push(`step ${step.id} risk 无效`);
      const deliveryRequirements = requireStringArray(step.deliveryRequirements, `step ${step.id} deliveryRequirements`, errors);
      if (deliveryRequirements.length && !unique(deliveryRequirements)) errors.push(`step ${step.id} deliveryRequirements 不得重复`);
      if (!Array.isArray(step.outputs) || !step.outputs.length) errors.push(`step ${step.id} outputs 必须是非空数组`);
      else for (const output of step.outputs) validateOutput(output, step.id, errors);
    }
  }

  for (const prompt of EXPECTED_STAGE_PROMPTS) {
    if (await resolveProjectFile(root, prompt, 'stagePrompts', errors) && !referencedPrompts.has(prompt)) errors.push(`阶段 prompt 未被 workflow 引用：${prompt}`);
  }
  try {
    const numberedPrompts = (await fs.readdir(path.join(root, 'prompts'))).filter(name => /^\d+-.*\.md$/.test(name)).map(name => `prompts/${name}`);
    for (const prompt of numberedPrompts) if (!EXPECTED_STAGE_PROMPTS.includes(prompt)) errors.push(`编号阶段 prompt 未登记：${prompt}`);
  } catch (error) {
    errors.push(`无法读取 prompts 目录：${error.message}`);
  }

  const documents = ['README.md', 'AGENTS.md', ...EXPECTED_STAGE_PROMPTS, 'prompts/制作提示.md', 'docs/INDEX.md', 'docs/runtime/authoring-workflow.md', 'docs/runtime/host-capabilities.md', 'docs/runtime/popup-authoring-workflow.md'];
  for (const relative of documents) {
    const file = await resolveProjectFile(root, relative, '流程文档', errors);
    if (!file) continue;
    let content;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch (error) {
      errors.push(`无法读取流程文档 ${relative}：${error.message}`);
      continue;
    }
    for (const fragment of REQUIRED_DOCUMENT_FRAGMENTS.get(relative) || []) if (!content.includes(fragment)) errors.push(`${relative} 缺少流程合同片段：${fragment}`);
    for (const match of content.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) if (!Object.hasOwn(scripts, match[1])) errors.push(`${relative} 引用未知 npm script：${match[1]}`);
    for (const match of content.matchAll(/node (tools\/[a-zA-Z0-9._/-]+\.(?:mjs|cjs))/g)) await resolveProjectFile(root, match[1], `${relative} 引用工具`, errors);
  }
  return { ok: errors.length === 0, errors };
}

async function main() {
  const result = await validateAiWorkflow();
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('[verify-ai-workflow] 通过');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
