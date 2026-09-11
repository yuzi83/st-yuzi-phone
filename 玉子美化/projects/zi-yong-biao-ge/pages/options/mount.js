const FIELDS = Object.freeze(['选项一', '选项二', '选项三', '选项四', '选项五']);
const ACTION_LABELS = Object.freeze({
  back: '返回',
  previousTable: '切换到上一张表',
  nextTable: '切换到下一张表',
  editCurrentTable: '打开编辑',
});

const icon = path => `<svg viewBox='0 0 24 24' aria-hidden='true'><path d='${path}'/></svg>`;

const TEMPLATE = `
  <style>
    .options-page{--bg:#151512;--surface:#23231f;--raised:#2c2c26;--line:#4b4a40;--line-soft:#37372f;--text:#e7e3d9;--text-soft:#c4c0b5;--muted:#9e9b91;--moss:#92a07c;--moss-soft:rgba(146,160,124,.16);position:relative;display:flex;flex-direction:column;height:100%;min-height:inherit;overflow:hidden;container:options/inline-size;color:var(--text);background:var(--bg);font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif)}
    .options-page,.options-page *{box-sizing:border-box}.options-page [hidden]{display:none!important}.options-page button{font-family:inherit;-webkit-tap-highlight-color:transparent}.options-page svg{display:block;width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .options-nav{flex:0 0 auto;padding-top:62px;background:rgba(29,29,26,.97);border-bottom:1px solid var(--line-soft)}
    .options-nav-row{display:grid;grid-template-columns:clamp(44px,15cqi,60px) minmax(0,1fr) clamp(44px,15cqi,60px);align-items:center;height:54px;padding-inline:10px 12px}.options-leading,.options-trailing,.options-center{display:flex;align-items:center}.options-leading{justify-content:flex-start}.options-trailing{justify-content:flex-end}.options-center{min-width:0;justify-content:center;gap:4px;padding-inline:4px}
    .options-title{min-width:0;margin:0;overflow:hidden;color:var(--text-soft);font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);font-size:17px;font-weight:600;line-height:24px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.options-icon{display:inline-grid;width:32px;height:32px;flex:0 0 32px;padding:4px;place-items:center;color:var(--text);background:transparent;border:0;border-radius:8px;cursor:pointer}.options-icon:hover{background:rgba(231,227,217,.07)}.options-icon:disabled{opacity:.38;cursor:default}.options-icon:disabled:hover{background:transparent}.options-icon:focus-visible,.options-choice:focus-visible{outline:2px solid var(--moss);outline-offset:2px}
    .options-content{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;overflow-x:hidden;overflow-y:auto;padding:22px 16px 38px;scrollbar-width:none;-ms-overflow-style:none}.options-content::-webkit-scrollbar{display:none;width:0;height:0}.options-intro{margin:0 0 14px;color:var(--muted);font-family:var(--yuzi-phone-font-family, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif);font-size:13px;line-height:20px;text-align:center}.options-list{display:grid;gap:11px;width:100%;margin:auto 0}.options-choice{display:grid;grid-template-columns:36px minmax(0,1fr);min-width:0;align-items:center;gap:12px;width:100%;min-height:58px;padding:12px 14px;color:var(--text);text-align:left;background:linear-gradient(135deg,rgba(44,44,38,.98),rgba(35,35,31,.98));border:1px solid var(--line);border-radius:9px;box-shadow:0 8px 18px rgba(0,0,0,.16);cursor:pointer;transition:transform 120ms ease,border-color 120ms ease,background-color 120ms ease}.options-choice:hover{border-color:rgba(146,160,124,.7);background:linear-gradient(135deg,rgba(54,55,45,.98),rgba(39,40,34,.98))}.options-choice:active{transform:translateY(1px) scale(.992);background:var(--surface)}.options-index{display:grid;width:30px;height:30px;place-items:center;color:var(--moss);background:var(--moss-soft);border:1px solid rgba(146,160,124,.36);border-radius:50%;font-size:12px;font-variant-numeric:tabular-nums;line-height:1}.options-copy{min-width:0;margin:0;color:var(--text-soft);font-size:15px;font-weight:600;line-height:23px;overflow-wrap:anywhere;white-space:pre-wrap}.options-empty{margin:auto 0;color:var(--muted);font-size:14px;line-height:22px;text-align:center}.options-toast{position:absolute;z-index:12;right:14px;bottom:14px;left:14px;margin:0;padding:9px 12px;color:var(--text);background:rgba(44,44,38,.97);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.35);font-size:12px;line-height:18px;text-align:center}
    @container options (max-width:330px){.options-content{padding-inline:12px}.options-choice{grid-template-columns:32px minmax(0,1fr);gap:9px;padding-inline:11px}.options-index{width:27px;height:27px}.options-copy{font-size:14px;line-height:21px}}
    .options-content{padding-top:14px}.options-intro{display:none}.options-list{margin:0}
    @media (prefers-reduced-motion:reduce){.options-page *{scroll-behavior:auto!important;transition-duration:0ms!important;animation-duration:0ms!important}}
  </style>
  <section class='options-page' aria-label='选项表'>
    <header class='options-nav'><div class='options-nav-row'>
      <div class='options-leading'><button class='options-icon' data-action='back' type='button' aria-label='返回上一层' title='返回上一层'>${icon('M16 19L8 12L16 5')}</button></div>
      <div class='options-center'><button id='options-previous' class='options-icon' data-action='previousTable' type='button' aria-label='上一张表' title='上一张表'>${icon('M16 19L8 12L16 5')}</button><h1 class='options-title'>选项</h1><button id='options-next' class='options-icon' data-action='nextTable' type='button' aria-label='下一张表' title='下一张表'>${icon('M8 5L16 12L8 19')}</button></div>
      <div class='options-trailing'><button class='options-icon' data-action='editCurrentTable' type='button' aria-label='编辑当前表' title='编辑当前表'>${icon('M12 20H21 M16.5 3.5A2.12 2.12 0 0 1 19.5 6.5L8 18L4 19L5 15Z')}</button></div>
    </div></header>
    <main class='options-content'><p class='options-intro'>选择一个行动方向</p><div id='options-list' class='options-list'></div><p id='options-empty' class='options-empty' hidden>暂无可选项</p></main>
    <p id='options-toast' class='options-toast' role='status' aria-live='polite' hidden></p>
  </section>`;

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function optionsFromState(state) {
  const headers = new Map((state?.headers || []).map((header, index) => [normalize(header), index]));
  const row = state?.rows?.[0] || [];
  return FIELDS.map(field => {
    const index = headers.get(normalize(field));
    return index === undefined ? '' : normalize(row[index]);
  });
}

