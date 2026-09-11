const FIELDS = Object.freeze({
  rowId: 'row_id',
  name: '姓名',
  type: '角色类型',
  gender: '性别',
  age: '年龄',
  intro: '一句话介绍',
  appearance: '外貌特征',
  clothing: '穿着打扮',
  base: '基础属性',
  special: '特有属性',
  location: '所在地点',
  presence: '在场状态',
  relations: '人际关系',
});

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
    .important-npc-page{--bg:#151512;--surface:#23231f;--raised:#2c2c26;--soft:#1d1d1a;--line:#4b4a40;--line-soft:#37372f;--text:#e7e3d9;--text-soft:#c4c0b5;--muted:#9e9b91;--moss:#92a07c;--moss-deep:#6f7d5f;--moss-soft:rgba(146,160,124,.16);position:relative;display:flex;flex-direction:column;height:100%;min-height:inherit;overflow:hidden;container:important-npc/inline-size;color:var(--text);background:var(--bg);font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif)}
    .important-npc-page,.important-npc-page *{box-sizing:border-box}.important-npc-page [hidden]{display:none!important}.important-npc-page button{font-family:inherit;-webkit-tap-highlight-color:transparent}.important-npc-page svg{display:block}.important-npc-icon svg,.important-npc-avatar-clear svg,.important-npc-roster-close svg,.important-npc-roster-toggle svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .important-npc-nav{flex:0 0 auto;padding-top:62px;background:rgba(29,29,26,.97);border-bottom:1px solid var(--line-soft)}
    .important-npc-nav-row{display:grid;grid-template-columns:clamp(44px,15cqi,60px) minmax(0,1fr) clamp(44px,15cqi,60px);align-items:center;height:54px;padding-inline:10px 12px}.important-npc-leading,.important-npc-trailing,.important-npc-center{display:flex;align-items:center}.important-npc-leading{justify-content:flex-start}.important-npc-trailing{justify-content:flex-end}.important-npc-center{min-width:0;justify-content:center;gap:4px;padding-inline:4px}
    .important-npc-title,.important-npc-name,.important-npc-section-title,.important-npc-kicker,.important-npc-roster-title,.important-npc-group-title{font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);font-weight:600;letter-spacing:0}.important-npc-title{min-width:0;margin:0;overflow:hidden;color:var(--text-soft);font-size:17px;line-height:24px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .important-npc-icon{display:inline-grid;width:32px;height:32px;flex:0 0 32px;padding:4px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:8px;cursor:pointer}.important-npc-icon:hover{background:rgba(231,227,217,.07)}.important-npc-icon:disabled{opacity:.38;cursor:default}.important-npc-icon:disabled:hover{background:transparent}.important-npc-icon:focus-visible,.important-npc-avatar-pick:focus-visible,.important-npc-avatar-clear:focus-visible,.important-npc-roster-toggle:focus-visible,.important-npc-roster-close:focus-visible,.important-npc-person:focus-visible{outline:2px solid var(--moss);outline-offset:2px}
    .important-npc-content{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;padding:18px 16px 38px;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}.important-npc-content::-webkit-scrollbar,.important-npc-roster-body::-webkit-scrollbar{display:none;width:0;height:0}
    .important-npc-roster-toggle{position:absolute;z-index:8;top:160px;left:-8px;display:grid;width:28px;height:48px;padding:0 0 0 7px;place-items:center;color:var(--moss);background:var(--surface);border:1px solid var(--moss-deep);border-left:0;border-radius:0 8px 8px 0;box-shadow:4px 5px 15px rgba(0,0,0,.24);cursor:pointer}.important-npc-roster-toggle svg{width:17px;height:17px}
    .important-npc-visuals{display:grid;grid-template-columns:112px minmax(0,1fr);min-height:152px;align-items:center;gap:16px;padding-bottom:19px;border-bottom:1px solid var(--line-soft)}
    .important-npc-avatar-shell{position:relative;width:112px;aspect-ratio:1}.important-npc-avatar-pick{position:relative;display:grid;width:100%;height:100%;padding:0;overflow:hidden;place-items:center;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:8px;cursor:pointer}.important-npc-avatar-pick:hover{border-color:rgba(146,160,124,.72)}.important-npc-avatar-pick.busy{cursor:wait;opacity:.72}.important-npc-avatar-pick img{width:100%;height:100%;object-fit:cover}.important-npc-avatar-plus{font-size:35px;font-weight:200;line-height:1}.important-npc-avatar-clear{position:absolute;top:5px;right:5px;display:grid;width:28px;height:28px;padding:4px;place-items:center;color:var(--text);background:rgba(21,21,18,.82);border:1px solid rgba(231,227,217,.28);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.24);cursor:pointer}.important-npc-avatar-clear svg{width:17px;height:17px}.important-npc-avatar-clear:disabled{opacity:.45;cursor:wait}
    .important-npc-chart{display:grid;min-width:0;min-height:152px;place-items:center}.important-npc-radar{width:100%;height:152px;overflow:visible}.important-npc-radar-grid{fill:none;stroke:var(--line-soft);stroke-width:1}.important-npc-radar-axis{stroke:var(--line-soft);stroke-width:1}.important-npc-radar-shape{fill:rgba(146,160,124,.2);stroke:var(--moss);stroke-width:1.7;stroke-linejoin:round}.important-npc-radar-dot{fill:var(--moss)}.important-npc-radar-label{fill:var(--text-soft);font:10px var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif)}.important-npc-radar-value{fill:var(--moss);font-weight:600}.important-npc-base-bars{display:grid;width:100%;gap:10px}.important-npc-base-raw{align-self:center;text-align:center}
    .important-npc-profile{padding-top:20px;animation:important-npc-enter .18s ease}.important-npc-heading{margin-bottom:17px}.important-npc-kicker{margin:0 0 4px;color:var(--moss);font-size:12px;line-height:18px}.important-npc-name{margin:0;color:var(--text);font-size:30px;line-height:1.2;overflow-wrap:anywhere}.important-npc-intro{margin:8px 0 0;color:var(--text-soft);font-size:14px;line-height:1.7;overflow-wrap:anywhere}.important-npc-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}.important-npc-tag{max-width:100%;padding:4px 8px;color:var(--muted);background:var(--soft);border:1px solid var(--line-soft);border-radius:8px;font-size:12px;line-height:18px;overflow-wrap:anywhere}.important-npc-tag.type{color:var(--text-soft)}
    .important-npc-location-band{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin:0 0 3px;padding:11px 12px;color:var(--text-soft);background:var(--soft);border:1px solid var(--line-soft);border-radius:8px;font-size:13px;line-height:20px}.important-npc-location{min-width:0;overflow-wrap:anywhere}.important-npc-presence{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.important-npc-status-dot{width:7px;height:7px;flex:0 0 7px;background:var(--muted);border-radius:50%}.important-npc-status-dot.present{background:var(--moss)}
    .important-npc-section{padding:17px 0;border-top:1px solid var(--line-soft)}.important-npc-section-title{margin:0 0 8px;color:var(--moss);font-size:13px;line-height:20px}.important-npc-copy,.important-npc-raw{margin:0;color:var(--text-soft);font-size:14px;line-height:1.85;overflow-wrap:anywhere;white-space:pre-wrap}
    .important-npc-relations{display:grid;gap:9px}.important-npc-relation{display:grid;grid-template-columns:minmax(74px,.72fr) minmax(0,1.4fr);align-items:start;gap:9px}.important-npc-relation-name{padding-top:3px;color:var(--text-soft);font-size:13px;line-height:20px;overflow-wrap:anywhere}.important-npc-relation-tags{display:flex;flex-wrap:wrap;gap:6px}.important-npc-relation-tag{padding:3px 7px;color:var(--muted);background:var(--soft);border:1px solid var(--line-soft);border-radius:8px;font-size:11px;line-height:17px;overflow-wrap:anywhere}
    .important-npc-bars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px}.important-npc-bar{min-width:0}.important-npc-bar-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:5px}.important-npc-bar-name{min-width:0;overflow:hidden;color:var(--text-soft);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.important-npc-bar-value{flex:0 0 auto;color:var(--moss);font-size:12px;font-variant-numeric:tabular-nums;line-height:18px}.important-npc-bar-track{height:4px;overflow:hidden;background:var(--line-soft);border-radius:2px}.important-npc-bar-fill{display:block;height:100%;background:var(--moss);border-radius:inherit}
    .important-npc-empty{display:grid;min-height:260px;place-items:center}.important-npc-empty-inner{text-align:center}.important-npc-empty-grid{width:142px;height:112px;margin:0 auto 18px;opacity:.46}.important-npc-empty-text{margin:0;color:var(--muted);font-size:14px;line-height:22px}
    .important-npc-overlay{position:absolute;z-index:15;inset:0;display:grid;padding:116px 14px 24px;place-items:center;background:rgba(8,8,7,.7)}.important-npc-roster{display:flex;flex-direction:column;width:86%;max-height:70%;overflow:hidden;background:var(--raised);border:1px solid var(--line);border-radius:8px;box-shadow:0 20px 46px rgba(0,0,0,.48)}.important-npc-roster-head{display:grid;grid-template-columns:32px minmax(0,1fr) 32px;align-items:center;min-height:52px;padding:8px 9px 8px 11px;border-bottom:1px solid var(--line-soft)}.important-npc-roster-title{grid-column:2;margin:0;color:var(--text-soft);font-size:15px;line-height:22px;text-align:center}.important-npc-roster-close{grid-column:3;display:grid;width:32px;height:32px;padding:4px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:8px;cursor:pointer}.important-npc-roster-close:hover{background:rgba(231,227,217,.07)}.important-npc-roster-body{min-height:0;overflow-y:auto;padding:15px 13px 19px;scrollbar-width:none;-ms-overflow-style:none}.important-npc-group+.important-npc-group{margin-top:19px}.important-npc-group-title{display:flex;align-items:center;gap:7px;margin:0 0 12px;color:var(--moss);font-size:12px;line-height:18px}.important-npc-group-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px 9px}.important-npc-person{display:grid;min-width:0;padding:3px 0;place-items:center;color:var(--text-soft);background:transparent;border:0;border-radius:8px;cursor:pointer}.important-npc-person-avatar{position:relative;display:grid;width:60px;height:60px;overflow:hidden;place-items:center;color:var(--text-soft);background:var(--surface);border:1px solid var(--line);border-radius:50%;font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);font-size:21px}.important-npc-person[aria-current="true"] .important-npc-person-avatar{border-color:var(--moss);box-shadow:0 0 0 1px var(--moss)}.important-npc-person-avatar img{width:100%;height:100%;object-fit:cover}.important-npc-person-dot{position:absolute;right:2px;bottom:3px;width:9px;height:9px;background:var(--muted);border:2px solid var(--surface);border-radius:50%}.important-npc-person-dot.present{background:var(--moss)}.important-npc-person-name{display:block;width:100%;margin-top:7px;overflow:hidden;font-size:11px;line-height:16px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .important-npc-toast{position:absolute;z-index:20;right:14px;bottom:14px;left:14px;width:fit-content;max-width:calc(100% - 28px);margin:0 auto;padding:9px 12px;color:var(--text);background:rgba(44,44,38,.97);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.35);font-size:12px;line-height:18px;text-align:center}
    @keyframes important-npc-enter{from{opacity:.25}to{opacity:1}}
    @container important-npc (max-width:330px){.important-npc-content{padding-inline:12px}.important-npc-visuals{grid-template-columns:100px minmax(0,1fr);gap:11px}.important-npc-avatar-shell{width:100px}.important-npc-radar{height:142px}.important-npc-name{font-size:27px}.important-npc-bars{gap-inline:10px}.important-npc-roster{width:92%}.important-npc-group-grid{gap-inline:6px}.important-npc-person-avatar{width:56px;height:56px}}
    @media (prefers-reduced-motion:reduce){.important-npc-page *{animation:none!important;scroll-behavior:auto!important}}
  </style>
  <section class="important-npc-page">
    <header class="important-npc-nav"><div class="important-npc-nav-row">
      <div class="important-npc-leading"><button class="important-npc-icon" data-action="back" type="button" aria-label="返回上一层" title="返回上一层">${icon('M16 19L8 12L16 5')}</button></div>
      <div class="important-npc-center"><button id="important-npc-previous" class="important-npc-icon" data-action="previousTable" type="button" aria-label="上一张表" title="上一张表">${icon('M15 18L9 12L15 6')}</button><h1 class="important-npc-title">重要角色</h1><button id="important-npc-next" class="important-npc-icon" data-action="nextTable" type="button" aria-label="下一张表" title="下一张表">${icon('M9 18L15 12L9 6')}</button></div>
      <div class="important-npc-trailing"><button class="important-npc-icon" data-action="editCurrentTable" type="button" aria-label="编辑当前表" title="编辑当前表">${icon('M12 20H5a1 1 0 0 1-1-1v-7 M16.5 3.5a2.1 2.1 0 0 1 3 3L10 16l-4 1 1-4Z')}</button></div>
    </div></header>
    <button id="important-npc-roster-toggle" class="important-npc-roster-toggle" type="button" aria-label="选择重要角色" title="选择重要角色" aria-expanded="false">${icon('M9 18L15 12L9 6')}</button>
    <main id="important-npc-content" class="important-npc-content">
      <div id="important-npc-filled" hidden>
        <section class="important-npc-visuals" aria-label="人物头像与基础属性">
          <div class="important-npc-avatar-shell">
            <button id="important-npc-avatar-pick" class="important-npc-avatar-pick" type="button" aria-label="选择人物头像" title="选择人物头像"><span id="important-npc-avatar-plus" class="important-npc-avatar-plus" aria-hidden="true">+</span><img id="important-npc-avatar-image" alt="人物头像" hidden></button>
            <button id="important-npc-avatar-clear" class="important-npc-avatar-clear" type="button" aria-label="删除人物头像" title="删除人物头像" hidden>${icon('M3 6H21 M8 6V4H16V6 M19 6L18 20H6L5 6 M10 10V16 M14 10V16')}</button>
            <input id="important-npc-avatar-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          </div>
          <div class="important-npc-chart"><svg id="important-npc-radar" class="important-npc-radar" viewBox="0 0 260 190" role="img" aria-label="基础属性维度图"></svg><div id="important-npc-base-bars" class="important-npc-base-bars" hidden></div><p id="important-npc-base-raw" class="important-npc-raw important-npc-base-raw" hidden></p></div>
        </section>
        <section id="important-npc-profile" class="important-npc-profile">
          <header class="important-npc-heading"><p class="important-npc-kicker">人物卷宗</p><h2 id="important-npc-name" class="important-npc-name">未命名</h2><p id="important-npc-intro" class="important-npc-intro"></p><div id="important-npc-meta" class="important-npc-meta"></div></header>
          <div class="important-npc-location-band"><span id="important-npc-location" class="important-npc-location"></span><span class="important-npc-presence"><i id="important-npc-presence-dot" class="important-npc-status-dot" aria-hidden="true"></i><span id="important-npc-presence"></span></span></div>
          <section class="important-npc-section"><h3 class="important-npc-section-title">外貌特征</h3><p id="important-npc-appearance" class="important-npc-copy"></p></section>
          <section class="important-npc-section"><h3 class="important-npc-section-title">穿着打扮</h3><p id="important-npc-clothing" class="important-npc-copy"></p></section>
          <section class="important-npc-section"><h3 class="important-npc-section-title">人际关系</h3><div id="important-npc-relations" class="important-npc-relations"></div><p id="important-npc-relations-raw" class="important-npc-raw" hidden></p></section>
          <section class="important-npc-section"><h3 class="important-npc-section-title">特有属性</h3><div id="important-npc-special-bars" class="important-npc-bars"></div><p id="important-npc-special-raw" class="important-npc-raw" hidden></p></section>
        </section>
      </div>
      <section id="important-npc-empty" class="important-npc-empty"><div class="important-npc-empty-inner"><svg id="important-npc-empty-grid" class="important-npc-empty-grid" viewBox="0 0 260 190" aria-hidden="true"></svg><p class="important-npc-empty-text">等待重要角色登场</p></div></section>
    </main>
    <div id="important-npc-overlay" class="important-npc-overlay" hidden>
      <section class="important-npc-roster" role="dialog" aria-modal="true" aria-labelledby="important-npc-roster-title">
        <header class="important-npc-roster-head"><h2 id="important-npc-roster-title" class="important-npc-roster-title">选择人物</h2><button id="important-npc-roster-close" class="important-npc-roster-close" type="button" aria-label="关闭人物选择" title="关闭">${icon('M6 6L18 18 M18 6L6 18')}</button></header>
        <div id="important-npc-roster-body" class="important-npc-roster-body"></div>
      </section>
    </div>
    <p id="important-npc-toast" class="important-npc-toast" role="status" aria-live="polite" hidden></p>
  </section>`;

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function recordsFromState(state) {
  const headers = new Map((state?.headers || []).map((header, index) => [normalize(header), index]));
  return (state?.rows || []).map((row, index) => {
    const value = field => {
      const column = headers.get(normalize(field));
      return column === undefined ? '' : normalize(row?.[column]);
    };
    const record = Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, value(field)]));
    record.key = record.rowId || `row-${index + 1}`;
    return record;
  });
}

function parseAttributes(source) {
  const text = normalize(source);
  if (!text) return { entries: [], valid: true };
  const entries = [];
  for (const part of text.split(/[;；]+/).map(value => value.trim()).filter(Boolean)) {
    const match = /^(.+?)\s*[=＝]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(part);
    if (!match) return { entries: [], valid: false };
    const value = Number(match[2]);
    if (!Number.isFinite(value)) return { entries: [], valid: false };
    entries.push({ name: match[1].trim(), value, percent: Math.max(0, Math.min(100, value)) });
  }
  return { entries, valid: entries.length > 0 };
}

function parseRelations(source) {
  const text = normalize(source);
  if (!text) return { entries: [], valid: true };
  const entries = [];
  for (const part of text.split(/[;；]+/).map(value => value.trim()).filter(Boolean)) {
    const match = /^([^:：]+)[:：](.+)$/.exec(part);
    if (!match) return { entries: [], valid: false };
    const tags = match[2].split(/[，,]+/).map(value => value.trim()).filter(Boolean);
    if (!tags.length) return { entries: [], valid: false };
    entries.push({ name: match[1].trim(), tags });
  }
  return { entries, valid: entries.length > 0 };
}

function isPresent(record) {
  const value = normalize(record?.presence);
  return value === '在场' || value === '在场中' || value === '当前在场';
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

function renderRadar(svg, attributes, empty = false) {
  svg.replaceChildren();
  const display = attributes.length >= 3 ? attributes : Array.from({ length: 6 }, () => ({ name: '', value: 0, percent: 0 }));
  const count = display.length;
  const center = [130, 94];
  for (const level of [0.25, 0.5, 0.75, 1]) {
    svg.append(createSvg('polygon', { points: polygonPoints(count, 61 * level).map(point => point.join(',')).join(' '), class: 'important-npc-radar-grid' }));
  }
  const outer = polygonPoints(count, 61);
  for (const point of outer) svg.append(createSvg('line', { x1: center[0], y1: center[1], x2: point[0], y2: point[1], class: 'important-npc-radar-axis' }));
  if (empty || attributes.length < 3) return;
  const shape = display.map((attribute, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const radius = 61 * attribute.percent / 100;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });
  svg.append(createSvg('polygon', { points: shape.map(point => point.join(',')).join(' '), class: 'important-npc-radar-shape' }));
  for (const point of shape) svg.append(createSvg('circle', { cx: point[0], cy: point[1], r: 2.3, class: 'important-npc-radar-dot' }));
  display.forEach((attribute, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const x = center[0] + Math.cos(angle) * 86;
    const y = center[1] + Math.sin(angle) * 79;
    const label = createSvg('text', { x, y, class: 'important-npc-radar-label', 'text-anchor': Math.cos(angle) > .25 ? 'start' : Math.cos(angle) < -.25 ? 'end' : 'middle' });
    const name = createSvg('tspan', { x, dy: 0 });
    name.textContent = attribute.name;
    const value = createSvg('tspan', { x, dy: 12, class: 'important-npc-radar-value' });
    value.textContent = String(attribute.value);
    label.append(name, value);
    svg.append(label);
  });
}

function renderBars(root, attributes) {
  const fragment = document.createDocumentFragment();
  for (const attribute of attributes) {
    const item = document.createElement('div');
    item.className = 'important-npc-bar';
    const head = document.createElement('div');
    head.className = 'important-npc-bar-head';
    const name = document.createElement('span');
    name.className = 'important-npc-bar-name';
    name.textContent = attribute.name;
    name.title = attribute.name;
    const value = document.createElement('span');
    value.className = 'important-npc-bar-value';
    value.textContent = String(attribute.value);
    const track = document.createElement('div');
    track.className = 'important-npc-bar-track';
    const fill = document.createElement('span');
    fill.className = 'important-npc-bar-fill';
    fill.style.width = `${attribute.percent}%`;
    head.append(name, value);
    track.append(fill);
    item.append(head, track);
    fragment.append(item);
  }
  root.replaceChildren(fragment);
}

function avatarSlot(record) {
  return `important-character-avatar-${encodeURIComponent(record.key)}`;
}

function initialFor(record) {
  return Array.from(record.name || '未').at(0) || '未';
}

export function mount(context) {
  const root = context.root;
  root.innerHTML = TEMPLATE;
  const page = root.querySelector('.important-npc-page');
  const content = root.querySelector('#important-npc-content');
  const previousButton = root.querySelector('#important-npc-previous');
  const nextButton = root.querySelector('#important-npc-next');
  const rosterToggle = root.querySelector('#important-npc-roster-toggle');
  const overlay = root.querySelector('#important-npc-overlay');
  const rosterClose = root.querySelector('#important-npc-roster-close');
  const rosterBody = root.querySelector('#important-npc-roster-body');
  const filled = root.querySelector('#important-npc-filled');
  const empty = root.querySelector('#important-npc-empty');
  const emptyGrid = root.querySelector('#important-npc-empty-grid');
  const avatarPick = root.querySelector('#important-npc-avatar-pick');
  const avatarInput = root.querySelector('#important-npc-avatar-input');
  const avatarImage = root.querySelector('#important-npc-avatar-image');
  const avatarPlus = root.querySelector('#important-npc-avatar-plus');
  const avatarClear = root.querySelector('#important-npc-avatar-clear');
  const radar = root.querySelector('#important-npc-radar');
  const baseBars = root.querySelector('#important-npc-base-bars');
  const baseRaw = root.querySelector('#important-npc-base-raw');
  const profile = root.querySelector('#important-npc-profile');
  const name = root.querySelector('#important-npc-name');
  const intro = root.querySelector('#important-npc-intro');
  const meta = root.querySelector('#important-npc-meta');
  const location = root.querySelector('#important-npc-location');
  const presence = root.querySelector('#important-npc-presence');
  const presenceDot = root.querySelector('#important-npc-presence-dot');
  const appearance = root.querySelector('#important-npc-appearance');
  const clothing = root.querySelector('#important-npc-clothing');
  const relations = root.querySelector('#important-npc-relations');
  const relationsRaw = root.querySelector('#important-npc-relations-raw');
  const specialBars = root.querySelector('#important-npc-special-bars');
  const specialRaw = root.querySelector('#important-npc-special-raw');
  const toast = root.querySelector('#important-npc-toast');
  const assetApi = context.presetAssets;
  const persistentAssetsAvailable = assetApi && typeof assetApi.getUrl === 'function' && typeof assetApi.save === 'function' && typeof assetApi.delete === 'function';
  const temporaryAvatars = new Map();
  let records = [];
  let selectedKey = '';
  let selectedRecord = null;
  let selectedAvatarUrl = '';
  let avatarEpoch = 0;
  let rosterEpoch = 0;
  let disposed = false;
  let avatarBusy = false;
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
    avatarPick.disabled = busy;
    avatarClear.disabled = busy;
  };

  const setAvatar = url => {
    selectedAvatarUrl = url || '';
    avatarImage.hidden = !selectedAvatarUrl;
    avatarPlus.hidden = Boolean(selectedAvatarUrl);
    avatarClear.hidden = !selectedAvatarUrl;
    if (selectedAvatarUrl) avatarImage.src = selectedAvatarUrl;
    else avatarImage.removeAttribute('src');
  };

  const getAvatarUrl = async record => {
    const temporary = temporaryAvatars.get(record.key);
    if (temporary) return temporary;
    if (!persistentAssetsAvailable) return '';
    return await assetApi.getUrl(avatarSlot(record)) || '';
  };

  const loadSelectedAvatar = async (record, epoch) => {
    setAvatar('');
    try {
      const url = await getAvatarUrl(record);
      if (!disposed && epoch === avatarEpoch && selectedKey === record.key) setAvatar(url);
    } catch (error) {
      if (!disposed && epoch === avatarEpoch) showToast(error instanceof Error && error.message ? error.message : '头像读取失败');
    }
  };

  const saveAvatar = async file => {
    if (!selectedRecord) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      showToast('请选择 PNG、JPEG、WebP 或 GIF 图片');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast('图片不能超过 8 MiB');
      return;
    }
    const record = selectedRecord;
    setAvatarBusy(true);
    try {
      const oldTemporary = temporaryAvatars.get(record.key);
      if (oldTemporary) URL.revokeObjectURL(oldTemporary);
      temporaryAvatars.delete(record.key);
      if (persistentAssetsAvailable) {
        const url = await assetApi.save(avatarSlot(record), file);
        if (!disposed && selectedKey === record.key) setAvatar(url);
      } else {
        const url = URL.createObjectURL(file);
        temporaryAvatars.set(record.key, url);
        if (!disposed && selectedKey === record.key) setAvatar(url);
        showToast('当前接口尚未接通，本次仅临时显示');
      }
      renderRoster();
    } catch (error) {
      if (!disposed) showToast(error instanceof Error && error.message ? error.message : '头像保存失败');
    } finally {
      if (!disposed) setAvatarBusy(false);
    }
  };

  const deleteAvatar = async () => {
    if (!selectedRecord) return;
    const record = selectedRecord;
    setAvatarBusy(true);
    try {
      if (persistentAssetsAvailable) await assetApi.delete(avatarSlot(record));
      const temporary = temporaryAvatars.get(record.key);
      if (temporary) URL.revokeObjectURL(temporary);
      temporaryAvatars.delete(record.key);
      if (!disposed && selectedKey === record.key) setAvatar('');
      renderRoster();
    } catch (error) {
      if (!disposed) showToast(error instanceof Error && error.message ? error.message : '头像删除失败');
    } finally {
      if (!disposed) setAvatarBusy(false);
    }
  };

  const renderMeta = record => {
    const values = [
      { value: record.type || '类型未记录', type: true },
      { value: record.gender || '性别未记录' },
      { value: record.age ? `${record.age}岁` : '年龄未记录' },
    ];
    const fragment = document.createDocumentFragment();
    for (const entry of values) {
      const tag = document.createElement('span');
      tag.className = `important-npc-tag${entry.type ? ' type' : ''}`;
      tag.textContent = entry.value;
      fragment.append(tag);
    }
    meta.replaceChildren(fragment);
  };

  const renderRelations = source => {
    const parsed = parseRelations(source);
    relations.hidden = !parsed.valid || parsed.entries.length === 0;
    relationsRaw.hidden = parsed.valid && parsed.entries.length > 0;
    if (!parsed.valid || !parsed.entries.length) {
      relations.replaceChildren();
      relationsRaw.textContent = source || '暂无人际关系记录';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of parsed.entries) {
      const row = document.createElement('div');
      row.className = 'important-npc-relation';
      const relationName = document.createElement('span');
      relationName.className = 'important-npc-relation-name';
      relationName.textContent = entry.name;
      const tags = document.createElement('div');
      tags.className = 'important-npc-relation-tags';
      for (const value of entry.tags) {
        const tag = document.createElement('span');
        tag.className = 'important-npc-relation-tag';
        tag.textContent = value;
        tags.append(tag);
      }
      row.append(relationName, tags);
      fragment.append(row);
    }
    relations.replaceChildren(fragment);
  };

  const renderRoster = () => {
    const epoch = ++rosterEpoch;
    const groups = [
      { title: '在场', present: true, records: records.filter(isPresent) },
      { title: '离场', present: false, records: records.filter(record => !isPresent(record)) },
    ];
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      if (!group.records.length) continue;
      const section = document.createElement('section');
      section.className = 'important-npc-group';
      const title = document.createElement('h3');
      title.className = 'important-npc-group-title';
      const dot = document.createElement('i');
      dot.className = `important-npc-status-dot${group.present ? ' present' : ''}`;
      dot.setAttribute('aria-hidden', 'true');
      title.append(dot, document.createTextNode(group.title));
      const grid = document.createElement('div');
      grid.className = 'important-npc-group-grid';
      for (const record of group.records) {
        const button = document.createElement('button');
        button.className = 'important-npc-person';
        button.type = 'button';
        button.dataset.personKey = record.key;
        button.setAttribute('aria-current', String(record.key === selectedKey));
        button.title = record.name || '未命名角色';
        const avatar = document.createElement('span');
        avatar.className = 'important-npc-person-avatar';
        avatar.textContent = initialFor(record);
        const status = document.createElement('i');
        status.className = `important-npc-person-dot${group.present ? ' present' : ''}`;
        status.setAttribute('aria-hidden', 'true');
        avatar.append(status);
        const personName = document.createElement('span');
        personName.className = 'important-npc-person-name';
        personName.textContent = record.name || '未命名';
        button.append(avatar, personName);
        grid.append(button);
        void getAvatarUrl(record).then(url => {
          if (!url || disposed || epoch !== rosterEpoch || !button.isConnected) return;
          const image = document.createElement('img');
          image.alt = '';
          image.src = url;
          image.addEventListener('error', () => image.remove(), { once: true });
          avatar.prepend(image);
        }).catch(() => {});
      }
      section.append(title, grid);
      fragment.append(section);
    }
    rosterBody.replaceChildren(fragment);
  };

  const renderRecord = record => {
    const epoch = ++avatarEpoch;
    selectedRecord = record;
    filled.hidden = false;
    empty.hidden = true;
    rosterToggle.hidden = false;
    name.textContent = record.name || '未命名';
    intro.textContent = record.intro || '暂无人物介绍';
    renderMeta(record);
    location.textContent = record.location || '地点未记录';
    presence.textContent = record.presence || '状态未记录';
    presenceDot.classList.toggle('present', isPresent(record));
    appearance.textContent = record.appearance || '暂无外貌记录';
    clothing.textContent = record.clothing || '暂无穿着记录';
    renderRelations(record.relations);
    const base = parseAttributes(record.base);
    radar.hidden = !base.valid || (base.entries.length > 0 && base.entries.length < 3);
    baseBars.hidden = !base.valid || base.entries.length === 0 || base.entries.length >= 3;
    baseRaw.hidden = base.valid;
    if (!base.valid) baseRaw.textContent = record.base;
    else if (base.entries.length >= 3) renderRadar(radar, base.entries);
    else if (base.entries.length) renderBars(baseBars, base.entries);
    else renderRadar(radar, [], true);
    const special = parseAttributes(record.special);
    specialBars.hidden = !special.valid || special.entries.length === 0;
    specialRaw.hidden = special.valid && special.entries.length > 0;
    if (special.valid && special.entries.length) renderBars(specialBars, special.entries);
    else specialRaw.textContent = record.special || '暂无特有属性';
    profile.style.animation = 'none';
    void profile.offsetWidth;
    profile.style.animation = '';
    void loadSelectedAvatar(record, epoch);
  };

  const chooseDefault = () => records.find(isPresent) || records[0] || null;

  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    previousButton.disabled = !state.canPrevious;
    nextButton.disabled = !state.canNext;
    records = recordsFromState(state);
    if (!records.length) {
      selectedKey = '';
      selectedRecord = null;
      filled.hidden = true;
      empty.hidden = false;
      rosterToggle.hidden = true;
      overlay.hidden = true;
      rosterToggle.setAttribute('aria-expanded', 'false');
      renderRadar(emptyGrid, [], true);
      setAvatar('');
      renderRoster();
      return;
    }
    const retained = records.find(record => record.key === selectedKey);
    const next = retained || chooseDefault();
    selectedKey = next.key;
    renderRecord(next);
    renderRoster();
  };

  const closeRoster = ({ restoreFocus = false } = {}) => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    rosterToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) rosterToggle.focus();
  };

  const openRoster = () => {
    if (!records.length) return;
    renderRoster();
    overlay.hidden = false;
    rosterToggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      const current = rosterBody.querySelector('[aria-current="true"]');
      current?.scrollIntoView({ block: 'nearest' });
      rosterClose.focus();
    });
  };

  const selectPerson = key => {
    const record = records.find(entry => entry.key === key);
    if (!record) return;
    selectedKey = record.key;
    content.scrollTop = 0;
    renderRecord(record);
    renderRoster();
    closeRoster({ restoreFocus: true });
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
    if (!actionButton || actionButton.disabled) return;
    const action = actionButton.dataset.action;
    if (typeof context.actions[action] === 'function') void runAction(action);
  };
  const handleRosterClick = event => {
    const person = event.target.closest?.('[data-person-key]');
    if (person) selectPerson(person.dataset.personKey);
  };
  const handleOverlayClick = event => {
    if (event.target === overlay) closeRoster({ restoreFocus: true });
  };
  const handleRosterClose = () => closeRoster({ restoreFocus: true });
  const handleAvatarPick = () => {
    if (!avatarBusy) avatarInput.click();
  };
  const handleAvatarInput = () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = '';
    if (file) void saveAvatar(file);
  };
  const handleAvatarError = () => {
    setAvatar('');
    showToast('头像无法显示');
  };

  page.addEventListener('click', handlePageClick);
  rosterToggle.addEventListener('click', openRoster);
  rosterClose.addEventListener('click', handleRosterClose);
  rosterBody.addEventListener('click', handleRosterClick);
  overlay.addEventListener('click', handleOverlayClick);
  avatarPick.addEventListener('click', handleAvatarPick);
  avatarInput.addEventListener('change', handleAvatarInput);
  avatarClear.addEventListener('click', deleteAvatar);
  avatarImage.addEventListener('error', handleAvatarError);
  const unsubscribe = context.subscribe(render);
  render();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
    for (const url of temporaryAvatars.values()) URL.revokeObjectURL(url);
    temporaryAvatars.clear();
    page.removeEventListener('click', handlePageClick);
    rosterToggle.removeEventListener('click', openRoster);
    rosterClose.removeEventListener('click', handleRosterClose);
    rosterBody.removeEventListener('click', handleRosterClick);
    overlay.removeEventListener('click', handleOverlayClick);
    avatarPick.removeEventListener('click', handleAvatarPick);
    avatarInput.removeEventListener('change', handleAvatarInput);
    avatarClear.removeEventListener('click', deleteAvatar);
    avatarImage.removeEventListener('error', handleAvatarError);
    context.signal.removeEventListener('abort', dispose);
    unsubscribe();
  };

  context.signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
