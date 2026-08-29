const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importModule(relativePath) {
    return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function classTokens(tag) {
    const match = tag.match(/\bclass="([^"]*)"/u);
    return match ? match[1].split(/\s+/u).filter(Boolean) : [];
}

function classSelectorSpecificity(selector) {
    return (selector.match(/\.[\w-]+/gu) || []).length;
}

function extractCssRule(css, selector) {
    const cleanCss = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    const rules = cleanCss.matchAll(/([^{}]+)\{([^}]*)\}/gu);
    for (const match of rules) {
        const selectors = match[1].split(',').map(item => item.trim());
        if (selectors.includes(selector)) {
            return match[2];
        }
    }
    assert.fail(`必须存在样式规则：${selector}`);
}

function buildReadyViewModel() {
    return {
        status: 'ready',
        eyeDropperSupported: false,
        config: {
            enabled: true,
            models: {
                'scrolling-barrage': {
                    maxConcurrent: 6,
                    intervalMs: 1600,
                    durationMs: 20000,
                    fontSizePx: 28,
                    opacity: 0.86,
                    palette: ['#ffffff'],
                },
            },
        },
        tables: [],
    };
}

async function testPublicHtmlRendersOneCompactRowPerParameter() {
    const {
        buildFullscreenOverlayPageHtml,
    } = await importModule('modules/settings-app/layout/page-builders/fullscreen-overlay-builders.js');

    const html = buildFullscreenOverlayPageHtml(buildReadyViewModel());
    const rows = [...html.matchAll(
        /<label\b[^>]*class="[^"]*\bphone-fullscreen-overlay-parameter-row\b[^"]*"[^>]*>[\s\S]*?<\/label>/gu,
    )].map(match => match[0]);

    assert.match(
        html,
        /class="phone-fullscreen-overlay-parameter-list"/u,
        '播放参数必须收敛到一个紧凑纵向列表',
    );
    assert.strictEqual(rows.length, 5, '密度、间隔、速度、字号、透明度必须各占一行');
    assert.doesNotMatch(
        html,
        /\bphone-fullscreen-overlay-parameter-grid\b/u,
        '公开 HTML 不应继续输出双列参数卡片网格',
    );

    const expectedRows = [
        { id: 'phone-fullscreen-overlay-density', label: '密度', value: '6', unit: '条' },
        { id: 'phone-fullscreen-overlay-interval', label: '间隔', value: '1.6', unit: '秒' },
        { id: 'phone-fullscreen-overlay-duration', label: '速度', value: '20', unit: '秒' },
        { id: 'phone-fullscreen-overlay-font-size', label: '字号', value: '28', unit: 'px' },
        { id: 'phone-fullscreen-overlay-opacity', label: '透明度', value: '0.86', unit: '' },
    ];

    expectedRows.forEach((expected, index) => {
        const row = rows[index];
        const inputMatch = row.match(new RegExp(
            `<input\\b[^>]*\\bid="${expected.id}"[^>]*>`,
            'u',
        ));
        assert.ok(inputMatch, `${expected.label}行必须包含对应的数字输入框`);
        assert.ok(
            classTokens(inputMatch[0]).includes('phone-settings-input'),
            `${expected.label}必须复用主设置页 phone-settings-input`,
        );
        assert.ok(
            classTokens(inputMatch[0]).includes('phone-fullscreen-overlay-parameter-input'),
            `${expected.label}必须带有仅负责紧凑尺寸的局部输入 class`,
        );
        assert.match(
            inputMatch[0],
            new RegExp(`\\bvalue="${expected.value}"`, 'u'),
            `${expected.label}必须显示公开 view model 中的值`,
        );

        const labelIndex = row.indexOf(`>${expected.label}<`);
        const inputIndex = row.indexOf(inputMatch[0]);
        assert.ok(labelIndex >= 0 && labelIndex < inputIndex, `${expected.label}必须先显示名称再显示数值`);
        if (expected.unit) {
            const unitMatch = row.match(
                /<span\b[^>]*class="[^"]*\bphone-fullscreen-overlay-parameter-unit\b[^"]*"[^>]*>([^<]*)<\/span>/u,
            );
            assert.ok(unitMatch, `${expected.label}行必须包含单位元素`);
            assert.strictEqual(unitMatch[1], expected.unit, `${expected.label}行必须显示正确单位`);
            assert.ok(
                inputIndex < row.indexOf(unitMatch[0]),
                `${expected.label}行必须按“名称、数值、单位”的横向阅读顺序输出`,
            );
        } else {
            assert.doesNotMatch(
                row,
                /\bphone-fullscreen-overlay-parameter-unit\b/u,
                `${expected.label}没有单位时不得输出空 unit 元素`,
            );
        }
        assert.doesNotMatch(
            row,
            /<small\b/u,
            `${expected.label}行不应再用常驻说明文字撑高单项`,
        );
    });

    const densityTitle = rows[0].match(/\btitle="([^"]*)"/u);
    assert.ok(densityTitle, '密度行必须通过 title 保留紧凑说明');
    assert.match(densityTitle[1], /轨道/u, '密度必须表达垂直轨道语义');
    assert.match(densityTitle[1], /视觉密度/u, '密度必须表达视觉密度语义');
    assert.doesNotMatch(
        densityTitle[1],
        /活动弹幕|允许同时存在|最大弹幕数/u,
        '密度不再表示完整动画生命周期内的活动弹幕总数',
    );
}

