// modules/utils/performance.js
/**
 * 玉子的手机 - 性能监控工具
 *
 * - createPerformanceTimer：基于 performance.now() 的轻量计时器
 * - createFPSMonitor：基于 requestAnimationFrame 的帧率监控器
 * - getMemoryUsage：performance.memory 的简单包装（非标准 API，仅 Chromium 可用）
 *
 * 这些工具仅用于开发期的性能侦察，不应进入热路径。
 */

import { Logger } from '../error-handler.js';

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
