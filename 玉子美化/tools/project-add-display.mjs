import process from 'node:process';
import { addProjectDisplay, parseCliArgs, printCliResult, promptForMissing } from './project-lib.mjs';

const options = parseCliArgs(process.argv.slice(2), {
  repeatable: ['field', 'asset', 'target', 'canvas', 'interaction'],
  boolean: ['theme', 'font', 'replace', 'dry-run', 'json'],
});
options.project ||= options._[0];
await promptForMissing(options, [
  { key: 'project', label: 'project.json 路径' },
  { key: 'kind', label: '小手机有三个弹窗接口：弹幕（barrage）、弹窗／浮窗（popup）、弹窗／插入正文（inline）。先选哪一个？前两种仅单表，只有插入正文可多表组合' },
  { key: 'id', label: '弹窗 id' },
  { key: 'name', label: '弹窗名称' },
  { key: 'mount', label: '项目内 mount.js 路径' },
]);
if (!options.target) {
  await promptForMissing(options, [{ key: 'table', label: '当前表的 sheetKey 或表名' }]);
}
if (!options.target && !options.field) {
  await promptForMissing(options, [{ key: 'field', label: '字段 JSON 数组，例如 ["姓名","状态"]' }]);
  try {
    options.field = JSON.parse(options.field);
  } catch {
    throw new Error('交互式字段必须是 JSON 字符串数组');
  }
}
if (options.field && (!Array.isArray(options.field) || options.field.some(value => typeof value !== 'string'))) throw new Error('--field 必须至少出现一次');
function parseJsonOptions(values, label) {
  return (values || []).map((value, index) => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`--${label}[${index + 1}] 必须是 JSON 对象`);
    }
  });
}
const targets = parseJsonOptions(options.target, 'target');
const canvases = parseJsonOptions(options.canvas, 'canvas');
const interactionAliases = new Map([['tab', 'tabs'], ['image-generation', 'image-generate']]);
const interactions = (options.interaction || []).map((value, index) => {
  const normalized = interactionAliases.get(value) || value;
  if (!['expand', 'tabs', 'append-input', 'image-generate'].includes(normalized)) {
    throw new Error(`--interaction[${index + 1}] 必须是 expand、tabs、append-input 或 image-generate`);
  }
  return normalized;
});
const integrations = {
  ...(options.theme ? { theme: true } : {}),
  ...(options.font ? { font: true } : {}),
};
const result = await addProjectDisplay({
  projectFile: options.project,
  table: options.table,
  id: options.id,
  name: options.name,
  kind: options.kind,
  fields: options.field || [],
  targets: targets.length > 0 ? targets : null,
  integrations: Object.keys(integrations).length > 0 ? integrations : null,
  imageGeneration: canvases.length > 0 ? { canvases } : null,
  interactions: interactions.length > 0 ? interactions : null,
  html: options.html || null,
  css: options.css || null,
  mount: options.mount,
  assets: options.asset || [],
  previewStatus: options['preview-status'] || 'not-run',
  previewNotes: options['preview-notes'] || '',
  replace: Boolean(options.replace),
  dryRun: Boolean(options['dry-run']),
});
printCliResult({ ...result, message: `${result.dryRun ? '计划登记' : '已登记'}弹窗：${result.display.id}` }, { json: options.json });
