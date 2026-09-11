const FIELDS = Object.freeze({
  name: '姓名',
  gender: '性别',
  age: '年龄',
  appearance: '外貌特征',
  identity: '身份',
  condition: '近况',
  base: '基础属性',
  special: '特有属性',
});

const AVATAR_SLOT = 'protagonist-avatar'; // Read legacy uploads only until a managed image/clear record exists.
const AVATAR_CANVAS = 'protagonist-avatar';
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ACTION_LABELS = Object.freeze({
  back: '返回',
  previousTable: '切换到上一张表',
  nextTable: '切换到下一张表',
  editCurrentTable: '打开编辑',
});

const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;

const TEMPLATE = `
  <style>
    .protagonist-page{--bg:#151512;--surface:#23231f;--raised:#2c2c26;--soft:#1d1d1a;--line:#4b4a40;--line-soft:#37372f;--text:#e7e3d9;--text-soft:#c4c0b5;--muted:#9e9b91;--moss:#92a07c;--moss-soft:rgba(146,160,124,.16);position:relative;display:flex;flex-direction:column;height:100%;min-height:inherit;overflow:hidden;container:protagonist/inline-size;color:var(--text);background:var(--bg);font-family:var(--yuzi-content-preset-font-family, var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif))}
    .protagonist-page,.protagonist-page *{box-sizing:border-box}.protagonist-page [hidden]{display:none!important}.protagonist-page button{font-family:inherit;-webkit-tap-highlight-color:transparent}.protagonist-page svg{display:block}.protagonist-icon svg,.protagonist-avatar-clear svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .protagonist-nav{flex:0 0 auto;padding-top:62px;background:rgba(29,29,26,.97);border-bottom:1px solid var(--line-soft)}
    .protagonist-nav-row{display:grid;grid-template-columns:clamp(44px,15cqi,60px) minmax(0,1fr) clamp(44px,15cqi,60px);align-items:center;height:54px;padding-inline:10px 12px}.protagonist-leading,.protagonist-trailing,.protagonist-center{display:flex;align-items:center}.protagonist-leading{justify-content:flex-start}.protagonist-trailing{justify-content:flex-end}.protagonist-center{min-width:0;justify-content:center;gap:4px;padding-inline:4px}
    .protagonist-title,.protagonist-name,.protagonist-section-title,.protagonist-kicker{font-family:var(--yuzi-content-preset-font-family, var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif));font-weight:600;letter-spacing:0}.protagonist-title{min-width:0;margin:0;overflow:hidden;color:var(--text-soft);font-size:17px;line-height:24px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .protagonist-icon{display:inline-grid;width:32px;height:32px;flex:0 0 32px;padding:4px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:8px;cursor:pointer}.protagonist-icon:hover{background:rgba(231,227,217,.07)}.protagonist-icon:disabled{opacity:.38;cursor:default}.protagonist-icon:disabled:hover{background:transparent}.protagonist-icon:focus-visible,.protagonist-avatar-pick:focus-visible,.protagonist-avatar-clear:focus-visible{outline:2px solid var(--moss);outline-offset:2px}
    .protagonist-content{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;padding:18px 16px 38px;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}.protagonist-content::-webkit-scrollbar{display:none;width:0;height:0}
    .protagonist-visuals{display:grid;grid-template-columns:112px minmax(0,1fr);min-height:152px;align-items:center;gap:16px;padding-bottom:19px;border-bottom:1px solid var(--line-soft)}
    .protagonist-avatar-shell{position:relative;width:112px;aspect-ratio:1}.protagonist-avatar-pick{position:relative;display:grid;width:100%;height:100%;padding:0;overflow:hidden;place-items:center;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:8px;cursor:pointer}.protagonist-avatar-pick:hover{border-color:rgba(146,160,124,.72)}.protagonist-avatar-pick.busy{cursor:wait;opacity:.72}.protagonist-avatar-pick img{width:100%;height:100%;object-fit:cover}.protagonist-avatar-plus{font-size:35px;font-weight:200;line-height:1}.protagonist-avatar-clear{position:absolute;top:5px;right:5px;display:grid;width:28px;height:28px;padding:4px;place-items:center;color:var(--text);background:rgba(21,21,18,.82);border:1px solid rgba(231,227,217,.28);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.24);cursor:pointer}.protagonist-avatar-clear svg{width:17px;height:17px}.protagonist-avatar-clear:disabled{opacity:.45;cursor:wait}
    .protagonist-avatar-generate{position:absolute;right:3px;bottom:3px;display:grid;width:28px;height:28px;padding:6px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:7px;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,.85))}.protagonist-avatar-generate svg{width:16px;height:16px;stroke-width:1.7}.protagonist-avatar-generate:hover{color:var(--moss)}.protagonist-avatar-generate:focus-visible{outline:2px solid var(--moss);outline-offset:1px}.protagonist-avatar-generate:disabled{opacity:.45;cursor:default}.protagonist-avatar-generate.busy{opacity:1;cursor:wait}.protagonist-avatar-generate.busy svg{animation:protagonist-generating 1.8s linear infinite}@keyframes protagonist-generating{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.protagonist-avatar-generate.busy svg{animation:none}}
    .protagonist-chart{display:grid;min-width:0;min-height:152px;place-items:center}.protagonist-radar{width:100%;height:152px;overflow:visible}.protagonist-radar-grid{fill:none;stroke:var(--line-soft);stroke-width:1}.protagonist-radar-axis{stroke:var(--line-soft);stroke-width:1}.protagonist-radar-shape{fill:rgba(146,160,124,.2);stroke:var(--moss);stroke-width:1.7;stroke-linejoin:round}.protagonist-radar-dot{fill:var(--moss)}.protagonist-radar-label{fill:var(--text-soft);font:10px var(--yuzi-content-preset-font-family, var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif))}.protagonist-radar-value{fill:var(--moss);font-weight:600}
    .protagonist-base-bars{display:grid;width:100%;gap:10px}.protagonist-profile{padding-top:20px}.protagonist-heading{margin-bottom:17px}.protagonist-kicker{margin:0 0 4px;color:var(--moss);font-size:12px;line-height:18px}.protagonist-name{margin:0;color:var(--text);font-size:30px;line-height:1.2;overflow-wrap:anywhere}.protagonist-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.protagonist-tag{max-width:100%;padding:4px 8px;color:var(--muted);background:var(--soft);border:1px solid var(--line-soft);border-radius:8px;font-size:12px;line-height:18px;overflow-wrap:anywhere}.protagonist-tag.identity{color:var(--text-soft)}
    .protagonist-section{padding:17px 0;border-top:1px solid var(--line-soft)}.protagonist-section-title{margin:0 0 8px;color:var(--moss);font-size:13px;line-height:20px}.protagonist-copy,.protagonist-raw{margin:0;color:var(--text-soft);font-size:14px;line-height:1.85;overflow-wrap:anywhere;white-space:pre-wrap}.protagonist-condition{font-size:15px;color:var(--text)}
    .protagonist-bars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px}.protagonist-bar{min-width:0}.protagonist-bar-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:5px}.protagonist-bar-name{min-width:0;overflow:hidden;color:var(--text-soft);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.protagonist-bar-value{flex:0 0 auto;color:var(--moss);font-size:12px;font-variant-numeric:tabular-nums;line-height:18px}.protagonist-bar-track{height:4px;overflow:hidden;background:var(--line-soft);border-radius:2px}.protagonist-bar-fill{display:block;height:100%;background:var(--moss);border-radius:inherit}
    .protagonist-empty{margin:34px 0 0;color:var(--muted);font-size:14px;line-height:22px;text-align:center}.protagonist-toast{position:absolute;z-index:20;right:14px;bottom:14px;left:14px;width:fit-content;max-width:calc(100% - 28px);margin:0 auto;padding:9px 12px;color:var(--text);background:rgba(44,44,38,.97);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.35);font-size:12px;line-height:18px;text-align:center}
    @container protagonist (max-width:330px){.protagonist-content{padding-inline:12px}.protagonist-visuals{grid-template-columns:100px minmax(0,1fr);gap:11px}.protagonist-avatar-shell{width:100px}.protagonist-radar{height:142px}.protagonist-name{font-size:27px}.protagonist-bars{gap-inline:10px}}
    @media (prefers-reduced-motion:reduce){.protagonist-page *{scroll-behavior:auto!important}}
  </style>
  <section class="protagonist-page">
    <header class="protagonist-nav"><div class="protagonist-nav-row">
      <div class="protagonist-leading"><button class="protagonist-icon" data-action="back" type="button" aria-label="返回上一层" title="返回上一层">${icon('M16 19L8 12L16 5')}</button></div>
      <div class="protagonist-center"><button id="protagonist-previous" class="protagonist-icon" data-action="previousTable" type="button" aria-label="上一张表" title="上一张表">${icon('M15 18L9 12L15 6')}</button><h1 class="protagonist-title">主角</h1><button id="protagonist-next" class="protagonist-icon" data-action="nextTable" type="button" aria-label="下一张表" title="下一张表">${icon('M9 18L15 12L9 6')}</button></div>
      <div class="protagonist-trailing"><button class="protagonist-icon" data-action="editCurrentTable" type="button" aria-label="编辑当前表" title="编辑当前表">${icon('M12 20H5a1 1 0 0 1-1-1v-7 M16.5 3.5a2.1 2.1 0 0 1 3 3L10 16l-4 1 1-4Z')}</button></div>
    </div></header>
    <main class="protagonist-content">
      <section class="protagonist-visuals" aria-label="人物头像与基础属性">
        <div class="protagonist-avatar-shell">
          <button id="protagonist-avatar-pick" class="protagonist-avatar-pick" type="button" aria-label="选择人物头像" title="选择人物头像"><span id="protagonist-avatar-plus" class="protagonist-avatar-plus" aria-hidden="true">+</span><img id="protagonist-avatar-image" alt="人物头像" hidden></button>
          <button id="protagonist-avatar-clear" class="protagonist-avatar-clear" type="button" aria-label="删除人物头像" title="删除人物头像" hidden>${icon('M3 6H21 M8 6V4H16V6 M19 6L18 20H6L5 6 M10 10V16 M14 10V16')}</button>
          <button id="protagonist-avatar-generate" class="protagonist-avatar-generate" type="button" aria-label="生成主角头像" title="生成主角头像" disabled>${icon('M12 3L14.3 9.7L21 12L14.3 14.3L12 21L9.7 14.3L3 12L9.7 9.7Z M20 2V6 M18 4H22')}</button>
          <input id="protagonist-avatar-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        </div>
        <div class="protagonist-chart"><svg id="protagonist-radar" class="protagonist-radar" viewBox="0 0 260 190" role="img" aria-label="基础属性维度图"></svg><div id="protagonist-base-bars" class="protagonist-base-bars" hidden></div></div>
      </section>
      <section id="protagonist-profile" class="protagonist-profile" hidden>
        <header class="protagonist-heading"><p class="protagonist-kicker">人物卷宗</p><h2 id="protagonist-name" class="protagonist-name">未命名</h2><div id="protagonist-meta" class="protagonist-meta"></div></header>
        <section class="protagonist-section"><h3 class="protagonist-section-title">近况</h3><p id="protagonist-condition" class="protagonist-copy protagonist-condition"></p></section>
        <section class="protagonist-section"><h3 class="protagonist-section-title">外貌特征</h3><p id="protagonist-appearance" class="protagonist-copy"></p></section>
        <section class="protagonist-section"><h3 class="protagonist-section-title">特有属性</h3><div id="protagonist-special-bars" class="protagonist-bars"></div><p id="protagonist-special-raw" class="protagonist-raw" hidden></p></section>
      </section>
      <p id="protagonist-empty" class="protagonist-empty">等待主角资料写入</p>
    </main>
    <p id="protagonist-toast" class="protagonist-toast" role="status" aria-live="polite" hidden></p>
  </section>`;

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function recordFromState(state) {
  const rows = state?.rows || [];
  if (!rows.length) return null;
  const headers = new Map((state.headers || []).map((header, index) => [normalize(header), index]));
  const row = rows[0] || [];
  const value = field => {
    const index = headers.get(normalize(field));
    return index === undefined ? '' : normalize(row[index]);
  };
  return Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, value(field)]));
}

