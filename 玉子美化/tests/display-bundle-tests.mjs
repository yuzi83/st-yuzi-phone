import assert from 'node:assert/strict';
import { validateBundle } from '../tools/lib.mjs';
import { validateSchema } from '../tools/schema-validator.mjs';

const displayOnlyBundle = {
  format: 'yuzi-beautify-preset',
  formatVersion: 3,
  apiVersion: 2,
  manifest: {
    id: 'inline-only',
    name: '正文卡片',
    version: '1.0.0',
    author: '测试作者',
    items: [],
    displays: [{
      id: 'square-inline',
      name: '广场正文卡片',
      kind: 'inline',
      targets: [{
        tableName: '广场表',
        fields: ['帖子编号', '正文'],
      }],
      entry: { mount: 'displays/square-inline/mount.js' },
      assets: [],
    }],
  },
  files: {
    'displays/square-inline/mount.js': {
      mimeType: 'text/javascript',
      encoding: 'text',
      content: 'export function mount(context) { context.root.textContent = context.getState().tableName; }',
    },
  },
};

assert.equal(validateSchema('bundle', displayOnlyBundle).ok, true, '展示-only Bundle 必须通过 Bundle Schema');
const validation = validateBundle(displayOnlyBundle, { strict: true });
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.equal(displayOnlyBundle.manifest.items.length, 0, '展示-only 不得需要伪造页面 item');
assert.equal(displayOnlyBundle.manifest.displays[0].targets.length, 1, '单表正文展示必须保留唯一目标声明');

const combined = structuredClone(displayOnlyBundle);
combined.manifest.id = 'combined-inline';
combined.manifest.displays[0].targets.push({ tableName: '任务表', fields: ['任务编号', '任务内容'] });
assert.equal(validateBundle(combined, { strict: true }).ok, true, '同一格式必须允许组合展示声明多个目标表');

const inlineWithHostCapabilities = structuredClone(displayOnlyBundle);
inlineWithHostCapabilities.manifest.id = 'inline-host-capabilities';
Object.assign(inlineWithHostCapabilities.manifest.displays[0], {
  integrations: { theme: true, font: true },
  imageGeneration: {
    canvases: [{
      tableName: '广场表',
      stableIdentityFields: ['帖子编号'],
      canvas: 'cover',
      promptFields: ['正文'],
    }],
  },
  interactions: ['expand', 'tabs', 'append-input', 'image-generate'],
});
assert.equal(validateBundle(inlineWithHostCapabilities, { strict: true }).ok, true, '正文展示必须接受顶层主题、字体、生图和局部交互合同');

const popupWithImageGeneration = structuredClone(inlineWithHostCapabilities);
popupWithImageGeneration.manifest.id = 'popup-no-image-generation';
popupWithImageGeneration.manifest.displays[0].kind = 'popup';
const popupValidation = validateBundle(popupWithImageGeneration, { strict: true });
assert.equal(popupValidation.ok, false, '浮窗不得声明生图或局部交互');
assert.equal(popupValidation.errors.some(error => /仅 inline/.test(error)), true);

const barrageWithInteractions = structuredClone(inlineWithHostCapabilities);
barrageWithInteractions.manifest.id = 'barrage-no-interactions';
barrageWithInteractions.manifest.displays[0].kind = 'barrage';
delete barrageWithInteractions.manifest.displays[0].imageGeneration;
const barrageValidation = validateBundle(barrageWithInteractions, { strict: true });
assert.equal(barrageValidation.ok, false, '弹幕不得声明局部交互');
assert.equal(barrageValidation.errors.some(error => /仅 inline/.test(error)), true);

console.log('[display-bundle-tests] 通过');
