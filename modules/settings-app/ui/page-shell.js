export function createPageShellSnapshot({ buildHtml, payload, rootSelector }) {
    const html = typeof buildHtml === 'function' ? buildHtml(payload) : '';

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        return {
            payload,
            html,
            pageRoot: null,
        };
    }

    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    const pageRoot = template.content.querySelector(rootSelector);

    return {
        payload,
        html,
        pageRoot: pageRoot instanceof HTMLElement ? pageRoot : null,
    };
}

export function resolvePageShellRegions(pageRoot, regionSelectors = {}) {
    if (!(pageRoot instanceof HTMLElement)) {
        return null;
    }

    return Object.fromEntries(Object.entries(regionSelectors).map(([key, selector]) => {
        return [key, pageRoot.querySelector(selector)];
    }));
}

export function hasRequiredPageShellRegions(regions, requiredRegionKeys = []) {
    if (!regions || typeof regions !== 'object') return false;
    return requiredRegionKeys.every((key) => regions[key] instanceof HTMLElement);
}

export function normalizePageShellRefreshPlan(refreshPlan, defaults = {}) {
    const source = refreshPlan && typeof refreshPlan === 'object' ? refreshPlan : null;
    return Object.fromEntries(Object.entries(defaults).map(([key, defaultValue]) => {
        if (!source || !Object.prototype.hasOwnProperty.call(source, key)) {
            return [key, !!defaultValue];
        }
        return [key, !!source[key]];
    }));
}

export function ensurePageShell(container, shellSnapshot, options = {}) {
    const {
        rootSelector,
        regionSelectors = {},
        requiredRegionKeys = Object.keys(regionSelectors),
    } = options;

    const currentPageRoot = container?.querySelector?.(rootSelector) || null;
    const currentRegions = resolvePageShellRegions(currentPageRoot, regionSelectors);

    if (currentPageRoot instanceof HTMLElement && hasRequiredPageShellRegions(currentRegions, requiredRegionKeys)) {
        return {
            pageRoot: currentPageRoot,
            didBootstrap: false,
        };
    }

    if (shellSnapshot?.pageRoot instanceof HTMLElement) {
        container.innerHTML = '';
        container.appendChild(shellSnapshot.pageRoot);
    } else {
        container.innerHTML = String(shellSnapshot?.html || '');
    }

    const nextPageRoot = container?.querySelector?.(rootSelector) || null;
    return {
        pageRoot: nextPageRoot instanceof HTMLElement ? nextPageRoot : null,
        didBootstrap: true,
    };
}

export function patchPageShell(pageRoot, shellSnapshot, options = {}) {
    const {
        regionSelectors = {},
        requiredRegionKeys = Object.keys(regionSelectors),
        refreshPlan = {},
    } = options;

    const currentRegions = resolvePageShellRegions(pageRoot, regionSelectors);
    const nextRegions = resolvePageShellRegions(shellSnapshot?.pageRoot || null, regionSelectors);

    if (!hasRequiredPageShellRegions(currentRegions, requiredRegionKeys)
        || !hasRequiredPageShellRegions(nextRegions, requiredRegionKeys)) {
        return false;
    }

    Object.entries(refreshPlan).forEach(([key, shouldPatch]) => {
        if (!shouldPatch) return;
        const currentRegion = currentRegions[key];
        const nextRegion = nextRegions[key];
        if (currentRegion instanceof HTMLElement && nextRegion instanceof HTMLElement) {
            currentRegion.replaceWith(nextRegion);
        }
    });

    return true;
}
