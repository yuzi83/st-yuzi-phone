// index.js
/**
 * 玉子手机 - 独立扩展入口
 * @version 1.2.0
 * @description 集成 SillyTavern 事件系统、TavernHelper API、Slash 命令、错误处理等
 */

import { PHONE_ICONS } from './modules/phone-home.js';
import { onPhoneActivated, onPhoneDeactivated, destroyPhoneRuntime } from './modules/phone-core.js';
import {
    getPhoneSettings,
    savePhoneSetting,
    migrateLegacyPhoneSettings,
    getDefaultPhoneTogglePosition,
    isMobileDevice,
    constrainPosition,
    flushPhoneSettingsSave,
} from './modules/settings.js';
import { createPhoneSettingsPanel } from './modules/settings-panel.js';
import { clampNumber } from './modules/utils.js';
import {
    onChatChanged,
    onCharacterLoaded,
    onAppReady,
    onUserMessageRendered,
    onCharacterMessageRendered,
    onMessageUpdated,
    onMessageDeleted,
    onGenerationStarted,
    onGenerationEnded,
    onGenerationAfterCommands,
    cleanupIntegration,
    showNotification,
    getChatMessages,
    getLastMessageId,
    getVariables,
    setVariables,
} from './modules/integration.js';
import {
    registerSlashCommands,
    unregisterSlashCommands,
    registerCommandHandler,
    isSlashCommandsRegistered,
} from './modules/slash-commands.js';
import {
    Logger,
    handleError,
    YuziPhoneError,
    ErrorCodes,
    configureErrorHandler,
} from './modules/error-handler.js';

const DOM_IDS = {
    root: 'yuzi-phone-root',
    container: 'yuzi-phone-standalone',
    toggle: 'yuzi-phone-toggle',
};

function escapeCssUrl(url) {
    return String(url || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n|\r/g, '');
}

function applyPhoneToggleVisualStyle(btn, settings = getPhoneSettings()) {
    if (!(btn instanceof HTMLElement)) return;

    const size = clampNumber(settings?.phoneToggleStyleSize, 32, 72, 44);
    const shapeRaw = String(settings?.phoneToggleStyleShape || 'rounded').trim();
    const shape = shapeRaw === 'circle' ? 'circle' : 'rounded';
    const coverRaw = typeof settings?.phoneToggleCoverImage === 'string'
        ? settings.phoneToggleCoverImage.trim()
        : '';

    btn.style.setProperty('--yuzi-phone-toggle-size', `${size}px`);
    btn.style.setProperty('--yuzi-phone-toggle-cover-image', coverRaw ? `url("${escapeCssUrl(coverRaw)}")` : 'none');

    btn.classList.toggle('yuzi-phone-toggle-shape-circle', shape === 'circle');
    btn.classList.toggle('yuzi-phone-toggle-shape-rounded', shape !== 'circle');
    btn.classList.toggle('yuzi-phone-toggle-has-cover', !!coverRaw);
    btn.classList.toggle('yuzi-phone-toggle-cover-only', !!coverRaw);
}

function syncPhoneToggleVisualStyle() {
    const btn = document.getElementById(DOM_IDS.toggle);
    if (!btn) return;
    applyPhoneToggleVisualStyle(btn, getPhoneSettings());
}

function createPhoneRoot() {
    let root = document.getElementById(DOM_IDS.root);
    if (root) return root;

    root = document.createElement('div');
    root.id = DOM_IDS.root;
    root.className = 'yuzi-phone-root';
    document.body.appendChild(root);
    return root;
}

function createPhoneContainer() {
    let container = document.getElementById(DOM_IDS.container);
    if (container) return container;

    const root = createPhoneRoot();
    container = document.createElement('div');
    container.id = DOM_IDS.container;
    container.className = 'yuzi-phone-standalone';

    const settings = getPhoneSettings();
    const defaultWidth = 320;
    const defaultHeight = 640;

    const savedWidth = Number(settings.phoneContainerWidth);
    const savedHeight = Number(settings.phoneContainerHeight);

    const width = Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : defaultWidth;
    const height = Number.isFinite(savedHeight) && savedHeight > 0 ? savedHeight : defaultHeight;

    const defaultX = Math.max(10, window.innerWidth - width - 40);
    const defaultY = Math.max(60, Math.floor((window.innerHeight - height) / 2));

    const savedX = Number(settings.phoneContainerX);
    const savedY = Number(settings.phoneContainerY);

    const initialX = Number.isFinite(savedX) ? savedX : defaultX;
    const initialY = Number.isFinite(savedY) ? savedY : defaultY;

    const constrained = constrainPosition(initialX, initialY, width, height);

    container.style.left = constrained.x + 'px';
    container.style.top = constrained.y + 'px';
    container.style.width = width + 'px';
    container.style.height = height + 'px';

    root.appendChild(container);
    return container;
}

