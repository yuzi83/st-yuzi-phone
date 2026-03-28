// modules/utils.js
/**
 * Yuzi Phone - 通用工具函数
 * @version 1.2.0
 * @description 添加防抖、节流等性能优化工具
 */

import { Logger } from './error-handler.js';

/**
 * 限制数值在指定范围内
 * @param {number} value - 要限制的值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {number} fallback - 无效时的默认值
 * @returns {number} 限制后的值
 */
export function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * 转义 HTML 特殊字符
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
}

/**
 * 转义 HTML 属性值
 * @param {string} value - 要转义的值
 * @returns {string} 转义后的字符串
 */
export function escapeHtmlAttr(value) {
    return escapeHtml(String(value || ''));
}

/**
 * 安全转换为字符串
 * @param {any} value - 要转换的值
 * @returns {string} 字符串
 */
export function safeText(value) {
    return String(value ?? '');
}

/**
 * 安全去除首尾空格
 * @param {any} value - 要处理的值
 * @returns {string} 处理后的字符串
 */
export function safeTrim(value) {
    return String(value ?? '').trim();
}

// ===== 性能优化工具 =====

/**
 * 防抖函数 - 延迟执行，在延迟期间再次调用会重新计时
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 延迟时间（毫秒）
 * @param {Object} options - 选项
 * @param {boolean} options.leading - 是否在开始时立即执行
 * @param {boolean} options.trailing - 是否在结束时执行
 * @returns {Function} 防抖后的函数
 *
 * @example
 * const debouncedSave = debounce(saveData, 300);
 * input.addEventListener('input', debouncedSave);
 */
export function debounce(func, wait = 300, options = {}) {
    let timeoutId = null;
    let lastArgs = null;
    let lastThis = null;
    let result = undefined;

    const { leading = false, trailing = true } = options;

    function invokeFunc() {
        if (lastArgs !== null) {
            result = func.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
        }
    }

    function startTimer() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (trailing) {
                invokeFunc();
            }
        }, wait);
    }

    function cancelTimer() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    const debounced = function (...args) {
        lastArgs = args;
        lastThis = this;

        if (timeoutId === null && leading) {
            invokeFunc();
        }

        startTimer();
        return result;
    };

    debounced.cancel = () => {
        cancelTimer();
        lastArgs = null;
        lastThis = null;
    };

    debounced.flush = () => {
        cancelTimer();
        if (trailing && lastArgs !== null) {
            invokeFunc();
        }
    };

    return debounced;
}

/**
 * 节流函数 - 在指定时间间隔内只执行一次
 * @param {Function} func - 要节流的函数
 * @param {number} wait - 间隔时间（毫秒）
 * @param {Object} options - 选项
 * @param {boolean} options.leading - 是否在开始时立即执行
 * @param {boolean} options.trailing - 是否在结束时执行
 * @returns {Function} 节流后的函数
 *
 * @example
 * const throttledScroll = throttle(handleScroll, 100);
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle(func, wait = 100, options = {}) {
    let timeoutId = null;
    let lastArgs = null;
    let lastThis = null;
    let lastTime = 0;
    let result = undefined;

    const { leading = true, trailing = true } = options;

    function invokeFunc() {
        if (lastArgs !== null) {
            result = func.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
        }
    }

    function startTimer() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            lastTime = Date.now();
            if (trailing && lastArgs !== null) {
                invokeFunc();
            }
        }, wait);
    }

    function cancelTimer() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    const throttled = function (...args) {
        const now = Date.now();
        const remaining = wait - (now - lastTime);

        lastArgs = args;
        lastThis = this;

        if (remaining <= 0 || remaining > wait) {
            cancelTimer();
            lastTime = now;
            if (leading) {
                invokeFunc();
            }
            if (trailing) {
                startTimer();
            }
        } else if (!timeoutId && trailing) {
            startTimer();
        }

        return result;
    };

    throttled.cancel = () => {
        cancelTimer();
        lastArgs = null;
        lastThis = null;
        lastTime = 0;
    };

    throttled.flush = () => {
        cancelTimer();
        invokeFunc();
    };

    return throttled;
}

/**
 * requestIdleCallback 兼容实现
 * @param {Function} callback - 回调函数
 * @param {Object} [options] - 选项
 * @returns {number} 回调 ID
 */
export function requestIdleCallback(callback, options = {}) {
    if (typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(callback, options);
    }

    const start = Date.now();
    return setTimeout(() => {
        callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        });
    }, 1);
}

