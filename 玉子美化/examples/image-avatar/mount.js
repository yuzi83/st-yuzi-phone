// Standalone author example. Register canvas.json, adapting fields to the actual table.
// No network calls, private globals, API keys, imports or database writes.
export function mount(context) {
  const { root, actions, signal } = context;
  root.innerHTML = `<section class="avatar-demo">
    <style>.avatar-demo{font-family:var(--yuzi-content-preset-font-family,system-ui)}.avatar-demo img{display:block;width:112px;height:112px;object-fit:cover}.avatar-demo button{font:inherit}</style>
    <img alt="人物头像" hidden><button type="button">生成头像</button><p role="status"></p>
  </section>`;
  const image = root.querySelector('img');
  const button = root.querySelector('button');
  const message = root.querySelector('[role="status"]');
  let disposed = false;
  let busy = false;
  let revision = 0;
  let shownIdentity = '';
  const row = () => {
    const state = context.getState();
    return Object.fromEntries(state.headers.map((header, index) => [header, state.rows[0]?.[index]]));
  };
  const identity = values => String(values['人物编号'] ?? '').normalize('NFKC').trim();
  const current = (values, token) => !disposed && !signal.aborted && token === revision && identity(row()) === identity(values);
  const showImage = path => { image.src = path; image.hidden = false; };
  const refresh = async () => {
    const token = ++revision;
    const values = row();
    if (shownIdentity !== identity(values)) { image.hidden = true; image.removeAttribute('src'); }
    shownIdentity = identity(values);
    const supported = typeof actions.getImageGenerationState === 'function' && typeof actions.generateImage === 'function' && typeof actions.readImage === 'function';
    button.disabled = true;
    if (!supported) { message.textContent = '当前无法生图，原有图片功能仍可使用。'; return; }
    try {
      const state = await actions.getImageGenerationState('avatar', values);
      if (!current(values, token)) return;
      button.disabled = busy || !state.available;
      if (!state.available) { message.textContent = '当前无法生图：' + state.status; return; }
      if (busy) return;
      const result = await actions.readImage('avatar', values);
      if (current(values, token) && result.ok && result.imagePath) showImage(result.imagePath);
    } catch { if (current(values, token)) message.textContent = '读取失败，保留原图。'; }
  };
  const generate = async () => {
    if (busy || button.disabled || disposed) return;
    busy = true;
    button.disabled = true;
    const values = row();
    const token = revision;
    message.textContent = '正在生成…';
    try {
      const result = await actions.generateImage('avatar', values);
      if (!current(values, token)) return;
      if (result.ok && result.imagePath) { showImage(result.imagePath); message.textContent = '已更新头像'; }
      else message.textContent = '未替换原图：' + result.status;
    } catch { if (current(values, token)) message.textContent = '生成失败，保留原图。'; }
    finally { busy = false; if (!disposed) void refresh(); }
  };
  button.addEventListener('click', generate);
  const unsubscribe = context.subscribe(refresh);
  const unsubscribeSettings = actions.subscribeImageGeneration?.(refresh) || (() => {});
  void refresh();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ++revision;
    unsubscribe();
    unsubscribeSettings();
    button.removeEventListener('click', generate);
    signal.removeEventListener('abort', dispose);
    root.replaceChildren();
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