function testCssUsesDenseRowsWithoutPerItemCardsAndKeepsDarkStylesScoped() {
    const css = read('styles/fullscreen-overlay/01-settings.css');
    const listRule = extractCssRule(css, '.phone-fullscreen-overlay-parameter-list');
    const rowRule = extractCssRule(css, '.phone-fullscreen-overlay-parameter-row');
    const compactInputSelector =
        '.phone-fullscreen-overlay-settings-page '
        + '.phone-fullscreen-overlay-parameter-row '
        + '.phone-fullscreen-overlay-parameter-input';
    const inputRule = extractCssRule(css, compactInputSelector);

    assert.match(listRule, /display:\s*(?:flex|grid)\s*;/u);
    assert.match(rowRule, /display:\s*(?:flex|grid)\s*;/u);
    assert.match(rowRule, /align-items:\s*center\s*;/u);
    assert.match(rowRule, /border-bottom:/u, '紧凑参数行只需要轻量分隔线');
    assert.doesNotMatch(rowRule, /(?:^|;)\s*border\s*:/u, '单项不应再有完整卡片边框');
    assert.doesNotMatch(rowRule, /\bborder-radius\s*:/u, '单项不应再有卡片圆角');
    assert.doesNotMatch(rowRule, /\bbackground(?:-color)?\s*:/u, '单项不应再有卡片底色');
    assert.doesNotMatch(rowRule, /\bbox-shadow\s*:/u, '单项不应再有卡片阴影');

    assert.ok(
        classSelectorSpecificity(compactInputSelector)
            > classSelectorSpecificity('.phone-settings-page .phone-settings-input'),
        '紧凑宽度选择器必须稳定压过主设置页 width: 100% 基础规则',
    );
    assert.match(inputRule, /\bwidth:\s*68px\s*;/u, '局部输入样式应固定紧凑宽度');
    assert.match(inputRule, /\bmin-width:\s*68px\s*;/u);
    assert.match(inputRule, /\btext-align:\s*(?:right|center)\s*;/u);

    const scopedInputRule = extractCssRule(
        css,
        '.phone-fullscreen-overlay-settings-page .phone-settings-input',
    );
    assert.match(scopedInputRule, /\bbackground(?:-color)?\s*:/u);
    assert.match(scopedInputRule, /\bcolor\s*:/u);
    assert.match(scopedInputRule, /-webkit-text-fill-color\s*:/u);
    assert.doesNotMatch(
        css,
        /(^|[,{]\s*)(input|select|option)(?=[\s:{.#\[])/mu,
        '深色兜底不得通过无页面作用域的原生表单选择器污染酒馆页面',
    );
}

async function main() {
    await testPublicHtmlRendersOneCompactRowPerParameter();
    testCssUsesDenseRowsWithoutPerItemCardsAndKeepsDarkStylesScoped();
    console.log('[fullscreen-overlay-compact-settings-ui] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-compact-settings-ui] failed');
    console.error(error);
    process.exitCode = 1;
});
