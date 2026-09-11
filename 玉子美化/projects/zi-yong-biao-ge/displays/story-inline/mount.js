const normalize = value => String(value ?? '').normalize('NFKC').trim();
const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

// Render the supplied snapshot in its original order. No latest-row selection or database access.
function records(state, name) {
  const table = state?.tables?.find(table => normalize(table.tableName) === normalize(name));
  if (!Array.isArray(table?.headers) || !Array.isArray(table?.rows)) return [];
  return table.rows.filter(Array.isArray).map(row => Object.fromEntries(table.headers.map((header, i) => [normalize(header), row[i]])));
}

export function mount(context) {
  const { root, signal, actions = {} } = context;
  const document = root.ownerDocument;
  if (signal.aborted) return () => {};
  let disposed = false;
  let revision = 0;
  let activeTab = 'summary';
  let sending = false;
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const card = element('section', 'story-inline');
  card.setAttribute('aria-label', '剧情随记');
  const style = element('style', '');
  style.textContent = `
.story-inline{--si-bg:#181c19;--si-panel:#202720;--si-ink:#e5e8de;--si-muted:#a4b19f;--si-line:#384335;--si-accent:#c4d1a6;box-sizing:border-box;width:100%;max-width:760px;margin:12px auto;color:var(--si-ink);background:var(--si-bg);border:1px solid var(--si-line);border-radius:18px;overflow:hidden;font:14px/1.65 var(--yuzi-content-preset-font-family,var(--yuzi-phone-font-family,system-ui));text-align:left;container-type:inline-size}
.story-inline *{box-sizing:border-box;min-width:0}.story-inline [hidden]{display:none!important}.story-inline button{font:inherit;color:inherit;cursor:pointer}.story-inline button:disabled{cursor:default;opacity:.55}.story-inline button:focus-visible{outline:2px solid var(--si-accent);outline-offset:-3px}
.story-inline .si-heading{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--si-line);font-size:12px;letter-spacing:.16em;color:var(--si-accent)}.story-inline .si-dot{width:6px;height:6px;flex:none;border-radius:50%;background:var(--si-accent)}
.story-inline .si-top{padding:20px}.story-inline .si-person+.si-person{margin-top:20px;padding-top:20px;border-top:1px solid var(--si-line)}.story-inline .si-profile{display:grid;grid-template-columns:84px minmax(0,1fr);gap:16px;align-items:center}.story-inline .si-avatar{width:84px;aspect-ratio:1;border:1px solid var(--si-line);border-radius:14px;background:linear-gradient(145deg,#374432,#232b22);display:grid;place-items:center;overflow:hidden;position:relative;color:var(--si-accent);font-size:27px}.story-inline .si-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.story-inline .si-name{margin:0 0 7px;font-size:23px;font-weight:600;color:var(--si-ink);overflow-wrap:anywhere}.story-inline .si-tags{display:flex;gap:6px;flex-wrap:wrap}.story-inline .si-tag{padding:2px 8px;border:1px solid var(--si-line);border-radius:6px;color:var(--si-accent);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.story-inline .si-details{display:grid;gap:12px;margin:18px 0 0}.story-inline .si-field{margin:0}.story-inline .si-label{font-size:11px;letter-spacing:.08em;color:var(--si-muted);margin:0 0 4px}.story-inline .si-value{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--si-ink)}.story-inline .si-global{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px;padding:14px;background:var(--si-panel);border:1px solid var(--si-line);border-radius:10px}.story-inline .si-global .si-value{font-size:12px}
.story-inline .si-tabs{display:flex;border-block:1px solid var(--si-line);padding:0 20px;gap:24px}.story-inline .si-tab{min-height:46px;padding:10px 4px;background:none;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--si-muted)}.story-inline .si-tab[aria-selected=true]{border-bottom-color:var(--si-accent);color:var(--si-accent)}
.story-inline .si-panel{padding:20px;max-height:520px;overflow:auto;overscroll-behavior:auto;scrollbar-width:thin;scrollbar-color:var(--si-line) transparent}.story-inline .si-entry{display:grid;gap:14px}.story-inline .si-entry+.si-entry{border-top:1px solid var(--si-line);margin-top:20px;padding-top:20px}.story-inline .si-meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--si-muted);font-size:12px}.story-inline .si-dialogue{padding:12px 14px;border-left:2px solid #87996d;background:var(--si-panel);border-radius:0 8px 8px 0}.story-inline .si-options{display:grid;gap:9px}.story-inline .si-option{display:grid;grid-template-columns:26px minmax(0,1fr) 16px;gap:10px;align-items:start;width:100%;padding:13px;background:var(--si-panel);border:1px solid var(--si-line);border-radius:10px;text-align:left}.story-inline .si-option:hover:not(:disabled){border-color:#87996d;background:#293126}.story-inline .si-number{font-size:11px;color:var(--si-accent);padding-top:3px}.story-inline .si-hint,.story-inline .si-empty{color:var(--si-muted);font-size:12px;margin:0}.story-inline .si-hint{margin-bottom:12px}.story-inline .si-status{padding:0 20px 12px;color:var(--si-accent);font-size:12px}.story-inline .si-status:empty{display:none}
@container(max-width:360px){.story-inline .si-top,.story-inline .si-panel{padding:15px}.story-inline .si-profile{grid-template-columns:68px minmax(0,1fr);gap:12px}.story-inline .si-avatar{width:68px}.story-inline .si-name{font-size:20px}.story-inline .si-global{grid-template-columns:1fr;gap:9px}.story-inline .si-global .si-field{display:grid;grid-template-columns:68px minmax(0,1fr);gap:8px}.story-inline .si-global .si-label{margin:0}}
`;
  const heading = element('div', 'si-heading');
  heading.append(element('span', 'si-dot'), element('span', '', '剧情随记'));
  const top = element('div', 'si-top');
  const tablist = element('div', 'si-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', '纪要与选项');
  const panels = {};
  const tabs = {};
  const status = element('div', 'si-status');
  status.setAttribute('role', 'status');
  for (const [key, label] of [['summary', '纪要'], ['options', '选项']]) {
    tabs[key] = element('button', 'si-tab', label);
    tabs[key].type = 'button';
    tabs[key].dataset.tab = key;
    tabs[key].setAttribute('role', 'tab');
    panels[key] = element('div', 'si-panel');
    panels[key].setAttribute('role', 'tabpanel');
    panels[key].setAttribute('aria-label', label);
    panels[key].tabIndex = 0;
    tablist.append(tabs[key]);
  }
  card.append(style, heading, top, tablist, panels.summary, panels.options, status);
  root.append(card);
  const selectTab = key => {
    activeTab = key;
    for (const name of Object.keys(tabs)) {
      tabs[name].setAttribute('aria-selected', String(name === key));
      tabs[name].tabIndex = name === key ? 0 : -1;
      panels[name].hidden = name !== key;
    }
  };
  const field = (label, value, className = '') => {
    const block = element('div', `si-field ${className}`);
    block.append(element('div', 'si-label', label), element('p', 'si-value', text(value).trim() || '暂无'));
    return block;
  };
  async function readAvatar(row, avatar, token) {
    if (!normalize(row['姓名']) || typeof actions.readImage !== 'function') return;
    try {
      const result = await actions.readImage('protagonist-avatar', row);
      if (disposed || signal.aborted || token !== revision || !result?.ok || !result.imagePath) return;
      // Never fall back to a legacy upload after the host has cleared an image.
      const url = String(result.imagePath);
      if (/^(?:javascript|data|vbscript):/i.test(url.trim())) return;
      const image = element('img', '');
      image.alt = `${text(row['姓名']) || '主角'}的头像`;
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = url;
      avatar.append(image);
    } catch { /* Keep the neutral avatar when the public image reader is unavailable. */ }
  }
  function render(state) {
    if (disposed || signal.aborted) return;
    const token = ++revision;
    top.replaceChildren();
    panels.summary.replaceChildren();
    panels.options.replaceChildren();
    status.textContent = '';
    const people = records(state, '主角信息');
    if (!people.length) top.append(element('p', 'si-empty', '暂无主角信息'));
    for (const row of people) {
      const person = element('section', 'si-person');
      const profile = element('div', 'si-profile');
      const avatar = element('div', 'si-avatar', Array.from(text(row['姓名']).trim())[0] || '人');
      const identity = element('div', '');
      const tags = element('div', 'si-tags');
      for (const key of ['性别', '年龄', '身份']) tags.append(element('span', 'si-tag', text(row[key]).trim() || `${key}待补充`));
      identity.append(element('h3', 'si-name', text(row['姓名']).trim() || '未命名主角'), tags);
      profile.append(avatar, identity);
      const details = element('div', 'si-details');
      for (const key of ['外貌特征', '近况', '特有属性']) details.append(field(key, row[key]));
      person.append(profile, details);
      top.append(person);
      if (normalize(row['姓名']) && people.filter(person => normalize(person['姓名']) === normalize(row['姓名'])).length === 1) void readAvatar(row, avatar, token);
    }
    const globals = records(state, '全局数据表');
    for (const row of globals.length ? globals : [{}]) {
      const bar = element('div', 'si-global');
      for (const key of ['当前时间', '当前位置', '经过的时间']) bar.append(field(key, row[key]));
      top.append(bar);
    }
    const summaries = records(state, '纪要表');
    if (!summaries.length) panels.summary.append(element('p', 'si-empty', '暂无纪要，收到内容后会显示在这里。'));
    for (const row of summaries) {
      const entry = element('article', 'si-entry');
      const meta = element('div', 'si-meta');
      meta.append(element('span', '', `编号 · ${text(row['编码索引']) || '暂无'}`), element('span', '', text(row['时间跨度']) || '时间待补充'));
      entry.append(meta, field('概览', row['概览']), field('纪要', row['纪要']), field('重要对话', row['重要对话'], 'si-dialogue'));
      panels.summary.append(entry);
    }
    panels.options.append(element('p', 'si-hint', '点击选项，追加到输入框；不会自动发送。'));
    const choices = element('div', 'si-options');
    for (const row of records(state, '选项表')) {
      ['选项一', '选项二', '选项三', '选项四', '选项五'].forEach((key, i) => {
        const value = text(row[key]).trim();
        if (!value) return;
        const button = element('button', 'si-option');
        button.type = 'button';
        button.dataset.option = value;
        button.disabled = sending || typeof actions.appendToComposer !== 'function';
        button.append(element('span', 'si-number', `0${i + 1}`), element('span', 'si-value', value), element('span', 'si-number', '↗'));
        choices.append(button);
      });
    }
    panels.options.append(choices);
    if (!choices.children.length) panels.options.append(element('p', 'si-empty', '暂无可选内容'));
    else if (typeof actions.appendToComposer !== 'function') status.textContent = '当前环境不支持追加到输入框，选项仍可阅读。';
    selectTab(activeTab);
  }
  async function click(event) {
    const tab = event.target.closest?.('[data-tab]');
    if (tab && tablist.contains(tab)) { selectTab(tab.dataset.tab); return; }
    const button = event.target.closest?.('[data-option]');
    if (!button || !card.contains(button) || disposed || signal.aborted || sending || button.disabled) return;
    sending = true;
    const token = revision;
    for (const option of card.querySelectorAll('[data-option]')) option.disabled = true;
    try {
      const result = await actions.appendToComposer(button.dataset.option);
      if (disposed || signal.aborted || token !== revision) return;
      status.textContent = result?.ok === true ? '已追加到输入框，尚未发送。' : '未能追加到输入框，请稍后重试。';
    } catch { if (!disposed && token === revision) status.textContent = '追加失败，未自动发送。'; }
    finally {
      sending = false;
      if (!disposed) for (const option of card.querySelectorAll('[data-option]')) option.disabled = typeof actions.appendToComposer !== 'function';
    }
  }
  function keydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !event.target.closest?.('[data-tab]')) return;
    event.preventDefault();
    const key = event.key === 'Home' ? 'summary' : event.key === 'End' ? 'options' : activeTab === 'summary' ? 'options' : 'summary';
    selectTab(key);
    tabs[key].focus();
  }
  card.addEventListener('click', click);
  tablist.addEventListener('keydown', keydown);
  const unsubscribe = context.subscribe(render);
  function dispose() {
    if (disposed) return;
    disposed = true;
    ++revision;
    unsubscribe();
    card.removeEventListener('click', click);
    tablist.removeEventListener('keydown', keydown);
    signal.removeEventListener('abort', dispose);
    card.remove();
  }
  signal.addEventListener('abort', dispose, { once: true });
  render(context.getState());
  return dispose;
}
