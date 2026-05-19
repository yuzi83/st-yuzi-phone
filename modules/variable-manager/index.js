/**
 * 变量管理器 - 入口模块
 * 导出 renderVariableManager 供路由系统调用
 */

import { createRuntimeScope } from '../runtime-manager.js';
import { navigateBack } from '../phone-core/routing.js';
import { getPhoneCoreState } from '../phone-core/state.js';
import { escapeHtml } from '../utils/dom-escape.js';
import { getFloorVariablesAsync, getLastMessageId, isMvuAvailable } from './variable-api.js';
import { flattenToGroups, renderGroupsHtml } from './flat-view.js';
import { buildVariableManagerPageHtml } from './templates.js';
import { bindVariableManagerInteractions } from './interactions.js';

const VARIABLE_MANAGER_PAGE_INSTANCE_KEY = '__yuziVariableManagerPageInstance';
const PAGE_CONNECT_WAIT_FRAMES = 30;

function getVariableManagerPageInstance(container) {
    if (!(container instanceof HTMLElement)) return null;
    const instance = container[VARIABLE_MANAGER_PAGE_INSTANCE_KEY];
    return instance && typeof instance === 'object' ? instance : null;
}

function setVariableManagerPageInstance(container, instance) {
    if (!(container instanceof HTMLElement)) return;
    if (instance && typeof instance === 'object') {
        container[VARIABLE_MANAGER_PAGE_INSTANCE_KEY] = instance;
        return;
    }
    delete container[VARIABLE_MANAGER_PAGE_INSTANCE_KEY];
}

function disposeVariableManagerPageInstance(container) {
    const instance = getVariableManagerPageInstance(container);
    if (!instance || typeof instance.dispose !== 'function') return;
    instance.dispose();
}

function normalizeRenderToken(value) {
    const token = Number(value);
    return Number.isFinite(token) ? token : null;
}

function createVariableManagerPageInstance(container, options = {}) {
    const runtime = createRuntimeScope('variable-manager-page');
    const renderToken = normalizeRenderToken(options.renderToken);
    const state = {
        currentMessageId: -1,
        loadSequence: 0,
    };
    let disposed = false;

    const isRouteTokenActive = () => {
        return renderToken === null || getPhoneCoreState().routeRenderToken === renderToken;
    };

    const isActive = (expectedMessageId = null) => {
        if (disposed) return false;
        if (typeof runtime.isDisposed === 'function' && runtime.isDisposed()) return false;
        if (!(container instanceof HTMLElement) || !container.isConnected) return false;
        if (!isRouteTokenActive()) return false;
        if (expectedMessageId !== null && state.currentMessageId !== expectedMessageId) return false;
        return true;
    };

    const isPendingRouteActive = () => {
        if (disposed) return false;
        if (typeof runtime.isDisposed === 'function' && runtime.isDisposed()) return false;
        if (!(container instanceof HTMLElement)) return false;
        return isRouteTokenActive();
    };

    const lifecycle = Object.freeze({
        renderToken,
        runtime,
        isActive,
    });

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        runtime.dispose();
        if (getVariableManagerPageInstance(container) === instance) {
            setVariableManagerPageInstance(container, null);
        }
    };

    const renderContent = (result) => {
        if (!isActive(result?.messageId ?? null)) return;
        renderVariableContent(container, result);
    };

    const loadAndRenderContent = async ({ showLoading = false } = {}) => {
        if (!isPendingRouteActive()) return;

        const loadId = state.loadSequence + 1;
        state.loadSequence = loadId;
        const expectedMessageId = getLastMessageId();
        state.currentMessageId = expectedMessageId;
        const isMvu = isMvuAvailable();

        if (showLoading) {
            renderVariableStatus(container, 'loading', expectedMessageId, '正在读取当前楼层变量…');
        }

        await waitForContainerConnection(container, runtime, () => isPendingRouteActive());
        if (!isActive(expectedMessageId) || state.loadSequence !== loadId) return;

        updateFloorLabel(container, expectedMessageId);
        updateMvuBadge(container, isMvu);

        const result = await getFloorVariablesAsync(expectedMessageId);
        if (!isActive(expectedMessageId) || state.loadSequence !== loadId) return;

        updateFloorLabel(container, result.messageId);
        updateMvuBadge(container, result.isMvu);
        renderContent(result);
        syncBottomBarInset(container);
    };

    const refreshView = () => {
        void loadAndRenderContent({ showLoading: true });
    };

    const mount = () => {
        if (disposed) return;
        state.currentMessageId = getLastMessageId();
        const isMvu = isMvuAvailable();

        container.innerHTML = buildVariableManagerPageHtml(state.currentMessageId, isMvu);
        renderVariableStatus(container, 'loading', state.currentMessageId, '正在读取当前楼层变量…');
        bindBottomBarInsetSync(container, runtime);

        const cleanupInteractions = bindVariableManagerInteractions(container, {
            runtime,
            lifecycle,
            navigateBack: () => navigateBack(),
            refreshView,
            getMessageId: () => state.currentMessageId,
        });
        runtime.registerCleanup(cleanupInteractions);

        observePageDisconnectionAfterMount(container, runtime, dispose);
        void loadAndRenderContent({ showLoading: false });
    };

    const instance = {
        mount,
        refreshView,
        dispose,
        runtime,
        lifecycle,
        state,
    };

    return instance;
}

