// modules/utils/timing.js
/**
 * 玉子的手机 - 时序与节流工具
 *
 * 包含 debounce / throttle / requestIdleCallback 兼容垫片 / createBatchHandler。
 *
 * debounce / throttle / createBatchHandler 支持 options.runtime：
 *   - 传入 runtimeScope 时，内部 setTimeout / clearTimeout 会走 runtime 管控
 *   - 不传 runtime 时保持浏览器原生 timer 行为，向后兼容旧调用方
 */

function resolveTimerApi(runtime = null) {
    const runtimeSetTimeout = runtime && typeof runtime.setTimeout === 'function'
        ? runtime.setTimeout.bind(runtime)
        : null;
    const runtimeClearTimeout = runtime && typeof runtime.clearTimeout === 'function'
        ? runtime.clearTimeout.bind(runtime)
        : null;

    return {
        setTimeout: runtimeSetTimeout || window.setTimeout.bind(window),
        clearTimeout: runtimeClearTimeout || window.clearTimeout.bind(window),
    };
}

/**
 * 防抖函数 - 延迟执行，在延迟期间再次调用会重新计时
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 延迟时间（毫秒）
 * @param {Object} options - 选项
 * @param {boolean} options.leading - 是否在开始时立即执行
 * @param {boolean} options.trailing - 是否在结束时执行
 * @param {Object} options.runtime - 可选 runtimeScope，用于托管内部 timer
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

    const { leading = false, trailing = true, runtime = null } = options;
    const timerApi = resolveTimerApi(runtime);

    function invokeFunc() {
        if (lastArgs !== null) {
            result = func.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
        }
    }

    function startTimer() {
        if (timeoutId !== null) {
            timerApi.clearTimeout(timeoutId);
        }
        timeoutId = timerApi.setTimeout(() => {
            timeoutId = null;
            if (trailing) {
                invokeFunc();
            }
        }, wait);
    }

    function cancelTimer() {
        if (timeoutId !== null) {
            timerApi.clearTimeout(timeoutId);
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
 * @param {Object} options.runtime - 可选 runtimeScope，用于托管内部 timer
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

    const { leading = true, trailing = true, runtime = null } = options;
    const timerApi = resolveTimerApi(runtime);

    function invokeFunc() {
        if (lastArgs !== null) {
            result = func.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
        }
    }

    function startTimer() {
        if (timeoutId !== null) {
            timerApi.clearTimeout(timeoutId);
        }
        timeoutId = timerApi.setTimeout(() => {
            timeoutId = null;
            lastTime = Date.now();
            if (trailing && lastArgs !== null) {
                invokeFunc();
            }
        }, wait);
    }

    function cancelTimer() {
        if (timeoutId !== null) {
            timerApi.clearTimeout(timeoutId);
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
 * @param {Object} options - 选项
 * @param {Object} options.runtime - 可选 runtimeScope，用于托管内部 timer
 * @returns {Function} 收集函数
 *
 * @example
 * const batchUpdate = createBatchHandler((items) => {
 *     console.log('批量处理:', items);
 * }, 100);
 */
export function createBatchHandler(handler, delay = 100, options = {}) {
    let items = [];
    let timerId = null;
    const { runtime = null } = options;
    const timerApi = resolveTimerApi(runtime);

    return function collect(item) {
        items.push(item);

        if (timerId === null) {
            timerId = timerApi.setTimeout(() => {
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