/**
 * cancelIdleCallback 兼容实现
 * @param {number} id - 回调 ID
 */
export function cancelIdleCallback(id) {
    if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(id);
    } else {
        clearTimeout(id);
    }
}

/**
 * 批量处理器 - 收集一段时间内的项目并批量处理
 * @param {Function} handler - 批量处理函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 收集函数
 *
 * @example
 * const batchUpdate = createBatchHandler((items) => {
 *     console.log('批量处理:', items);
 * }, 100);
 */
export function createBatchHandler(handler, delay = 100) {
    let items = [];
    let timerId = null;

    return function collect(item) {
        items.push(item);

        if (timerId === null) {
            timerId = setTimeout(() => {
                const batch = [...items];
                items = [];
                timerId = null;
                handler(batch);
            }, delay);
        }
    };
}

/**
 * 单例 Promise 创建器 - 确保异步操作在执行期间只运行一次
 * @param {Function} factory - Promise 工厂函数
 * @returns {Function} 包装后的函数
 */
export function createSingletonPromise(factory) {
    let currentPromise = null;

    return function singleton(...args) {
        if (!currentPromise) {
            currentPromise = Promise.resolve()
                .then(() => factory(...args))
                .finally(() => {
                    currentPromise = null;
                });
        }
        return currentPromise;
    };
}

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {...Object} sources - 源对象列表
 * @returns {Object} 合并后的对象
 */
export function deepMerge(target, ...sources) {
    const output = { ...(target && typeof target === 'object' ? target : {}) };

    sources.forEach((source) => {
        if (!source || typeof source !== 'object') return;

        Object.keys(source).forEach((key) => {
            const sourceValue = source[key];
            const targetValue = output[key];

            if (
                sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
                && targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
            ) {
                output[key] = deepMerge(targetValue, sourceValue);
            } else if (Array.isArray(sourceValue)) {
                output[key] = [...sourceValue];
            } else {
                output[key] = sourceValue;
            }
        });
    });

    return output;
}

/**
 * 生成唯一 ID
 * @param {string} prefix - 前缀
 * @returns {string} 唯一 ID
 */
export function generateUniqueId(prefix = 'id') {
    const random = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now().toString(36);
    return `${prefix}_${timestamp}_${random}`;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
export function formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size < 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 检测移动设备
 * @returns {boolean}
 */
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 检测触摸设备
 * @returns {boolean}
 */
export function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * HTML 安全净化（兼容别名，内部使用 escapeHtml）
 * @param {string} input - 原始字符串
 * @returns {string}
 */
export function sanitizeHTML(input) {
    return escapeHtml(input);
}

/**
 * URL 安全检查
 * @param {string} url - URL 字符串
 * @returns {string}
 */
export function sanitizeUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';

    try {
        const normalized = new URL(raw, window.location.origin);
        const protocol = normalized.protocol.toLowerCase();
        if (['http:', 'https:', 'data:', 'blob:'].includes(protocol)) {
            return normalized.href;
        }
    } catch {
        if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/')) {
            return raw;
        }
    }

    return '';
}

/**
 * CSS url() 安全转义
 * @param {string} url - URL 字符串
 * @returns {string}
 */
