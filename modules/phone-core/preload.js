// modules/phone-core/preload.js
/**
 * 玉子的手机 - 路由模块预热
 *
 * [`route-renderer.js`](modules/phone-core/route-renderer.js:24) 用动态 import 实现路由懒加载——这意味着
 * 用户首次进入 settings/fusion/variable-manager 时浏览器才开始下载这些模块，会有 50-300ms 白屏。
 *
 * 本模块的职责是：在用户准备打开手机（toggle 按钮挂载完成）的空闲时间，
 * 通过 <link rel="modulepreload"> 把所有路由入口模块预先下载到浏览器缓存。
 *
 * 行为约定：
 *   - 必须在 requestIdleCallback 里执行，避免与首屏渲染抢占 CPU
 *   - 只触发预热（download + parse），不触发模块顶层执行（modulepreload 与 import() 不同）
 *   - 阶段四接入打包后这一步会失效——bundle 模式下没有动态 chunk，
 *     届时会改成 entry chunk 自动包含所有路由代码
 *
 * 调用时机：[`bootstrap/app-bootstrap.js`](modules/bootstrap/app-bootstrap.js:1) 的 mountPhoneBootstrapUi 完成后调用一次。
 */

import { Logger } from '../error-handler.js';
import { requestIdleCallback as idleCallbackPolyfill } from '../utils/timing.js';

const logger = Logger.withScope({ scope: 'phone-core/preload', feature: 'route' });

/**
 * 路由入口模块清单。
 * 这些路径必须与 [`route-renderer.js`](modules/phone-core/route-renderer.js:24) 的动态 import 路径精确一致，
 * 否则 modulepreload 缓存命中失败，等于没预热。
 *
 * 阶段二收尾后的真实入口路径必须与 route-renderer.js 的动态 import 保持一致。
 */
const ROUTE_MODULES = [
    '../phone-home/render.js',
    '../table-viewer/render.js',
    '../settings-app/render.js',
    '../phone-fusion/render.js',
    '../variable-manager/index.js',
];

let preloadScheduled = false;

function isBundledRuntime() {
    const currentModuleUrl = String(import.meta.url || '').replace(/\\/g, '/');
    return /\/dist\/yuzi-phone\.bundle\.js(?:[?#].*)?$/.test(currentModuleUrl);
}

/**
 * 在浏览器空闲时调度路由模块预热。
 *
 * 重复调用是安全的——第二次会直接早退（preloadScheduled flag 防御）。
 *
 * @returns {boolean} 是否已经调度（true=本次调度，false=之前已经调度过）
 */
export function schedulePreloadRouteModules() {
    if (isBundledRuntime()) {
        logger.debug('route module preload 已跳过：当前运行在单 bundle 模式');
        return false;
    }

    if (typeof document === 'undefined' || typeof document.head?.appendChild !== 'function') {
        return false;
    }

    if (preloadScheduled) {
        return false;
    }
    preloadScheduled = true;

    const idleScheduler = typeof globalThis.requestIdleCallback === 'function'
        ? globalThis.requestIdleCallback
        : idleCallbackPolyfill;

    idleScheduler(() => {
        try {
            ROUTE_MODULES.forEach((relativePath) => {
                const resolved = new URL(relativePath, import.meta.url).href;
                const link = document.createElement('link');
                link.rel = 'modulepreload';
                link.href = resolved;
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
            });
            logger.debug('route module preload 调度完成', { context: { count: ROUTE_MODULES.length } });
        } catch (error) {
            // 不影响主流程；只是失去预热收益
            logger.warn('route module preload 调度失败', error);
        }
    }, { timeout: 2000 });

    return true;
}

/**
 * 重置预热调度状态（仅用于测试与卸载场景）。
 */
export function resetPreloadScheduleForTest() {
    preloadScheduled = false;
}
