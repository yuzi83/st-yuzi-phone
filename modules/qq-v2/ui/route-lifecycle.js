function asScopeId(result) {
    return String(result?.context?.scopeId || '').trim();
}

function canReadSnapshot(result) {
    return result?.ok === true;
}

const LOCAL_NAVIGATION_REASONS = new Set(['conversation-opened']);

/**
 * Binds one freshly-created QQ root renderer to one phone route page.
 * The route owns this object so late Facade work cannot affect another page.
 */
export function createQQRouteLifecycle({
    page,
    facade,
    createApp,
    shell = {},
    isCurrent = () => true,
} = {}) {
    if (!facade?.query || typeof createApp !== 'function') {
        throw new TypeError('QQ route lifecycle needs an injected Facade and root renderer');
    }

    let disposed = false;
    let app = null;
    let activeScopeId = '';
    let unsubscribe = null;
    let toastShown = false;
    let refreshPending = false;
    let refreshPromise = null;

    const isActive = () => !disposed && isCurrent() === true;
    const isRefreshActive = () => isActive() && page?.isConnected !== false;

    const showToastOnce = () => {
        if (toastShown || !isActive()) return;
        toastShown = true;
        try {
            shell.showToast?.('QQ 暂时无法加载');
        } catch {
            // A shell notification must never break route cleanup.
        }
    };

    const showReadFailure = () => {
        if (!isActive()) return;
        page?.replaceChildren?.();
        showToastOnce();
    };

    const refreshOnce = async () => {
        if (!isRefreshActive() || !app) return;

        let snapshot;
        try {
            snapshot = await facade.query.bootstrap();
        } catch {
            if (isRefreshActive()) showReadFailure();
            return;
        }

        if (!isRefreshActive() || !canReadSnapshot(snapshot) || asScopeId(snapshot) !== activeScopeId) return;
        try {
            await app.refresh?.();
        } catch {
            if (isRefreshActive()) showReadFailure();
        }
    };

    const refreshForEvent = (event) => {
        if (LOCAL_NAVIGATION_REASONS.has(String(event?.reason || '').trim())) return Promise.resolve();
        if (String(event?.scopeId || '').trim() !== activeScopeId || !isRefreshActive() || !app) {
            return Promise.resolve();
        }
        refreshPending = true;
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
            while (refreshPending && isRefreshActive() && app) {
                refreshPending = false;
                await refreshOnce();
            }
        })().finally(() => {
            refreshPromise = null;
        });
        return refreshPromise;
    };

    const bindSubscription = async () => {
        if (typeof facade.subscribe !== 'function') return;
        try {
            const nextUnsubscribe = await facade.subscribe((event) => {
                return refreshForEvent(event);
            });
            if (!isActive()) {
                nextUnsubscribe?.();
                return;
            }
            unsubscribe = typeof nextUnsubscribe === 'function' ? nextUnsubscribe : null;
        } catch {
            if (isRefreshActive()) showReadFailure();
        }
    };

    return Object.freeze({
        async mount() {
            let snapshot;
            try {
                snapshot = await facade.query.bootstrap?.();
            } catch {
                if (isActive()) showReadFailure();
                return false;
            }

            if (!isActive()) return false;
            if (!canReadSnapshot(snapshot)) {
                showReadFailure();
                return false;
            }

            activeScopeId = asScopeId(snapshot);
            try {
                app = createApp({
                    facade,
                    shell,
                    scopeId: activeScopeId,
                    onError: () => showToastOnce(),
                });
                app.mount(page);
            } catch {
                app?.destroy?.();
                app = null;
                showReadFailure();
                return false;
            }

            if (!isActive()) {
                app.destroy?.();
                app = null;
                return false;
            }

            void bindSubscription();
            return true;
        },
        destroy() {
            if (disposed) return;
            disposed = true;
            refreshPending = false;
            unsubscribe?.();
            unsubscribe = null;
            app?.destroy?.();
            app = null;
        },
    });
}
