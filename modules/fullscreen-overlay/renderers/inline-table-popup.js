import { INLINE_TABLE_POPUP_MODEL_ID, normalizeFullscreenOverlaySettings } from '../settings.js';
import { createTablePopupCard } from './table-popup-card.js';

export function createInlineTablePopupRenderer({ documentRef, getSettings, getTarget, getInlineEpoch }) {
    let container = null;
    let targetId = null;
    let groupKey = null;
    let disposed = false;
    const clear = () => {
        container?.remove();
        container = null;
        targetId = null;
        groupKey = null;
    };
    return {
        async play(batch, { signal } = {}) {
            if (disposed || signal?.aborted || (getInlineEpoch && batch.inlineEpoch !== getInlineEpoch())) return { emittedCount: 0 };
            const target = getTarget();
            if (!target?.element?.parentNode) {
                clear();
                throw new Error('no-ai-message');
            }
            const expected = batch.inlineTarget;
            if (expected && (expected.chat !== target.chat || expected.message !== target.message
                || expected.text !== target.text || expected.swipeId !== target.swipeId)) return { emittedCount: 0 };
            const settings = normalizeFullscreenOverlaySettings(getSettings()).models[INLINE_TABLE_POPUP_MODEL_ID];
            if (groupKey !== batch.inlineGroupKey || targetId !== target.messageId || !container?.parentNode) {
                clear();
                container = documentRef.createElement('div');
                container.className = 'yuzi-phone-inline-table-popup-container';
                target.element.after(container);
                targetId = target.messageId;
                groupKey = batch.inlineGroupKey;
            }
            let emittedCount = 0;
            for (const item of batch.items || []) {
                if (!Array.isArray(item.cells) || !item.cells.length) continue;
                const { element } = createTablePopupCard(documentRef, item, settings, { width: 560 });
                element.setAttribute('data-yuzi-phone-sheet-key', String(batch.sheetKey || ''));
                container.appendChild(element);
                emittedCount++;
            }
            return { emittedCount };
        },
        clear,
        dispose() {
            if (disposed) return;
            disposed = true;
            clear();
        },
    };
}
