import { getTableData } from '../phone-core/data-api.js';
import { showConfirmDialog } from '../settings-app/ui/confirm-dialog.js';
import { showToast } from '../settings-app/ui/toast.js';
import { deleteTheaterEntities } from './delete-service.js';

/**
 * Phone Theater 通用交互
 * - 删除管理态、全选、取消选择、单项选择、确认级联删除。
 * - 场景专属交互通过 scene.bindInteractions(container, context) 接入。
 */

function normalizeText(value) {
    return String(value ?? '').trim();
}

function ensureDeleteState(options) {
    const state = options?.state && typeof options.state === 'object' ? options.state : {};
    if (!(state.selectedKeys instanceof Set)) {
        state.selectedKeys = new Set(Array.isArray(state.selectedKeys) ? state.selectedKeys.map(normalizeText).filter(Boolean) : []);
    }
    state.deleteManageMode = !!state.deleteManageMode;
    state.deleting = !!state.deleting;
    return state;
}

function requestRender(options) {
    if (typeof options?.render === 'function') {
        options.render();
    }
}

function isTheaterInteractionActive(container, options = {}) {
    if (!(container instanceof HTMLElement) || !container.isConnected) return false;
    const lifecycle = options.lifecycle;
    if (lifecycle && typeof lifecycle.isActive === 'function') {
        return lifecycle.isActive();
    }
    return true;
}

function requestRenderIfActive(container, options) {
    if (!isTheaterInteractionActive(container, options)) return false;
    requestRender(options);
    return true;
}

function showToastIfActive(container, options, message, isError = false) {
    if (!isTheaterInteractionActive(container, options)) return false;
    showToast(container, message, isError);
    return true;
}

function collectCurrentDeleteKeys(container) {
    const keys = new Set();
    container.querySelectorAll('[data-theater-delete-key]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const key = normalizeText(node.dataset.theaterDeleteKey);
        if (key) keys.add(key);
    });
    return keys;
}

function setDeleteMode(container, options, enabled) {
    if (!isTheaterInteractionActive(container, options)) return;

    const state = ensureDeleteState(options);
    if (state.deleting) return;
    state.deleteManageMode = !!enabled;
    if (!state.deleteManageMode) {
        state.selectedKeys.clear();
    } else {
        const currentKeys = collectCurrentDeleteKeys(container);
        state.selectedKeys = new Set([...state.selectedKeys].filter(key => currentKeys.has(key)));
    }
    requestRenderIfActive(container, options);
}

function selectAllCurrent(container, options) {
    if (!isTheaterInteractionActive(container, options)) return;

    const state = ensureDeleteState(options);
    if (!state.deleteManageMode || state.deleting) return;
    state.selectedKeys = collectCurrentDeleteKeys(container);
    requestRenderIfActive(container, options);
}

function clearSelection(container, options) {
    if (!isTheaterInteractionActive(container, options)) return;

    const state = ensureDeleteState(options);
    if (!state.deleteManageMode || state.deleting) return;
    state.selectedKeys.clear();
    requestRenderIfActive(container, options);
}

function toggleSelection(actionNode, container, options) {
    if (!isTheaterInteractionActive(container, options)) return;

    const state = ensureDeleteState(options);
    if (!state.deleteManageMode || state.deleting) return;
    const key = normalizeText(actionNode.dataset.theaterDeleteKey);
    if (!key) return;

    const currentKeys = collectCurrentDeleteKeys(container);
    if (!currentKeys.has(key)) return;

    if (state.selectedKeys.has(key)) {
        state.selectedKeys.delete(key);
    } else {
        state.selectedKeys.add(key);
    }
    requestRenderIfActive(container, options);
}

async function executeConfirmedDelete(container, options) {
    if (!isTheaterInteractionActive(container, options)) return;

    const state = ensureDeleteState(options);
    const sceneId = normalizeText(options?.sceneId || options?.scene?.id);
    const selectedKeys = [...state.selectedKeys].map(normalizeText).filter(Boolean);

    if (state.deleting) return;
    if (!sceneId) {
        showToastIfActive(container, options, '删除失败：缺少小剧场场景标识', true);
        return;
    }
    if (selectedKeys.length <= 0) {
        showToastIfActive(container, options, '请先选择要删除的内容', true);
        return;
    }

    state.deleting = true;
    requestRenderIfActive(container, options);

    try {
        const result = await deleteTheaterEntities(getTableData(), sceneId, selectedKeys);
        if (!isTheaterInteractionActive(container, options)) return;

        state.deleting = false;
        if (result?.ok) {
            state.deleteManageMode = false;
            state.selectedKeys.clear();
            requestRenderIfActive(container, options);
            showToastIfActive(container, options, result.message || '删除完成', result.refreshed === false);
            return;
        }

        requestRenderIfActive(container, options);
        showToastIfActive(container, options, result?.message || '删除失败', true);
    } catch (error) {
        console.error('[YuziPhone] Theater delete failed:', error);
        if (!isTheaterInteractionActive(container, options)) return;

        state.deleting = false;
        requestRenderIfActive(container, options);
        showToastIfActive(container, options, '删除失败：执行过程中发生异常', true);
    }
}

