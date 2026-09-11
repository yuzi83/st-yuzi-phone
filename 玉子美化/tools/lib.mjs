import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { assertSchema, validateSchema } from './schema-validator.mjs';

export const FORMAT = 'yuzi-beautify-preset';
export const VERSION = 2;
export const API_VERSION = 1;
export const DISPLAY_VERSION = 3;
export const DISPLAY_API_VERSION = 2;
export const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
export const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const DRIVE_PATTERN = /^[a-z]:/i;

function rejectUnknownKeys(value, allowedKeys, prefix, errors) {
  if (!isObject(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${prefix} 包含未知字段：${key}`);
  }
}

function isPathInside(rootReal, fileReal) {
  const relative = path.relative(rootReal, fileReal);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function stripNonCode(source) {
  let result = '';
  let index = 0;
  let quote = '';
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      if (char === '\\') { result += '  '; index += 2; continue; }
      if (char === quote) quote = '';
      result += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      result += ' '.repeat((end < 0 ? source.length : end) - index);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const comment = source.slice(index, end < 0 ? source.length : end + 2);
      result += comment.replace(/[^\n]/g, ' ');
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') quote = char;
    result += char;
    index += 1;
  }
  return result;
}

function hasMountExport(file) {
  if (!file || file.encoding !== 'text' || !/^(?:text|application)\/javascript$/i.test(String(file.mimeType || '').trim())) return false;
  const source = stripNonCode(String(file.content ?? ''));
  return /^\s*export\s+(?:async\s+)?function\s+mount\s*\(\s*context\s*\)/m.test(source);
}

export const normalizeMatchText = value => String(value ?? '').normalize('NFKC').trim();

export function normalizePackagePath(value) {
  if (typeof value !== 'string' || value !== value.trim()) throw new Error('包路径必须是无首尾空白的字符串');
  const raw = value;
  if (!raw) throw new Error('包路径不能为空');
  if (/[\\?#\0-\x1f\x7f]/.test(raw)) throw new Error(`包路径包含非法字符：${raw}`);
  if (raw.startsWith('/') || DRIVE_PATTERN.test(raw) || SCHEME_PATTERN.test(raw)) throw new Error(`包路径必须是相对路径：${raw}`);
  const segments = raw.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error(`包路径包含无效段：${raw}`);
  return segments.join('/');
}

export function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('内容不是规范 Base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('内容不是规范 Base64');
  return bytes;
}

function isMessageTableName(value) {
  return normalizeMatchText(value) === '消息记录表';
}

export function normalizeTables(input) {
  if (!isObject(input)) throw new Error('表数据必须是对象或包含 chatSheets/sheets');
  const source = isObject(input.chatSheets) ? input.chatSheets : isObject(input.sheets) ? input.sheets : input;
  const shujukuRoot = input === source && input?.mate?.type === 'chatSheets';
  return Object.entries(source).filter(([sheetKey, sheet]) => {
    if (!isObject(sheet)) return false;
    if (shujukuRoot) return sheetKey.startsWith('sheet_') && Array.isArray(sheet.content);
    return Array.isArray(sheet.content) || Array.isArray(sheet.rows);
  }).map(([sheetKey, sheet]) => {
    const content = Array.isArray(sheet?.content) ? sheet.content : Array.isArray(sheet?.rows) ? [sheet.headers || [], ...sheet.rows] : [];
    const headers = Array.isArray(content[0]) ? content[0].map(value => String(value ?? '').trim()) : [];
    const tableName = String(sheet?.name || sheet?.tableName || sheetKey).trim();
    const isMessage = normalizeMatchText(sheet?.specialType).toLowerCase() === 'message' || isMessageTableName(tableName);
    return { sheetKey, tableName, headers, rows: content.slice(1).filter(Array.isArray), specialType: isMessage ? 'message' : String(sheet?.specialType || ''), isMessage };
  });
}

export function matchesTargetToTable(target, table) {
  if (normalizeMatchText(target?.tableName) !== normalizeMatchText(table?.tableName)) return false;
  const actualFields = new Set((table?.headers || []).map(normalizeMatchText).filter(Boolean));
  return (target?.fields || []).map(normalizeMatchText).every(field => actualFields.has(field));
}

export function matchesItemToTable(item, table) {
  return matchesTargetToTable(item?.target, table);
}

function validateFields(fields, prefix, errors) {
  if (!Array.isArray(fields)) { errors.push(`${prefix} 必须是数组`); return; }
  if (fields.length === 0) errors.push(`${prefix} 至少需要一个字段`);
  const seen = new Set();
  fields.forEach((field, index) => {
    if (typeof field !== 'string' || !normalizeMatchText(field)) { errors.push(`${prefix}[${index}] 必须是非空字符串`); return; }
    const normalized = normalizeMatchText(field);
    if (seen.has(normalized)) errors.push(`${prefix} NFKC 规范化后重复：${normalized}`);
    seen.add(normalized);
  });
}

function validateIntegrations(integrations, prefix, errors) {
  if (integrations === undefined) return;
  if (!isObject(integrations)) {
    errors.push(`${prefix}.integrations 必须是对象`);
    return;
  }
  rejectUnknownKeys(integrations, ['theme', 'font'], `${prefix}.integrations`, errors);
  if (Object.keys(integrations).length === 0) errors.push(`${prefix}.integrations 至少需要一个接入项`);
  for (const key of ['theme', 'font']) {
    if (integrations[key] !== undefined && integrations[key] !== true) errors.push(`${prefix}.integrations.${key} 只能为 true`);
  }
}

function validateItemCapabilities(item, prefix, errors) {
  validateIntegrations(item?.integrations, prefix, errors);
  if (item?.imageGeneration === undefined) return;
  if (!isObject(item.imageGeneration)) {
    errors.push(`${prefix}.imageGeneration 必须是对象`);
    return;
  }
  rejectUnknownKeys(item.imageGeneration, ['canvases'], `${prefix}.imageGeneration`, errors);
  const canvases = item.imageGeneration.canvases;
  if (!Array.isArray(canvases) || canvases.length === 0) {
    errors.push(`${prefix}.imageGeneration.canvases 至少需要一个画布`);
    return;
  }
  const tableName = normalizeMatchText(item?.target?.tableName);
  const targetFields = new Set((Array.isArray(item?.target?.fields) ? item.target.fields : []).map(normalizeMatchText));
  const canvasNames = new Set();
  for (const [canvasIndex, canvas] of canvases.entries()) {
    const canvasPrefix = `${prefix}.imageGeneration.canvases[${canvasIndex}]`;
    if (!isObject(canvas)) {
      errors.push(`${canvasPrefix} 必须是对象`);
      continue;
    }
    rejectUnknownKeys(canvas, ['tableName', 'stableIdentityFields', 'canvas', 'promptFields', 'promptSuffix'], canvasPrefix, errors);
    if (canvas.promptSuffix !== undefined && typeof canvas.promptSuffix !== 'string') errors.push(`${canvasPrefix}.promptSuffix 必须是字符串`);
    const canvasName = normalizeMatchText(canvas.canvas);
    const canvasTableName = normalizeMatchText(canvas.tableName);
    if (!canvasName) errors.push(`${canvasPrefix}.canvas 缺失`);
    if (canvasTableName !== tableName) errors.push(`${canvasPrefix}.tableName 必须等于 item.target.tableName`);
    if (canvasName && canvasNames.has(canvasName)) errors.push(`${canvasPrefix}.canvas 重复：${canvas.canvas}`);
    canvasNames.add(canvasName);
    validateFields(canvas.stableIdentityFields, `${canvasPrefix}.stableIdentityFields`, errors);
    validateFields(canvas.promptFields, `${canvasPrefix}.promptFields`, errors);
    for (const field of [...(Array.isArray(canvas.stableIdentityFields) ? canvas.stableIdentityFields : []), ...(Array.isArray(canvas.promptFields) ? canvas.promptFields : [])]) {
      if (!targetFields.has(normalizeMatchText(field))) errors.push(`${canvasPrefix} 引用了未在 item.target 声明的字段：${field}`);
    }
  }
}

function validateDisplayCapabilities(display, prefix, errors) {
  validateIntegrations(display?.integrations, prefix, errors);

  const targetByName = new Map((Array.isArray(display?.targets) ? display.targets : []).map(target => [normalizeMatchText(target.tableName), target]));
  const canvases = display?.imageGeneration?.canvases;
  if (display?.imageGeneration !== undefined) {
    if (display?.kind !== 'inline') errors.push(`${prefix}.imageGeneration 仅 inline 展示可用`);
    if (!isObject(display.imageGeneration)) {
      errors.push(`${prefix}.imageGeneration 必须是对象`);
    } else {
      rejectUnknownKeys(display.imageGeneration, ['canvases'], `${prefix}.imageGeneration`, errors);
      if (!Array.isArray(canvases) || canvases.length === 0) {
        errors.push(`${prefix}.imageGeneration.canvases 至少需要一个画布`);
      } else {
        const seenCanvases = new Set();
        for (const [canvasIndex, canvas] of canvases.entries()) {
          const canvasPrefix = `${prefix}.imageGeneration.canvases[${canvasIndex}]`;
          if (!isObject(canvas)) {
            errors.push(`${canvasPrefix} 必须是对象`);
            continue;
          }
          rejectUnknownKeys(canvas, ['tableName', 'stableIdentityFields', 'canvas', 'promptFields', 'promptSuffix'], canvasPrefix, errors);
          if (canvas.promptSuffix !== undefined && typeof canvas.promptSuffix !== 'string') errors.push(`${canvasPrefix}.promptSuffix 必须是字符串`);
          const canvasName = normalizeMatchText(canvas.canvas);
          const tableName = normalizeMatchText(canvas.tableName);
          if (!canvasName) errors.push(`${canvasPrefix}.canvas 缺失`);
          if (!tableName) errors.push(`${canvasPrefix}.tableName 缺失`);
          const canvasKey = `${tableName}\u0000${canvasName}`;
          if (canvasName && tableName && seenCanvases.has(canvasKey)) errors.push(`${canvasPrefix} 画布名称与归属表重复：${canvas.canvas}`);
          seenCanvases.add(canvasKey);
          validateFields(canvas.stableIdentityFields, `${canvasPrefix}.stableIdentityFields`, errors);
          validateFields(canvas.promptFields, `${canvasPrefix}.promptFields`, errors);
          const target = targetByName.get(tableName);
          if (!target) {
            errors.push(`${canvasPrefix}.tableName 必须属于展示 targets`);
          } else {
            const targetFields = new Set(target.fields.map(normalizeMatchText));
            for (const field of [...(Array.isArray(canvas.stableIdentityFields) ? canvas.stableIdentityFields : []), ...(Array.isArray(canvas.promptFields) ? canvas.promptFields : [])]) {
              if (!targetFields.has(normalizeMatchText(field))) errors.push(`${canvasPrefix} 引用了未在归属 target 声明的字段：${field}`);
            }
          }
        }
      }
    }
  }

  if (display?.interactions !== undefined) {
    if (display?.kind !== 'inline') errors.push(`${prefix}.interactions 仅 inline 展示可用`);
    if (!Array.isArray(display.interactions) || display.interactions.length === 0) {
      errors.push(`${prefix}.interactions 至少需要一个交互`);
    } else {
      const seen = new Set();
      for (const [index, interaction] of display.interactions.entries()) {
        if (!['expand', 'tabs', 'append-input', 'image-generate'].includes(interaction)) errors.push(`${prefix}.interactions[${index}] 无效`);
        if (seen.has(interaction)) errors.push(`${prefix}.interactions 重复：${interaction}`);
        seen.add(interaction);
      }
    }
  }
}

export function validateBundle(bundle, { strict = true, tables = null } = {}) {
  const structural = validateSchema('bundle', bundle);
  const errors = structural.errors.map(error => `Bundle Schema：${error}`);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) errors.push('Bundle 必须是对象');
  rejectUnknownKeys(bundle, ['format', 'formatVersion', 'apiVersion', 'manifest', 'files'], 'Bundle', errors);
  if (bundle?.format !== FORMAT) errors.push(`format 必须为 ${FORMAT}`);
  const isV2 = bundle?.formatVersion === VERSION && bundle?.apiVersion === API_VERSION;
  const isV3 = bundle?.formatVersion === DISPLAY_VERSION && bundle?.apiVersion === DISPLAY_API_VERSION;
  if (!isV2 && !isV3) errors.push(`仅支持 formatVersion/apiVersion ${VERSION}/${API_VERSION} 或 ${DISPLAY_VERSION}/${DISPLAY_API_VERSION}`);
  if (!isObject(bundle?.manifest)) errors.push('manifest 必须是对象');
  if (!isObject(bundle?.files)) errors.push('files 必须是对象');
  rejectUnknownKeys(bundle?.manifest, ['id', 'name', 'version', 'author', 'items', 'displays'], 'manifest', errors);
  const files = isObject(bundle?.files) ? bundle.files : {};
  const normalizedFiles = new Set();
  for (const [filePath, file] of Object.entries(files)) {
    let normalized;
    try { normalized = normalizePackagePath(filePath); } catch (error) { errors.push(error.message); continue; }
    if (normalizedFiles.has(normalized)) errors.push(`包路径规范化后重复：${normalized}`);
    normalizedFiles.add(normalized);
    if (!isObject(file)) { errors.push(`files.${filePath} 必须是对象`); continue; }
    rejectUnknownKeys(file, ['mimeType', 'encoding', 'content'], `files.${filePath}`, errors);
    if (!String(file.mimeType || '').trim()) errors.push(`files.${filePath}.mimeType 缺失`);
    if (!['text', 'base64'].includes(file.encoding)) errors.push(`files.${filePath}.encoding 无效`);
    if (typeof file.content !== 'string') errors.push(`files.${filePath}.content 必须是字符串`);
    if (file.encoding === 'base64' && typeof file.content === 'string') {
      try { decodeCanonicalBase64(file.content); } catch { errors.push(`files.${filePath}.content 不是规范 Base64`); }
    }
  }
  const items = Array.isArray(bundle?.manifest?.items) ? bundle.manifest.items : [];
  const displays = Array.isArray(bundle?.manifest?.displays) ? bundle.manifest.displays : [];
  if (strict && !String(bundle?.manifest?.id || '').trim()) errors.push('严格模式要求 manifest.id');
  if (strict && items.length + displays.length === 0) errors.push('严格模式要求至少一个页面或展示');
  if (isV2 && items.length === 0) errors.push('v2 严格模式要求至少一个 item');
  if (!isV3 && displays.length > 0) errors.push('v2 不支持 displays');
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const prefix = `items[${index}]`;
    if (!isObject(item)) { errors.push(`${prefix} 必须是对象`); continue; }
    rejectUnknownKeys(item, ['id', 'name', 'target', 'entry', 'assets', 'integrations', 'imageGeneration'], prefix, errors);
    rejectUnknownKeys(item.target, ['tableName', 'fields'], `${prefix}.target`, errors);
    rejectUnknownKeys(item.entry, ['html', 'css', 'mount'], `${prefix}.entry`, errors);
    const id = String(item?.id || '').trim();
    if (!id) errors.push(`${prefix}.id 缺失`); else if (ids.has(id)) errors.push(`${prefix}.id 重复`); else ids.add(id);
    if (!String(item?.target?.tableName || '').trim()) errors.push(`${prefix}.target.tableName 缺失`);
    validateFields(item?.target?.fields, `${prefix}.target.fields`, errors);
    if (hasOwn(item?.entry, 'js') || hasOwn(item?.entry, 'scriptMode') || hasOwn(item, 'scriptMode')) errors.push(`${prefix} 不接受 legacy entry.js/scriptMode`);
    const entries = ['html', 'css', 'mount'].filter(key => item?.entry?.[key]);
    if (!item?.entry?.mount) errors.push(`${prefix}.entry.mount 缺失`);
    for (const key of entries) {
      let entryPath;
      try { entryPath = normalizePackagePath(item.entry[key]); } catch (error) { errors.push(`${prefix}.entry.${key}: ${error.message}`); continue; }
      const file = files[entryPath];
      if (!hasOwn(files, entryPath)) errors.push(`${prefix}.entry.${key} 文件不存在`);
      if (key === 'mount' && file && !hasMountExport(file)) errors.push(`${prefix}.entry.mount 必须导出 mount(context)`);
      if (key === 'html' && file && (file.encoding !== 'text' || String(file.mimeType).toLowerCase() !== 'text/html')) errors.push(`${prefix}.entry.html 必须是 text/html 文本`);
      if (key === 'css' && file && (file.encoding !== 'text' || String(file.mimeType).toLowerCase() !== 'text/css')) errors.push(`${prefix}.entry.css 必须是 text/css 文本`);
    }
    if (item?.assets !== undefined && !Array.isArray(item.assets)) errors.push(`${prefix}.assets 必须是数组`);
    const assets = Array.isArray(item?.assets) ? item.assets : [];
    const assetPaths = new Set();
    for (const [assetIndex, asset] of assets.entries()) {
      let assetPath;
      try { assetPath = normalizePackagePath(asset); } catch (error) { errors.push(`${prefix}.assets[${assetIndex}]: ${error.message}`); continue; }
      if (assetPaths.has(assetPath)) errors.push(`${prefix}.assets 重复：${assetPath}`);
      assetPaths.add(assetPath);
      if (!hasOwn(files, assetPath)) errors.push(`${prefix}.assets[${assetIndex}] 文件不存在`);
    }
    validateItemCapabilities(item, prefix, errors);
    if (isV2 && (item?.integrations !== undefined || item?.imageGeneration !== undefined)) {
      errors.push(`${prefix} 声明宿主能力时必须使用 v3 Bundle`);
    }
    if (strict && Array.isArray(tables) && !tables.some(table => matchesItemToTable(item, table))) errors.push(`${prefix} 未匹配任何真实表`);
  }
  for (const [index, display] of displays.entries()) {
    const prefix = `displays[${index}]`;
    if (!isObject(display)) { errors.push(`${prefix} 必须是对象`); continue; }
    rejectUnknownKeys(display, ['id', 'name', 'kind', 'targets', 'entry', 'assets', 'integrations', 'imageGeneration', 'interactions'], prefix, errors);
    rejectUnknownKeys(display.entry, ['html', 'css', 'mount'], `${prefix}.entry`, errors);
    const id = String(display?.id || '').trim();
    if (!id) errors.push(`${prefix}.id 缺失`); else if (ids.has(id)) errors.push(`${prefix}.id 重复`); else ids.add(id);
    if (!String(display?.name || '').trim()) errors.push(`${prefix}.name 缺失`);
    if (!['inline', 'popup', 'barrage'].includes(display?.kind)) errors.push(`${prefix}.kind 无效`);
    const targets = Array.isArray(display?.targets) ? display.targets : [];
    if (targets.length === 0) errors.push(`${prefix}.targets 至少需要一个目标表`);
    const targetNames = new Set();
    for (const [targetIndex, target] of targets.entries()) {
      const targetPrefix = `${prefix}.targets[${targetIndex}]`;
      if (!isObject(target)) { errors.push(`${targetPrefix} 必须是对象`); continue; }
      rejectUnknownKeys(target, ['tableName', 'fields'], targetPrefix, errors);
      if (!String(target?.tableName || '').trim()) errors.push(`${targetPrefix}.tableName 缺失`);
      const targetName = normalizeMatchText(target?.tableName);
      if (targetName && targetNames.has(targetName)) errors.push(`${prefix}.targets 重复声明表：${target.tableName}`);
      targetNames.add(targetName);
      validateFields(target?.fields, `${targetPrefix}.fields`, errors);
    }
    validateDisplayCapabilities(display, prefix, errors);
    if (hasOwn(display?.entry, 'js') || hasOwn(display?.entry, 'scriptMode') || hasOwn(display, 'scriptMode')) errors.push(`${prefix} 不接受 legacy entry.js/scriptMode`);
    const entries = ['html', 'css', 'mount'].filter(key => display?.entry?.[key]);
    if (!display?.entry?.mount) errors.push(`${prefix}.entry.mount 缺失`);
    for (const key of entries) {
      let entryPath;
      try { entryPath = normalizePackagePath(display.entry[key]); } catch (error) { errors.push(`${prefix}.entry.${key}: ${error.message}`); continue; }
      const file = files[entryPath];
      if (!hasOwn(files, entryPath)) errors.push(`${prefix}.entry.${key} 文件不存在`);
      if (key === 'mount' && file && !hasMountExport(file)) errors.push(`${prefix}.entry.mount 必须导出 mount(context)`);
      if (key === 'html' && file && (file.encoding !== 'text' || String(file.mimeType).toLowerCase() !== 'text/html')) errors.push(`${prefix}.entry.html 必须是 text/html 文本`);
      if (key === 'css' && file && (file.encoding !== 'text' || String(file.mimeType).toLowerCase() !== 'text/css')) errors.push(`${prefix}.entry.css 必须是 text/css 文本`);
    }
    if (display?.assets !== undefined && !Array.isArray(display.assets)) errors.push(`${prefix}.assets 必须是数组`);
    const assetPaths = new Set();
    for (const [assetIndex, asset] of (Array.isArray(display?.assets) ? display.assets : []).entries()) {
      let assetPath;
      try { assetPath = normalizePackagePath(asset); } catch (error) { errors.push(`${prefix}.assets[${assetIndex}]: ${error.message}`); continue; }
      if (assetPaths.has(assetPath)) errors.push(`${prefix}.assets 重复：${assetPath}`);
      assetPaths.add(assetPath);
      if (!hasOwn(files, assetPath)) errors.push(`${prefix}.assets[${assetIndex}] 文件不存在`);
    }
    if (strict && Array.isArray(tables) && !targets.every(target => tables.some(table => matchesTargetToTable(target, table)))) {
      errors.push(`${prefix} 未匹配全部声明真实表`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function resolveProjectFile(root, source, label) {
  if (typeof source !== 'string' || source !== source.trim()) throw new Error(`${label} 必须是无首尾空白的项目内相对路径`);
  const raw = source;
  if (!raw || raw.includes('\\') || path.isAbsolute(raw) || DRIVE_PATTERN.test(raw) || SCHEME_PATTERN.test(raw) || raw.includes('\0')) throw new Error(`${label} 必须是项目内相对路径`);
  const rootReal = await fs.realpath(root);
  const candidate = path.resolve(rootReal, raw);
  if (!isPathInside(rootReal, candidate)) throw new Error(`${label} 越出项目目录：${raw}`);
  const fileReal = await fs.realpath(candidate);
  if (!isPathInside(rootReal, fileReal)) throw new Error(`${label} 越出项目目录：${raw}`);
  const stat = await fs.stat(fileReal);
  if (!stat.isFile()) throw new Error(`${label} 不是普通文件：${raw}`);
  return fileReal;
}

export async function loadSourceProject(projectFile) {
  const projectPath = projectFile instanceof URL ? fileURLToPath(projectFile) : path.resolve(String(projectFile));
  const project = await readJson(projectPath);
  assertSchema('project', project, 'project.json');
  return { projectPath, root: path.dirname(projectPath), project };
}

export async function loadProjectTables(projectFile) {
  const { projectPath, root, project } = await loadSourceProject(projectFile);
  const tablesPath = await resolveProjectFile(root, project.tablesFile, 'tablesFile');
  const tablesDocument = await readJson(tablesPath);
  return { projectPath, root, project, tablesPath, tablesDocument, tables: normalizeTables(tablesDocument) };
}

function canonicalManifest(manifest = {}) {
  return {
    ...manifest,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    items: (Array.isArray(manifest.items) ? manifest.items : []).map(item => ({
      ...item,
      id: item.id,
      name: item.name,
      target: { ...item.target, tableName: item.target?.tableName, fields: item.target?.fields },
      entry: { ...item.entry },
      ...(item.integrations ? { integrations: structuredClone(item.integrations) } : {}),
      ...(item.imageGeneration ? { imageGeneration: structuredClone(item.imageGeneration) } : {}),
      assets: Array.isArray(item.assets) ? item.assets : [],
    })),
    ...(Array.isArray(manifest.displays) && manifest.displays.length > 0
      ? {
          displays: manifest.displays.map(display => ({
            ...display,
            id: display.id,
            name: display.name,
            kind: display.kind,
            targets: (Array.isArray(display.targets) ? display.targets : []).map(target => ({
              ...target,
              tableName: target.tableName,
              fields: target.fields,
            })),
            entry: { ...display.entry },
            ...(display.integrations ? { integrations: structuredClone(display.integrations) } : {}),
            ...(display.imageGeneration ? { imageGeneration: structuredClone(display.imageGeneration) } : {}),
            ...(display.interactions ? { interactions: structuredClone(display.interactions) } : {}),
            assets: Array.isArray(display.assets) ? display.assets : [],
          })),
        }
      : {}),
  };
}

async function bundleMountModule(sourcePath, root) {
  const rootReal = await fs.realpath(root);
  const javascriptLoaders = new Map([
    ['.js', 'js'],
    ['.mjs', 'js'],
    ['.cjs', 'js'],
  ]);
  const containmentPlugin = {
    name: 'yuzi-project-containment',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (!args.importer) return undefined;
        if (args.path.startsWith('./') || args.path.startsWith('../')) return undefined;
        throw new Error(`module dependency 必须是 package-local 相对 JavaScript 路径：${args.path}`);
      });
      build.onLoad({ filter: /.*/, namespace: 'file' }, async (args) => {
        const fileReal = await fs.realpath(args.path);
        if (!isPathInside(rootReal, fileReal)) {
          throw new Error(`module dependency 越出项目目录：${fileReal}`);
        }
        const stat = await fs.stat(fileReal);
        if (!stat.isFile()) throw new Error(`module dependency 不是普通文件：${fileReal}`);
        const extension = path.extname(fileReal).toLowerCase();
        const loader = javascriptLoaders.get(extension);
        if (!loader) throw new Error(`module dependency 仅支持 JavaScript 文件：${fileReal}`);
        return {
          contents: await fs.readFile(fileReal),
          loader,
          resolveDir: path.dirname(fileReal),
        };
      });
    },
  };
  const result = await esbuild.build({
    absWorkingDir: rootReal,
    entryPoints: [sourcePath],
    outfile: path.join(root, '.yuzi-build', 'mount.js'),
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    charset: 'utf8',
    legalComments: 'none',
    sourcemap: false,
    minify: false,
    logLevel: 'silent',
    external: ['http://*', 'https://*'],
    plugins: [containmentPlugin],
  });
  const javascriptOutputs = (result.outputFiles || []).filter(output => path.extname(output.path).toLowerCase() === '.js');
  if (javascriptOutputs.length !== 1) throw new Error(`module mount 构建应产生一个 JavaScript 文件，实际 ${javascriptOutputs.length} 个`);
  return normalizeBundledMountExport(javascriptOutputs[0].text);
}

function normalizeBundledMountExport(source) {
  const exportBlockPattern = /\nexport\s*\{([\s\S]*?)\};\s*$/;
  const exportBlock = String(source).match(exportBlockPattern);
  if (!exportBlock) throw new Error('module mount 构建结果缺少导出块');
  const mountExport = exportBlock[1].split(',').map(value => value.trim()).find(value => /(?:^|\s+as\s+)mount$/.test(value));
  if (!mountExport) throw new Error('module mount 构建结果缺少 mount 导出');
  const localName = mountExport.split(/\s+as\s+/)[0].trim();
  const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = new RegExp(`(^|\\n)(\\s*)((?:async\\s+)?function\\s+)${escapedName}(\\s*\\(\\s*context\\s*\\))`);
  const withoutExports = String(source).replace(exportBlockPattern, '\n');
  if (!declarationPattern.test(withoutExports)) throw new Error('module mount 构建结果无法规范化为 export function mount(context)');
  return withoutExports.replace(declarationPattern, (_match, lineStart, indent, prefix, signature) => `${lineStart}${indent}export ${prefix}mount${signature}`);
}

function splitReferenceSuffix(reference) {
  const value = String(reference || '');
  const index = value.search(/[?#]/);
  return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index)];
}

function decodeCssEscapes(value) {
  const source = String(value ?? '');
  let output = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '\\') {
      output += char;
      continue;
    }
    if (index + 1 >= source.length) {
      output += '\uFFFD';
      continue;
    }
    const next = source[index + 1];
    if (next === '\n' || next === '\f') {
      index += 1;
      continue;
    }
    if (next === '\r') {
      index += source[index + 2] === '\n' ? 2 : 1;
      continue;
    }
    const hexMatch = source.slice(index + 1).match(/^[\da-f]{1,6}/i);
    if (hexMatch) {
      const codePoint = Number.parseInt(hexMatch[0], 16);
      output += codePoint === 0 || codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)
        ? '\uFFFD'
        : String.fromCodePoint(codePoint);
      index += hexMatch[0].length;
      if (source[index + 1] === '\r' && source[index + 2] === '\n') index += 2;
      else if (/[\t\n\f\r ]/.test(source[index + 1] || '')) index += 1;
      continue;
    }
    output += next;
    index += 1;
  }
  return output;
}

function consumeCssEscape(source, index) {
  if (source[index] !== '\\' || index + 1 >= source.length) return index + 1;
  const next = source[index + 1];
  if (next === '\r') return index + (source[index + 2] === '\n' ? 3 : 2);
  if (next === '\n' || next === '\f') return index + 2;
  const hexMatch = source.slice(index + 1).match(/^[\da-f]{1,6}/i);
  if (!hexMatch) return index + 2;
  let end = index + 1 + hexMatch[0].length;
  if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
  else if (/[\t\n\f\r ]/.test(source[end] || '')) end += 1;
  return end;
}

function isValidCssEscape(source, index) {
  const next = source[index + 1];
  return source[index] === '\\' && Boolean(next) && next !== '\n' && next !== '\r' && next !== '\f';
}

function isCssWhitespace(char) {
  return Boolean(char) && /[\t\n\f\r ]/.test(char);
}

function isCssNameChar(char) {
  return Boolean(char) && (/[-_a-z\d]/i.test(char) || char.codePointAt(0) >= 0x80);
}

function consumeCssName(source, index) {
  let end = index;
  while (end < source.length) {
    if (isCssNameChar(source[end])) { end += 1; continue; }
    if (isValidCssEscape(source, end)) { end = consumeCssEscape(source, end); continue; }
    break;
  }
  return end;
}

function consumeCssString(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === quote) return index + 1;
    if (char === '\n' || char === '\r' || char === '\f') return index;
    if (char === '\\') {
      if (index + 1 >= source.length) return source.length;
      index = consumeCssEscape(source, index);
      continue;
    }
    index += 1;
  }
  return source.length;
}

function consumeBadCssUrlRemnants(source, index) {
  let end = index;
  while (end < source.length) {
    if (source[end] === ')') return end + 1;
    if (isValidCssEscape(source, end)) {
      end = consumeCssEscape(source, end);
      continue;
    }
    end += 1;
  }
  return source.length;
}

function badCssUrl(source, index) {
  return { type: 'bad', end: consumeBadCssUrlRemnants(source, index) };
}

function consumeCssUrl(source, openParenIndex) {
  let index = openParenIndex + 1;
  while (/[\t\n\f\r ]/.test(source[index] || '')) index += 1;
  const quote = source[index];
  if (quote === '\'' || quote === '"') {
    const valueStart = index + 1;
    index = valueStart;
    while (index < source.length) {
      const char = source[index];
      if (char === quote) break;
      if (char === '\n' || char === '\r' || char === '\f') return badCssUrl(source, index);
      if (char === '\\') {
        if (index + 1 >= source.length) return badCssUrl(source, index);
        index = consumeCssEscape(source, index);
        continue;
      }
      index += 1;
    }
    if (source[index] !== quote) return badCssUrl(source, index);
    const rawReference = source.slice(valueStart, index);
    index += 1;
    while (/[\t\n\f\r ]/.test(source[index] || '')) index += 1;
    return source[index] === ')'
      ? { type: 'valid', end: index + 1, rawReference }
      : badCssUrl(source, index);
  }
  const valueStart = index;
  while (index < source.length) {
    const char = source[index];
    if (char === ')') return { type: 'valid', end: index + 1, rawReference: source.slice(valueStart, index).trimEnd() };
    if (/[\t\n\f\r ]/.test(char)) {
      const valueEnd = index;
      while (/[\t\n\f\r ]/.test(source[index] || '')) index += 1;
      return source[index] === ')'
        ? { type: 'valid', end: index + 1, rawReference: source.slice(valueStart, valueEnd) }
        : badCssUrl(source, index);
    }
    if (char === '\'' || char === '"' || char === '(' || char === '\u0000' || /[\u0001-\u0008\u000B\u000E-\u001F\u007F]/.test(char)) return badCssUrl(source, index);
    if (char === '\\') {
      if (!isValidCssEscape(source, index)) return badCssUrl(source, index);
      index = consumeCssEscape(source, index);
      continue;
    }
    index += 1;
  }
  return badCssUrl(source, index);
}

function isExternalReference(reference) {
  const value = String(reference || '').trim();
  return !value || value.startsWith('/') || value.startsWith('#') || SCHEME_PATTERN.test(value);
}

function resolveCssPackagePath(basePath, reference) {
  const [pathPart] = splitReferenceSuffix(reference);
  return normalizePackagePath(path.posix.normalize(path.posix.join(path.posix.dirname(basePath), pathPart)));
}

function transformCssUrls(css, transform) {
  const source = String(css);
  let output = '';
  let index = 0;
  while (index < source.length) {
    if (source[index] === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      const next = end < 0 ? source.length : end + 2;
      output += source.slice(index, next);
      index = next;
      continue;
    }
    if (source[index] === '\'' || source[index] === '"') {
      const end = consumeCssString(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (isCssNameChar(source[index]) || isValidCssEscape(source, index)) {
      const nameEnd = consumeCssName(source, index);
      const functionName = decodeCssEscapes(source.slice(index, nameEnd));
      if (functionName.toLowerCase() !== 'url' || source[nameEnd] !== '(') {
        output += source.slice(index, nameEnd);
        index = nameEnd;
        continue;
      }
      const parsed = consumeCssUrl(source, nameEnd);
      if (parsed.type === 'valid') {
        const raw = source.slice(index, parsed.end);
        output += transform(raw, parsed.rawReference);
      } else {
        output += source.slice(index, parsed.end);
      }
      index = parsed.end;
      continue;
    }
    output += source[index];
    index += 1;
  }
  return output;
}

function quoteCssUrl(reference) {
  const escaped = String(reference).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n?|\n|\f/g, '\\A ');
  return `url("${escaped}")`;
}

function rebaseImportedCssReferences(css, sourcePath, entryPath) {
  return transformCssUrls(css, (match, rawReference) => {
    const reference = decodeCssEscapes(rawReference);
    if (isExternalReference(reference)) return match;
    try {
      const [pathPart, suffix] = splitReferenceSuffix(reference);
      const targetPath = normalizePackagePath(path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), pathPart)));
      let relative = path.posix.relative(path.posix.dirname(entryPath), targetPath);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return quoteCssUrl(`${relative}${suffix}`);
    } catch {
      return match;
    }
  });
}

function consumeBalancedFunction(value, name) {
  const pattern = new RegExp(`^${name}\\s*\\(`, 'i');
  const match = String(value).match(pattern);
  if (!match) return null;
  let depth = 1;
  let quote = '';
  let index = match[0].length;
  for (; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === '\\') { index += 1; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '\'' || char === '"') { quote = char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return { body: value.slice(match[0].length, index), rest: value.slice(index + 1).trim() };
  }
  throw new Error(`CSS @import ${name}() 括号未闭合`);
}

function wrapImportedCss(css, prelude) {
  let rest = String(prelude || '').trim();
  let layer = null;
  let supports = null;
  const layerFunction = consumeBalancedFunction(rest, 'layer');
  if (layerFunction) {
    layer = layerFunction.body.trim();
    rest = layerFunction.rest;
  } else if (/^layer(?:\s|$)/i.test(rest)) {
    layer = '';
    rest = rest.replace(/^layer(?:\s+|$)/i, '').trim();
  }
  const supportsFunction = consumeBalancedFunction(rest, 'supports');
  if (supportsFunction) {
    supports = supportsFunction.body.trim();
    rest = supportsFunction.rest;
  }
  let result = css;
  if (rest) result = `@media ${rest} {\n${result}\n}`;
  if (supports !== null) {
    const supportsCondition = /^(?:selector|font-tech|font-format)\s*\(/i.test(supports) ? supports : `(${supports})`;
    result = `@supports ${supportsCondition} {\n${result}\n}`;
  }
  if (layer !== null) result = layer ? `@layer ${layer} {\n${result}\n}` : `@layer {\n${result}\n}`;
  return result;
}

function normalizeCssTrivia(value) {
  const source = String(value);
  let output = '';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      output += char;
      if (char === '\\' && index + 1 < source.length) {
        output += source[index + 1];
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new Error('CSS 注释未闭合');
      output += ' ';
      index = end + 1;
      continue;
    }
    output += char;
  }
  return output;
}

function findTopLevelCssAtRuleEnd(source, start) {
  let parentheses = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\'' || char === '"') {
      const end = consumeCssString(source, index);
      index = Math.max(index, end - 1);
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) return -1;
      index = end + 1;
      continue;
    }
    if (char === '(') parentheses += 1;
    if (char === ')') parentheses = Math.max(0, parentheses - 1);
    if (char === ';' && parentheses === 0) return index + 1;
    if (char === '{' && parentheses === 0) return -1;
  }
  return -1;
}

function transformTopLevelCssImports(css, transform) {
  const source = String(css);
  let output = '';
  let index = 0;
  let braceDepth = 0;
  while (index < source.length) {
    if (source[index] === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      const next = end < 0 ? source.length : end + 2;
      output += source.slice(index, next);
      index = next;
      continue;
    }
    if (source[index] === '\'' || source[index] === '"') {
      const end = consumeCssString(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (source[index] === '{') braceDepth += 1;
    if (source[index] === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (braceDepth === 0 && source[index] === '@') {
      const nameEnd = consumeCssName(source, index + 1);
      const atRuleName = decodeCssEscapes(source.slice(index + 1, nameEnd)).toLowerCase();
      const boundary = source[nameEnd];
      const hasImportPreludeBoundary = isCssWhitespace(boundary) || boundary === '"' || boundary === '\''
        || (boundary === '/' && source[nameEnd + 1] === '*');
      if (atRuleName === 'import' && hasImportPreludeBoundary) {
        const end = findTopLevelCssAtRuleEnd(source, index);
        if (end > index) {
          const canonicalRule = `@import ${source.slice(nameEnd, end)}`;
          output += transform(canonicalRule);
          index = end;
          continue;
        }
      }
    }
    output += source[index];
    index += 1;
  }
  return output;
}

function inlineLocalCssImports(entryPath, files, currentPath = entryPath, stack = []) {
  if (stack.includes(currentPath)) throw new Error(`CSS @import 循环：${[...stack, currentPath].join(' -> ')}`);
  const file = files[currentPath];
  if (!file || file.encoding !== 'text' || String(file.mimeType).toLowerCase() !== 'text/css') throw new Error(`CSS @import 文件不存在或不是 text/css：${currentPath}`);
  return transformTopLevelCssImports(file.content, (match) => {
    const normalizedRule = normalizeCssTrivia(match);
    const parsed = normalizedRule.match(/^@import\s+(?:url\(\s*(?:(['"])(.*?)\1|([^\s)'";]+))\s*\)|(['"])(.*?)\4)\s*([^;]*);$/is);
    if (!parsed) return match;
    const [, _urlQuote, quotedUrl, bareUrl, _plainQuote, quotedPlain, media] = parsed;
    const reference = decodeCssEscapes(quotedUrl ?? bareUrl ?? quotedPlain);
    if (isExternalReference(reference)) return match;
    const importedPath = resolveCssPackagePath(currentPath, reference);
    const imported = inlineLocalCssImports(entryPath, files, importedPath, [...stack, currentPath]);
    const rebased = rebaseImportedCssReferences(imported, importedPath, currentPath);
    return wrapImportedCss(rebased, media);
  });
}

export async function buildBundle(projectFile) {
  const { project, root, tables } = await loadProjectTables(projectFile);
  const fileEntries = [];
  const sourcePaths = new Map();
  const packagePaths = new Set();
  for (const [rawPackagePath, source] of Object.entries(project.files || {})) {
    const packagePath = normalizePackagePath(rawPackagePath);
    if (packagePaths.has(packagePath)) throw new Error(`包路径规范化后重复：${packagePath}`);
    packagePaths.add(packagePath);
    const encoding = project.encodings?.[rawPackagePath] || 'text';
    if (!['text', 'base64'].includes(encoding)) throw new Error(`${packagePath} encoding 无效`);
    const sourcePath = await resolveProjectFile(root, source, `files.${packagePath}`);
    sourcePaths.set(packagePath, sourcePath);
    const bytes = await fs.readFile(sourcePath);
    const content = encoding === 'base64' ? bytes.toString('base64') : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    fileEntries.push([packagePath, { mimeType: project.mimeTypes?.[rawPackagePath] || 'application/octet-stream', encoding, content }]);
  }
  const files = Object.fromEntries(fileEntries);
  const manifest = canonicalManifest(project.manifest);
  const renderables = [...manifest.items, ...(manifest.displays || [])];
  for (const mountPath of new Set(renderables.map(item => item.entry.mount).filter(Boolean))) {
    const sourcePath = sourcePaths.get(mountPath);
    if (!sourcePath) throw new Error(`entry.mount 未声明在 project.files：${mountPath}`);
    files[mountPath] = { mimeType: 'text/javascript', encoding: 'text', content: await bundleMountModule(sourcePath, root) };
  }
  for (const cssPath of new Set(renderables.map(item => item.entry.css).filter(Boolean))) {
    const inlined = inlineLocalCssImports(cssPath, files);
    files[cssPath] = { ...files[cssPath], content: rebaseImportedCssReferences(inlined, cssPath, cssPath) };
  }
  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => compareCodeUnits(a, b)));
  const usesV3 = (manifest.displays || []).length > 0
    || manifest.items.some(item => item.integrations || item.imageGeneration);
  if (usesV3) manifest.displays ||= [];
  const bundle = {
    format: FORMAT,
    formatVersion: usesV3 ? DISPLAY_VERSION : VERSION,
    apiVersion: usesV3 ? DISPLAY_API_VERSION : API_VERSION,
    manifest,
    files: sortedFiles,
  };
  const result = validateBundle(bundle, { strict: true, tables });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return bundle;
}

export const serializeBundle = bundle => `${JSON.stringify(bundle, null, 2)}\n`;

export function fileBytes(file) {
  if (file.encoding === 'base64') return decodeCanonicalBase64(file.content);
  return Buffer.from(file.content, 'utf8');
}
