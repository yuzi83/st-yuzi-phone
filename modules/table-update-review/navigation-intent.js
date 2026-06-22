let pendingIntent = null;

function normalizeIntent(intent = {}) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return null;
    const sheetKey = String(intent.sheetKey || '').trim();
    if (!sheetKey) return null;

    const rowIndex = Number(intent.rowIndex);
    return {
        sheetKey,
        rowId: String(intent.rowId ?? '').trim(),
        rowIndex: Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : -1,
        changeType: String(intent.changeType || '').trim(),
        createdAt: Number.isFinite(Number(intent.createdAt)) ? Number(intent.createdAt) : Date.now(),
    };
}

export function setPendingTableReviewNavigationIntent(intent = {}) {
    const normalized = normalizeIntent(intent);
    if (!normalized) return false;
    pendingIntent = normalized;
    return true;
}

export function peekPendingTableReviewNavigationIntent() {
    return pendingIntent ? { ...pendingIntent } : null;
}

export function clearPendingTableReviewNavigationIntent() {
    pendingIntent = null;
}

export function consumePendingTableReviewNavigationIntent(sheetKey) {
    const key = String(sheetKey || '').trim();
    if (!pendingIntent || pendingIntent.sheetKey !== key) return null;
    const intent = pendingIntent;
    pendingIntent = null;
    return { ...intent };
}
