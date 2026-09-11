const FIELDS = Object.freeze({
  code: '编码索引',
  time: '时间跨度',
  relation: '与今天的关系',
  summary: '概览',
  text: '纪要',
  dialogue: '重要对话',
});

const ACTION_LABELS = Object.freeze({
  back: '返回',
  previousTable: '切换到上一张表',
  nextTable: '切换到下一张表',
  editCurrentTable: '打开编辑',
});

const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;

const TEMPLATE = `
  <style>
    .chronicle-page{--bg:#151512;--surface:#23231f;--raised:#2c2c26;--soft:#1d1d1a;--line:#4b4a40;--line-soft:#37372f;--text:#e7e3d9;--text-soft:#c4c0b5;--muted:#9e9b91;--moss:#92a07c;--moss-soft:rgba(146,160,124,.18);position:relative;display:flex;flex-direction:column;height:100%;min-height:inherit;overflow:hidden;container:chronicle/inline-size;color:var(--text);background-color:var(--bg);font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif)}
    .chronicle-page,.chronicle-page *{box-sizing:border-box}.chronicle-page [hidden]{display:none!important}.chronicle-page button{font-family:inherit;-webkit-tap-highlight-color:transparent}.chronicle-page svg{display:block;width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .chronicle-nav{flex:0 0 auto;padding-top:62px;background:rgba(29,29,26,.97);border-bottom:1px solid var(--line-soft)}
    .chronicle-nav-row{display:grid;grid-template-columns:clamp(44px,15cqi,60px) minmax(0,1fr) clamp(44px,15cqi,60px);align-items:center;height:54px;padding-inline:10px 12px}.chronicle-leading,.chronicle-trailing,.chronicle-center{display:flex;align-items:center}.chronicle-leading{justify-content:flex-start}.chronicle-trailing{justify-content:flex-end}.chronicle-center{min-width:0;justify-content:center;gap:4px;padding-inline:4px}
    .chronicle-title,.chronicle-group-title,.chronicle-dialog-title,.chronicle-section h3{font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);font-weight:600;letter-spacing:0}.chronicle-title{min-width:0;margin:0;overflow:hidden;color:var(--text-soft);font-size:17px;line-height:24px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .chronicle-icon{display:inline-grid;width:32px;height:32px;flex:0 0 32px;padding:4px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:8px;cursor:pointer}.chronicle-icon:hover{background:rgba(231,227,217,.07)}.chronicle-icon:disabled{opacity:.38;cursor:default}.chronicle-icon:disabled:hover{background:transparent}.chronicle-icon:focus-visible,.chronicle-code:focus-visible{outline:2px solid var(--moss);outline-offset:2px}
    .chronicle-content{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:18px 16px 30px;scrollbar-color:var(--line) transparent}.chronicle-content.locked{overflow:hidden}.chronicle-groups{display:grid;gap:22px}.chronicle-group{min-width:0}.chronicle-group-title{display:flex;min-height:30px;margin:0 0 10px;align-items:center;color:var(--text-soft);font-size:15px;line-height:22px;border-bottom:1px solid var(--line-soft)}
    .chronicle-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.chronicle-code{min-width:0;min-height:42px;padding:8px 6px;overflow:hidden;color:var(--moss);background:var(--surface);border:1px solid var(--line);border-radius:8px;box-shadow:0 5px 14px rgba(0,0,0,.18);font:600 13px/20px var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);letter-spacing:0;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;transition:transform 120ms ease,border-color 120ms ease,box-shadow 120ms ease}.chronicle-code:hover{border-color:rgba(146,160,124,.68)}.chronicle-code:active{transform:translateY(1px) scale(.985)}.chronicle-code.active{border-color:var(--moss);box-shadow:0 0 0 1px var(--moss),0 7px 18px rgba(0,0,0,.24)}.chronicle-empty{margin:72px 0 0;color:var(--muted);font-size:14px;line-height:22px;text-align:center}
    .chronicle-overlay{position:absolute;z-index:30;inset:0;display:grid;padding:82px 16px 28px;place-items:center;background:rgba(5,5,4,.76);animation:chronicle-fade 150ms ease both}.chronicle-dialog{display:flex;width:86%;max-width:360px;max-height:100%;min-height:0;flex-direction:column;overflow:hidden;color:var(--text);background:var(--raised);border:1px solid var(--line);border-radius:8px;box-shadow:0 24px 64px rgba(0,0,0,.5);outline:none;animation:chronicle-pop 160ms ease both}.chronicle-dialog-head{display:flex;min-height:54px;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:10px 10px 10px 16px;border-bottom:1px solid var(--line-soft)}.chronicle-dialog-title{min-width:0;margin:0;overflow:hidden;color:var(--moss);font-size:19px;line-height:26px;text-overflow:ellipsis;white-space:nowrap}.chronicle-dialog-body{min-height:0;overflow-x:hidden;overflow-y:auto;padding:16px;overscroll-behavior:contain;scrollbar-color:var(--line) transparent}
    .chronicle-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.chronicle-tag{max-width:100%;padding:5px 8px;overflow-wrap:anywhere;color:var(--muted);background:var(--soft);border:1px solid var(--line-soft);border-radius:8px;font-size:12px;line-height:18px}.chronicle-tag.accent{color:var(--moss);background:var(--moss-soft);border-color:rgba(146,160,124,.34)}.chronicle-section+.chronicle-section{margin-top:20px}.chronicle-section h3{margin:0 0 8px;color:var(--text-soft);font-size:14px;line-height:21px}.chronicle-summary,.chronicle-text,.chronicle-dialogue{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.chronicle-summary{font-size:15px;font-weight:600;line-height:1.75}.chronicle-text{color:var(--text-soft);font-size:14px;line-height:1.85}.chronicle-dialogue{padding:12px 14px;color:var(--text-soft);background:rgba(18,18,16,.48);border-inline-start:3px solid var(--moss);border-radius:0 8px 8px 0;font-size:14px;line-height:1.8}
    .chronicle-toast{position:absolute;z-index:40;right:16px;bottom:18px;left:16px;width:fit-content;max-width:calc(100% - 32px);margin:0 auto;padding:9px 12px;color:var(--text);background:rgba(35,35,31,.96);border:1px solid var(--line);border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,.34);font-size:13px;line-height:20px;text-align:center}
    @container chronicle (max-width:330px){.chronicle-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.chronicle-content{padding-inline:12px}.chronicle-dialog{width:92%}}
    @keyframes chronicle-fade{from{opacity:0}to{opacity:1}}@keyframes chronicle-pop{from{opacity:0;transform:scale(.975)}to{opacity:1;transform:scale(1)}}
    @media (prefers-reduced-motion:reduce){.chronicle-overlay,.chronicle-dialog{animation:none}.chronicle-code{transition:none}}
  </style>
  <section class="chronicle-page">
    <header class="chronicle-nav"><div class="chronicle-nav-row">
      <div class="chronicle-leading"><button class="chronicle-icon" data-action="back" type="button" aria-label="返回上一层" title="返回上一层">${icon('M16 19L8 12L16 5')}</button></div>
      <div class="chronicle-center"><button id="chronicle-previous" class="chronicle-icon" data-action="previousTable" type="button" aria-label="上一张表" title="上一张表">${icon('M16 19L8 12L16 5')}</button><h1 class="chronicle-title">纪要</h1><button id="chronicle-next" class="chronicle-icon" data-action="nextTable" type="button" aria-label="下一张表" title="下一张表">${icon('M8 5L16 12L8 19')}</button></div>
      <div class="chronicle-trailing"><button class="chronicle-icon" data-action="editCurrentTable" type="button" aria-label="编辑当前表" title="编辑当前表">${icon('M12 20H21 M16.5 3.5A2.12 2.12 0 0 1 19.5 6.5L8 18L4 19L5 15Z')}</button></div>
    </div></header>
    <main id="chronicle-content" class="chronicle-content"><div id="chronicle-groups" class="chronicle-groups"></div><p id="chronicle-empty" class="chronicle-empty" hidden>暂无纪要</p></main>
    <p id="chronicle-toast" class="chronicle-toast" role="status" aria-live="polite" hidden></p>
    <div id="chronicle-overlay" class="chronicle-overlay" hidden><section class="chronicle-dialog" role="dialog" aria-modal="true" aria-labelledby="chronicle-dialog-title">
      <header class="chronicle-dialog-head"><h2 id="chronicle-dialog-title" class="chronicle-dialog-title">未编号</h2><button id="chronicle-close" class="chronicle-icon" type="button" aria-label="关闭纪要" title="关闭">${icon('M18 6L6 18 M6 6L18 18')}</button></header>
      <div id="chronicle-dialog-body" class="chronicle-dialog-body"><div class="chronicle-meta"><span id="chronicle-time" class="chronicle-tag"></span><span id="chronicle-relation" class="chronicle-tag accent"></span></div><section class="chronicle-section"><h3>概览</h3><p id="chronicle-summary" class="chronicle-summary"></p></section><section class="chronicle-section"><h3>纪要</h3><p id="chronicle-text" class="chronicle-text"></p></section><section id="chronicle-dialogue-section" class="chronicle-section" hidden><h3>重要对话</h3><blockquote id="chronicle-dialogue" class="chronicle-dialogue"></blockquote></section></div>
    </section></div>
  </section>`;

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function recordsFromState(state) {
  const headerMap = new Map((state.headers || []).map((header, index) => [normalize(header), index]));
  const indexes = Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, headerMap.get(normalize(field)) ?? -1]));
  const value = (row, key) => indexes[key] < 0 ? '' : String(row[indexes[key]] ?? '').trim();
  return (state.rows || []).map((row, index) => {
    const code = value(row, 'code');
    const match = /^AM(\d+)$/i.exec(normalize(code));
    return {
      key: code ? `code:${normalize(code).toUpperCase()}` : `missing:${index}`,
      code: code || '未编号',
      order: match ? Number(match[1]) : Number.POSITIVE_INFINITY,
      index,
      time: value(row, 'time'),
      relation: value(row, 'relation') || '时间未标注',
      summary: value(row, 'summary'),
      text: value(row, 'text'),
      dialogue: value(row, 'dialogue'),
    };
  }).sort((a, b) => a.order - b.order || a.index - b.index);
}