function createPhoneToggleButton() {
    let btn = document.getElementById(DOM_IDS.toggle);
    if (btn) {
        applyPhoneToggleVisualStyle(btn, getPhoneSettings());
        return btn;
    }

    const root = createPhoneRoot();
    const settings = getPhoneSettings();
    const isMobile = isMobileDevice();
    const defaultPos = getDefaultPhoneTogglePosition();

    btn = document.createElement('div');
    btn.id = DOM_IDS.toggle;
    btn.className = `yuzi-phone-toggle yuzi-phone-toggle-shape-rounded ${isMobile ? 'yuzi-phone-toggle-mobile' : ''}`;
    btn.innerHTML = `<span class="yuzi-phone-toggle-icon">${PHONE_ICONS.phone}</span><span class="yuzi-phone-toggle-text">玉子手机</span>`;
    btn.title = '拖拽移动 / 点击打开';

    btn.style.left = (settings.phoneToggleX ?? defaultPos.x) + 'px';
    btn.style.top = (settings.phoneToggleY ?? defaultPos.y) + 'px';

    applyPhoneToggleVisualStyle(btn, settings);

    root.appendChild(btn);
    initPhoneToggleDraggable(btn);
    return btn;
}

function initPhoneToggleDraggable(btn) {
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let pointerId = null;
    let startTime = 0;

    const DRAG_THRESHOLD = 5;

    const onContextMenu = (e) => e.preventDefault();
    const onPointerDown = (e) => {
        startTime = Date.now();
        hasMoved = false;
        pointerId = e.pointerId;

        const rect = btn.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        startX = e.clientX;
        startY = e.clientY;

        btn.setPointerCapture(e.pointerId);
        btn.classList.add('dragging');
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (e.pointerId !== pointerId) return;

        if (Math.abs(e.clientX - startX) > DRAG_THRESHOLD || Math.abs(e.clientY - startY) > DRAG_THRESHOLD) {
            hasMoved = true;
        }
        if (!hasMoved) return;

        const newX = e.clientX - offsetX;
        const newY = e.clientY - offsetY;
        const constrained = constrainPosition(newX, newY, btn.offsetWidth, btn.offsetHeight);

        btn.style.left = constrained.x + 'px';
        btn.style.top = constrained.y + 'px';

        e.preventDefault();
    };

    const onPointerUp = (e) => {
        if (e.pointerId !== pointerId) return;

        try { btn.releasePointerCapture(e.pointerId); } catch {}
        btn.classList.remove('dragging');

        if (hasMoved) {
            savePhoneSetting('phoneToggleX', parseInt(btn.style.left, 10));
            savePhoneSetting('phoneToggleY', parseInt(btn.style.top, 10));
        }

        if (!hasMoved && Date.now() - startTime < 300) {
            togglePhone();
        }

        hasMoved = false;
        pointerId = null;
    };

    btn.addEventListener('contextmenu', onContextMenu);
    btn.addEventListener('pointerdown', onPointerDown);
    btn.addEventListener('pointermove', onPointerMove);
    btn.addEventListener('pointerup', onPointerUp);
    btn.addEventListener('pointercancel', onPointerUp);
}

function togglePhone(show) {
    const container = document.getElementById(DOM_IDS.container);
    const btn = document.getElementById(DOM_IDS.toggle);
    if (!container || !btn) return;

    const nextShow = show ?? !container.classList.contains('visible');
    container.classList.toggle('visible', nextShow);
    btn.classList.toggle('active', nextShow);

    if (nextShow) {
        onPhoneActivated();
    } else {
        onPhoneDeactivated();
    }
}

/**
 * 设置手机启用状态（带UI更新）
 * @param {boolean} enabled 是否启用
 */