function confirmDelete(container, options) {
    if (!isTheaterInteractionActive(container, options)) return;

    const state = ensureDeleteState(options);
    if (!state.deleteManageMode || state.deleting) return;
    const selectedCount = state.selectedKeys.size;
    if (selectedCount <= 0) {
        showToastIfActive(container, options, '请先选择要删除的内容', true);
        return;
    }

    showConfirmDialog(
        container,
        '确认删除',
        `将删除已选 ${selectedCount} 项，并同步清理关联附表数据。此操作不可撤销。`,
        () => executeConfirmedDelete(container, options),
        '删除',
        '取消'
    );
}

function handleDeleteAction(event, container, options) {
    const actionNode = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!(actionNode instanceof HTMLElement)) return false;

    const action = actionNode.dataset.action;
    if (!action || !action.startsWith('theater-') && action !== 'toggle-theater-delete-mode') return false;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'toggle-theater-delete-mode') {
        const state = ensureDeleteState(options);
        setDeleteMode(container, options, !state.deleteManageMode);
        return true;
    }
    if (action === 'theater-select-all') {
        selectAllCurrent(container, options);
        return true;
    }
    if (action === 'theater-clear-selection') {
        clearSelection(container, options);
        return true;
    }
    if (action === 'theater-toggle-select') {
        toggleSelection(actionNode, container, options);
        return true;
    }
    if (action === 'theater-confirm-delete') {
        confirmDelete(container, options);
        return true;
    }
    return false;
}

function createSceneInteractionContext(options = {}) {
    const lifecycle = options.lifecycle;
    const runtime = lifecycle?.runtime || lifecycle?.phoneRuntime || null;

    return Object.freeze({
        scene: options.scene,
        sceneId: options.sceneId,
        state: options.state,
        viewModel: options.viewModel,
        render: options.render,
        lifecycle: options.lifecycle,
        runtime,
        addEventListener: (...args) => {
            if (lifecycle && typeof lifecycle.addEventListener === 'function') {
                return lifecycle.addEventListener(...args);
            }
            if (runtime && typeof runtime.addEventListener === 'function') {
                return runtime.addEventListener(...args);
            }
            return () => {};
        },
        setTimeout: (...args) => {
            if (lifecycle && typeof lifecycle.setTimeout === 'function') {
                return lifecycle.setTimeout(...args);
            }
            if (runtime && typeof runtime.setTimeout === 'function') {
                return runtime.setTimeout(...args);
            }
            return window.setTimeout(...args);
        },
        registerCleanup: (...args) => {
            if (lifecycle && typeof lifecycle.registerCleanup === 'function') {
                return lifecycle.registerCleanup(...args);
            }
            if (runtime && typeof runtime.registerCleanup === 'function') {
                return runtime.registerCleanup(...args);
            }
            return () => {};
        },
        isDisposed: () => {
            if (lifecycle && typeof lifecycle.isDisposed === 'function') {
                return lifecycle.isDisposed();
            }
            return !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
        },
        isActive: () => !!(lifecycle && typeof lifecycle.isActive === 'function' ? lifecycle.isActive() : true),
    });
}

function bindSceneSpecificInteractions(container, options) {
    const binder = options?.scene?.bindInteractions;
    if (typeof binder !== 'function') return;
    binder(container, createSceneInteractionContext(options));
}

/**
 * 在已经渲染完成的容器上绑定小剧场交互。
 * @param {HTMLElement} container 渲染好的页面根节点
 * @param {Object} options 删除管理态依赖的 scene/state/render 回调
 */
export function bindTheaterSceneInteractions(container, options = {}) {
    if (!(container instanceof HTMLElement)) return;

    if (typeof container.__phoneTheaterClickCleanup === 'function') {
        container.__phoneTheaterClickCleanup();
        container.__phoneTheaterClickCleanup = null;
    } else if (typeof container.__phoneTheaterClickHandler === 'function') {
        container.removeEventListener('click', container.__phoneTheaterClickHandler);
    }

    container.__phoneTheaterClickHandler = (event) => {
        handleDeleteAction(event, container, options);
    };

    const lifecycle = options.lifecycle;
    if (lifecycle && typeof lifecycle.addEventListener === 'function' && typeof lifecycle.isDisposed === 'function' && !lifecycle.isDisposed()) {
        container.__phoneTheaterClickCleanup = lifecycle.addEventListener(container, 'click', container.__phoneTheaterClickHandler);
    } else {
        container.addEventListener('click', container.__phoneTheaterClickHandler);
        container.__phoneTheaterClickCleanup = () => {
            container.removeEventListener('click', container.__phoneTheaterClickHandler);
        };
    }

    bindSceneSpecificInteractions(container, options);
}
