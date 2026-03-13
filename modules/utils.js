// modules/utils.js
/**
 * Yuzi Phone - 通用工具函数
 * @version 1.2.0
 * @description 添加防抖、节流等性能优化工具
 */

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
 * 请求空闲回调的兼容实现
 * @param {Function} callback - 回调函数
 * @param {Object} options - 选项
 * @param {number} options.timeout - 超时时间（毫秒）
 * @returns {number} 回调 ID
 */
export function requestIdleCallback(callback, options = {}) {
    if ('requestIdleCallback' in window) {
        return window.requestIdleCallback(callback, options);
    }
    
    // 降级实现
    const { timeout = 1 } = options;
    return setTimeout(() => {
        const start = Date.now();
        callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        });
    }, timeout);
}

/**
 * 取消空闲回调
 * @param {number} id - 回调 ID
 */
export function cancelIdleCallback(id) {
    if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(id);
    } else {
        clearTimeout(id);
    }
}

/**
 * 批量处理函数 - 将多次调用合并为一次批量处理
 * @param {Function} batchHandler - 批量处理函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 添加到批量的函数
 *
 * @example
 * const batchUpdate = createBatchHandler((items) => {
 *     console.log('批量处理:', items);
 * }, 100);
 *
 * batchUpdate({ id: 1 });
 * batchUpdate({ id: 2 });
 * // 100ms 后会一次性处理 [{ id: 1 }, { id: 2 }]
 */
export function createBatchHandler(batchHandler, delay = 100) {
    let items = [];
    let timeoutId = null;

    function flush() {
        if (items.length > 0) {
            const currentItems = items;
            items = [];
            batchHandler(currentItems);
        }
        timeoutId = null;
    }

    function scheduleFlush() {
        if (timeoutId === null) {
            timeoutId = setTimeout(flush, delay);
        }
    }

    return function addItem(item) {
        items.push(item);
        scheduleFlush();
    };
}

/**
 * 创建单例 Promise - 防止重复调用
 * @param {Function} asyncFunc - 异步函数
 * @returns {Function} 包装后的函数
 *
 * @example
 * const loadOnce = createSingletonPromise(async () => {
 *     const data = await fetchData();
 *     return data;
 * });
 *
 * // 多次调用只会执行一次
 * loadOnce();
 * loadOnce();
 */
export function createSingletonPromise(asyncFunc) {
    let promise = null;

    return function (...args) {
        if (promise === null) {
            promise = asyncFunc.apply(this, args).finally(() => {
                // 可选：在完成后清除，允许再次调用
                // promise = null;
            });
        }
        return promise;
    };
}

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {...Object} sources - 源对象
 * @returns {Object} 合并后的对象
 */
export function deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return deepMerge(target, ...sources);
}

/**
 * 检查是否为普通对象
 * @param {any} item - 要检查的值
 * @returns {boolean} 是否为普通对象
 */
function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * 生成唯一 ID
 * @param {string} prefix - 前缀
 * @returns {string} 唯一 ID
 */
export function generateUniqueId(prefix = 'yuzi') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的字符串
 */
export function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 检查是否为移动设备
 * @returns {boolean} 是否为移动设备
 */
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 检查是否支持触摸
 * @returns {boolean} 是否支持触摸
 */
export function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// ===== IntersectionObserver 工具 =====

/**
 * 创建可见性观察器
 * @param {Function} callback - 当元素可见性变化时的回调函数
 * @param {Object} options - IntersectionObserver 选项
 * @param {Element} options.root - 根元素
 * @param {string} options.rootMargin - 根元素边距
 * @param {number} options.threshold - 阈值（0-1）
 * @returns {Object} 包含 observe, unobserve, disconnect 方法的对象
 *
 * @example
 * const observer = createVisibilityObserver((entry, observer) => {
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
        console.warn('[玉子手机] IntersectionObserver 不支持，使用降级方案');
        // 降级方案：立即调用回调
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
            // 加载后停止观察
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
                console.error('[玉子手机] 无限滚动加载失败:', error);
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
            console.log(`[玉子手机] ${name} 耗时: ${duration.toFixed(2)}ms`);
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
    let animationFrameId = null;
    let fpsHistory = [];

    function measure(timestamp) {
        if (lastTime === 0) {
            lastTime = timestamp;
        }

        frameCount++;

        if (timestamp - lastTime >= 1000) {
            const fps = Math.round((frameCount * 1000) / (timestamp - lastTime));
            fpsHistory.push(fps);

            if (fpsHistory.length > sampleSize) {
                fpsHistory.shift();
            }

            const avgFps = Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
            callback(avgFps);

            frameCount = 0;
            lastTime = timestamp;
        }

        animationFrameId = requestAnimationFrame(measure);
    }

    return {
        start: () => {
            if (animationFrameId === null) {
                lastTime = 0;
                frameCount = 0;
                fpsHistory = [];
                animationFrameId = requestAnimationFrame(measure);
            }
        },
        stop: () => {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        },
        getAverageFPS: () => {
            if (fpsHistory.length === 0) return 0;
            return Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
        },
    };
}

/**
 * 内存使用监控（如果浏览器支持）
 * @returns {Object|null} 内存使用信息，如果不支持则返回 null
 */
export function getMemoryUsage() {
    if (performance && performance.memory) {
        return {
            usedJSHeapSize: formatFileSize(performance.memory.usedJSHeapSize),
            totalJSHeapSize: formatFileSize(performance.memory.totalJSHeapSize),
            jsHeapSizeLimit: formatFileSize(performance.memory.jsHeapSizeLimit),
        };
    }
    return null;
}
