import { acquireCurrentViewingSheet, releaseCurrentViewingSheet, subscribeTableUpdate } from '../phone-core/callbacks.js';
import { getTableData } from '../phone-core/data-api.js';
import { registerRoutePageCleanup } from '../phone-core/route-page-lifecycle.js';
import { getPhoneCoreState } from '../phone-core/state.js';
import { buildTableNavigationControlState } from '../table-navigation/controls.js';
import { resolveStableChatId } from '../integration/chat-identity.js';
import { isContentPresetFullPageRuntimeEnabled } from './activation-gate.js';
import { createAssetRuntime } from './asset-runtime.js';
import { getContentPresetIndexSnapshot } from './index-state.js';
import { createContentPresetInstance } from './instance-coordinator.js';
import { matchesPresetItem } from './matcher.js';
import { createPresetAssetsRuntime } from './preset-assets.js';
import { getPresetRecord } from './repository.js';
import { createContentPresetActions } from './runtime-actions.js';
import { createContentPresetRuntimeContextController } from './runtime-context.js';
import { importContentPresetModule, invokeContentPresetMount } from './script-runtime.js';
import { contentPresetScrollRegistry } from './scroll-registry.js';
import { createPresetStateSnapshot, createTableSnapshot } from './snapshot.js';

function fileText(record, path) {
    const file = path ? record.files?.[path] : null;
    if (!file) return '';
    if (file.encoding !== 'base64') return String(file.content ?? '');
    const binary = atob(file.content);
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

const DEFAULT_RUNTIME_DEPS = Object.freeze({
    acquireCurrentViewingSheet,
    contentPresetScrollRegistry,
    createAssetRuntime,
    createContentPresetActions,
    createContentPresetInstance,
    createContentPresetRuntimeContextController,
    createPresetAssetsRuntime,
    getContentPresetIndexSnapshot,
    getPhoneCoreState,
    getPresetRecord,
    getTableData,
    importContentPresetModule,
    invokeContentPresetMount,
    isContentPresetFullPageRuntimeEnabled,
    matchesPresetItem,
    registerRoutePageCleanup,
    releaseCurrentViewingSheet,
    resolveStableChatId,
    subscribeTableUpdate,
});

function createState(rawData, sheetKey, route, version) {
    return createPresetStateSnapshot({
        rawData,
        sheetKey,
        route,
        version,
        navigationState: buildTableNavigationControlState(rawData, sheetKey),
    });
}

export function __test__createTryRenderContentPreset(overrides = {}) {
    const runtimeDeps = { ...DEFAULT_RUNTIME_DEPS, ...overrides };
    const isActiveTokenForRuntime = renderToken => !Number.isFinite(renderToken)
        || runtimeDeps.getPhoneCoreState().routeRenderToken === renderToken;

    return async function tryRenderContentPreset(page, target, options = {}) {
    if (!runtimeDeps.isContentPresetFullPageRuntimeEnabled()) return false;
    const indexSnapshot = runtimeDeps.getContentPresetIndexSnapshot();
    const binding = indexSnapshot.status === 'ready'
        ? indexSnapshot.activeByTable.get(target?.sheetKey)
        : null;
    if (!binding || !(page instanceof HTMLElement) || !target?.sheetKey) return false;

    let version = 0;
    let initialState;
    try {
        initialState = createState(
            options.initialTableData || runtimeDeps.getTableData(),
            target.sheetKey,
            target.route,
            version,
        );
    } catch {
        return false;
    }
    if (!initialState) return false;

    const root = document.createElement('div');
    root.className = 'phone-content-preset-root';
    page.replaceChildren(root);
    let owner = null;
    let assetRuntime = null;
    let presetAssets = null;
    let moduleRuntime = null;
    let contextController = null;
    let unsubscribeTableUpdate = () => {};
    let unregisterPageCleanup = () => {};
    let cancelScrollRestore = () => {};
    let instance = null;
    let fallbackStarted = false;
    let committed = false;
    const scrollKey = { chatId: '', sheetKey: target.sheetKey, presetId: binding.presetId, itemId: binding.itemId };
    const cleanup = () => {
        unregisterPageCleanup(); unregisterPageCleanup = () => {};
        unsubscribeTableUpdate(); unsubscribeTableUpdate = () => {};
        cancelScrollRestore(); cancelScrollRestore = () => {};
        contextController?.dispose(); contextController = null;
        moduleRuntime?.disposeModuleUrl(); moduleRuntime = null;
        presetAssets?.dispose(); presetAssets = null;
        assetRuntime?.dispose(); assetRuntime = null;
        runtimeDeps.releaseCurrentViewingSheet(owner); owner = null;
        root.remove();
    };
    const isCurrent = () => instance?.isCurrent(runtimeDeps.getPhoneCoreState().routeRenderToken) === true;
    const fallback = () => {
        if (fallbackStarted || !isCurrent()) return;
        fallbackStarted = true;
        instance.dispose();
        options.originalRenderer?.(page);
    };

    try {
        owner = runtimeDeps.acquireCurrentViewingSheet(target.sheetKey);
        instance = runtimeDeps.createContentPresetInstance({
            sheetKey: target.sheetKey,
            routeToken: options.renderToken,
            isPageOwner: () => isActiveTokenForRuntime(options.renderToken),
            onStopUpdates: () => contextController?.dispose(),
            onCaptureScroll: () => { if (committed && scrollKey.chatId) runtimeDeps.contentPresetScrollRegistry.write(scrollKey, root.scrollTop); },
            onHostCleanup: cleanup,
        });
        unregisterPageCleanup = runtimeDeps.registerRoutePageCleanup(page, () => instance.dispose());
        instance.transition('importing');
        const record = await runtimeDeps.getPresetRecord(binding.presetId);
        const item = record?.items?.find(entry => entry.id === binding.itemId);
        if (!item?.activatable || !runtimeDeps.matchesPresetItem(item, { tableName: initialState.tableName, headers: createTableSnapshot(runtimeDeps.getTableData(), target.sheetKey)?.rawHeaders })) throw new Error('绑定项已失效');
        if (!isCurrent()) { instance.dispose(); return true; }

        assetRuntime = runtimeDeps.createAssetRuntime(record);
        presetAssets = runtimeDeps.createPresetAssetsRuntime(record.id);
        const html = fileText(record, item.entry.html);
        const css = fileText(record, item.entry.css);
        root.innerHTML = html ? assetRuntime.rewriteHtml(html, item.entry.html) : '';
        if (css) {
            const style = document.createElement('style');
            style.textContent = assetRuntime.rewriteCss(css, item.entry.css);
            root.prepend(style);
        }
        scrollKey.chatId = runtimeDeps.resolveStableChatId();
        const actions = runtimeDeps.createContentPresetActions({
            sheetKey: target.sheetKey,
            getRoute: () => runtimeDeps.getPhoneCoreState().currentRoute,
            isCurrent,
        });
        contextController = runtimeDeps.createContentPresetRuntimeContextController({
            root,
            signal: instance.signal,
            initialState,
            actions,
            presetAssets,
            resolveAsset: assetRuntime.resolveAsset,
        });
        moduleRuntime = await runtimeDeps.importContentPresetModule({ source: fileText(record, item.entry.mount), signal: instance.signal });
        if (!isCurrent()) { instance.dispose(); return true; }
        instance.transition('mounting');
        const disposer = await runtimeDeps.invokeContentPresetMount({
            mount: moduleRuntime.mount,
            context: contextController.context,
            signal: instance.signal,
            onLateDisposer: lateDisposer => instance.setAuthorDisposer(lateDisposer),
        });
        instance.setAuthorDisposer(disposer);
        if (!isCurrent()) { instance.dispose(); return true; }
        instance.transition('active');
        committed = true;
        try {
            options.onCommitted?.();
        } catch {}
        try {
            unsubscribeTableUpdate = runtimeDeps.subscribeTableUpdate(() => {
                if (!isCurrent()) return;
                try {
                    const rawData = runtimeDeps.getTableData();
                    const nextTable = createTableSnapshot(rawData, target.sheetKey);
                    if (!nextTable || !runtimeDeps.matchesPresetItem(item, { tableName: nextTable.tableName, headers: nextTable.rawHeaders })) return;
                    version += 1;
                    contextController.publish(createState(rawData, target.sheetKey, target.route, version), 'table-data');
                } catch {}
            }) || (() => {});
        } catch {}
        try {
            if (scrollKey.chatId) cancelScrollRestore = runtimeDeps.contentPresetScrollRegistry.restore(root, scrollKey, isCurrent);
        } catch {}
        return true;
    } catch {
        if (!instance) cleanup();
        else if (!committed) fallback();
        return true;
    }
    };
}

export const tryRenderContentPreset = __test__createTryRenderContentPreset();
