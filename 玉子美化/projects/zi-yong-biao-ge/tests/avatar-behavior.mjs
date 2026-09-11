// DOM behavior only; not a visual preview and never invokes a real image service.
import assert from 'node:assert/strict';
import { mount } from '../pages/protagonist/mount.js';
import { createPreviewImageActions } from '../../../preview/image-actions.js';

class Element {
  constructor() { this.hidden = false; this.disabled = false; this.attributes = new Map(); this.events = new Map(); this.style = {}; this.children = []; this.classList = { toggle() {} }; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); if (key === 'src') this.src = ''; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  addEventListener(name, listener) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(listener); }
  removeEventListener(name, listener) { this.events.get(name)?.delete(listener); }
  fire(name) { if (this.disabled) return; for (const listener of this.events.get(name) || []) listener({ target: this }); }
  closest() { return null; }
  click() { this.fire('click'); }
}
class Root extends Element {
  set innerHTML(value) {
    this.nodes = new Map([['.protagonist-page', new Element()]]);
    for (const tag of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
      const element = new Element();
      element.hidden = /\shidden(?:\s|>)/.test(tag[0]);
      element.disabled = /\sdisabled(?:\s|>)/.test(tag[0]);
      this.nodes.set('#' + tag[1], element);
    }
  }
  querySelector(selector) { assert(this.nodes.has(selector), 'unknown selector ' + selector); return this.nodes.get(selector); }
}
const originalDocument = globalThis.document;
globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element(), createDocumentFragment: () => new Element() };
const values = { row_id: 'hero', 姓名: '主角', 性别: '女', 年龄: 22, 外貌特征: '短发', 身份: '旅人', 近况: '', 基础属性: '', 特有属性: '' };
const canvas = { tableName: '主角信息', stableIdentityFields: ['姓名'], canvas: 'protagonist-avatar', promptFields: ['性别','年龄','外貌特征','身份'] };
const images = new Map();
const fixtures = [];
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
function setup(delayMs = 0) {
  const root = new Root();
  const controller = new AbortController();
  let state = { version: 1, sheetKey: 'sheet_protagonist', tableName: '主角信息', headers: Object.keys(values), rows: [Object.values(values)] };
  const listeners = new Set();
  const mock = createPreviewImageActions({ declaration: { imageGeneration: { canvases: [canvas] } }, getState: () => state, signal: controller.signal, images, delayMs });
  const calls = { generate: 0, save: 0, delete: 0 };
  const actions = { ...mock.actions,
    generateImage: (...args) => { calls.generate++; return mock.actions.generateImage(...args); },
    saveImage: (...args) => { calls.save++; return mock.actions.saveImage(...args); },
    deleteImage: (...args) => { calls.delete++; return mock.actions.deleteImage(...args); },
  };
  const cleanup = mount({ root, actions, signal: controller.signal, getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    presetAssets: { async getUrl() { return 'legacy-avatar'; }, async save() {}, async delete() {} },
  });
  const fixture = { root, mock, calls, node: id => root.querySelector('#protagonist-avatar-' + id),
    update(row) { state = { ...state, version: state.version + 1, rows: [Object.values(row)] }; for (const listener of listeners) listener(state); },
    dispose() { controller.abort(); cleanup(); assert.equal(listeners.size, 0); for (const element of root.nodes.values()) for (const events of element.events.values()) assert.equal(events.size, 0); },
  };
  fixtures.push(fixture);
  return fixture;
}
try {
  let f = setup();
  await flush();
  assert.equal(f.node('image').src, 'legacy-avatar', '保留已有头像');
  assert.equal(f.node('generate').disabled, false);
  f.node('generate').click(); f.node('generate').click();
  assert.equal(f.calls.generate, 1, '重复点击只能发出一次请求');
  assert.equal(f.node('image').src, 'legacy-avatar', '等待期间保留旧图');
  await flush();
  const generated = f.node('image').src;
  f.update({ ...values, row_id: 'changed-number' }); await flush();
  assert.equal(f.node('image').src, generated, '编号变化但姓名不变，图片仍属于同一人物');
  assert.ok(generated.startsWith('data:image/svg+xml'));
  f.mock.setScenario('failed'); await flush();
  f.node('generate').click(); await flush();
  assert.equal(f.node('image').src, generated, '失败不替换旧图');
  f.mock.setScenario('disabled'); await flush();
  assert.equal(f.node('generate').disabled, true);
  f.node('input').files = [new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])], { type: 'image/png' })];
  f.node('input').fire('change'); await flush();
  const uploaded = f.node('image').src;
  assert.equal(f.calls.save, 1);
  assert.ok(uploaded.startsWith('data:image/png'));
  f.dispose();
  f = setup(); await flush();
  assert.equal(f.node('image').src, uploaded, '重开继续显示上传替换结果');
  f.node('clear').click(); await flush();
  assert.equal(f.calls.delete, 1);
  assert.equal(f.node('image').hidden, true);
  f.dispose();
  f = setup(); await flush();
  assert.equal(f.node('image').hidden, true, '持久清空不回退旧头像');
  f.update({ ...values, 姓名: '' }); await flush();
  assert.equal(f.node('generate').disabled, true);
  f.dispose();
  f = setup(35); await flush();
  f.node('generate').click();
  f.update({ ...values, 姓名: '另一人' });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(f.node('image').hidden, true, '迟到图片不得贴给新的主角，也不回退旧主角上传槽');
  f.dispose();
  f = setup(35); await flush();
  f.node('generate').click(); f.dispose();
  await new Promise(resolve => setTimeout(resolve, 50));
} finally {
  for (const fixture of fixtures) fixture.dispose();
  globalThis.document = originalDocument;
}
console.log('[protagonist-avatar] 通过：单次点击、失败保留、上传替换、持久清空、身份变化和销毁清理（非视觉模拟）');
