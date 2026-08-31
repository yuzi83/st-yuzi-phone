import { getTableData } from '../phone-core/data-api.js';
import { replaceCurrentRoute } from '../phone-core/routing.js';
import {
    buildTableNavigationContext,
    resolveAdjacentTableTarget,
    resolveAdjacentTableTargetFromCatalog,
} from './catalog.js';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function buildDirectionState(result, blocked) {
    const target = result?.target || null;
    return Object.freeze({
        disabled: blocked || !target,
        reason: blocked ? 'blocked' : String(result?.reason || ''),
        target,
    });
}

export function buildTableNavigationControlState(rawData, currentSheetKey, options = {}) {
    const blocked = options.blocked === true;
    const navigationContext = options.navigationContext || buildTableNavigationContext(rawData);
    const previousResult = resolveAdjacentTableTargetFromCatalog(navigationContext.catalog, currentSheetKey, 'previous');
    const nextResult = resolveAdjacentTableTargetFromCatalog(navigationContext.catalog, currentSheetKey, 'next');
    return Object.freeze({
        currentSheetKey: normalizeText(currentSheetKey),
        blocked,
        disabled: blocked || !previousResult.target || !nextResult.target,
        reason: blocked ? 'blocked' : String(previousResult.reason || nextResult.reason || ''),
        previous: buildDirectionState(previousResult, blocked),
        next: buildDirectionState(nextResult, blocked),
    });
}

export function requestTableNavigationSwitch(currentSheetKey, direction, options = {}) {
    if (options.blocked === true) {
        return Object.freeze({ navigated: false, reason: 'blocked', target: null });
    }
    if (typeof options.isActive === 'function' && !options.isActive()) {
        return Object.freeze({ navigated: false, reason: 'inactive', target: null });
    }

    const readTableData = options.getTableData || getTableData;
    const replaceRoute = options.replaceCurrentRoute || replaceCurrentRoute;
    const result = resolveAdjacentTableTarget(readTableData(), currentSheetKey, direction);
    if (!result.target) {
        return Object.freeze({ navigated: false, reason: result.reason, target: null });
    }
    if (typeof options.isActive === 'function' && !options.isActive()) {
        return Object.freeze({ navigated: false, reason: 'inactive', target: null });
    }

    replaceRoute(result.target.route);
    return Object.freeze({ navigated: true, reason: '', target: result.target });
}
