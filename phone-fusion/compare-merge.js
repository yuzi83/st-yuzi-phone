import {
    buildFusionCompareHtml,
    buildFusionCompareRowHtml,
    buildFusionEmptyResultHtml,
    buildFusionSuccessResultHtml,
} from './templates.js';
import { extractSheets } from './utils.js';
import { clearFusionResult, setFusionDownloadUrl } from './runtime.js';

export function renderFusionCompare(container, templateA, templateB) {
    const compareEl = container.querySelector('#phone-fusion-compare');
    const actionsEl = container.querySelector('#phone-fusion-actions');

    if (!compareEl || !actionsEl) return;

    if (!templateA || !templateB) {
        compareEl.innerHTML = '';
        actionsEl.style.display = 'none';
        clearFusionResult(container);
        return;
    }

    const sheetsA = extractSheets(templateA);
    const sheetsB = extractSheets(templateB);
    const allKeys = [...new Set([...sheetsA.map(s => s.key), ...sheetsB.map(s => s.key)])];

    const rowsHtml = allKeys.map((key) => {
        const inA = sheetsA.find(s => s.key === key);
        const inB = sheetsB.find(s => s.key === key);
        const conflict = inA && inB;
        const name = inA?.name || inB?.name || key;
        const cols = inA?.cols || inB?.cols || 0;
        const source = conflict ? '两者都有' : (inA ? 'A' : 'B');
        const sourceClass = conflict ? 'phone-source-conflict' : (inA ? 'phone-source-a' : 'phone-source-b');

        return buildFusionCompareRowHtml({ key, name, cols, source, sourceClass, conflict });
    }).join('');

    compareEl.innerHTML = buildFusionCompareHtml(rowsHtml);
    actionsEl.style.display = 'flex';
}

export function performFusionMerge(container, templateA, templateB) {
    const resultEl = container.querySelector('#phone-fusion-result');
    const rows = container.querySelectorAll('.phone-fusion-table-row');
    if (!(resultEl instanceof HTMLElement)) return;

    const merged = {
        mate: { type: 'chatSheets', version: 1 },
    };

    if (templateA?.mate) merged.mate = { ...merged.mate, ...templateA.mate };

    let orderNo = 0;
    rows.forEach((row) => {
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
        resultEl.innerHTML = buildFusionEmptyResultHtml();
        return;
    }

    clearFusionResult(container);
    const jsonStr = JSON.stringify(merged, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const nextUrl = URL.createObjectURL(blob);
    setFusionDownloadUrl(nextUrl);

    resultEl.innerHTML = buildFusionSuccessResultHtml(nextUrl, sheetCount);
}