function parseAttributes(source) {
  if (!source) return [];
  const entries = [];
  for (const part of normalize(source).split(/[;；]+/)) {
    const match = /^(.+?)\s*[=＝]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(part.trim());
    if (!match) continue;
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    entries.push({ name: match[1].trim(), value, percent: Math.max(0, Math.min(100, value)) });
  }
  return entries;
}

function failureMessage(action, result) {
  if (result?.status === 'unavailable') return `${ACTION_LABELS[action]}暂时不可用`;
  if (result?.status === 'stale') return '当前页面已经失效';
  return result?.message || `${ACTION_LABELS[action]}失败`;
}

function createSvg(tag, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function polygonPoints(count, radius, centerX = 130, centerY = 94) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
  });
}

function renderRadar(svg, attributes) {
  svg.replaceChildren();
  const display = attributes.length >= 3 ? attributes : Array.from({ length: 6 }, () => ({ name: '', value: 0, percent: 0 }));
  const count = display.length;
  const center = [130, 94];
  for (const level of [0.25, 0.5, 0.75, 1]) {
    const points = polygonPoints(count, 61 * level).map(point => point.join(',')).join(' ');
    svg.append(createSvg('polygon', { points, class: 'protagonist-radar-grid' }));
  }
  const outer = polygonPoints(count, 61);
  for (const point of outer) svg.append(createSvg('line', { x1: center[0], y1: center[1], x2: point[0], y2: point[1], class: 'protagonist-radar-axis' }));
  if (attributes.length < 3) return;
  const shape = display.map((attribute, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const radius = 61 * attribute.percent / 100;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });
  svg.append(createSvg('polygon', { points: shape.map(point => point.join(',')).join(' '), class: 'protagonist-radar-shape' }));
  for (const point of shape) svg.append(createSvg('circle', { cx: point[0], cy: point[1], r: 2.3, class: 'protagonist-radar-dot' }));
  display.forEach((attribute, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const x = center[0] + Math.cos(angle) * 86;
    const y = center[1] + Math.sin(angle) * 79;
    const text = createSvg('text', { x, y, class: 'protagonist-radar-label', 'text-anchor': Math.cos(angle) > .25 ? 'start' : Math.cos(angle) < -.25 ? 'end' : 'middle' });
    const name = createSvg('tspan', { x, dy: 0 });
    name.textContent = attribute.name;
    const value = createSvg('tspan', { x, dy: 12, class: 'protagonist-radar-value' });
    value.textContent = String(attribute.value);
    text.append(name, value);
    svg.append(text);
  });
}

