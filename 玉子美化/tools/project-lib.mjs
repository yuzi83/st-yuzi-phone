import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import {
  hash,
  loadSourceProject,
  normalizeMatchText,
  normalizePackagePath,
  normalizeTables,
  readJson,
  resolveProjectFile,
} from './lib.mjs';
import { assertSchema, validateSchema } from './schema-validator.mjs';

const require = createRequire(import.meta.url);
const WORKFLOW_FILE = 'workflow-state.json';
const TABLES_ORIGINAL_FILE = 'tables/original/imported.json';
const TABLES_SOURCE_DIR = 'tables/source';
const TABLES_GENERATED_FILE = 'tables/generated/tables.json';
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const PROJECT_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MIME_BY_EXTENSION = Object.freeze({
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt']);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const toForwardSlashes = value => value.split(path.sep).join('/');
const nowIso = () => new Date().toISOString();

async function pathExists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveProjectDirectory(root, source, label) {
  const normalized = normalizePackagePath(source);
  const rootReal = await fs.realpath(root);
  const candidate = path.resolve(rootReal, ...normalized.split('/'));
  if (!isInside(rootReal, candidate)) throw new Error(`${label} 越出项目目录：${source}`);
  const directoryReal = await fs.realpath(candidate);
  if (!isInside(rootReal, directoryReal)) throw new Error(`${label} 越出项目目录：${source}`);
  const stat = await fs.stat(directoryReal);
  if (!stat.isDirectory()) throw new Error(`${label} 不是目录：${source}`);
  return directoryReal;
}

async function renameWithRetry(source, destination, { attempts = 6, baseDelayMs = 20 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (error) {
      const transient = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error?.code);
      if (!transient || attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertProjectId(id) {
  if (typeof id !== 'string' || id !== id.trim() || !PROJECT_ID.test(id) || WINDOWS_RESERVED.test(id) || id.endsWith('.') || id.endsWith(' ')) {
    throw new Error('项目 id 必须为 1-64 位小写字母、数字、点、下划线或连字符，首尾必须是字母或数字，且不能是 Windows 保留名');
  }
  return id;
}

function assertDisplayText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

function emptyProject({ id, name, version = '1.0.0', author = '' }) {
  return {
    tablesFile: TABLES_GENERATED_FILE,
    manifest: { id, name, version, author, items: [] },
    files: {},
    mimeTypes: {},
    encodings: {},
  };
}

function emptyWorkflow(id) {
  return {
    format: 'yuzi-beautify-workflow',
    version: 1,
    projectId: id,
    phase: 'empty',
    tables: {
      originalFile: null,
      sourceDir: null,
      generatedFile: null,
      originalSha256: null,
      generatedSha256: null,
    },
    queue: [],
    currentTable: null,
    confirmation: { confirmed: false, confirmedAt: null, summaryHash: null },
  };
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeFileExclusive(file, content) {
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
}

async function atomicWrite(file, content) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  await writeFileExclusive(temporary, content);
  try {
    await renameWithRetry(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

async function writeProjectPair(context, project, state) {
  assertSchema('project', project, 'project.json');
  assertSchema('workflow', state, WORKFLOW_FILE);
  const oldProject = await fs.readFile(context.projectPath, 'utf8');
  const oldState = await fs.readFile(context.statePath, 'utf8');
  await atomicWrite(context.projectPath, jsonText(project));
  try {
    await atomicWrite(context.statePath, jsonText(state));
  } catch (error) {
    await atomicWrite(context.projectPath, oldProject);
    await atomicWrite(context.statePath, oldState);
    throw error;
  }
}

function resetConfirmation(state) {
  state.confirmation = { confirmed: false, confirmedAt: null, summaryHash: null };
}

function tableContract(table) {
  const headers = table.headers.map(value => String(value));
  return {
    sheetKey: table.sheetKey,
    tableName: table.tableName,
    headers,
    schemaHash: hash(Buffer.from(JSON.stringify([table.sheetKey, table.tableName, headers]), 'utf8')),
  };
}

function newQueueEntry(table) {
  return {
    ...tableContract(table),
    status: 'pending',
    itemId: null,
    fields: [],
    display: null,
    displays: [],
    skipReason: null,
    completedAt: null,
    preview: { status: 'not-run', recordedAt: null, notes: '' },
  };
}

function derivePhase(state) {
  if (state.confirmation.confirmed) return 'confirmed';
  if (state.queue.length === 0) return state.tables.generatedFile ? 'tables-imported' : 'empty';
  if (state.queue.every(entry => entry.status === 'completed' || entry.status === 'skipped')) return 'ready';
  if (state.queue.every(entry => entry.status === 'pending')) return 'tables-imported';
  return 'working';
}

function updatePhase(state) {
  state.phase = derivePhase(state);
  state.currentTable = state.queue.find(entry => ['pending', 'in-progress', 'invalidated'].includes(entry.status))?.sheetKey || null;
  return state;
}

function assertUniqueNormalized(values, label) {
  const seen = new Map();
  for (const value of values) {
    const normalized = normalizeMatchText(value);
    if (!normalized) throw new Error(`${label} 包含空值`);
    if (seen.has(normalized)) throw new Error(`${label} NFKC 规范化后重复：${seen.get(normalized)} / ${value}`);
    seen.set(normalized, value);
  }
}

export function validateChatSheetsDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('表格模板必须是对象');
  if (document?.mate?.type !== 'chatSheets') throw new Error('正式导入只接受 mate.type === "chatSheets" 的完整模板');
  const tables = normalizeTables(document);
  if (tables.length === 0) throw new Error('chatSheets 模板至少需要一张 sheet_* 表');
  assertUniqueNormalized(tables.map(table => table.sheetKey), 'sheetKey');
  assertUniqueNormalized(tables.map(table => table.tableName), '表名');
  for (const table of tables) {
    if (table.headers.length === 0) throw new Error(`${table.tableName} 缺少表头`);
    assertUniqueNormalized(table.headers, `${table.tableName} 表头`);
  }
  return tables;
}

function reconcileState(state, tables, project = null) {
  const previous = new Map(state.queue.map(entry => [entry.sheetKey, entry]));
  const next = [];
  const removedDisplayIds = new Set();
  let changed = false;
  for (const table of tables) {
    const contract = tableContract(table);
    const old = previous.get(table.sheetKey);
    previous.delete(table.sheetKey);
    if (!old) {
      next.push(newQueueEntry(table));
      changed = true;
      continue;
    }
    if (old.schemaHash !== contract.schemaHash) {
      next.push({
        ...old,
        ...contract,
        status: old.status === 'skipped' ? 'skipped' : 'invalidated',
        completedAt: null,
        preview: { status: 'not-run', recordedAt: null, notes: '表结构变化后需要重新确认' },
      });
      changed = true;
      continue;
    }
    next.push({ ...old, ...contract });
  }
  for (const removed of previous.values()) {
    if (project) {
      removeItem(project, removed.itemId);
      for (const display of displayStates(removed)) {
        removeDisplay(project, display.id);
        removedDisplayIds.add(display.id);
      }
    }
    changed = true;
  }
  state.queue = next;
  for (const displayId of removedDisplayIds) removeDisplayState(state, displayId);
  if (changed) resetConfirmation(state);
  updatePhase(state);
  return { state, changed };
}

function summaryPayload(project, state) {
  return {
    projectId: project.manifest.id,
    generatedSha256: state.tables.generatedSha256,
    queue: state.queue.map(entry => ({
      sheetKey: entry.sheetKey,
      tableName: entry.tableName,
      schemaHash: entry.schemaHash,
      status: entry.status,
      itemId: entry.itemId,
      fields: entry.fields,
      display: entry.display,
      ...(displayStates(entry).length > 0 ? { displays: displayStates(entry) } : {}),
      skipReason: entry.skipReason,
      preview: entry.preview,
    })),
  };
}

export function workflowSummaryHash(project, state) {
  return hash(Buffer.from(JSON.stringify(summaryPayload(project, state)), 'utf8'));
}

export async function createProject({ projectsDir = 'projects', id, name, version = '1.0.0', author = '', dryRun = false } = {}) {
  const safeId = assertProjectId(id);
  const displayName = assertDisplayText(name, '项目名称');
  const displayVersion = assertDisplayText(version, '项目版本');
  const root = path.resolve(projectsDir);
  const target = path.resolve(root, safeId);
  if (!isInside(root, target)) throw new Error('项目目录越出 projectsDir');
  const project = emptyProject({ id: safeId, name: displayName, version: displayVersion, author: String(author || '').trim() });
  const state = emptyWorkflow(safeId);
  assertSchema('project', project, '空白 project.json');
  assertSchema('workflow', state, '空白 workflow-state.json');
  const files = [
    'project.json',
    WORKFLOW_FILE,
    'README.md',
    'notes/requirements.md',
    'notes/data-contract.md',
    'notes/ui-spec.md',
    'notes/acceptance.md',
  ];
  const result = { ok: true, dryRun, projectDir: target, projectFile: path.join(target, 'project.json'), files };
  if (dryRun) return result;
  await fs.mkdir(root, { recursive: true });
  if (await pathExists(target)) throw new Error(`目标项目已存在，拒绝覆盖：${target}`);
  const staging = await fs.mkdtemp(path.join(root, '.yuzi-beautify-new-'));
  try {
    await fs.mkdir(path.join(staging, 'notes'), { recursive: true });
    await fs.mkdir(path.join(staging, 'pages'), { recursive: true });
    await fs.mkdir(path.join(staging, 'assets'), { recursive: true });
    await writeFileExclusive(path.join(staging, 'project.json'), jsonText(project));
    await writeFileExclusive(path.join(staging, WORKFLOW_FILE), jsonText(state));
    await writeFileExclusive(path.join(staging, 'README.md'), `# ${displayName}\n\n这是一个玉子美化源码草稿。先导入 chatSheets，再逐表制作。\n`);
    await writeFileExclusive(path.join(staging, 'notes', 'requirements.md'), '# 逐表需求\n');
    await writeFileExclusive(path.join(staging, 'notes', 'data-contract.md'), '# 字段合同\n');
    await writeFileExclusive(path.join(staging, 'notes', 'ui-spec.md'), '# 页面设计\n');
    await writeFileExclusive(path.join(staging, 'notes', 'acceptance.md'), '# 验收记录\n');
    await renameWithRetry(staging, target);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return result;
}

export async function loadWorkflowProject(projectFile) {
  const source = await loadSourceProject(projectFile);
  const statePath = path.join(source.root, WORKFLOW_FILE);
  const state = await readJson(statePath);
  assertSchema('workflow', state, WORKFLOW_FILE);
  if (state.projectId !== source.project.manifest.id) throw new Error('workflow-state.projectId 与 manifest.id 不一致');
  return { ...source, statePath, state };
}

async function readCurrentTables(context, { allowMissing = false } = {}) {
  let tablesPath;
  try {
    tablesPath = await resolveProjectFile(context.root, context.project.tablesFile, 'tablesFile');
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return null;
    throw error;
  }
  const raw = await fs.readFile(tablesPath);
  const document = JSON.parse(raw.toString('utf8'));
  const tables = validateChatSheetsDocument(document);
  return { tablesPath, raw, document, tables, sha256: hash(raw) };
}

function findQueueEntry(state, token) {
  const normalized = normalizeMatchText(token);
  const matches = state.queue.filter(entry => normalizeMatchText(entry.sheetKey) === normalized || normalizeMatchText(entry.tableName) === normalized);
  if (matches.length === 0) throw new Error(`队列中没有表：${token}`);
  if (matches.length > 1) throw new Error(`表标识不唯一，请使用 sheetKey：${token}`);
  return matches[0];
}

function inferFileMetadata(packagePath) {
  const extension = path.extname(packagePath).toLowerCase();
  return {
    mimeType: MIME_BY_EXTENSION[extension] || 'application/octet-stream',
    encoding: TEXT_EXTENSIONS.has(extension) ? 'text' : 'base64',
  };
}

async function assertSourceFiles(context, packagePaths) {
  for (const packagePath of packagePaths) {
    normalizePackagePath(packagePath);
    await resolveProjectFile(context.root, packagePath, `源码 ${packagePath}`);
  }
}

function canonicalFields(entry, fields) {
  if (!Array.isArray(fields) || fields.length === 0) throw new Error('至少需要一个 --field');
  assertUniqueNormalized(fields, `${entry.tableName} 字段合同`);
  const actual = new Map(entry.headers.map(header => [normalizeMatchText(header), header]));
  return fields.map(field => {
    const canonical = actual.get(normalizeMatchText(field));
    if (!canonical) throw new Error(`${entry.tableName} 不存在字段：${field}`);
    return canonical;
  });
}

function removeItem(project, itemId) {
  if (!itemId) return;
  project.manifest.items = project.manifest.items.filter(item => item.id !== itemId);
}

function removeDisplay(project, displayId) {
  if (!displayId) return;
  project.manifest.displays = (project.manifest.displays || []).filter(display => display.id !== displayId);
}

function displayStates(entry) {
  const byId = new Map();
  for (const display of [...(Array.isArray(entry.displays) ? entry.displays : []), entry.display].filter(Boolean)) {
    if (!byId.has(display.id)) byId.set(display.id, display);
  }
  return [...byId.values()];
}

function hasProducedResult(entry) {
  return Boolean(entry.itemId || displayStates(entry).length > 0);
}

function removeDisplayState(state, displayId) {
  for (const entry of state.queue) {
    if (entry.display?.id === displayId) entry.display = null;
    if (Array.isArray(entry.displays)) entry.displays = entry.displays.filter(display => display.id !== displayId);
    if (entry.status !== 'skipped' && !hasProducedResult(entry)) {
      entry.status = 'pending';
      entry.completedAt = null;
      entry.preview = { status: 'not-run', recordedAt: null, notes: '' };
    }
  }
}

function setDisplayState(entry, displayState, { legacyInline = false } = {}) {
  const displays = displayStates(entry).filter(display => display.id !== displayState.id);
  displays.push(displayState);
  entry.displays = displays;
  if (legacyInline && (!entry.display || entry.display.id === displayState.id)) entry.display = displayState;
  entry.status = 'completed';
  entry.skipReason = null;
  entry.completedAt ||= displayState.completedAt;
}

function canonicalDisplayTargets(state, table, fields, targets) {
  const requested = Array.isArray(targets) && targets.length > 0
    ? targets
    : [{ tableName: table, fields }];
  const seen = new Set();
  return requested.map((target, index) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error(`targets[${index}] 必须是对象`);
    const requestedTable = target.tableName ?? target.table;
    const entry = findQueueEntry(state, requestedTable);
    if (entry.status === 'skipped') throw new Error(`目标表已跳过：${entry.tableName}`);
    const key = normalizeMatchText(entry.tableName);
    if (seen.has(key)) throw new Error(`targets 不能重复声明表：${entry.tableName}`);
    seen.add(key);
    return {
      entry,
      target: {
        tableName: entry.tableName,
        fields: canonicalFields(entry, target.fields),
      },
    };
  });
}

function canonicalDisplayCapabilities({ integrations, imageGeneration, interactions }, targets, kind) {
  const result = {};
  if (integrations !== undefined && integrations !== null) {
    if (!integrations || typeof integrations !== 'object' || Array.isArray(integrations)) throw new Error('integrations 必须是对象');
    const allowed = new Set(['theme', 'font']);
    for (const key of Object.keys(integrations)) if (!allowed.has(key)) throw new Error(`integrations 包含未知字段：${key}`);
    for (const key of ['theme', 'font']) {
      if (integrations[key] === undefined) continue;
      if (integrations[key] !== true) throw new Error(`integrations.${key} 只能为 true`);
      result.integrations ||= {};
      result.integrations[key] = true;
    }
    if (!result.integrations) throw new Error('integrations 至少需要一个接入项');
  }
  if (imageGeneration !== undefined && imageGeneration !== null) {
    if (kind !== 'inline') throw new Error('仅 inline 展示可以声明生图接口');
    if (!imageGeneration || typeof imageGeneration !== 'object' || Array.isArray(imageGeneration) || !Array.isArray(imageGeneration.canvases) || imageGeneration.canvases.length === 0) {
      throw new Error('生图接口至少需要一个 canvas 声明');
    }
    const targetByName = new Map(targets.map(value => [normalizeMatchText(value.target.tableName), value]));
    const canvasNames = new Set();
    result.imageGeneration = {
      canvases: imageGeneration.canvases.map((canvas, index) => {
        if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) throw new Error(`canvas[${index}] 必须是对象`);
        if (canvas.promptSuffix !== undefined && typeof canvas.promptSuffix !== 'string') throw new Error(`canvas[${index}].promptSuffix 必须是字符串`);
        const canvasName = assertDisplayText(canvas.canvas, `canvas[${index}].canvas`);
        const target = targetByName.get(normalizeMatchText(canvas.tableName ?? canvas.table));
        if (!target) throw new Error(`canvas ${canvasName} 的归属表必须在 targets 中声明`);
        const canvasKey = `${normalizeMatchText(target.target.tableName)}\u0000${normalizeMatchText(canvasName)}`;
        if (canvasNames.has(canvasKey)) throw new Error(`canvas 名称与归属表重复：${canvasName}`);
        canvasNames.add(canvasKey);
        return {
          tableName: target.target.tableName,
          stableIdentityFields: canonicalFields(target.entry, canvas.stableIdentityFields),
          canvas: canvasName,
          promptFields: canonicalFields(target.entry, canvas.promptFields),
          ...(canvas.promptSuffix !== undefined ? { promptSuffix: canvas.promptSuffix.trim() } : {}),
        };
      }),
    };
  }
  if (interactions !== undefined && interactions !== null) {
    if (kind !== 'inline') throw new Error('仅 inline 展示可以声明局部交互');
    if (!Array.isArray(interactions) || interactions.length === 0) throw new Error('局部交互至少需要一项');
    const allowed = new Set(['expand', 'tabs', 'append-input', 'image-generate']);
    assertUniqueNormalized(interactions, '局部交互');
    result.interactions = interactions.map((interaction, index) => {
      if (typeof interaction !== 'string' || !allowed.has(interaction)) throw new Error(`interaction[${index}] 无效`);
      return interaction;
    });
  }
  return result;
}

export async function addProjectItem({
  projectFile,
  table,
  id,
  name = '',
  fields = [],
  html = null,
  css = null,
  mount,
  assets = [],
  integrations = null,
  imageGeneration = null,
  previewStatus = 'not-run',
  previewNotes = '',
  replace = false,
  dryRun = false,
} = {}) {
  const context = await loadWorkflowProject(projectFile);
  const current = await readCurrentTables(context);
  const project = structuredClone(context.project);
  const state = structuredClone(context.state);
  reconcileState(state, current.tables, project);
  const entry = findQueueEntry(state, table);
  if (entry.status === 'skipped') throw new Error('该表已跳过；请先用 project:skip-table --resume 恢复制作');
  const itemId = assertProjectId(id);
  const itemFields = canonicalFields(entry, fields);
  const itemCapabilities = canonicalDisplayCapabilities(
    { integrations, imageGeneration, interactions: null },
    [{ entry: { ...entry, headers: itemFields }, target: { tableName: entry.tableName, fields: itemFields } }],
    'inline',
  );
  const packagePaths = [mount, html, css, ...assets].filter(Boolean).map(normalizePackagePath);
  if (!mount) throw new Error('--mount 不能为空');
  assertUniqueNormalized(packagePaths, 'item 源码路径');
  await assertSourceFiles(context, packagePaths);
  const usedByOther = project.manifest.items.find(item => item.id === itemId && item.id !== entry.itemId);
  if (usedByOther) throw new Error(`item id 已被其他表使用：${itemId}`);
  if (entry.itemId && !replace) throw new Error(`该表已有 item：${entry.itemId}；如需重做请显式使用 --replace`);
  if (!['not-run', 'passed', 'skipped', 'failed'].includes(previewStatus)) throw new Error(`预览状态无效：${previewStatus}`);
  project.files ||= {};
  project.mimeTypes ||= {};
  project.encodings ||= {};
  const stateEntry = entry;
  removeItem(project, stateEntry.itemId);
  const item = {
    id: itemId,
    name: String(name || entry.tableName).trim(),
    target: { tableName: entry.tableName, fields: itemFields },
    entry: { ...(html ? { html } : {}), ...(css ? { css } : {}), mount },
    ...itemCapabilities,
    assets: assets.map(normalizePackagePath),
  };
  project.manifest.items.push(item);
  for (const packagePath of packagePaths) {
    project.files[packagePath] = packagePath;
    const metadata = inferFileMetadata(packagePath);
    project.mimeTypes[packagePath] = metadata.mimeType;
    project.encodings[packagePath] = metadata.encoding;
  }
  Object.assign(stateEntry, {
    status: 'completed',
    itemId,
    fields: itemFields,
    skipReason: null,
    completedAt: nowIso(),
    preview: {
      status: previewStatus,
      recordedAt: previewStatus === 'not-run' ? null : nowIso(),
      notes: String(previewNotes || ''),
    },
  });
  state.tables.generatedSha256 = current.sha256;
  resetConfirmation(state);
  updatePhase(state);
  assertSchema('project', project, 'project.json');
  assertSchema('workflow', state, WORKFLOW_FILE);
  const result = { ok: true, dryRun, item, state: stateEntry, phase: state.phase };
  if (!dryRun) await writeProjectPair(context, project, state);
  return result;
}

export async function addProjectDisplay({
  projectFile,
  table,
  id,
  name = '',
  kind,
  fields = [],
  targets = null,
  integrations = null,
  imageGeneration = null,
  interactions = null,
  html = null,
  css = null,
  mount,
  assets = [],
  previewStatus = 'not-run',
  previewNotes = '',
  replace = false,
  dryRun = false,
} = {}) {
  const context = await loadWorkflowProject(projectFile);
  const current = await readCurrentTables(context);
  const project = structuredClone(context.project);
  const state = structuredClone(context.state);
  reconcileState(state, current.tables, project);
  if (!['inline', 'popup', 'barrage'].includes(kind)) throw new Error(`请先选择弹窗接口：弹幕、弹窗／浮窗或弹窗／插入正文（kind 无效：${kind}）`);
  const displayId = assertProjectId(id);
  const displayTargets = canonicalDisplayTargets(state, table, fields, targets);
  if (kind !== 'inline' && displayTargets.length !== 1) throw new Error('弹幕和弹窗／浮窗只能使用单表；只有弹窗／插入正文可以多表组合');
  const displayCapabilities = canonicalDisplayCapabilities({ integrations, imageGeneration, interactions }, displayTargets, kind);
  const packagePaths = [mount, html, css, ...assets].filter(Boolean).map(normalizePackagePath);
  if (!mount) throw new Error('--mount 不能为空');
  assertUniqueNormalized(packagePaths, 'display 源码路径');
  await assertSourceFiles(context, packagePaths);
  const existingDisplay = (project.manifest.displays || []).find(display => display.id === displayId);
  if (project.manifest.items.some(item => item.id === displayId)) throw new Error(`展示 id 已被其他制作结果使用：${displayId}`);
  if (existingDisplay && !replace) throw new Error(`展示 id 已存在：${displayId}；如需重做请显式使用 --replace`);
  if (!['not-run', 'passed', 'skipped', 'failed'].includes(previewStatus)) throw new Error(`预览状态无效：${previewStatus}`);
  project.files ||= {};
  project.mimeTypes ||= {};
  project.encodings ||= {};
  project.manifest.displays ||= [];
  if (existingDisplay) {
    removeDisplay(project, displayId);
    removeDisplayState(state, displayId);
  }
  const display = {
    id: displayId,
    name: String(name || displayTargets[0].target.tableName).trim(),
    kind,
    targets: displayTargets.map(value => value.target),
    entry: { ...(html ? { html } : {}), ...(css ? { css } : {}), mount },
    ...displayCapabilities,
    assets: assets.map(normalizePackagePath),
  };
  project.manifest.displays.push(display);
  for (const packagePath of packagePaths) {
    project.files[packagePath] = packagePath;
    const metadata = inferFileMetadata(packagePath);
    project.mimeTypes[packagePath] = metadata.mimeType;
    project.encodings[packagePath] = metadata.encoding;
  }
  const completedAt = nowIso();
  const preview = {
    status: previewStatus,
    recordedAt: previewStatus === 'not-run' ? null : completedAt,
    notes: String(previewNotes || ''),
  };
  for (const { entry, target } of displayTargets) {
    setDisplayState(entry, {
      id: displayId,
      fields: target.fields,
      completedAt,
      preview,
    }, { legacyInline: kind === 'inline' && displayTargets.length === 1 });
  }
  state.tables.generatedSha256 = current.sha256;
  resetConfirmation(state);
  updatePhase(state);
  assertSchema('project', project, 'project.json');
  assertSchema('workflow', state, WORKFLOW_FILE);
  const result = { ok: true, dryRun, display, states: displayTargets.map(({ entry }) => entry), phase: state.phase };
  if (!dryRun) await writeProjectPair(context, project, state);
  return result;
}

export async function skipProjectTable({ projectFile, table, reason = '', resume = false, dryRun = false } = {}) {
  const context = await loadWorkflowProject(projectFile);
  const current = await readCurrentTables(context);
  const project = structuredClone(context.project);
  const state = structuredClone(context.state);
  reconcileState(state, current.tables, project);
  const stateEntry = findQueueEntry(state, table);
  if (resume) {
    stateEntry.status = 'pending';
    stateEntry.itemId = null;
    stateEntry.fields = [];
    stateEntry.display = null;
    stateEntry.displays = [];
    stateEntry.skipReason = null;
    stateEntry.completedAt = null;
    stateEntry.preview = { status: 'not-run', recordedAt: null, notes: '' };
  } else {
    const skipReason = assertDisplayText(reason, '跳过原因');
    removeItem(project, stateEntry.itemId);
    for (const display of displayStates(stateEntry)) {
      removeDisplay(project, display.id);
      removeDisplayState(state, display.id);
    }
    stateEntry.status = 'skipped';
    stateEntry.itemId = null;
    stateEntry.fields = [];
    stateEntry.display = null;
    stateEntry.displays = [];
    stateEntry.skipReason = skipReason;
    stateEntry.completedAt = null;
    stateEntry.preview = { status: 'skipped', recordedAt: nowIso(), notes: '该表由用户明确跳过制作' };
  }
  state.tables.generatedSha256 = current.sha256;
  resetConfirmation(state);
  updatePhase(state);
  const result = { ok: true, dryRun, table: stateEntry, phase: state.phase };
  if (!dryRun) await writeProjectPair(context, project, state);
  return result;
}

function validateProjectMappings(project, root, errors) {
  const fileKeys = new Set(Object.keys(project.files || {}));
  for (const key of Object.keys(project.mimeTypes || {})) if (!fileKeys.has(key)) errors.push(`mimeTypes 包含未声明文件：${key}`);
  for (const key of Object.keys(project.encodings || {})) if (!fileKeys.has(key)) errors.push(`encodings 包含未声明文件：${key}`);
  for (const renderable of [...(project.manifest.items || []), ...(project.manifest.displays || [])]) {
    for (const [kind, packagePath] of Object.entries(renderable.entry || {})) {
      if (!fileKeys.has(packagePath)) errors.push(`${renderable.id}.entry.${kind} 未声明在 files：${packagePath}`);
      if (!project.mimeTypes?.[packagePath]) errors.push(`${renderable.id}.entry.${kind} 缺少 MIME：${packagePath}`);
    }
    for (const asset of renderable.assets || []) {
      if (!fileKeys.has(asset)) errors.push(`${renderable.id}.assets 未声明在 files：${asset}`);
      if (!project.mimeTypes?.[asset]) errors.push(`${renderable.id}.assets 缺少 MIME：${asset}`);
      if (!project.encodings?.[asset]) errors.push(`${renderable.id}.assets 缺少 encoding：${asset}`);
    }
  }
  return Promise.all(Object.entries(project.files || {}).map(async ([packagePath, source]) => {
    try {
      normalizePackagePath(packagePath);
      await resolveProjectFile(root, source, `files.${packagePath}`);
    } catch (error) {
      errors.push(error.message);
    }
  }));
}

async function checkLoadedWorkflowProject(context, { mode = 'draft', requireConfirmation = mode === 'release' } = {}) {
  if (!['draft', 'release'].includes(mode)) throw new Error(`检查模式无效：${mode}`);
  const errors = [];
  const projectStructure = validateSchema('project', context.project);
  const stateStructure = validateSchema('workflow', context.state);
  errors.push(...projectStructure.errors.map(value => `project.json Schema：${value}`));
  errors.push(...stateStructure.errors.map(value => `${WORKFLOW_FILE} Schema：${value}`));
  await validateProjectMappings(context.project, context.root, errors);
  let current = null;
  try {
    current = await readCurrentTables(context, { allowMissing: mode === 'draft' });
  } catch (error) {
    errors.push(error.message);
  }
  const state = structuredClone(context.state);
  if (!current) {
    if (mode === 'release') errors.push('发布检查要求已导入 generated chatSheets');
    if (state.queue.length !== 0) errors.push('generated chatSheets 缺失，但制作队列不为空');
  } else {
    const reconciliation = reconcileState(state, current.tables);
    if (reconciliation.changed) errors.push('generated chatSheets 的表结构与制作状态不一致；受影响表需要重新确认');
    if (state.tables.generatedFile !== context.project.tablesFile) errors.push('workflow-state.tables.generatedFile 必须等于 project.tablesFile');
    if (state.tables.generatedSha256 !== current.sha256) errors.push('generated chatSheets 哈希与制作状态不一致');
    if (mode === 'release' && (!context.project.tablesFile.startsWith('tables/generated/') || !context.project.tablesFile.endsWith('.json'))) {
      errors.push('发布项目的 project.json.tablesFile 必须指向项目内 tables/generated/*.json');
    }
    if (state.tables.originalFile) {
      try {
        const originalPath = await resolveProjectFile(context.root, state.tables.originalFile, 'originalFile');
        const originalHash = hash(await fs.readFile(originalPath));
        if (originalHash !== state.tables.originalSha256) errors.push('原始导入 JSON 已被修改');
      } catch (error) {
        errors.push(error.message);
      }
    } else if (mode === 'release') {
      errors.push('发布检查要求保留 tables/original 下的原始导入 JSON');
    }
    if (state.tables.sourceDir) {
      try {
        const sourceDir = await resolveProjectDirectory(context.root, state.tables.sourceDir, 'sourceDir');
        const tableSource = require('./table-source.cjs');
        if (typeof tableSource.buildTemplateFromDirectory !== 'function') throw new Error('tools/table-source.cjs 缺少 buildTemplateFromDirectory API');
        const rebuilt = tableSource.buildTemplateFromDirectory(sourceDir);
        if (!isDeepStrictEqual(rebuilt, current.document)) errors.push('表格 Markdown 事实源与 generated chatSheets 不深度等价');
      } catch (error) {
        errors.push(error.message);
      }
    } else if (mode === 'release') {
      errors.push('发布检查要求保留逐表 Markdown 事实源目录');
    }
    if (mode === 'release') {
      if (!state.tables.generatedFile) errors.push('发布检查要求记录 generated chatSheets 路径');
      if (!state.tables.originalSha256) errors.push('发布检查要求记录原始导入 JSON 哈希');
      if (!state.tables.generatedSha256) errors.push('发布检查要求记录 generated chatSheets 哈希');
    }
    const tableByKey = new Map(current.tables.map(table => [table.sheetKey, table]));
    const itemById = new Map(context.project.manifest.items.map(item => [item.id, item]));
    const displayById = new Map((context.project.manifest.displays || []).map(display => [display.id, display]));
    const claimedItems = new Set();
    const claimedDisplayTargets = new Map();
    for (const entry of state.queue) {
      const table = tableByKey.get(entry.sheetKey);
      if (!table && entry.status === 'skipped') continue;
      if (!table) {
        errors.push(`队列表在 generated JSON 中不存在：${entry.sheetKey}`);
        continue;
      }
      if (entry.status === 'skipped') {
        if (entry.itemId) errors.push(`已跳过表不能绑定 item：${entry.tableName}`);
        if (displayStates(entry).length > 0) errors.push(`已跳过表不能绑定正文展示：${entry.tableName}`);
        continue;
      }
      if (entry.status !== 'completed') {
        if (mode === 'release') errors.push(`表尚未完成或跳过：${entry.tableName} (${entry.status})`);
        continue;
      }
      const actualFields = new Set(table.headers.map(normalizeMatchText));
      if (entry.itemId) {
        const item = itemById.get(entry.itemId);
        if (!item) {
          errors.push(`制作状态引用不存在的 item：${entry.itemId}`);
        } else {
          if (claimedItems.has(item.id)) errors.push(`多个表重复绑定 item：${item.id}`);
          claimedItems.add(item.id);
          if (normalizeMatchText(item.target.tableName) !== normalizeMatchText(table.tableName)) errors.push(`${item.id} 的表名与 generated JSON 不匹配`);
          const contractFields = entry.fields.map(normalizeMatchText);
          const itemFields = item.target.fields.map(normalizeMatchText);
          if (JSON.stringify(contractFields) !== JSON.stringify(itemFields)) errors.push(`${item.id} 的字段与制作状态不一致`);
          for (const field of itemFields) if (!actualFields.has(field)) errors.push(`${item.id} 引用了不存在字段：${field}`);
        }
      }
      for (const stateDisplay of displayStates(entry)) {
        const display = displayById.get(stateDisplay.id);
        if (!display) {
          errors.push(`制作状态引用不存在的展示：${stateDisplay.id}`);
        } else {
          const target = display.targets.find(candidate => normalizeMatchText(candidate.tableName) === normalizeMatchText(table.tableName));
          if (!target) {
            errors.push(`${display.id} 未声明当前表目标：${entry.tableName}`);
          } else {
            const contractFields = stateDisplay.fields.map(normalizeMatchText);
            const displayFields = target.fields.map(normalizeMatchText);
            if (JSON.stringify(contractFields) !== JSON.stringify(displayFields)) errors.push(`${display.id} 的字段与制作状态不一致`);
            for (const field of displayFields) if (!actualFields.has(field)) errors.push(`${display.id} 引用了不存在字段：${field}`);
            const claimed = claimedDisplayTargets.get(display.id) || new Set();
            if (claimed.has(entry.sheetKey)) errors.push(`${display.id} 重复绑定当前表：${entry.tableName}`);
            claimed.add(entry.sheetKey);
            claimedDisplayTargets.set(display.id, claimed);
          }
        }
      }
      if (!entry.itemId && displayStates(entry).length === 0) errors.push(`已完成表缺少页面或正文展示：${entry.tableName}`);
    }
    for (const item of context.project.manifest.items) if (!claimedItems.has(item.id)) errors.push(`manifest 包含未绑定当前非跳过表的 item：${item.id}`);
    for (const display of context.project.manifest.displays || []) {
      const claimed = claimedDisplayTargets.get(display.id);
      if (!claimed) {
        errors.push(`manifest 包含未绑定当前非跳过表的展示：${display.id}`);
        continue;
      }
      for (const target of display.targets) {
        const entry = state.queue.find(candidate => normalizeMatchText(candidate.tableName) === normalizeMatchText(target.tableName));
        if (!entry || !claimed.has(entry.sheetKey)) errors.push(`${display.id} 缺少目标表制作状态：${target.tableName}`);
      }
    }
  }
  if (mode === 'release') {
    if (!context.project.manifest.id.trim()) errors.push('发布检查要求 manifest.id');
    if (context.project.manifest.items.length + (context.project.manifest.displays || []).length === 0) errors.push('发布检查要求至少一个完整页面或正文展示');
    if (state.queue.length === 0) errors.push('发布检查要求非空制作队列');
    if (requireConfirmation) {
      if (!state.confirmation.confirmed) errors.push('发布前需要用户确认完成、跳过和未模拟项汇总');
      const expected = workflowSummaryHash(context.project, state);
      if (state.confirmation.summaryHash !== expected) errors.push('用户确认摘要已过期，需要重新确认');
    }
  }
  const counts = Object.fromEntries(['pending', 'in-progress', 'completed', 'skipped', 'invalidated'].map(status => [status, state.queue.filter(entry => entry.status === status).length]));
  return {
    ok: errors.length === 0,
    mode,
    errors,
    summary: {
      projectId: context.project.manifest.id,
      phase: derivePhase(state),
      currentTable: state.currentTable,
      counts,
      preview: Object.fromEntries(['not-run', 'passed', 'skipped', 'failed'].map(status => [status, state.queue.filter(entry => entry.preview.status === status).length])),
      confirmation: state.confirmation,
    },
  };
}

export async function checkWorkflowProject(projectFile, options = {}) {
  const mode = options.mode || 'draft';
  try {
    const context = await loadWorkflowProject(projectFile);
    return await checkLoadedWorkflowProject(context, options);
  } catch (error) {
    return { ok: false, mode, errors: [error.message], summary: null };
  }
}

export async function getProjectStatus({ projectFile, refresh = false, confirm = false, dryRun = false } = {}) {
  const context = await loadWorkflowProject(projectFile);
  const current = await readCurrentTables(context, { allowMissing: true });
  const project = structuredClone(context.project);
  const state = structuredClone(context.state);
  if (current) {
    reconcileState(state, current.tables, project);
    state.tables.generatedSha256 = current.sha256;
  }
  if (confirm) {
    const provisional = await checkWorkflowProject(projectFile, { mode: 'release', requireConfirmation: false });
    if (!provisional.ok) throw new Error(`当前项目不能确认发布：\n${provisional.errors.join('\n')}`);
    state.confirmation = { confirmed: true, confirmedAt: nowIso(), summaryHash: workflowSummaryHash(project, state) };
  }
  updatePhase(state);
  if ((refresh || confirm) && !dryRun) await writeProjectPair(context, project, state);
  const report = refresh || confirm
    ? await checkLoadedWorkflowProject({ ...context, project, state }, { mode: 'draft', requireConfirmation: false })
    : await checkWorkflowProject(projectFile, { mode: 'draft', requireConfirmation: false });
  return {
    ok: report.ok,
    dryRun,
    projectId: project.manifest.id,
    phase: state.phase,
    currentTable: state.currentTable,
    queue: state.queue,
    confirmation: state.confirmation,
    draftErrors: report.errors,
  };
}

export async function importProjectTables({ projectFile, inputFile, overwrite = false, dryRun = false } = {}) {
  const context = await loadWorkflowProject(projectFile);
  const inputPath = path.resolve(assertDisplayText(inputFile, '导入文件'));
  const raw = await fs.readFile(inputPath);
  const document = JSON.parse(raw.toString('utf8'));
  const tables = validateChatSheetsDocument(document);
  const destinations = {
    original: path.join(context.root, TABLES_ORIGINAL_FILE),
    source: path.join(context.root, TABLES_SOURCE_DIR),
    generated: path.join(context.root, TABLES_GENERATED_FILE),
  };
  const occupied = [];
  for (const [kind, destination] of Object.entries(destinations)) if (await pathExists(destination)) occupied.push(kind);
  if (occupied.length && !overwrite) throw new Error(`导入目标已存在，拒绝覆盖：${occupied.join(', ')}`);
  const result = {
    ok: true,
    dryRun,
    inputFile: inputPath,
    tableCount: tables.length,
    tables: tables.map(table => ({ sheetKey: table.sheetKey, tableName: table.tableName, headers: table.headers })),
    destinations: Object.fromEntries(Object.entries(destinations).map(([key, value]) => [key, toForwardSlashes(path.relative(context.root, value))])),
  };
  if (dryRun) return result;
  const tableSource = require('./table-source.cjs');
  if (typeof tableSource.splitTemplateToDirectory !== 'function' || typeof tableSource.buildTemplateFromDirectory !== 'function') {
    throw new Error('tools/table-source.cjs 缺少可编程拆分/合成 API');
  }
  const staging = await fs.mkdtemp(path.join(context.root, '.yuzi-beautify-import-'));
  const stagedOriginal = path.join(staging, 'original', 'imported.json');
  const stagedSource = path.join(staging, 'source');
  const stagedGenerated = path.join(staging, 'generated', 'tables.json');
  try {
    await fs.mkdir(path.dirname(stagedOriginal), { recursive: true });
    await fs.mkdir(path.dirname(stagedGenerated), { recursive: true });
    await fs.writeFile(stagedOriginal, raw);
    await tableSource.splitTemplateToDirectory(document, stagedSource, { force: false });
    const rebuilt = await tableSource.buildTemplateFromDirectory(stagedSource);
    if (!isDeepStrictEqual(rebuilt, document)) throw new Error('Markdown 拆分/合成未保持深度等价');
    await fs.writeFile(stagedGenerated, jsonText(rebuilt), 'utf8');
    const backups = new Map();
    const installed = [];
    try {
      if (occupied.length) {
        const backupRoot = path.join(staging, 'backup');
        await fs.mkdir(backupRoot, { recursive: true });
        for (const [kind, destination] of Object.entries(destinations)) {
          if (!(await pathExists(destination))) continue;
          const backup = path.join(backupRoot, kind);
          await renameWithRetry(destination, backup);
          backups.set(destination, backup);
        }
      }
      await fs.mkdir(path.dirname(destinations.original), { recursive: true });
      await fs.mkdir(path.dirname(destinations.generated), { recursive: true });
      await renameWithRetry(stagedOriginal, destinations.original);
      installed.push(destinations.original);
      await renameWithRetry(stagedSource, destinations.source);
      installed.push(destinations.source);
      await renameWithRetry(stagedGenerated, destinations.generated);
      installed.push(destinations.generated);
    } catch (error) {
      for (const destination of installed.reverse()) await fs.rm(destination, { recursive: true, force: true });
      for (const [destination, backup] of backups) await renameWithRetry(backup, destination);
      throw error;
    }
    const project = structuredClone(context.project);
    project.tablesFile = TABLES_GENERATED_FILE;
    const generatedRaw = await fs.readFile(destinations.generated);
    const state = overwrite ? structuredClone(context.state) : emptyWorkflow(project.manifest.id);
    state.tables = {
      originalFile: TABLES_ORIGINAL_FILE,
      sourceDir: TABLES_SOURCE_DIR,
      generatedFile: TABLES_GENERATED_FILE,
      originalSha256: hash(raw),
      generatedSha256: hash(generatedRaw),
    };
    if (overwrite) reconcileState(state, tables, project);
    else state.queue = tables.map(newQueueEntry);
    resetConfirmation(state);
    updatePhase(state);
    try {
      await writeProjectPair(context, project, state);
    } catch (error) {
      for (const destination of Object.values(destinations)) await fs.rm(destination, { recursive: true, force: true });
      const backupRoot = path.join(staging, 'backup');
      if (await pathExists(backupRoot)) {
        for (const [kind, destination] of Object.entries(destinations)) {
          const backup = path.join(backupRoot, kind);
          if (await pathExists(backup)) await renameWithRetry(backup, destination);
        }
      }
      throw error;
    }
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  await fs.rm(staging, { recursive: true, force: true });
  return result;
}

export function parseCliArgs(argv, { repeatable = [], boolean = [] } = {}) {
  const repeatableSet = new Set(repeatable);
  const booleanSet = new Set(boolean);
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (!key) throw new Error('参数名不能为空');
    if (booleanSet.has(key)) {
      result[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} 缺少值`);
    index += 1;
    if (repeatableSet.has(key)) {
      result[key] ||= [];
      result[key].push(value);
    } else if (hasOwn(result, key)) {
      throw new Error(`参数重复：--${key}`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function promptForMissing(options, prompts) {
  const missing = prompts.filter(prompt => !options[prompt.key]);
  if (missing.length === 0) return options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`缺少参数：${missing.map(prompt => `--${prompt.key}`).join(', ')}`);
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const prompt of missing) options[prompt.key] = (await terminal.question(`${prompt.label}：`)).trim();
  } finally {
    terminal.close();
  }
  return options;
}

export function printCliResult(result, { json = false } = {}) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.message || JSON.stringify(result, null, 2));
}

export const PROJECT_CONSTANTS = Object.freeze({
  workflowFile: WORKFLOW_FILE,
  originalFile: TABLES_ORIGINAL_FILE,
  sourceDir: TABLES_SOURCE_DIR,
  generatedFile: TABLES_GENERATED_FILE,
  sha256Pattern: SHA256.source,
});