function setPhoneEnabledWithUI(enabled) {
    if (enabled) {
        createPhoneRoot();
        createPhoneContainer();
        createPhoneToggleButton();
    } else {
        document.getElementById(DOM_IDS.container)?.classList.remove('visible');
        document.getElementById(DOM_IDS.toggle)?.classList.remove('active');
        document.getElementById(DOM_IDS.container)?.remove();
        document.getElementById(DOM_IDS.toggle)?.remove();
        const root = document.getElementById(DOM_IDS.root);
        if (root && root.childElementCount === 0) {
            root.remove();
        }
    }
}

/**
 * 注册 Slash 命令处理器
 */
function setupSlashCommandHandlers() {
    // 注册手机操作处理器
    registerCommandHandler('phone-action', (action) => {
        const container = document.getElementById(DOM_IDS.container);
        const toggle = document.getElementById(DOM_IDS.toggle);

        switch (action) {
            case 'open':
                if (container) {
                    container.classList.add('visible');
                    onPhoneActivated();
                    Logger.info('手机已通过命令打开');
                }
                break;
            case 'close':
                if (container) {
                    container.classList.remove('visible');
                    onPhoneDeactivated();
                    Logger.info('手机已通过命令关闭');
                }
                break;
            case 'toggle':
                togglePhone();
                Logger.info('手机状态已通过命令切换');
                break;
            case 'reset':
                if (toggle) {
                    const defaultPos = getDefaultPhoneTogglePosition();
                    toggle.style.left = defaultPos.x + 'px';
                    toggle.style.top = defaultPos.y + 'px';
                    savePhoneSetting('phoneToggleX', defaultPos.x);
                    savePhoneSetting('phoneToggleY', defaultPos.y);
                    Logger.info('手机位置已重置');
                }
                break;
        }
    });

    // 注册表格操作处理器
    registerCommandHandler('open-table', (tableName) => {
        Logger.info(`打开表格: ${tableName}`);
        // 实际的表格打开逻辑由 phone-table-viewer 模块实现
        const event = new CustomEvent('yuzi-phone-open-table', { detail: { tableName } });
        window.dispatchEvent(event);
    });

    // 注册表格列表处理器
    registerCommandHandler('list-tables', () => {
        // 返回可用表格列表
        const event = new CustomEvent('yuzi-phone-list-tables');
        window.dispatchEvent(event);
        return []; // 实际列表由外部模块提供
    });

    // 注册设置操作处理器
    registerCommandHandler('reset-settings', () => {
        const keys = Object.keys(localStorage).filter(key => key.startsWith('yuzi-phone'));
        keys.forEach(key => localStorage.removeItem(key));
        Logger.info('设置已重置');
    });

    registerCommandHandler('export-settings', () => {
        const settings = getPhoneSettings();
        return settings;
    });

    Logger.debug('Slash 命令处理器已注册');
}

/**
 * 注册 SillyTavern 事件监听器
 */
async function registerEventListeners() {
    try {
        // 监听聊天切换事件
        await onChatChanged((chatId) => {
            Logger.info('聊天切换:', chatId);
            // 可以在这里更新手机内容
            const container = document.getElementById(DOM_IDS.container);
            if (container && container.classList.contains('visible')) {
                // 如果手机可见，刷新内容
                onPhoneDeactivated();
                setTimeout(() => onPhoneActivated(), 100);
            }
        });

        // 监听角色加载事件
        await onCharacterLoaded((characterId) => {
            Logger.info('角色加载:', characterId);
            // 可以在这里更新角色相关数据
        });

        // 监听应用就绪事件
        await onAppReady(() => {
            Logger.info('SillyTavern 应用就绪');
            // 可以在这里执行一些初始化操作
        });

        // 监听用户消息渲染完成事件
        await onUserMessageRendered((messageId) => {
            Logger.debug('用户消息渲染完成:', messageId);
            // 可以在这里处理消息渲染后的逻辑
        });

        // 监听角色消息渲染完成事件
        await onCharacterMessageRendered((messageId) => {
            Logger.debug('角色消息渲染完成:', messageId);
            // 可以在这里处理 AI 回复渲染后的逻辑
        });

        // 监听消息更新事件
        await onMessageUpdated((messageId) => {
            Logger.debug('消息更新:', messageId);
            // 可以在这里处理消息更新逻辑
        });

        // 监听消息删除事件
        await onMessageDeleted((messageId) => {
            Logger.debug('消息删除:', messageId);
            // 可以在这里处理消息删除逻辑
        });

        // 监听生成开始事件
        await onGenerationStarted(() => {
            Logger.debug('AI 生成开始');
            // 可以在这里处理生成开始逻辑
        });

        // 监听生成结束事件
        await onGenerationEnded(() => {
            Logger.debug('AI 生成结束');
            // 可以在这里处理生成结束逻辑
        });

        // 监听生成前命令处理事件（关键时机：AI生成前的最佳数据注入时机）
        await onGenerationAfterCommands((type, params, dryRun) => {
            if (dryRun) return; // 跳过干运行
            Logger.debug('生成前命令处理:', { type, params });
            // 这是插入数据的最佳时机
        });

        Logger.debug('事件监听器已注册');
    } catch (error) {
        handleError(error, '注册事件监听器失败');
    }
}

