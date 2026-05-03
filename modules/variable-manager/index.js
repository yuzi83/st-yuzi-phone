/**
 * 变量管理器 - 入口模块
 * 导出 renderVariableManager 供路由系统调用
 */

import { createRuntimeScope } from '../runtime-manager.js';
import { navigateBack } from '../phone-core/routing.js';
import { getPhoneCoreState } from '../phone-core/state.js';
import { getFloorVariables, getLastMessageId, isMvuAvailable } from './variable-api.js';
import { flattenToGroups, renderGroupsHtml } from './flat-view.js';
import { buildVariableManagerPageHtml } from './templates.js';
import { bindVariableManagerInteractions } from './interactions.js';

const VARIABLE_MANAGER_PAGE_INSTANCE_KEY = '__yuziVariableManagerPageInstance';

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
    };
    let disposed = false;

    const isActive = (expectedMessageId = null) => {
        if (disposed) return false;
        if (typeof runtime.isDisposed === 'function' && runtime.isDisposed()) return false;
        if (!(container instanceof HTMLElement) || !container.isConnected) return false;
        if (renderToken !== null && getPhoneCoreState().routeRenderToken !== renderToken) return false;
        if (expectedMessageId !== null && state.currentMessageId !== expectedMessageId) return false;
        return true;
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

    const renderContent = () => {
        if (!isActive()) return;
        renderVariableContent(container, state.currentMessageId);
    };

    const refreshView = () => {
        if (!isActive()) return;
        state.currentMessageId = getLastMessageId();
        const isMvu = isMvuAvailable();

        if (!isActive()) return;
        updateFloorLabel(container, state.currentMessageId);
        updateMvuBadge(container, isMvu);
        renderContent();
        syncBottomBarInset(container);
    };

    const mount = () => {
        if (disposed) return;
        state.currentMessageId = getLastMessageId();
        const isMvu = isMvuAvailable();

        container.innerHTML = buildVariableManagerPageHtml(state.currentMessageId, isMvu);
        bindBottomBarInsetSync(container, runtime);
        renderContent();

        const cleanupInteractions = bindVariableManagerInteractions(container, {
            runtime,
            lifecycle,
            navigateBack: () => navigateBack(),
            refreshView,
            getMessageId: () => state.currentMessageId,
        });
        runtime.registerCleanup(cleanupInteractions);

        observePageDisconnectionAfterMount(container, runtime, dispose);
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

/**
 * 渲染变量内容区域
 */
function renderVariableContent(container, messageId) {
    const contentEl = container.querySelector('.vm-content');
    if (!(contentEl instanceof HTMLElement)) return;

    if (messageId < 0) {
        contentEl.innerHTML = '<div class="vm-empty-state">当前没有聊天消息</div>';
        return;
    }

    const result = getFloorVariables(messageId);
    const data = result?.data;

    if (!data || Object.keys(data).length === 0) {
        contentEl.innerHTML = '<div class="vm-empty-state">当前楼层没有变量数据</div>';
        return;
    }

    const groups = flattenToGroups(data);
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