function waitForContainerConnection(container, runtime, isStillValid) {
    if (!(container instanceof HTMLElement) || !runtime || typeof isStillValid !== 'function') {
        return Promise.resolve(false);
    }
    if (container.isConnected) return Promise.resolve(true);

    return new Promise((resolve) => {
        let frameCount = 0;
        const waitNextFrame = () => {
            if (!isStillValid()) {
                resolve(false);
                return;
            }
            if (container.isConnected) {
                resolve(true);
                return;
            }
            frameCount += 1;
            if (frameCount >= PAGE_CONNECT_WAIT_FRAMES) {
                resolve(false);
                return;
            }
            runtime.requestAnimationFrame(waitNextFrame);
        };
        runtime.requestAnimationFrame(waitNextFrame);
    });
}

function observePageDisconnectionAfterMount(container, runtime, dispose) {
    if (!(container instanceof HTMLElement) || !runtime || typeof dispose !== 'function') return;

    const MAX_WAIT_FRAMES = 30;
    let disposed = false;
    let frameCount = 0;

    const registerObserver = () => {
        if (disposed || runtime.isDisposed?.()) return;
        runtime.observeDisconnection(container, dispose, {
            observerRoot: document.body,
            childList: true,
            subtree: true,
        });
    };

    const waitForConnection = () => {
        if (disposed || runtime.isDisposed?.()) return;
        if (container.isConnected) {
            registerObserver();
            return;
        }
        frameCount += 1;
        if (frameCount >= MAX_WAIT_FRAMES) {
            dispose();
            return;
        }
        runtime.requestAnimationFrame(waitForConnection);
    };

    runtime.registerCleanup(() => {
        disposed = true;
    });

    if (container.isConnected) {
        registerObserver();
        return;
    }

    runtime.requestAnimationFrame(waitForConnection);
}

/**
 * 渲染变量管理器页面
 * @param {HTMLElement} container 页面容器（phone-page）
 */
export function renderVariableManager(container, options = {}) {
    if (!(container instanceof HTMLElement)) return;

    disposeVariableManagerPageInstance(container);
    const instance = createVariableManagerPageInstance(container, options);
    setVariableManagerPageInstance(container, instance);
    instance.mount();
}

function renderVariableStatus(container, status, messageId, message) {
    const contentEl = container.querySelector('.vm-content');
    if (!(contentEl instanceof HTMLElement)) return;

    const safeMessage = String(message || '').trim() || resolveStatusMessage(status, messageId);
    const statusClass = status === 'error' ? 'vm-state-error' : `vm-state-${status}`;
    contentEl.innerHTML = `<div class="vm-empty-state vm-state ${statusClass}">${escapeHtml(safeMessage)}</div>`;
}

function resolveStatusMessage(status, messageId) {
    if (messageId < 0) return '当前没有聊天消息';
    if (status === 'loading') return '正在读取当前楼层变量…';
    if (status === 'unavailable') return '未检测到可用的变量接口';
    if (status === 'error') return '变量读取失败，请刷新重试';
    return '当前楼层没有变量数据';
}

