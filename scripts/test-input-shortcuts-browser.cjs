// 可选的真实浏览器行为检查：YUZI_TEST_BROWSER 可指定 Chromium/Edge 可执行文件。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const browser = process.env.YUZI_TEST_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(file => fs.existsSync(file));
if (!browser) { console.error('未找到浏览器，请通过 YUZI_TEST_BROWSER 指定。'); process.exit(1); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuzi-shortcuts-test-'));
try {
    const js = esbuild.buildSync({ entryPoints: [path.join(__dirname, 'fixtures/input-shortcuts-browser.js')], bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'import.meta.url': '"file:///yuzi-test.js"' } }).outputFiles[0].text;
    const css = esbuild.buildSync({ entryPoints: [path.join(root, 'style.css')], bundle: true, write: false, loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' } }).outputFiles[0].text;
    const html = `<!doctype html><meta charset="utf-8"><style>${css}
        #test-phone { width: 390px; height: 700px; position: relative; } #test-phone .phone-app-page { position: relative; height: 700px; }
        #test-phone .phone-settings-scroll { height: 580px; overflow-y: auto; }
        textarea, select, option { background: black !important; color: black !important; }
        </style><div id="test-phone"></div><textarea id="send_textarea"></textarea><pre id="result">PENDING</pre><script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
    const file = path.join(dir, 'test.html'); fs.writeFileSync(file, html);
    const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=4000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 60000, maxBuffer: 12 * 1024 * 1024, windowsHide: true });
    const output = result.stdout || '';
    const summary = output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    if (result.error || !summary?.startsWith('PASS:')) {
        console.error(summary || result.error || result.stderr); process.exitCode = 1;
    } else console.log(summary);
} finally {
    // 仅清理本次 mkdtemp 创建的绝对临时目录，不接触仓库或用户浏览器配置。
    if (path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('yuzi-shortcuts-test-')) {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}
