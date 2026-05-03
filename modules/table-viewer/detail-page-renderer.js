import { createGenericTemplateStylePayload } from './generic-style-payload.js';
import { buildGenericDetailPageHtml } from './detail-page-template.js';
import { bindGenericDetailEditController } from './detail-edit-controller.js';
import { buildGenericDetailRowPayload } from './detail-row-payload.js';
import { showInlineToast, bindWheelBridge } from './shared-ui.js';

export function renderGenericDetailPage(options = {}) {
    const {
        container,
        state,
        sheetKey,
        headers = [],
        rawHeaders = [],
        rows = [],
        genericMatch,
        render,
        restoreListScroll,
        renderKeepScroll,
        getTableLockState,
        isTableRowLocked,
        isTableCellLocked,
        toggleTableCellLock,
        getTableData,
        saveTableData,
        viewerRuntime,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;

    const row = rows[state.rowIndex];
    if (!row) {
        state.returnToListMode();
        if (typeof render === 'function') {
            render();
        }
        return;
    }

    state.syncLockState(getTableLockState(sheetKey));

    const genericStylePayload = createGenericTemplateStylePayload(genericMatch, 'detail');
    const {
        title,
        rowIndexForLock,
        rowLocked,
        shouldHideLeadingPlaceholder,
        toLockColIndex,
        kvPairs,
        pagerInfo,
    } = buildGenericDetailRowPayload({
        row,
        state,
        headers,
        rawHeaders,
        fieldBindings: genericStylePayload.fieldBindings,
        sheetKey,
        rowsCount: rows.length,
        saving: state.saving,
        isTableRowLocked,
        isTableCellLocked,
    });

    container.innerHTML = buildGenericDetailPageHtml({
        title,
        kvPairs,
        rowLocked,
        pagerInfo,
        genericStylePayload,
        state,
    });

    bindWheelBridge(container);

    bindGenericDetailEditController({
        container,
        state,
        rowLocked,
        rowIndexForLock,
        sheetKey,
        rawHeaders,
        rows,
        shouldHideLeadingPlaceholder,
        toLockColIndex,
        render,
        restoreListScroll,
        renderKeepScroll,
        getTableLockState,
        isTableRowLocked,
        toggleTableCellLock,
        isTableCellLocked,
        getTableData,
        saveTableData,
        showInlineToast,
        runtime: viewerRuntime,
    });
}