function renderBars(root, attributes) {
  const fragment = document.createDocumentFragment();
  for (const attribute of attributes) {
    const item = document.createElement('div');
    item.className = 'protagonist-bar';
    const head = document.createElement('div');
    head.className = 'protagonist-bar-head';
    const name = document.createElement('span');
    name.className = 'protagonist-bar-name';
    name.textContent = attribute.name;
    name.title = attribute.name;
    const value = document.createElement('span');
    value.className = 'protagonist-bar-value';
    value.textContent = String(attribute.value);
    const track = document.createElement('div');
    track.className = 'protagonist-bar-track';
    const fill = document.createElement('span');
    fill.className = 'protagonist-bar-fill';
    fill.style.width = `${attribute.percent}%`;
    head.append(name, value);
    track.append(fill);
    item.append(head, track);
    fragment.append(item);
  }
  root.replaceChildren(fragment);
}

export function mount(context) {
  const root = context.root;
  root.innerHTML = TEMPLATE;
  const page = root.querySelector('.protagonist-page');
  const previousButton = root.querySelector('#protagonist-previous');
  const nextButton = root.querySelector('#protagonist-next');
  const avatarPick = root.querySelector('#protagonist-avatar-pick');
  const avatarInput = root.querySelector('#protagonist-avatar-input');
  const avatarImage = root.querySelector('#protagonist-avatar-image');
  const avatarPlus = root.querySelector('#protagonist-avatar-plus');
  const avatarClear = root.querySelector('#protagonist-avatar-clear');
  const avatarGenerate = root.querySelector('#protagonist-avatar-generate');
  const radar = root.querySelector('#protagonist-radar');
  const baseBars = root.querySelector('#protagonist-base-bars');
  const profile = root.querySelector('#protagonist-profile');
  const empty = root.querySelector('#protagonist-empty');
  const name = root.querySelector('#protagonist-name');
  const meta = root.querySelector('#protagonist-meta');
  const condition = root.querySelector('#protagonist-condition');
  const appearance = root.querySelector('#protagonist-appearance');
  const specialBars = root.querySelector('#protagonist-special-bars');
  const specialRaw = root.querySelector('#protagonist-special-raw');
  const toast = root.querySelector('#protagonist-toast');
  const assetApi = context.presetAssets;
  const persistentAssetsAvailable = assetApi && typeof assetApi.getUrl === 'function' && typeof assetApi.save === 'function' && typeof assetApi.delete === 'function';
  const imageApi = context.actions;
  const managedImagesAvailable = ['generateImage', 'readImage', 'saveImage', 'deleteImage', 'getImageGenerationState'].every(method => typeof imageApi[method] === 'function');
  let avatarRow = null;
  let avatarKey = '';
  let legacyAvatarKey = '';
  let imageRevision = 0;
  let availabilityRevision = 0;
  let generationAvailable = false;
  let disposed = false;
  let avatarBusy = false;
  let temporaryAvatarUrl = null;
  let toastTimer = null;

  const showToast = message => {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.textContent = '';
      toastTimer = null;
    }, 2200);
  };

  const setAvatarBusy = busy => {
    avatarBusy = busy;
    avatarPick.classList.toggle('busy', busy);
    avatarPick.disabled = busy || !avatarKey;
    avatarClear.disabled = busy || !avatarKey;
    avatarGenerate.disabled = busy || !generationAvailable || !avatarKey;
    avatarGenerate.classList.toggle('busy', busy && avatarGenerate.getAttribute('aria-busy') === 'true');
  };

  const setAvatar = url => {
    const visible = Boolean(url);
    avatarImage.hidden = !visible;
    avatarPlus.hidden = visible;
    avatarClear.hidden = !visible;
    if (visible) avatarImage.src = url;
    else avatarImage.removeAttribute('src');
  };

  const releaseTemporaryAvatar = () => {
    if (!temporaryAvatarUrl) return;
    URL.revokeObjectURL(temporaryAvatarUrl);
    temporaryAvatarUrl = null;
  };
  const stillCurrent = (key, revision) => !disposed && !context.signal.aborted && key === avatarKey && revision === imageRevision;
  const imageFailure = result => ({
    disabled: '当前未开启生图', unavailable: '当前图片功能不可用', busy: '头像正在处理中，请稍候',
    'invalid-target': '主角标识为空或重复，无法确定头像归属', 'invalid-input': '图片或头像配置无效',
    stale: '人物或页面已变化，本次未替换头像', failed: '图片处理失败，已保留原图',
  }[result?.status] || '图片处理未完成，已保留原图');

  const refreshImageAvailability = async () => {
    const revision = ++availabilityRevision;
    const key = avatarKey;
    generationAvailable = false;
    setAvatarBusy(avatarBusy);
    if (!managedImagesAvailable || !key) {
      avatarGenerate.title = !key ? '等待有效的主角资料' : '当前生图接口不可用';
      return;
    }
    try {
      const state = await imageApi.getImageGenerationState(AVATAR_CANVAS, avatarRow);
      if (disposed || key !== avatarKey || revision !== availabilityRevision) return;
      generationAvailable = state.available === true;
      avatarGenerate.title = generationAvailable ? '生成主角头像' : imageFailure(state);
    } catch {
      if (disposed || key !== avatarKey || revision !== availabilityRevision) return;
      avatarGenerate.title = '当前生图接口不可用';
    }
    setAvatarBusy(avatarBusy);
  };

  const loadAvatar = async () => {
    const key = avatarKey;
    const revision = ++imageRevision;
    if (!key) return;
    try {
      if (managedImagesAvailable) {
        const result = await imageApi.readImage(AVATAR_CANVAS, avatarRow);
        if (!stillCurrent(key, revision)) return;
        if (!result.ok) { showToast(imageFailure(result)); return; }
        if (result.imagePath) { setAvatar(result.imagePath); return; }
        // A persisted clear is authoritative: never fall back to the old upload slot.
        if (result.cleared) { setAvatar(null); return; }
      }
      if (persistentAssetsAvailable && key === legacyAvatarKey) {
        const url = await assetApi.getUrl(AVATAR_SLOT);
        if (stillCurrent(key, revision)) setAvatar(url);
      }
    } catch { if (stillCurrent(key, revision)) showToast('头像读取失败，已保留当前图片'); }
  };

  const changeAvatar = async (action, file) => {
    if (disposed || avatarBusy || !avatarKey) return;
    if (action === 'generateImage' && (!managedImagesAvailable || !generationAvailable)) return;
    if (file && (!ACCEPTED_IMAGE_TYPES.has(file.type) || !file.size || file.size > MAX_AVATAR_BYTES)) {
      showToast('请选择不超过 8 MiB 的 PNG、JPEG、WebP 或 GIF 图片');
      return;
    }
    const key = avatarKey;
    const revision = ++imageRevision;
    const row = avatarRow;
    avatarGenerate.setAttribute('aria-busy', String(action === 'generateImage'));
    avatarGenerate.setAttribute('aria-label', action === 'generateImage' ? '正在生成主角头像' : '生成主角头像');
    setAvatarBusy(true);
    try {
      if (managedImagesAvailable) {
        const result = await imageApi[action](AVATAR_CANVAS, row, file);
        if (!stillCurrent(key, revision)) return;
        if (!result?.ok) { showToast(imageFailure(result)); return; }
        if (action !== 'deleteImage' && !result.imagePath) { showToast('没有收到有效图片，已保留原图'); return; }
        setAvatar(action === 'deleteImage' ? null : result.imagePath);
        releaseTemporaryAvatar();
      } else if (action === 'saveImage') {
        const url = persistentAssetsAvailable ? await assetApi.save(AVATAR_SLOT, file) : URL.createObjectURL(file);
        if (!stillCurrent(key, revision)) { if (!persistentAssetsAvailable) URL.revokeObjectURL(url); return; }
        setAvatar(url);
        releaseTemporaryAvatar();
        if (!persistentAssetsAvailable) { temporaryAvatarUrl = url; showToast('本次头像仅临时显示'); }
      } else if (action === 'deleteImage') {
        if (persistentAssetsAvailable) await assetApi.delete(AVATAR_SLOT);
        if (!stillCurrent(key, revision)) return;
        setAvatar(null);
        releaseTemporaryAvatar();
      }
    } catch { if (stillCurrent(key, revision)) showToast('图片处理失败，已保留原图'); }
    finally {
      if (!disposed) {
        avatarGenerate.setAttribute('aria-busy', 'false');
        avatarGenerate.setAttribute('aria-label', '生成主角头像');
        setAvatarBusy(false);
        void refreshImageAvailability();
        if (key !== avatarKey) void loadAvatar();
      }
    }
  };
  const saveAvatar = file => changeAvatar('saveImage', file);
  const deleteAvatar = () => { void changeAvatar('deleteImage'); };
  const generateAvatar = () => { void changeAvatar('generateImage'); };

  const renderMeta = record => {
    const values = [record.gender || '性别未记录', record.age ? `${record.age}岁` : '年龄未记录'];
    values.push(...record.identity.split(/[，,]+/).map(value => value.trim()).filter(Boolean));
    const fragment = document.createDocumentFragment();
    values.forEach((value, index) => {
      const tag = document.createElement('span');
      tag.className = `protagonist-tag${index > 1 ? ' identity' : ''}`;
      tag.textContent = value;
      fragment.append(tag);
    });
    meta.replaceChildren(fragment);
  };

  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    previousButton.disabled = !state.canPrevious;
    nextButton.disabled = !state.canNext;
    const record = recordFromState(state);
    const row = state.rows?.[0];
    const mapped = row ? Object.fromEntries(state.headers.map((header, index) => [normalize(header), row[index]])) : null;
    const id = normalize(mapped?.[FIELDS.name]);
    const idIndex = state.headers.findIndex(header => normalize(header) === normalize(FIELDS.name));
    const unique = id && state.rows.filter(values => normalize(values[idIndex]) === id).length === 1;
    const nextKey = unique ? JSON.stringify([state.sheetKey, id]) : '';
    avatarRow = mapped;
    if (!legacyAvatarKey && nextKey) legacyAvatarKey = nextKey;
    if (nextKey !== avatarKey) {
      avatarKey = nextKey;
      ++imageRevision;
      setAvatar(null);
      releaseTemporaryAvatar();
      if (!avatarBusy) void loadAvatar();
    }
    void refreshImageAvailability();
    const baseAttributes = parseAttributes(record?.base || '');
    renderRadar(radar, baseAttributes);
    const useBaseBars = baseAttributes.length > 0 && baseAttributes.length < 3;
    radar.hidden = useBaseBars;
    baseBars.hidden = !useBaseBars;
    if (useBaseBars) renderBars(baseBars, baseAttributes);
    profile.hidden = !record;
    empty.hidden = Boolean(record);
    if (!record) return;
    name.textContent = record.name || '未命名';
    renderMeta(record);
    condition.textContent = record.condition || '暂无近况记录';
    appearance.textContent = record.appearance || '暂无外貌记录';
    const specialAttributes = parseAttributes(record.special);
    specialBars.hidden = specialAttributes.length === 0;
    specialRaw.hidden = specialAttributes.length > 0;
    if (specialAttributes.length) renderBars(specialBars, specialAttributes);
    else specialRaw.textContent = record.special || '暂无特有属性';
  };

  const runAction = async action => {
    try {
      const result = await context.actions[action]();
      if (!disposed && !result?.ok) showToast(failureMessage(action, result));
    } catch (error) {
      if (!disposed) showToast(error instanceof Error && error.message ? error.message : `${ACTION_LABELS[action]}失败`);
    }
  };

  const handlePageClick = event => {
    const actionButton = event.target.closest?.('[data-action]');
    if (actionButton && !actionButton.disabled) {
      const action = actionButton.dataset.action;
      if (typeof context.actions[action] === 'function') void runAction(action);
    }
  };

  const handleAvatarPick = () => {
    if (!avatarBusy) avatarInput.click();
  };
  const handleAvatarInput = () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = '';
    if (file) void saveAvatar(file);
  };
  const handleAvatarError = () => {
    setAvatar(null);
    showToast('头像无法显示');
  };

  page.addEventListener('click', handlePageClick);
  avatarPick.addEventListener('click', handleAvatarPick);
  avatarInput.addEventListener('change', handleAvatarInput);
  avatarClear.addEventListener('click', deleteAvatar);
  avatarGenerate.addEventListener('click', generateAvatar);
  avatarImage.addEventListener('error', handleAvatarError);
  const unsubscribe = context.subscribe(render);
  const unsubscribeImage = managedImagesAvailable && typeof imageApi.subscribeImageGeneration === 'function'
    ? imageApi.subscribeImageGeneration(() => { void refreshImageAvailability(); }) : () => {};
  render();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ++imageRevision;
    ++availabilityRevision;
    unsubscribeImage();
    if (toastTimer) clearTimeout(toastTimer);
    releaseTemporaryAvatar();
    page.removeEventListener('click', handlePageClick);
    avatarPick.removeEventListener('click', handleAvatarPick);
    avatarInput.removeEventListener('change', handleAvatarInput);
    avatarClear.removeEventListener('click', deleteAvatar);
    avatarGenerate.removeEventListener('click', generateAvatar);
    avatarImage.removeEventListener('error', handleAvatarError);
    context.signal.removeEventListener('abort', dispose);
    unsubscribe();
  };

  context.signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
