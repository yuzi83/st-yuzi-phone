import { createAppearanceAssetCodec } from './appearance-asset-repository.js';

// 隔离手机运行时设置与宿主的可序列化设置，避免其他扩展触发保存时带走图片。
export function createAppearanceSettingsContext({ getHostContext, extensionName, onError, onMissing, codec = createAppearanceAssetCodec() }) {
    let extensionSettings;
    let missing = new Map();
    let initialization;
    let queue = Promise.resolve(true);

    function getContext() {
        const host = getHostContext();
        if (!host?.extensionSettings) return null;
        if (!extensionSettings) {
            extensionSettings = {
                ...host.extensionSettings,
                [extensionName]: structuredClone(host.extensionSettings[extensionName]),
            };
        }
        return { ...host, extensionSettings, saveSettingsDebounced: save };
    }

    function save() {
        const ctx = getContext();
        if (!ctx) throw new Error('酒馆设置上下文不可用');
        const snapshot = structuredClone(ctx.extensionSettings[extensionName]);
        const preserved = new Map(missing);
        queue = queue.then(async () => {
            const stored = await codec.serialize(snapshot, preserved);
            const host = getHostContext();
            if (!host?.extensionSettings || typeof host.saveSettingsDebounced !== 'function') {
                throw new Error('酒馆设置上下文不可用');
            }
            // 资源提交后才发布引用；失败时宿主原设置（包括旧版图片）完全不动。
            const previous = host.extensionSettings[extensionName];
            host.extensionSettings[extensionName] = stored;
            try {
                await host.saveSettingsDebounced();
            } catch (error) {
                if (host.extensionSettings[extensionName] === stored) host.extensionSettings[extensionName] = previous;
                throw error;
            }
            return true;
        }).catch(error => {
            onError?.(error);
            return false;
        });
        return queue;
    }

    function initialize() {
        if (initialization) return initialization;
        initialization = (async () => {
            const ctx = getContext();
            if (!ctx) throw new Error('酒馆设置上下文不可用');
            const original = ctx.extensionSettings[extensionName];
            if (!original) return;
            const hydrated = await codec.hydrate(original);
            extensionSettings[extensionName] = hydrated.settings;
            missing = hydrated.missing;
            if (missing.size) onMissing?.();
            // 首次迁移也经过同一保存边界，不直接修改真实 settings.json。
            await save();
        })().catch(error => {
            initialization = undefined;
            onError?.(error);
        });
        return initialization;
    }

    return {
        getContext,
        initialize,
        whenSaved: () => queue,
        markChanged: key => key === undefined ? missing.clear() : missing.delete(key),
    };
}