export function escapeCssUrl(url) {
    const safeUrl = sanitizeUrl(url);
    return safeUrl.replace(/["'()\\\n\r]/g, (match) => `\\${match}`);
}

/**
 * CSS 文本净化（供模板运行时使用）
 * - 移除 HTML 标签残留
 * - 拦截明显危险的 `expression()` / `javascript:` / `vbscript:`
 * - 过滤 `@import javascript:` 一类危险入口
 * @param {string} cssText - 原始 CSS 文本
 * @returns {string}
 */
export function sanitizeCSS(cssText) {
    const raw = String(cssText || '').trim();
    if (!raw) return '';

    const withoutTags = raw.replace(/<[^>]*>/g, '');
    const blockedPatterns = [
        /expression\s*\(/gi,
        /javascript\s*:/gi,
        /vbscript\s*:/gi,
        /behavior\s*:/gi,
        /@import\s+(?:url\()?\s*["']?\s*javascript:/gi,
    ];

    let sanitized = withoutTags;
    blockedPatterns.forEach((pattern) => {
        sanitized = sanitized.replace(pattern, '');
    });

    return sanitized.trim();
}

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

    return createVisibilityObserver(async (entry, observer) => {
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

// ===== 性能监控工具 =====

/**
 * 性能计时器
 * @param {string} name - 计时器名称
 * @returns {Object} 包含 start, end, measure 方法的对象
 *
 * @example
 * const timer = createPerformanceTimer('数据加载');
 * timer.start();
 * await loadData();
 * timer.end();
 * timer.measure(); // 输出: 数据加载耗时: 123ms
 */
export function createPerformanceTimer(name) {
    let startTime = 0;
    let endTime = 0;

    return {
        start: () => {
            startTime = performance.now();
        },
        end: () => {
            endTime = performance.now();
        },
        measure: () => {
            const duration = endTime - startTime;
            Logger.info(`[玉子手机] ${name} 耗时: ${duration.toFixed(2)}ms`);
            return duration;
        },
    };
}

/**
 * 帧率监控器
 * @param {Function} callback - 回调函数，接收当前 FPS
 * @param {number} sampleSize - 采样大小
 * @returns {Object} 包含 start, stop 方法的对象
 *
 * @example
 * const fpsMonitor = createFPSMonitor((fps) => {
 *     console.log('当前 FPS:', fps);
 * });
 * fpsMonitor.start();
 * // ... 运行一段时间后
 * fpsMonitor.stop();
 */
export function createFPSMonitor(callback, sampleSize = 60) {
    let frameCount = 0;
    let lastTime = 0;
    let rafId = null;

    const measure = (timestamp) => {
        if (!lastTime) {
            lastTime = timestamp;
        }

        frameCount++;
        const elapsed = timestamp - lastTime;

        if (frameCount >= sampleSize) {
            const fps = elapsed > 0 ? Math.round((frameCount * 1000) / elapsed) : 0;
            callback(fps);
            frameCount = 0;
            lastTime = timestamp;
        }

        rafId = requestAnimationFrame(measure);
    };

    return {
        start: () => {
            if (rafId !== null) return;
            frameCount = 0;
            lastTime = 0;
            rafId = requestAnimationFrame(measure);
        },
        stop: () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        },
    };
}

/**
 * 获取内存使用情况（如支持）
 * @returns {Object|null}
 */
export function getMemoryUsage() {
    if (performance && performance.memory) {
        return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        };
    }
    return null;
}

/**
 * 事件管理器 - 统一管理事件监听器的清理，防止内存泄漏
 * @example
 * const eventManager = new EventManager();
 * eventManager.add(element, 'click', handler);
 * eventManager.add(window, 'resize', handler2);
 * // 清理所有监听器
 * eventManager.dispose();
 */
export class EventManager {
    constructor() {
        /** @type {Set<AbortController>} */
        this.controllers = new Set();
        /** @type {Map<string, {target: EventTarget, type: string, handler: Function, controller: AbortController}>} */
        this.listeners = new Map();
    }

    /**
     * 添加事件监听器
     * @param {EventTarget} target - 目标对象
     * @param {string} type - 事件类型
     * @param {Function} handler - 处理函数
     * @param {Object} options - 选项
     * @returns {Function} 取消监听的函数
     */
    add(target, type, handler, options = {}) {
        if (!target || typeof target.addEventListener !== 'function') {
            return () => {};
        }

        const controller = new AbortController();
        const listenerOptions = {
            ...options,
            signal: controller.signal,
        };

        target.addEventListener(type, handler, listenerOptions);
        this.controllers.add(controller);

        const key = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.listeners.set(key, { target, type, handler, controller });

        return () => {
            controller.abort();
            this.controllers.delete(controller);
            this.listeners.delete(key);
        };
    }

    /**
     * 移除指定事件监听器
     * @param {EventTarget} target - 目标对象
     * @param {string} type - 事件类型
     * @param {Function} handler - 处理函数
     */
    remove(target, type, handler) {
        for (const [key, listener] of this.listeners.entries()) {
            if (listener.target === target &&
                listener.type === type &&
                listener.handler === handler) {
                listener.controller.abort();
                this.controllers.delete(listener.controller);
                this.listeners.delete(key);
                break;
            }
        }
    }

    /**
     * 清理所有事件监听器
     */
    dispose() {
        this.controllers.forEach(c => c.abort());
        this.controllers.clear();
        this.listeners.clear();
    }

    /**
     * 获取监听器数量
     * @returns {number}
     */
    get size() {
        return this.controllers.size;
    }
}