/**
 * 初始化函数
 */
(function init() {
    // 配置错误处理器
    configureErrorHandler({
        enableLogging: true,
        enableNotification: true,
        logLevel: 'info',
    });

    // 监听自定义事件
    window.addEventListener('yuzi-phone-toggle-style-updated', () => {
        syncPhoneToggleVisualStyle();
    });

    /**
     * 就绪回调
     */
    const onReady = async () => {
        try {
            Logger.info('开始初始化...');

            // 1. 迁移旧版设置
            migrateLegacyPhoneSettings();

            // 2. 获取设置
            const settings = getPhoneSettings();

            // 3. 创建设置面板
            const hasPanel = createPhoneSettingsPanel((enabled) => {
                setPhoneEnabledWithUI(enabled);
            });

            // 4. 如果启用，创建UI
            if (settings.enabled !== false || !hasPanel) {
                createPhoneRoot();
                createPhoneContainer();
                createPhoneToggleButton();
            }

            // 5. 注册事件监听器（异步）
            await registerEventListeners();

            // 6. 注册 Slash 命令
            if (registerSlashCommands()) {
                setupSlashCommandHandlers();
                Logger.info('Slash 命令已注册');
            } else {
                Logger.warn('Slash 命令注册失败，使用降级方案');
            }

            Logger.info('v1.2.0 初始化完成');
            showNotification('玉子手机已加载 (v1.2.0)', 'success');
        } catch (error) {
            handleError(error, '玉子手机初始化失败');
        }
    };

    // 等待 DOM 就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        setTimeout(onReady, 100);
    }
})();

/**
 * 销毁函数 - 清理所有资源
 */
export function destroy() {
    try {
        Logger.info('开始卸载...');

        // 1. 注销 Slash 命令
        unregisterSlashCommands();

        // 2. 销毁手机运行时
        destroyPhoneRuntime();

        // 3. 清理事件监听器
        cleanupIntegration();

        // 4. 移除 DOM 元素
        document.getElementById(DOM_IDS.toggle)?.remove();
        document.getElementById(DOM_IDS.container)?.remove();
        document.getElementById(DOM_IDS.root)?.remove();

        // 5. 保存设置
        flushPhoneSettingsSave();

        Logger.info('扩展已卸载');
        showNotification('玉子手机已卸载', 'info');
    } catch (error) {
        handleError(error, '卸载错误');
    }
}

/**
 * 导出 API 供外部使用
 */
export {
    // 集成 API
    getChatMessages,
    getLastMessageId,
    getVariables,
    setVariables,
    showNotification,
    
    // Slash 命令
    registerSlashCommands,
    unregisterSlashCommands,
    registerCommandHandler,
    isSlashCommandsRegistered,
    
    // 错误处理
    Logger,
    handleError,
    YuziPhoneError,
    ErrorCodes,
    configureErrorHandler,
};

// 导出虚拟滚动（按需使用）
export { VirtualScroll, createVirtualScroll, renderVirtualList } from './modules/virtual-scroll.js';

// 导出工具函数
export {
    debounce,
    throttle,
    requestIdleCallback,
    cancelIdleCallback,
    createBatchHandler,
    createSingletonPromise,
    deepMerge,
    generateUniqueId,
    formatFileSize,
    isMobileDevice,
    isTouchDevice,
    createVisibilityObserver,
    createLazyLoader,
    createInfiniteScroll,
    createPerformanceTimer,
    createFPSMonitor,
    getMemoryUsage,
} from './modules/utils.js';
