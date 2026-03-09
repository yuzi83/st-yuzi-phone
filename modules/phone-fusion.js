// modules/phone/phone-fusion.js
/**
 * 玉子的手机 - 模板缝合 App
 * 导入两个模板 → 识别 sheet 区块 → 可视化对照 → 合并导出
 */

import { navigateBack } from './phone-core.js';
import { PHONE_ICONS } from './phone-home.js';

let templateA = null;
let templateB = null;
let templateAName = '';
let templateBName = '';

export function renderFusion(container) {
    templateA = null;
    templateB = null;
    templateAName = '';
    templateBName = '';

    container.innerHTML = `
        <div class="phone-app-page">
            <div class="phone-nav-bar">
                <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">模板缝合</span>
            </div>
            <div class="phone-app-body phone-fusion-body">
                <div class="phone-fusion-desc">
                    从两个模板中选择需要的表格区块，自动合并为新模板
                </div>
                <div class="phone-fusion-import-row">
                    <div class="phone-fusion-import-card" id="phone-import-a">
                        ${PHONE_ICONS.upload}
                        <span>导入模板 A</span>
                        <span class="phone-fusion-file-name" id="phone-fname-a"></span>
                    </div>
                    <div class="phone-fusion-import-card" id="phone-import-b">
                        ${PHONE_ICONS.upload}
                        <span>导入模板 B</span>
                        <span class="phone-fusion-file-name" id="phone-fname-b"></span>
                    </div>
                </div>
                <div id="phone-fusion-compare" class="phone-fusion-compare"></div>
                <div id="phone-fusion-actions" class="phone-fusion-actions" style="display:none;">
                    <button type="button" class="phone-fusion-merge-btn" id="phone-fusion-merge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                        <span>合并选中的表格</span>
                    </button>
                </div>
                <div id="phone-fusion-result" class="phone-fusion-result"></div>
            </div>
        </div>
    `;

    container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

    container.querySelector('#phone-import-a')?.addEventListener('click', () => {
        pickJsonFile((obj, name) => {
            templateA = obj;
            templateAName = name;
            container.querySelector('#phone-fname-a').textContent = name;
            container.querySelector('#phone-import-a').classList.add('phone-fusion-imported');
            tryRenderCompare(container);
        });
    });

    container.querySelector('#phone-import-b')?.addEventListener('click', () => {
        pickJsonFile((obj, name) => {
            templateB = obj;
            templateBName = name;
            container.querySelector('#phone-fname-b').textContent = name;
            container.querySelector('#phone-import-b').classList.add('phone-fusion-imported');
            tryRenderCompare(container);
        });
    });

    container.querySelector('#phone-fusion-merge')?.addEventListener('click', () => {
        performMerge(container);
    });
}

