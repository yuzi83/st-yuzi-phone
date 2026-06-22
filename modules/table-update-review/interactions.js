import { navigateBack, navigateTo } from '../phone-core/routing.js';
import { TABLE_GENERIC_ROUTE_PREFIX } from './constants.js';
import { setPendingTableReviewNavigationIntent } from './navigation-intent.js';

export function bindTableUpdateReviewInteractions(container, options = {}) {
    if (!(container instanceof HTMLElement)) return () => {};
    const isActive = typeof options.isActive === 'function' ? options.isActive : () => true;

    const onClick = (event) => {
        if (!isActive()) return;
        const actionEl = event.target instanceof Element ? event.target.closest('[data-action]') : null;
        if (!(actionEl instanceof HTMLElement) || !container.contains(actionEl)) return;
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;

        if (action === 'nav-back') {
            navigateBack();
            return;
        }

        if (action === 'open-review-change') {
            const sheetKey = String(actionEl.dataset.sheetKey || '').trim();
            const changeType = String(actionEl.dataset.changeType || '').trim();
            if (changeType === 'delete') return;
            if (!sheetKey) return;
            const intentAccepted = setPendingTableReviewNavigationIntent({
                sheetKey,
                rowId: String(actionEl.dataset.rowId || '').trim(),
                rowIndex: Number(actionEl.dataset.rowIndex),
                changeType,
                createdAt: Date.now(),
            });
            if (!intentAccepted) return;
            navigateTo(`${TABLE_GENERIC_ROUTE_PREFIX}${sheetKey}`);
        }
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
}
