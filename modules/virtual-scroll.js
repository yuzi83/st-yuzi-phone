// modules/virtual-scroll.js
/**
 * Yuzi Phone - 虚拟滚动模块
 * @version 1.0.0
 * @description 用于优化大列表渲染性能，支持固定高度和动态高度两种模式
 */

import { Logger } from './error-handler.js';
import { debounce, throttle, requestIdleCallback, cancelIdleCallback } from './utils.js';

/**
 * 虚拟滚动配置
 */
const DEFAULT_CONFIG = {
    // 每项高度（固定高度模式）
    itemHeight: 60,
    // 缓冲区大小（上下各渲染的额外项数）
    bufferSize: 3,
    // 滚动节流时间（毫秒）
    scrollThrottle: 16,
    // 是否使用动态高度
    dynamicHeight: false,
    // 动态高度估算函数
    estimateHeight: null,
    // 容器高度（不设置则自动获取）
    containerHeight: null,
    // 是否启用滚动条样式优化
    optimizeScrollbar: true,
};

/**
 * 虚拟滚动类
 */
export class VirtualScroll {
    /**
     * 创建虚拟滚动实例
     * @param {HTMLElement} container - 容器元素
     * @param {Object} options - 配置选项
     */
    constructor(container, options = {}) {
        this.container = container;
        this.config = { ...DEFAULT_CONFIG, ...options };
        
        // 数据
        this.items = [];
        this.itemHeights = new Map();
        
        // 渲染状态
        this.visibleStartIndex = 0;
        this.visibleEndIndex = 0;
        this.scrollTop = 0;
        
        // DOM 元素
        this.wrapper = null;
        this.content = null;
        this.renderedItems = new Map();
        
        // 回调函数
        this.renderItem = null;
        this.onScroll = null;
        
        // 性能优化
        this.scrollHandler = null;
        this.resizeObserver = null;
        this.idleCallbackId = null;
        
        // 状态
        this.isInitialized = false;
        this.isDestroyed = false;
        
        // 初始化
        this._init();
    }

    /**
     * 初始化虚拟滚动
     * @private
     */
    _init() {
        if (this.isInitialized || this.isDestroyed) return;

        try {
            // 创建包装器
            this._createWrapper();
            
            // 设置滚动事件
            this._setupScrollHandler();
            
            // 设置容器样式
            this._setupContainerStyles();
            
            // 设置 ResizeObserver
            this._setupResizeObserver();
            
            this.isInitialized = true;
            Logger.debug('虚拟滚动初始化完成');
        } catch (error) {
            Logger.error('虚拟滚动初始化失败:', error);
        }
    }

