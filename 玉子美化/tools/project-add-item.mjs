import process from 'node:process';
import { addProjectItem, parseCliArgs, printCliResult, promptForMissing } from './project-lib.mjs';

const options = parseCliArgs(process.argv.slice(2), {
  repeatable: ['field', 'asset', 'canvas'],
  boolean: ['theme', 'font', 'replace', 'dry-run', 'json'],
});
options.project ||= options._[0];
await promptForMissing(options, [
  { key: 'project', label: 'project.json 路径' },
  { key: 'table', label: '当前表的 sheetKey 或表名' },
  { key: 'id', label: 'item id' },
  { key: 'mount', label: '项目内 mount.js 路径' },
]);
if (!options.field) {
  await promptForMissing(options, [{ key: 'field', label: '字段 JSON 数组，例如 ["姓名","状态"]' }]);
  try {
    options.field = JSON.parse(options.field);
  } catch {
    throw new Error('交互式字段必须是 JSON 字符串数组');
  }
}
if (!Array.isArray(options.field) || options.field.some(value => typeof value !== 'string')) throw new Error('--field 必须至少出现一次');
const canvases = (options.canvas || []).map((value, index) => {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`--canvas[${index + 1}] 必须是 JSON 对象`);
  }
});
const integrations = {
  ...(options.theme ? { theme: true } : {}),
  ...(options.font ? { font: true } : {}),
};
const result = await addProjectItem({
  projectFile: options.project,
  table: options.table,
  id: options.id,
  name: options.name || '',
  fields: options.field,
  html: options.html || null,
  css: options.css || null,
  mount: options.mount,
  assets: options.asset || [],
  integrations: Object.keys(integrations).length > 0 ? integrations : null,
  imageGeneration: canvases.length > 0 ? { canvases } : null,
  previewStatus: options['preview-status'] || 'not-run',
  previewNotes: options['preview-notes'] || '',
  replace: Boolean(options.replace),
  dryRun: Boolean(options['dry-run']),
});
printCliResult({ ...result, message: `${result.dryRun ? '计划写入' : '已完成'} item：${result.item.id}` }, { json: options.json });
