/**
 * 变量管理器 - 入口模块
 * 导出 renderVariableManager 供路由系统调用
 */

import { getFloorVariables, getLastMessageId, isMvuAvailable } from './variable-api.js';
import { flattenToGroups, renderGroupsHtml } from './flat-view.js';
import { buildVariableManagerPageHtml } from './templates.js';
import { bindVariableManagerInteractions } from './interactions.js';
import { navigateBack } from '../phone-core/routing.js';

/** 当前页面状态 */
let currentMessageId = -1;
/** 底部操作栏高度同步清理函数 */
let bottomBarSyncCleanup = null;

/**
 * 渲染变量管理器页面
 * @param {HTMLElement} container 页面容器（phone-page）
 */
export function renderVariableManager(container) {
    if (!(container instanceof HTMLElement)) return;

    // 获取最新楼层
    currentMessageId = getLastMessageId();
    const isMvu = isMvuAvailable();

    // 渲染页面骨架
    container.innerHTML = buildVariableManagerPageHtml(currentMessageId, isMvu);

    if (typeof bottomBarSyncCleanup === 'function') {
        bottomBarSyncCleanup();
        bottomBarSyncCleanup = null;
    }
    bottomBarSyncCleanup = bindBottomBarInsetSync(container);

    // 加载变量数据并渲染
    renderVariableContent(container);

    // 绑定交互
    bindVariableManagerInteractions(container, {
        navigateBack: () => navigateBack(),
        refreshView: () => refreshVariableView(container),
        getMessageId: () => currentMessageId,
    });
}

/**
 * 渲染变量内容区域
 */
function renderVariableContent(container) {
    const contentEl = container.querySelector('.vm-content');
    if (!contentEl) return;

    if (currentMessageId < 0) {
        contentEl.innerHTML = '<div class="vm-empty-state">当前没有聊天消息</div>';
        return;
    }

    const result = getFloorVariables(currentMessageId);
    const data = result.data;

    if (!data || Object.keys(data).length === 0) {
        contentEl.innerHTML = '<div class="vm-empty-state">当前楼层没有变量数据</div>';
        return;
    }

    const groups = flattenToGroups(data);
    contentEl.innerHTML = renderGroupsHtml(groups);
}

function bindBottomBarInsetSync(container) {
    const syncInFrame = () => requestAnimationFrame(() => syncBottomBarInset(container));
    const bars = [
        container.querySelector('.vm-footer'),
        container.querySelector('.vm-delete-bar'),
    ].filter((el) => el instanceof HTMLElement);

    syncInFrame();

    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => syncInFrame());
        bars.forEach((bar) => resizeObserver.observe(bar));
    }

    window.addEventListener('resize', syncInFrame);

    return () => {
        resizeObserver?.disconnect();
        window.removeEventListener('resize', syncInFrame);
    };
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
    }
}

/**
 * 刷新变量视图（重新获取数据并渲染）
 */
function refreshVariableView(container) {
    // 重新获取最新楼层
    currentMessageId = getLastMessageId();
    const isMvu = isMvuAvailable();

    // 更新楼层标签
    const floorLabel = container.querySelector('.vm-floor-label');
    if (floorLabel) {
        floorLabel.textContent = currentMessageId >= 0 ? `第${currentMessageId}楼` : '无数据';
    }

    // 更新 MVU 标记
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

    // 重新渲染内容
    renderVariableContent(container);

    // 重新绑定分组折叠（因为内容被替换了）
    // interactions 中的事件委托会自动处理
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