    /**
     * 创建包装器
     * @private
     */
    _createWrapper() {
        // 创建内容包装器
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'yuzi-virtual-scroll-wrapper';
        this.wrapper.style.cssText = `
            position: relative;
            width: 100%;
            min-height: 100%;
        `;

        // 创建内容容器
        this.content = document.createElement('div');
        this.content.className = 'yuzi-virtual-scroll-content';
        this.content.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            will-change: transform;
        `;

        this.wrapper.appendChild(this.content);
        this.container.appendChild(this.wrapper);
    }

    /**
     * 设置滚动事件处理
     * @private
     */
    _setupScrollHandler() {
        const { scrollThrottle } = this.config;
        
        // 使用节流优化滚动性能
        this.scrollHandler = throttle((event) => {
            this._onScroll(event);
        }, scrollThrottle);

        this.container.addEventListener('scroll', this.scrollHandler, { passive: true });
    }

    /**
     * 设置容器样式
     * @private
     */
    _setupContainerStyles() {
        const { optimizeScrollbar } = this.config;
        
        // 确保容器有滚动条
        const computedStyle = window.getComputedStyle(this.container);
        if (computedStyle.overflowY !== 'auto' && computedStyle.overflowY !== 'scroll') {
            this.container.style.overflowY = 'auto';
        }
        
        // 优化滚动条样式
        if (optimizeScrollbar) {
            this.container.classList.add('yuzi-virtual-scroll-container');
        }
    }

    /**
     * 设置 ResizeObserver
     * @private
     */
    _setupResizeObserver() {
        if (typeof ResizeObserver === 'undefined') return;

        this.resizeObserver = new ResizeObserver(
            debounce(() => {
                this._updateVisibleItems();
            }, 100)
        );

        this.resizeObserver.observe(this.container);
    }

    /**
     * 滚动事件处理
     * @private
     * @param {Event} event - 滚动事件
     */
    _onScroll(event) {
        this.scrollTop = this.container.scrollTop;
        this._updateVisibleItems();
        
        if (this.onScroll) {
            this.onScroll(event, this.scrollTop);
        }
    }

    /**
     * 更新可见项
     * @private
     */
    _updateVisibleItems() {
        if (this.isDestroyed || this.items.length === 0) return;

        const { bufferSize, dynamicHeight } = this.config;
        const containerHeight = this._getContainerHeight();

        // 计算可见范围
        let startIndex, endIndex;

        if (dynamicHeight) {
            // 动态高度模式
            const range = this._calculateVisibleRangeDynamic(containerHeight);
            startIndex = range.start;
            endIndex = range.end;
        } else {
            // 固定高度模式
            const { itemHeight } = this.config;
            startIndex = Math.max(0, Math.floor(this.scrollTop / itemHeight) - bufferSize);
            endIndex = Math.min(
                this.items.length - 1,
                Math.ceil((this.scrollTop + containerHeight) / itemHeight) + bufferSize
            );
        }

        // 检查是否需要更新
        if (startIndex === this.visibleStartIndex && endIndex === this.visibleEndIndex) {
            return;
        }

        this.visibleStartIndex = startIndex;
        this.visibleEndIndex = endIndex;

        // 使用 requestIdleCallback 进行渲染
        this.idleCallbackId = requestIdleCallback(() => {
            this._renderVisibleItems();
        }, { timeout: 50 });
    }

    /**
     * 计算动态高度模式下的可见范围
     * @private
     * @param {number} containerHeight - 容器高度
     * @returns {Object} 可见范围 { start, end }
     */
    _calculateVisibleRangeDynamic(containerHeight) {
        const { bufferSize } = this.config;
        let currentHeight = 0;
        let startIndex = 0;
        let endIndex = this.items.length - 1;

        // 找到起始索引
        for (let i = 0; i < this.items.length; i++) {
            const itemHeight = this._getItemHeight(i);
            if (currentHeight + itemHeight >= this.scrollTop) {
                startIndex = Math.max(0, i - bufferSize);
                break;
            }
            currentHeight += itemHeight;
        }

        // 找到结束索引
        currentHeight = 0;
        for (let i = startIndex; i < this.items.length; i++) {
            const itemHeight = this._getItemHeight(i);
            if (currentHeight > this.scrollTop + containerHeight) {
                endIndex = Math.min(this.items.length - 1, i + bufferSize);
                break;
            }
            currentHeight += itemHeight;
        }

        return { start: startIndex, end: endIndex };
    }

    /**
     * 获取项高度
     * @private
     * @param {number} index - 项索引
     * @returns {number} 高度
     */
    _getItemHeight(index) {
        const { itemHeight, dynamicHeight, estimateHeight } = this.config;
        
        if (dynamicHeight) {
            // 优先使用缓存的高度
            if (this.itemHeights.has(index)) {
                return this.itemHeights.get(index);
            }
            
            // 使用估算函数
            if (estimateHeight && typeof estimateHeight === 'function') {
                return estimateHeight(this.items[index], index);
            }
            
            // 默认估算高度
            return itemHeight;
        }
        
        return itemHeight;
    }

    /**
     * 渲染可见项
     * @private
     */
    _renderVisibleItems() {
        if (this.isDestroyed || !this.renderItem) return;

        const fragment = document.createDocumentFragment();
        const newRenderedItems = new Map();
        let offsetY = 0;

        // 计算起始偏移量
        if (this.config.dynamicHeight) {
            for (let i = 0; i < this.visibleStartIndex; i++) {
                offsetY += this._getItemHeight(i);
            }
        } else {
            offsetY = this.visibleStartIndex * this.config.itemHeight;
        }

        // 渲染可见项
        for (let i = this.visibleStartIndex; i <= this.visibleEndIndex; i++) {
            const item = this.items[i];
            if (!item) continue;

            // 尝试复用已有元素
            let element = this.renderedItems.get(i);
            
            if (!element) {
                // 创建新元素
                element = this.renderItem(item, i);
                if (!(element instanceof HTMLElement)) {
                    Logger.warn(`renderItem 必须返回 HTMLElement，索引: ${i}`);
                    continue;
                }
            }

            // 设置位置
            const itemHeight = this._getItemHeight(i);
            element.style.position = 'absolute';
            element.style.top = `${offsetY}px`;
            element.style.left = '0';
            element.style.right = '0';
            element.style.height = `${itemHeight}px`;

            fragment.appendChild(element);
            newRenderedItems.set(i, element);

            offsetY += itemHeight;
        }

        // 清理旧元素
        this.renderedItems.forEach((element, index) => {
            if (!newRenderedItems.has(index)) {
                // 可以在这里进行元素回收
            }
        });

        // 更新内容
        this.content.innerHTML = '';
        this.content.appendChild(fragment);
        this.renderedItems = newRenderedItems;

        // 更新总高度
        this._updateTotalHeight();
    }

    /**
     * 更新总高度
     * @private
     */
    _updateTotalHeight() {
        let totalHeight = 0;

        if (this.config.dynamicHeight) {
            // 动态高度模式：累加所有项高度
            for (let i = 0; i < this.items.length; i++) {
                totalHeight += this._getItemHeight(i);
            }
        } else {
            // 固定高度模式
            totalHeight = this.items.length * this.config.itemHeight;
        }

        this.wrapper.style.height = `${totalHeight}px`;
    }

    /**
     * 获取容器高度
     * @private
     * @returns {number} 容器高度
     */
    _getContainerHeight() {
        if (this.config.containerHeight) {
            return this.config.containerHeight;
        }
        return this.container.clientHeight || 400;
    }

    /**
     * 设置数据
     * @param {Array} items - 数据数组
     */
    setItems(items) {
        if (this.isDestroyed) return;

        this.items = Array.isArray(items) ? items : [];
        this.itemHeights.clear();
        this.renderedItems.clear();
        this.visibleStartIndex = 0;
        this.visibleEndIndex = 0;

        this._updateTotalHeight();
        this._updateVisibleItems();
    }

    /**
     * 更新单个项
     * @param {number} index - 项索引
     * @param {any} item - 新数据
     */
    updateItem(index, item) {
        if (this.isDestroyed || index < 0 || index >= this.items.length) return;

        this.items[index] = item;
        
        // 如果该项在可见范围内，重新渲染
        if (index >= this.visibleStartIndex && index <= this.visibleEndIndex) {
            this._renderVisibleItems();
        }
    }

    /**
     * 更新项高度（动态高度模式）
     * @param {number} index - 项索引
     * @param {number} height - 新高度
     */
    updateItemHeight(index, height) {
        if (!this.config.dynamicHeight || this.isDestroyed) return;

        this.itemHeights.set(index, height);
        this._updateTotalHeight();
        this._updateVisibleItems();
    }

    /**
     * 滚动到指定索引
     * @param {number} index - 项索引
     * @param {Object} options - 滚动选项
     * @param {string} options.behavior - 滚动行为 ('auto' | 'smooth')
     * @param {string} options.block - 对齐方式 ('start' | 'center' | 'end')
     */
    scrollToIndex(index, options = {}) {
        if (this.isDestroyed || index < 0 || index >= this.items.length) return;

        const { behavior = 'auto', block = 'start' } = options;
        let scrollTop = 0;

        if (this.config.dynamicHeight) {
            // 动态高度模式：累加高度
            for (let i = 0; i < index; i++) {
                scrollTop += this._getItemHeight(i);
            }

            const itemHeight = this._getItemHeight(index);
            const containerHeight = this._getContainerHeight();

            switch (block) {
                case 'center':
                    scrollTop -= (containerHeight - itemHeight) / 2;
                    break;
                case 'end':
                    scrollTop -= containerHeight - itemHeight;
                    break;
            }
        } else {
            // 固定高度模式
            const { itemHeight } = this.config;
            const containerHeight = this._getContainerHeight();

            switch (block) {
                case 'start':
                    scrollTop = index * itemHeight;
                    break;
                case 'center':
                    scrollTop = index * itemHeight - (containerHeight - itemHeight) / 2;
                    break;
                case 'end':
                    scrollTop = index * itemHeight - containerHeight + itemHeight;
                    break;
            }
        }

        this.container.scrollTo({
            top: Math.max(0, scrollTop),
            behavior,
        });
    }

    /**
     * 滚动到顶部
     * @param {Object} options - 滚动选项
     */
    scrollToTop(options = {}) {
        if (this.isDestroyed) return;

        this.container.scrollTo({
            top: 0,
            behavior: options.behavior || 'auto',
        });
    }

    /**
     * 滚动到底部
     * @param {Object} options - 滚动选项
     */
    scrollToBottom(options = {}) {
        if (this.isDestroyed) return;

        this.container.scrollTo({
            top: this.wrapper.scrollHeight,
            behavior: options.behavior || 'auto',
        });
    }

    /**
     * 设置渲染函数
     * @param {Function} renderFn - 渲染函数 (item, index) => HTMLElement
     */
    setRenderFunction(renderFn) {
        if (typeof renderFn !== 'function') {
            Logger.warn('渲染函数必须是函数');
            return;
        }
        this.renderItem = renderFn;
    }

    /**
     * 设置滚动回调
     * @param {Function} callback - 回调函数 (event, scrollTop) => void
     */
    setOnScroll(callback) {
        this.onScroll = typeof callback === 'function' ? callback : null;
    }

    /**
     * 获取当前可见项索引范围
     * @returns {Object} { startIndex, endIndex }
     */
    getVisibleRange() {
        return {
            startIndex: this.visibleStartIndex,
            endIndex: this.visibleEndIndex,
        };
    }

    /**
     * 获取当前滚动位置
     * @returns {number} 滚动位置
     */
    getScrollTop() {
        return this.scrollTop;
    }

    /**
     * 刷新虚拟滚动（重新计算和渲染）
     */
    refresh() {
        if (this.isDestroyed) return;

        this._updateTotalHeight();
        this._updateVisibleItems();
    }

    /**
     * 销毁虚拟滚动实例
     */
    destroy() {
        if (this.isDestroyed) return;

        this.isDestroyed = true;

        // 移除事件监听
        if (this.scrollHandler) {
            this.container.removeEventListener('scroll', this.scrollHandler);
        }

        // 断开 ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // 取消空闲回调
        if (this.idleCallbackId) {
            cancelIdleCallback(this.idleCallbackId);
        }

        // 清理 DOM
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }

        // 清理引用
        this.items = [];
        this.itemHeights.clear();
        this.renderedItems.clear();
        this.wrapper = null;
        this.content = null;
        this.renderItem = null;
        this.onScroll = null;

        Logger.debug('虚拟滚动已销毁');
    }
}

/**
 * 创建虚拟滚动实例
 * @param {HTMLElement|string} container - 容器元素或选择器
 * @param {Object} options - 配置选项
 * @returns {VirtualScroll|null} 虚拟滚动实例
 */
export function createVirtualScroll(container, options = {}) {
    // 支持选择器
    const element = typeof container === 'string'
        ? document.querySelector(container)
        : container;

    if (!(element instanceof HTMLElement)) {
        Logger.error('无效的容器元素');
        return null;
    }

    return new VirtualScroll(element, options);
}

/**
 * 简化的虚拟列表渲染函数
 * @param {HTMLElement} container - 容器元素
 * @param {Array} items - 数据数组
 * @param {Function} renderItem - 渲染函数
 * @param {Object} options - 配置选项
 * @returns {VirtualScroll} 虚拟滚动实例
 */
export function renderVirtualList(container, items, renderItem, options = {}) {
    const virtualScroll = createVirtualScroll(container, options);
    
    if (virtualScroll) {
        virtualScroll.setRenderFunction(renderItem);
        virtualScroll.setItems(items);
    }

    return virtualScroll;
}