function tryRenderCompare(container) {
    const compareEl = container.querySelector('#phone-fusion-compare');
    const actionsEl = container.querySelector('#phone-fusion-actions');

    if (!templateA || !templateB) {
        compareEl.innerHTML = '';
        actionsEl.style.display = 'none';
        return;
    }

    const sheetsA = extractSheets(templateA);
    const sheetsB = extractSheets(templateB);

    // 找出所有唯一的 sheet keys
    const allKeys = [...new Set([...sheetsA.map(s => s.key), ...sheetsB.map(s => s.key)])];

    compareEl.innerHTML = `
        <div class="phone-fusion-table">
            <div class="phone-fusion-table-header">
                <span class="phone-fusion-col-check"></span>
                <span class="phone-fusion-col-name">表格名称</span>
                <span class="phone-fusion-col-source">来源</span>
                <span class="phone-fusion-col-cols">列数</span>
            </div>
            ${allKeys.map(key => {
                const inA = sheetsA.find(s => s.key === key);
                const inB = sheetsB.find(s => s.key === key);
                const conflict = inA && inB;
                const name = inA?.name || inB?.name || key;
                const cols = inA?.cols || inB?.cols || 0;
                const source = conflict ? '两者都有' : (inA ? 'A' : 'B');
                const sourceClass = conflict ? 'phone-source-conflict' : (inA ? 'phone-source-a' : 'phone-source-b');

                if (conflict) {
                    // 冲突：让用户选择来源
                    return `
                        <div class="phone-fusion-table-row phone-fusion-conflict" data-key="${escapeHtmlAttr(key)}">
                            <span class="phone-fusion-col-check">
                                <input type="checkbox" class="phone-fusion-check" checked>
                            </span>
                            <span class="phone-fusion-col-name">${escapeHtml(name)}</span>
                            <span class="phone-fusion-col-source ${sourceClass}">
                                <select class="phone-fusion-source-select" data-key="${escapeHtmlAttr(key)}">
                                    <option value="A">模板 A</option>
                                    <option value="B">模板 B</option>
                                </select>
                            </span>
                            <span class="phone-fusion-col-cols">${cols}</span>
                        </div>
                    `;
                }

                return `
                    <div class="phone-fusion-table-row" data-key="${escapeHtmlAttr(key)}">
                        <span class="phone-fusion-col-check">
                            <input type="checkbox" class="phone-fusion-check" checked>
                        </span>
                        <span class="phone-fusion-col-name">${escapeHtml(name)}</span>
                        <span class="phone-fusion-col-source ${sourceClass}">${source}</span>
                        <span class="phone-fusion-col-cols">${cols}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    actionsEl.style.display = 'flex';
}

function performMerge(container) {
    const resultEl = container.querySelector('#phone-fusion-result');
    const rows = container.querySelectorAll('.phone-fusion-table-row');

    const merged = {
        mate: { type: 'chatSheets', version: 1 }
    };

    // 合并 mate（优先 A）
    if (templateA?.mate) merged.mate = { ...merged.mate, ...templateA.mate };

    let orderNo = 0;
    rows.forEach(row => {
        const cb = row.querySelector('.phone-fusion-check');
        if (!cb?.checked) return;

        const key = row.dataset.key;
        const sourceSelect = row.querySelector('.phone-fusion-source-select');
        const source = sourceSelect ? sourceSelect.value : (templateA?.[key] ? 'A' : 'B');
        const srcTemplate = source === 'A' ? templateA : templateB;
        const sheet = srcTemplate?.[key];

        if (sheet) {
            merged[key] = JSON.parse(JSON.stringify(sheet));
            merged[key].orderNo = orderNo++;
        }
    });

    const sheetCount = Object.keys(merged).filter(k => k.startsWith('sheet_')).length;

    if (sheetCount === 0) {
        resultEl.innerHTML = `<div class="phone-empty-msg">未选中任何表格</div>`;
        return;
    }

    // 生成输出
    const jsonStr = JSON.stringify(merged, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    resultEl.innerHTML = `
        <div class="phone-fusion-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32" stroke-linecap="round"><path d="M5 12l5 5L19 7"/></svg>
            <div class="phone-fusion-success-text">
                <strong>合并完成</strong>
                <span>${sheetCount} 个表格已合并</span>
            </div>
            <a class="phone-fusion-download-btn" href="${url}" download="merged_template.json">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><path d="M12 4v12M12 16l-4-4M12 16l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
                <span>下载合并模板</span>
            </a>
        </div>
    `;
}

// ===== 工具 =====

function extractSheets(template) {
    if (!template || typeof template !== 'object') return [];
    return Object.keys(template)
        .filter(k => k.startsWith('sheet_'))
        .map(k => ({
            key: k,
            name: template[k]?.name || k,
            cols: Array.isArray(template[k]?.content?.[0]) ? template[k].content[0].length : 0,
        }))
        .sort((a, b) => {
            const ao = template[a.key]?.orderNo ?? Infinity;
            const bo = template[b.key]?.orderNo ?? Infinity;
            return ao - bo;
        });
}

function pickJsonFile(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const obj = JSON.parse(reader.result);
                callback(obj, file.name);
            } catch (e) {
                alert('JSON 解析失败: ' + e.message);
            }
            input.remove();
        };
        reader.readAsText(file);
    });

    input.click();
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