function failureMessage(action, result) {
  if (result?.status === 'unavailable') return `${ACTION_LABELS[action]}暂时不可用`;
  if (result?.status === 'stale') return '当前页面已经失效';
  return result?.message || `${ACTION_LABELS[action]}失败`;
}

export function mount(context) {
  const root = context.root;
  root.innerHTML = TEMPLATE;
  const page = root.querySelector('.chronicle-page');
  const nav = root.querySelector('.chronicle-nav');
  const content = root.querySelector('#chronicle-content');
  const groupsRoot = root.querySelector('#chronicle-groups');
  const empty = root.querySelector('#chronicle-empty');
  const previous = root.querySelector('#chronicle-previous');
  const next = root.querySelector('#chronicle-next');
  const toast = root.querySelector('#chronicle-toast');
  const overlay = root.querySelector('#chronicle-overlay');
  const close = root.querySelector('#chronicle-close');
  const dialogBody = root.querySelector('#chronicle-dialog-body');
  const dialogTitle = root.querySelector('#chronicle-dialog-title');
  const time = root.querySelector('#chronicle-time');
  const relation = root.querySelector('#chronicle-relation');
  const summary = root.querySelector('#chronicle-summary');
  const text = root.querySelector('#chronicle-text');
  const dialogueSection = root.querySelector('#chronicle-dialogue-section');
  const dialogue = root.querySelector('#chronicle-dialogue');
  let disposed = false;
  let records = [];
  let selectedKey = null;
  let lastFocused = null;
  let toastTimer = null;

  const showToast = message => {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.textContent = '';
      toastTimer = null;
    }, 1800);
  };

  const updateActive = () => {
    for (const button of groupsRoot.querySelectorAll('[data-record-key]')) button.classList.toggle('active', button.dataset.recordKey === selectedKey);
  };

  const closeDialog = restoreFocus => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    nav.inert = false;
    content.inert = false;
    content.classList.remove('locked');
    selectedKey = null;
    updateActive();
    if (restoreFocus !== false && lastFocused?.isConnected) lastFocused.focus();
    lastFocused = null;
  };

  const fillDialog = record => {
    dialogTitle.textContent = record.code;
    time.textContent = record.time || '时间跨度未标注';
    relation.textContent = record.relation;
    summary.textContent = record.summary || '暂无内容';
    text.textContent = record.text || '暂无内容';
    dialogue.textContent = record.dialogue;
    dialogueSection.hidden = !record.dialogue;
  };

  const openDialog = record => {
    selectedKey = record.key;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fillDialog(record);
    overlay.hidden = false;
    nav.inert = true;
    content.inert = true;
    content.classList.add('locked');
    dialogBody.scrollTop = 0;
    updateActive();
    close.focus();
  };

  const renderGroups = () => {
    const grouped = new Map();
    for (const record of records) {
      if (!grouped.has(record.relation)) grouped.set(record.relation, []);
      grouped.get(record.relation).push(record);
    }
    const fragment = document.createDocumentFragment();
    for (const [name, groupRecords] of grouped) {
      const section = document.createElement('section');
      section.className = 'chronicle-group';
      const title = document.createElement('h2');
      title.className = 'chronicle-group-title';
      title.textContent = name;
      const grid = document.createElement('div');
      grid.className = 'chronicle-grid';
      for (const record of groupRecords) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `chronicle-code${record.key === selectedKey ? ' active' : ''}`;
        button.dataset.recordKey = record.key;
        button.textContent = record.code;
        button.setAttribute('aria-label', `查看纪要 ${record.code}`);
        grid.append(button);
      }
      section.append(title, grid);
      fragment.append(section);
    }
    groupsRoot.replaceChildren(fragment);
    empty.hidden = records.length > 0;
  };

  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    previous.disabled = !state.canPrevious;
    next.disabled = !state.canNext;
    records = recordsFromState(state);
    renderGroups();
    if (!selectedKey) return;
    const selected = records.find(record => record.key === selectedKey);
    if (selected) fillDialog(selected);
    else closeDialog(false);
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
      return;
    }
    const recordButton = event.target.closest?.('[data-record-key]');
    const record = records.find(item => item.key === recordButton?.dataset.recordKey);
    if (record) openDialog(record);
  };

  const handleOverlayClick = event => {
    if (event.target === overlay) closeDialog();
  };
  const handleClose = () => closeDialog();

  page.addEventListener('click', handlePageClick);
  overlay.addEventListener('click', handleOverlayClick);
  close.addEventListener('click', handleClose);
  const unsubscribe = context.subscribe(render);
  render();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
    page.removeEventListener('click', handlePageClick);
    overlay.removeEventListener('click', handleOverlayClick);
    close.removeEventListener('click', handleClose);
    context.signal.removeEventListener('abort', dispose);
    unsubscribe();
  };

  context.signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
