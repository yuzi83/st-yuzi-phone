const FIELDS = Object.freeze({
  current: '当前时间',
  previous: '上轮场景时间',
  elapsed: '经过的时间',
  location: '当前位置',
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
    .global-state-page{--bg:#151512;--surface:#23231f;--raised:#2c2c26;--soft:#1d1d1a;--line:#4b4a40;--line-soft:#37372f;--text:#e7e3d9;--text-soft:#c4c0b5;--muted:#9e9b91;--moss:#92a07c;position:relative;display:flex;flex-direction:column;height:100%;min-height:inherit;overflow:hidden;container:global-state/inline-size;color:var(--text);background:var(--bg);font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif)}
    .global-state-page,.global-state-page *{box-sizing:border-box}.global-state-page button{font-family:inherit;-webkit-tap-highlight-color:transparent}.global-state-page svg{display:block;width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .global-nav{flex:0 0 auto;padding-top:62px;background:rgba(29,29,26,.97);border-bottom:1px solid var(--line-soft)}
    .global-nav-row{display:grid;grid-template-columns:clamp(44px,15cqi,60px) minmax(0,1fr) clamp(44px,15cqi,60px);align-items:center;height:54px;padding-inline:10px 12px}.global-leading,.global-trailing,.global-center{display:flex;align-items:center}.global-leading{justify-content:flex-start}.global-trailing{justify-content:flex-end}.global-center{min-width:0;justify-content:center;gap:4px;padding-inline:4px}
    .global-title,.global-date,.global-location-label,.global-timeline-label{font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);font-weight:600;letter-spacing:0}.global-title{min-width:0;margin:0;overflow:hidden;color:var(--text-soft);font-size:17px;line-height:24px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .global-icon{display:inline-grid;width:32px;height:32px;flex:0 0 32px;padding:4px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:8px;cursor:pointer}.global-icon:hover{background:rgba(231,227,217,.07)}.global-icon:disabled{opacity:.38;cursor:default}.global-icon:disabled:hover{background:transparent}.global-icon:focus-visible{outline:2px solid var(--moss);outline-offset:2px}
    .global-content{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;overflow-x:hidden;overflow-y:auto;padding:20px 16px 52px;overscroll-behavior:contain;scrollbar-color:var(--line) transparent}
    .global-time-stage{display:grid;min-height:190px;flex:1 1 auto;padding:16px 8px 22px;place-content:center;text-align:center}.global-date{margin:0 0 8px;color:var(--muted);font-size:14px;line-height:21px}.global-clock{max-width:100%;margin:0;color:var(--text);font-size:48px;font-variant-numeric:tabular-nums;line-height:1.08;overflow-wrap:anywhere}.global-clock.raw{font-size:24px;line-height:1.35}
    .global-location{width:100%;margin:0 0 16px;padding:14px 16px 15px;text-align:center;background:var(--surface);border:1px solid var(--line-soft);border-radius:8px}.global-location-label{display:block;margin-bottom:5px;color:var(--moss);font-size:12px;line-height:18px}.global-location-value{display:-webkit-box;margin:0;overflow:hidden;color:var(--text-soft);font-size:17px;font-weight:600;line-height:25px;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}
    .global-timeline{display:grid;grid-template-columns:minmax(0,1.65fr) 14px minmax(0,.9fr) 14px minmax(0,.55fr);min-height:72px;flex:0 0 auto;align-items:stretch;padding:10px 8px;color:var(--text-soft);border:1px solid var(--line-soft);border-radius:8px}.global-timeline-part{display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;text-align:center}.global-timeline-label{color:var(--muted);font-size:11px;line-height:16px}.global-timeline-value{max-width:100%;margin-top:3px;color:var(--text-soft);font-size:11px;font-weight:600;line-height:16px;overflow-wrap:anywhere}.global-timeline-arrow{display:grid;place-items:center;color:var(--line);font-size:15px}
    .global-toast{position:absolute;z-index:20;right:14px;bottom:14px;left:14px;margin:0;padding:9px 12px;color:var(--text);background:rgba(44,44,38,.97);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.35);font-size:12px;line-height:18px;text-align:center}
    @container global-state (max-width:330px){.global-content{padding-inline:12px}.global-time-stage{min-height:172px;padding-inline:4px}.global-location{padding-inline:12px}.global-timeline{grid-template-columns:minmax(0,1.7fr) 10px minmax(0,.85fr) 10px minmax(0,.5fr);padding-inline:6px}.global-timeline-arrow{font-size:13px}.global-timeline-value{font-size:10px}}
    @media (prefers-reduced-motion:reduce){.global-state-page *{scroll-behavior:auto!important}}
  </style>
  <section class="global-state-page">
    <header class="global-nav"><div class="global-nav-row">
      <div class="global-leading"><button class="global-icon" data-action="back" type="button" aria-label="返回上一层" title="返回上一层">${icon('M16 19L8 12L16 5')}</button></div>
      <div class="global-center"><button id="global-previous" class="global-icon" data-action="previousTable" type="button" aria-label="上一张表" title="上一张表">${icon('M15 18L9 12L15 6')}</button><h1 class="global-title">全局</h1><button id="global-next" class="global-icon" data-action="nextTable" type="button" aria-label="下一张表" title="下一张表">${icon('M9 18L15 12L9 6')}</button></div>
      <div class="global-trailing"><button class="global-icon" data-action="editCurrentTable" type="button" aria-label="编辑当前表" title="编辑当前表">${icon('M12 20H5a1 1 0 0 1-1-1v-7 M16.5 3.5a2.1 2.1 0 0 1 3 3L10 16l-4 1 1-4Z')}</button></div>
    </div></header>
    <main class="global-content">
      <section class="global-time-stage" aria-label="当前时间"><p id="global-date" class="global-date">等待首次记录</p><p id="global-clock" class="global-clock">--:--</p></section>
      <section class="global-location" aria-label="当前位置"><span class="global-location-label">当前位置</span><p id="global-location" class="global-location-value">尚未记录</p></section>
      <section class="global-timeline" aria-label="时间变化">
        <div class="global-timeline-part"><span class="global-timeline-label">上轮</span><strong id="global-previous-time" class="global-timeline-value">未记录</strong></div><span class="global-timeline-arrow" aria-hidden="true">›</span>
        <div class="global-timeline-part"><span class="global-timeline-label">经过</span><strong id="global-elapsed" class="global-timeline-value">未记录</strong></div><span class="global-timeline-arrow" aria-hidden="true">›</span>
        <div class="global-timeline-part"><span class="global-timeline-label">现在</span><strong class="global-timeline-value">此刻</strong></div>
      </section>
    </main>
    <p id="global-toast" class="global-toast" role="status" aria-live="polite" hidden></p>
  </section>`;

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function valuesFromState(state) {
  const headers = new Map((state.headers || []).map((header, index) => [normalize(header), index]));
  const row = state.rows?.[0] || [];
  const value = field => {
    const index = headers.get(normalize(field));
    return index === undefined ? '' : normalize(row[index]);
  };
  return {
    current: value(FIELDS.current),
    previous: value(FIELDS.previous),
    elapsed: value(FIELDS.elapsed),
    location: value(FIELDS.location),
  };
}

function parseDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return { date: `${match[1]}年${match[2]}月${match[3]}日`, time: `${match[4]}:${match[5]}` };
}

function failureMessage(action, result) {
  if (result?.status === 'unavailable') return `${ACTION_LABELS[action]}暂时不可用`;
  if (result?.status === 'stale') return '当前页面已经失效';
  return result?.message || `${ACTION_LABELS[action]}失败`;
}

export function mount(context) {
  const root = context.root;
  root.innerHTML = TEMPLATE;
  const page = root.querySelector('.global-state-page');
  const previousButton = root.querySelector('#global-previous');
  const nextButton = root.querySelector('#global-next');
  const date = root.querySelector('#global-date');
  const clock = root.querySelector('#global-clock');
  const location = root.querySelector('#global-location');
  const previousTime = root.querySelector('#global-previous-time');
  const elapsed = root.querySelector('#global-elapsed');
  const toast = root.querySelector('#global-toast');
  let disposed = false;
  let rendered = false;
  let toastTimer = null;

  const updateText = (node, value) => {
    if (node.textContent === value) return;
    node.textContent = value;
    if (rendered && typeof node.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    }
  };

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

  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    previousButton.disabled = !state.canPrevious;
    nextButton.disabled = !state.canNext;
    const values = valuesFromState(state);
    const parsed = parseDateTime(values.current);
    updateText(date, parsed?.date || (values.current ? '当前时间' : '等待首次记录'));
    updateText(clock, parsed?.time || values.current || '--:--');
    clock.classList.toggle('raw', Boolean(values.current && !parsed));
    updateText(location, values.location || '尚未记录');
    updateText(previousTime, values.previous || '未记录');
    updateText(elapsed, values.elapsed || '未记录');
    rendered = true;
  };

  const runAction = async action => {
    try {
      const result = await context.actions[action]();
      if (!disposed && !result?.ok) showToast(failureMessage(action, result));
    } catch (error) {
      if (!disposed) showToast(error instanceof Error && error.message ? error.message : `${ACTION_LABELS[action]}失败`);
    }
  };

  const handleClick = event => {
    const button = event.target.closest?.('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (typeof context.actions[action] === 'function') void runAction(action);
  };

  page.addEventListener('click', handleClick);
  const unsubscribe = context.subscribe(render);
  render();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
    for (const animation of page.getAnimations()) animation.cancel();
    page.removeEventListener('click', handleClick);
    context.signal.removeEventListener('abort', dispose);
    unsubscribe();
  };

  context.signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
