// modules/utils/observers.js
/**
 * 玉子的手机 - 视口/可见性观察工具
 *
 * - createVisibilityObserver：IntersectionObserver 的 thin wrapper（含降级路径）
 * - createLazyLoader：基于 createVisibilityObserver 的懒加载视图实现
 * - createInfiniteScroll：无限滚动观察器
 *
 * createVisibilityObserver 在 IntersectionObserver 不可用时会立即触发回调（降级），
 * 这是历史决策——保留以兼容老浏览器场景；调用方需自行决定是否依赖该降级行为。
 */

import { Logger } from '../error-handler.js';

/**
 * 创建可见性观察器
 * @param {Function} callback - 可见性变化回调
 * @param {Object} options - 选项
 * @returns {Object} 包含 observe, unobserve, disconnect 方法的对象
 *
 * @example
 * const observer = createVisibilityObserver((entry) => {
 *     if (entry.isIntersecting) {
 *         console.log('元素进入视口');
 *         // 加载图片或数据
 *     }
 * });
 *
 * observer.observe(document.querySelector('.lazy-load'));
 */
export function createVisibilityObserver(callback, options = {}) {
    const {
        root = null,
        rootMargin = '0px',
        threshold = 0.1,
    } = options;

    if (!('IntersectionObserver' in window)) {
        Logger.warn('[玉子手机] IntersectionObserver 不支持，使用降级方案');
        return {
            observe: (element) => {
                callback({ isIntersecting: true, target: element }, null);
            },
            unobserve: () => {},
            disconnect: () => {},
        };
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            callback(entry, observer);
        });
    }, { root, rootMargin, threshold });

    return {
        observe: (element) => observer.observe(element),
        unobserve: (element) => observer.unobserve(element),
        disconnect: () => observer.disconnect(),
    };
}

/**
 * 创建懒加载观察器
 * @param {Function} loadCallback - 加载回调函数
 * @param {Object} options - 选项
 * @returns {Object} 包含 observe, unobserve, disconnect 方法的对象
 *
 * @example
 * const lazyLoader = createLazyLoader((element) => {
 *     const src = element.dataset.src;
 *     if (src) {
 *         element.src = src;
 *     }
 * });
 *
 * document.querySelectorAll('img[data-src]').forEach(img => {
 *     lazyLoader.observe(img);
 * });
 */
export function createLazyLoader(loadCallback, options = {}) {
    const loadedElements = new WeakSet();

    return createVisibilityObserver((entry, observer) => {
        if (entry.isIntersecting && !loadedElements.has(entry.target)) {
            loadedElements.add(entry.target);
            loadCallback(entry.target);
            if (observer) {
                observer.unobserve(entry.target);
            }
        }
    }, options);
}

/**
 * 创建无限滚动观察器
 * @param {Function} loadMoreCallback - 加载更多的回调函数
 * @param {Object} options - 选项
 * @returns {Object} 包含 observe, unobserve, disconnect 方法的对象
 *
 * @example
 * const infiniteScroll = createInfiniteScroll(async () => {
 *     const moreData = await fetchMoreData();
 *     appendData(moreData);
 * });
 *
 * infiniteScroll.observe(document.querySelector('.load-more-trigger'));
 */
export function createInfiniteScroll(loadMoreCallback, options = {}) {
    let isLoading = false;

    return createVisibilityObserver(async (entry) => {
        if (entry.isIntersecting && !isLoading) {
            isLoading = true;
            try {
                await loadMoreCallback();
            } catch (error) {
                Logger.error('[玉子手机] 无限滚动加载失败:', error);
            } finally {
                isLoading = false;
            }
        }
    }, { threshold: 0.1, ...options });
}