function failureMessage(action, result) {
  if (result?.status === 'unavailable') return `${ACTION_LABELS[action]}暂时不可用`;
  if (result?.status === 'stale') return '当前页面已经失效';
  return result?.message || `${ACTION_LABELS[action]}失败`;
}

function appendToTavernInput(text) {
  const textarea = document.querySelector('#send_textarea');
  if (!textarea || textarea.tagName !== 'TEXTAREA' || typeof textarea.value !== 'string') return false;
  textarea.value += text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    textarea.focus({ preventScroll: true });
  } catch {
    textarea.focus();
  }
  if (typeof textarea.setSelectionRange === 'function') textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  return true;
}

export function mount(context) {
  const root = context.root;
  root.innerHTML = TEMPLATE;
  const page = root.querySelector('.options-page');
  const list = root.querySelector('#options-list');
  const empty = root.querySelector('#options-empty');
  const previous = root.querySelector('#options-previous');
  const next = root.querySelector('#options-next');
  const toast = root.querySelector('#options-toast');
  let options = [];
  let toastTimer = null;
  let disposed = false;
  let previewTextarea = null;

  if (document.documentElement?.dataset.yuziPreviewFrame === 'true' && !document.querySelector('#send_textarea')) {
    previewTextarea = document.createElement('textarea');
    previewTextarea.id = 'send_textarea';
    previewTextarea.setAttribute('aria-label', '制作期模拟酒馆输入框');
    previewTextarea.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;';
    document.body.append(previewTextarea);
  }

  const showToast = message => {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; toast.textContent = ''; toastTimer = null; }, 1800);
  };

  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    previous.disabled = !state.canPrevious;
    next.disabled = !state.canNext;
    options = optionsFromState(state);
    const fragment = document.createDocumentFragment();
    options.forEach((text, index) => {
      if (!text) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'options-choice';
      button.dataset.optionIndex = String(index);
      button.setAttribute('aria-label', `写入选项 ${index + 1}`);
      const badge = document.createElement('span');
      badge.className = 'options-index';
      badge.textContent = String(index + 1).padStart(2, '0');
      const copy = document.createElement('span');
      copy.className = 'options-copy';
      copy.textContent = text;
      button.append(badge, copy);
      fragment.append(button);
    });
    list.replaceChildren(fragment);
    empty.hidden = options.some(Boolean);
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
    const actionButton = event.target.closest?.('[data-action]');
    if (actionButton && !actionButton.disabled) {
      const action = actionButton.dataset.action;
      if (typeof context.actions[action] === 'function') void runAction(action);
      return;
    }
    const optionButton = event.target.closest?.('[data-option-index]');
    if (!optionButton) return;
    const text = options[Number(optionButton.dataset.optionIndex)];
    if (!text) return;
    if (!appendToTavernInput(text)) showToast('未找到酒馆输入框');
  };

  page.addEventListener('click', handleClick);
  const unsubscribe = context.subscribe(render);
  render();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
    page.removeEventListener('click', handleClick);
    previewTextarea?.remove();
    context.signal.removeEventListener('abort', dispose);
    unsubscribe();
  };
  context.signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