/**
 * 渲染变量内容区域
 */
function renderVariableContent(container, result) {
    const contentEl = container.querySelector('.vm-content');
    if (!(contentEl instanceof HTMLElement)) return;

    const messageId = Number(result?.messageId);
    if (!Number.isFinite(messageId) || messageId < 0) {
        renderVariableStatus(container, 'unavailable', -1, '当前没有聊天消息');
        return;
    }

    if (result?.status === 'unavailable') {
        renderVariableStatus(container, 'unavailable', messageId, '未检测到 MVU / TavernHelper 变量接口');
        return;
    }

    if (result?.status === 'error') {
        renderVariableStatus(container, 'error', messageId, `变量读取失败：${result?.error?.message || '请刷新重试'}`);
        return;
    }

    const data = result?.data;

    if (!data || Object.keys(data).length === 0) {
        renderVariableStatus(container, 'empty', messageId, '当前楼层没有变量数据');
        return;
    }

    const groups = flattenToGroups(data, { isMvu: result?.isMvu === true });
    contentEl.innerHTML = renderGroupsHtml(groups);
}

function bindBottomBarInsetSync(container, runtime) {
    if (!(container instanceof HTMLElement) || !runtime) return;

    const syncInFrame = () => runtime.requestAnimationFrame(() => syncBottomBarInset(container));
    const bars = [
        container.querySelector('.vm-footer'),
        container.querySelector('.vm-delete-bar'),
    ].filter((el) => el instanceof HTMLElement);

    syncInFrame();

    if (typeof ResizeObserver === 'function') {
        const resizeObserver = new ResizeObserver(() => syncInFrame());
        bars.forEach((bar) => resizeObserver.observe(bar));
        runtime.registerCleanup(() => resizeObserver.disconnect());
    }

    runtime.addEventListener(window, 'resize', syncInFrame);
}

function syncBottomBarInset(container) {
    const page = container.querySelector('.vm-page');
    if (!(page instanceof HTMLElement)) return;

    const bars = [
        container.querySelector('.vm-footer'),
        container.querySelector('.vm-delete-bar'),
    ];

    const bottomBarHeight = bars.reduce((maxHeight, bar) => {
        if (!(bar instanceof HTMLElement)) return maxHeight;
        const rectHeight = Math.ceil(bar.getBoundingClientRect().height || 0);
        const nextHeight = rectHeight || bar.offsetHeight || 0;
        return Math.max(maxHeight, nextHeight);
    }, 0);

    if (bottomBarHeight > 0) {
        page.style.setProperty('--vm-bottom-bar-height', `${bottomBarHeight}px`);
    } else {
        page.style.removeProperty('--vm-bottom-bar-height');
    }
}

function updateFloorLabel(container, messageId) {
    const floorLabel = container.querySelector('.vm-floor-label');
    if (floorLabel) {
        floorLabel.textContent = messageId >= 0 ? `第${messageId}楼` : '无数据';
    }
}

function updateMvuBadge(container, isMvu) {
    const mvuBadge = container.querySelector('.vm-mvu-badge');
    if (isMvu && !mvuBadge) {
        const titleEl = container.querySelector('.vm-nav-title');
        if (titleEl) {
            const badge = document.createElement('span');
            badge.className = 'vm-mvu-badge';
            badge.textContent = 'MVU';
            titleEl.appendChild(badge);
        }
    } else if (!isMvu && mvuBadge) {
        mvuBadge.remove();
    }
}

/**
 * 变量管理器 app 图标定义
 */
export const VARIABLE_MANAGER_APP = {
    id: '__variable_manager__',
    name: '变量',
    route: 'variable-manager',
    isSystemApp: true,
};

/**
 * 获取变量管理器图标 SVG
 */
export function getVariableManagerIcon() {
    return `
        <div style="width:100%;height:100%;background:linear-gradient(135deg,#7C4DFF,#536DFE);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;color:#fff;border-radius:var(--phone-app-icon-radius,12px);box-sizing:border-box;">
            变
        </div>
    `;
}
