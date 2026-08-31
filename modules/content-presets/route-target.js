import { resolveTableNavigationTarget } from '../table-navigation/catalog.js';

export function resolveContentPresetRouteTarget(route, rawData, options = {}) {
    const value = String(route ?? '').trim();
    if (value.startsWith('table-generic:') || value.startsWith('app:') || value.startsWith('theater:')) {
        return Object.freeze({ bypass: true, route: value, sheetKey: '' });
    }
    if (value.startsWith('table:')) {
        const sheetKey = value.slice('table:'.length).trim();
        const catalogEntry = resolveTableNavigationTarget(rawData, sheetKey, {
            navigationContext: options.navigationContext,
        });
        return Object.freeze({ bypass: !catalogEntry, route: value, sheetKey, catalogEntry });
    }
    return Object.freeze({ bypass: true, route: value, sheetKey: '' });
}
