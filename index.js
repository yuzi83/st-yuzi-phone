// yuzi-phone/index.js
/**
 * 玉子手机（独立扩展骨架）
 * 与玉子市场完全解耦，不依赖其任何模块。
 */

const YUZI_PHONE_ROOT_ID = 'yuzi-phone-root';
const YUZI_PHONE_TOGGLE_ID = 'yuzi-phone-toggle';

function createRoot() {
    if (document.getElementById(YUZI_PHONE_ROOT_ID)) return;

    const root = document.createElement('div');
    root.id = YUZI_PHONE_ROOT_ID;
    root.className = 'yuzi-phone-root';
    root.innerHTML = `
        <div class="yuzi-phone-shell">
            <div class="yuzi-phone-header">
                <span class="yuzi-phone-title">玉子手机</span>
                <span class="yuzi-phone-badge">独立扩展</span>
            </div>
            <div class="yuzi-phone-body">
                <p>骨架已创建。</p>
                <p>下一步将迁移首页、表格、设置等模块。</p>
            </div>
        </div>
    `;

    document.body.appendChild(root);
}

function createToggle() {
    if (document.getElementById(YUZI_PHONE_TOGGLE_ID)) return;

    const btn = document.createElement('button');
    btn.id = YUZI_PHONE_TOGGLE_ID;
    btn.className = 'yuzi-phone-toggle';
    btn.type = 'button';
    btn.textContent = '玉子手机';
    btn.addEventListener('click', () => {
        const root = document.getElementById(YUZI_PHONE_ROOT_ID);
        if (!root) return;
        root.classList.toggle('is-visible');
    });

    document.body.appendChild(btn);
}

function initYuziPhone() {
    createRoot();
    createToggle();
    console.log('[yuzi-phone] 扩展骨架初始化完成');
}

jQuery(() => {
    initYuziPhone();
});
