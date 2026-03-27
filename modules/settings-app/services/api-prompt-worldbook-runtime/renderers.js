import { escapeHtml, escapeHtmlAttr } from '../../../utils.js';
import {
    filterEntries,
    getEntrySelectionState,
    setEntrySelectionState,
} from '../worldbook-selection.js';

export function createWorldbookRenderers(ctx = {}) {
    const {
        container,
        state,
    } = ctx;

    const updateWorldbookStatus = () => {
        const statusEl = container.querySelector('#phone-worldbook-status-text');
        if (!statusEl) return;

        const sourceMode = String(state.worldbookSourceMode || 'manual');
        const filteredEntries = filterEntries(state.worldbookEntries, state.worldbookSearchQuery);
        const currentWorldbook = String(state.currentWorldbook || '').trim();
        const boundWorldbookNames = Array.isArray(state.boundWorldbookNames) ? state.boundWorldbookNames : [];

        if (sourceMode === 'off') {
            statusEl.textContent = '当前已关闭世界书读取';
            return;
        }

        if (sourceMode === 'manual' && !currentWorldbook) {
            statusEl.textContent = '请先选择世界书';
            return;
        }

        if (sourceMode === 'character_bound' && boundWorldbookNames.length === 0) {
            statusEl.textContent = '当前角色未绑定世界书';
            return;
        }

        let selectedCount = 0;
        let enabledCount = 0;
        let disabledCount = 0;

        filteredEntries.forEach((entry) => {
            const worldbookName = String(entry.__worldbookName || currentWorldbook || '').trim();
            if (entry.enabled !== false) {
                enabledCount++;
                if (worldbookName && getEntrySelectionState(worldbookName, entry.uid, sourceMode)) {
                    selectedCount++;
                }
            } else {
                disabledCount++;
            }
        });

        let statusText = `已选择: ${selectedCount}/${enabledCount} 条目`;
        if (sourceMode === 'character_bound' && boundWorldbookNames.length > 0) {
            statusText += ` · 来源: ${boundWorldbookNames.join('、')}`;
        }
        if (disabledCount > 0) {
            statusText += ` (禁用: ${disabledCount})`;
        }
        statusEl.textContent = statusText;
    };

    const renderWorldbookEntriesList = () => {
        const entriesContainer = container.querySelector('#phone-worldbook-entries');
        if (!entriesContainer) return;

        const sourceMode = String(state.worldbookSourceMode || 'manual');
        const filteredEntries = filterEntries(state.worldbookEntries, state.worldbookSearchQuery);
        const currentWorldbook = String(state.currentWorldbook || '').trim();
        const boundWorldbookNames = Array.isArray(state.boundWorldbookNames) ? state.boundWorldbookNames : [];

        if (sourceMode === 'off') {
            entriesContainer.innerHTML = '<div class="phone-worldbook-empty">已关闭世界书读取</div>';
            updateWorldbookStatus();
            return;
        }

        if (state.worldbookLoading) {
            entriesContainer.innerHTML = '<div class="phone-worldbook-loading">加载中...</div>';
            return;
        }

        if (state.worldbookError) {
            entriesContainer.innerHTML = `<div class="phone-worldbook-error">${escapeHtml(state.worldbookError)}</div>`;
            return;
        }

        if (sourceMode === 'manual' && !currentWorldbook) {
            entriesContainer.innerHTML = '<div class="phone-worldbook-empty">请先选择世界书</div>';
            updateWorldbookStatus();
            return;
        }

        if (sourceMode === 'character_bound' && boundWorldbookNames.length === 0) {
            entriesContainer.innerHTML = '<div class="phone-worldbook-empty">当前角色未绑定世界书</div>';
            updateWorldbookStatus();
            return;
        }

        if (filteredEntries.length === 0) {
            if (state.worldbookSearchQuery) {
                entriesContainer.innerHTML = '<div class="phone-worldbook-empty">未找到匹配的条目</div>';
            } else {
                entriesContainer.innerHTML = '<div class="phone-worldbook-empty">该模式下暂无可用条目</div>';
            }
            updateWorldbookStatus();
            return;
        }

        let selectedCount = 0;
        let enabledCount = 0;

        const entriesHtml = filteredEntries.map((entry) => {
            const uid = entry.uid;
            const name = entry.name || `条目 ${uid}`;
            const enabled = entry.enabled !== false;
            const sourceWorldbook = String(entry.__worldbookName || currentWorldbook || '').trim();
            const checked = sourceWorldbook ? getEntrySelectionState(sourceWorldbook, uid, sourceMode) : false;

            if (enabled) {
                enabledCount++;
                if (checked) selectedCount++;
            }

            const disabledClass = enabled ? '' : 'is-disabled';
            const worldbookMeta = sourceMode === 'character_bound' && sourceWorldbook
                ? `<span class="phone-worldbook-entry-meta">${escapeHtml(sourceWorldbook)}</span>`
                : '';

            return `
                <div class="phone-worldbook-entry ${disabledClass}" data-uid="${uid}" data-worldbook="${escapeHtmlAttr(sourceWorldbook)}">
                    <label class="phone-worldbook-entry-label">
                        <input type="checkbox" class="phone-worldbook-entry-checkbox"
                            data-uid="${uid}" data-worldbook="${escapeHtmlAttr(sourceWorldbook)}" ${enabled ? '' : 'disabled'} ${checked ? 'checked' : ''}>
                        <span class="phone-worldbook-entry-name">${escapeHtml(name)}</span>
                        ${worldbookMeta}
                    </label>
                </div>
            `;
        }).join('');

        entriesContainer.innerHTML = entriesHtml;

        entriesContainer.querySelectorAll('.phone-worldbook-entry-checkbox').forEach((checkbox) => {
            checkbox.addEventListener('change', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement)) return;

                const uid = parseInt(target.dataset.uid, 10);
                const worldbookName = String(target.dataset.worldbook || '').trim();
                const checked = !!target.checked;
                if (!worldbookName || Number.isNaN(uid)) return;
                setEntrySelectionState(worldbookName, uid, checked, { sourceMode });
                updateWorldbookStatus();
            });
        });

        updateWorldbookStatus();
    };

    return {
        renderWorldbookEntriesList,
        updateWorldbookStatus,
    };
}
