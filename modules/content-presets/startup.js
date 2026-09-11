import { getPhoneCoreState } from '../phone-core/state.js';
import { isContentPresetFullPageRuntimeEnabled } from './activation-gate.js';
import { commitContentPresetIndex, markContentPresetIndexUnavailable } from './index-state.js';
import { listPresetMetadata, loadActiveBindings, loadPopupBindings } from './repository.js';
import { convergeCurrentContentPresetRoute } from './route-convergence.js';

const DEFAULT_STARTUP_DEPS = Object.freeze({
    commitContentPresetIndex,
    convergeCurrentContentPresetRoute,
    getPhoneCoreState,
    isContentPresetFullPageRuntimeEnabled,
    listPresetMetadata,
    loadActiveBindings,
    loadPopupBindings,
    markContentPresetIndexUnavailable,
});

function createContentPresetIndexInitializer(overrides = {}) {
    const runtimeDeps = { ...DEFAULT_STARTUP_DEPS, ...overrides };
    // 旧测试 / 调用方只提供页面绑定加载器时，不触发额外的真实数据库读取。
    if (overrides.loadActiveBindings && !overrides.loadPopupBindings) runtimeDeps.loadPopupBindings = async () => new Map();
    let startupPromise = null;
    return function initializeContentPresetIndexWithDeps() {
        if (!runtimeDeps.isContentPresetFullPageRuntimeEnabled()) return Promise.resolve(null);
        if (startupPromise) return startupPromise;
        const state = runtimeDeps.getPhoneCoreState();
        const initialRoute = String(state.currentRoute || '');
        const initialRenderToken = state.routeRenderToken;
        startupPromise = (async () => {
            let pageByTable;
            let popupByTable;
            let snapshot;
            try {
                const [metadata, pages, popups] = await Promise.all([
                    runtimeDeps.listPresetMetadata(),
                    runtimeDeps.loadActiveBindings(),
                    runtimeDeps.loadPopupBindings(),
                ]);
                pageByTable = pages;
                popupByTable = popups;
                snapshot = runtimeDeps.commitContentPresetIndex({
                    status: 'ready',
                    error: null,
                    metadata: new Map(metadata.map(entry => [entry.id, entry])),
                    pageByTable,
                    popupByTable,
                    // v2 初始化测试与旧全页 renderer 继续把页面绑定读作 activeByTable。
                    activeByTable: pageByTable,
                });
            } catch (error) {
                runtimeDeps.markContentPresetIndexUnavailable(error);
                return null;
            }
            if (String(state.currentRoute || '') === initialRoute && state.routeRenderToken === initialRenderToken) {
                try { await runtimeDeps.convergeCurrentContentPresetRoute([...pageByTable.keys()]); } catch {
                    // 索引已经提交成功；当前路由收敛失败不得污染数据面的 ready 状态。
                }
            }
            return snapshot;
        })();
        return startupPromise;
    };
}
const initializeContentPresetIndexImpl = createContentPresetIndexInitializer();
export function initializeContentPresetIndex() { return initializeContentPresetIndexImpl(); }
export function __test__createContentPresetIndexInitializer(overrides = {}) { return createContentPresetIndexInitializer(overrides); }
