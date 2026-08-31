import { getTableData } from '../phone-core/data-api.js';
import { navigateBack } from '../phone-core/routing.js';
import { getPhoneCoreState, phoneRuntime } from '../phone-core/state.js';
import { buildTableNavigationControlState } from '../table-navigation/controls.js';
import { createRuntimeScrollPreserver } from '../ui-runtime/scroll-preserver-core.js';
import {
    buildTheaterSceneViewModel,
    resolveTheaterNavigationSheetKey,
} from './data.js';
import { buildTheaterScenePageHtml } from './templates.js';
import { bindTheaterSceneInteractions } from './interactions.js';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeRenderToken(value) {
    const token = Number(value);
    return Number.isFinite(token) ? token : null;
}

function createTheaterLifecycleContext(container, sceneId, options = {}) {
    const expectedSceneId = normalizeText(sceneId);
    const renderToken = normalizeRenderToken(options.renderToken);
    const allowDetachedInitialRender = options.allowDetachedInitialRender !== false;
    return Object.freeze({
        renderToken,
        sceneId: expectedSceneId,
        phoneRuntime,
        runtime: phoneRuntime,
        addEventListener: (...args) => phoneRuntime.addEventListener(...args),
        setTimeout: (...args) => phoneRuntime.setTimeout(...args),
        clearTimeout: (...args) => phoneRuntime.clearTimeout(...args),
        registerCleanup: (...args) => phoneRuntime.registerCleanup(...args),
        isDisposed: () => typeof phoneRuntime?.isDisposed === 'function' && phoneRuntime.isDisposed(),
        isActive(activeOptions = {}) {
            const allowDetached = activeOptions.allowDetached === true && allowDetachedInitialRender;
            if (!(container instanceof HTMLElement)) return false;
            if (!allowDetached && !container.isConnected) return false;
            if (typeof phoneRuntime?.isDisposed === 'function' && phoneRuntime.isDisposed()) return false;
            if (container.__phoneTheaterSceneState?.sceneId !== expectedSceneId) return false;
            if (renderToken !== null && getPhoneCoreState().routeRenderToken !== renderToken) return false;
            return true;
        },
    });
}

function createInitialState(sceneId) {
    return {
        sceneId: normalizeText(sceneId),
        navigationSheetKey: '',
        deleteManageMode: false,
        selectedKeys: new Set(),
        deleting: false,
        bodyScrollTop: 0,
        editMenuOpen: false,
    };
}

function getTheaterRenderState(container, sceneId) {
    const normalizedSceneId = normalizeText(sceneId);
    if (!container.__phoneTheaterSceneState || container.__phoneTheaterSceneState.sceneId !== normalizedSceneId) {
        container.__phoneTheaterSceneState = createInitialState(normalizedSceneId);
    }
    const state = container.__phoneTheaterSceneState;
    if (!(state.selectedKeys instanceof Set)) {
        state.selectedKeys = new Set(Array.isArray(state.selectedKeys) ? state.selectedKeys.map(normalizeText).filter(Boolean) : []);
    }
    return state;
}

function collectDeletableKeys(viewModel) {
    const collector = viewModel?.scene?.collectDeletableKeys;
    const keys = typeof collector === 'function' ? collector(viewModel) : [];
    return [...new Set((Array.isArray(keys) ? keys : []).map(normalizeText).filter(Boolean))];
}

function buildUiState(state, viewModel) {
    const deletableKeys = collectDeletableKeys(viewModel);
    const availableKeys = new Set(deletableKeys);
    state.selectedKeys = new Set([...state.selectedKeys].filter(key => availableKeys.has(key)));
    const editableTables = Array.isArray(viewModel?.editableTables) ? viewModel.editableTables : [];
    const canDelete = deletableKeys.length > 0 && viewModel?.scene?.deletable !== false;
    const canEdit = editableTables.some(entry => entry?.available);
    if (!canDelete && state.deleteManageMode) {
        state.deleteManageMode = false;
        state.selectedKeys.clear();
    }
    if (!canEdit && state.editMenuOpen) {
        state.editMenuOpen = false;
    }
    return {
        deleteManageMode: !!state.deleteManageMode,
        selectedKeys: state.selectedKeys,
        selectedCount: state.selectedKeys.size,
        totalCount: deletableKeys.length,
        deleting: !!state.deleting,
        canDelete,
        canEdit,
        editMenuOpen: !!state.editMenuOpen,
        editableTables,
    };
}

function bindTheaterSceneEvents(container, lifecycle) {
    const backButton = container.querySelector('.phone-nav-back');
    if (!(backButton instanceof HTMLElement)) return;

    const runtime = lifecycle?.runtime;
    if (runtime && typeof runtime.addEventListener === 'function' && typeof runtime.isDisposed === 'function' && !runtime.isDisposed()) {
        runtime.addEventListener(backButton, 'click', navigateBack);
        return;
    }

    backButton.addEventListener('click', navigateBack);
}

export function renderTheaterScene(container, sceneId, options = {}) {
    if (!(container instanceof HTMLElement)) return;

    const state = getTheaterRenderState(container, sceneId);
    const lifecycle = createTheaterLifecycleContext(container, state.sceneId, options);
    const scrollPreserver = createRuntimeScrollPreserver(container, state, '.phone-app-body.phone-theater-body', phoneRuntime);
    const hasExistingScrollableBody = !!container.querySelector('.phone-app-body.phone-theater-body');
    const prevContainerHeight = Math.max(0, container.offsetHeight || 0);
    const nextRenderOptions = options.initialTableData || options.initialNavigationContext
        ? {
            ...options,
            initialTableData: undefined,
            initialNavigationContext: undefined,
        }
        : options;
    const renderCurrentScene = () => {
        if (!lifecycle.isActive()) return;
        renderTheaterScene(container, state.sceneId, nextRenderOptions);
    };
    const rawData = options.initialTableData || getTableData();
    const viewModel = buildTheaterSceneViewModel(rawData, state.sceneId);
    state.navigationSheetKey = resolveTheaterNavigationSheetKey(rawData, viewModel, options.navigationSheetKey);
    const uiState = buildUiState(state, viewModel);
    uiState.tableNavigation = state.navigationSheetKey
        ? buildTableNavigationControlState(rawData, state.navigationSheetKey, {
            blocked: state.deleteManageMode || state.deleting,
            navigationContext: options.initialNavigationContext,
        })
        : null;

    if (!lifecycle.isActive({ allowDetached: true })) return;

    if (hasExistingScrollableBody) {
        scrollPreserver.captureScroll('bodyScrollTop');
        if (prevContainerHeight > 0) {
            container.style.minHeight = `${prevContainerHeight}px`;
        }
    }

    try {
        container.innerHTML = buildTheaterScenePageHtml(viewModel, uiState);
        bindTheaterSceneEvents(container, lifecycle);
        bindTheaterSceneInteractions(container, {
            scene: viewModel.scene,
            sceneId: state.sceneId,
            state,
            viewModel,
            tableNavigation: uiState.tableNavigation,
            render: renderCurrentScene,
            lifecycle,
        });
    } finally {
        if (hasExistingScrollableBody) {
            scrollPreserver.restoreScroll('bodyScrollTop');
            phoneRuntime.requestAnimationFrame(() => {
                phoneRuntime.requestAnimationFrame(() => {
                    if (!container.isConnected) return;
                    container.style.removeProperty('min-height');
                });
            });
        }
    }
}
