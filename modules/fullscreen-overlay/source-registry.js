function normalizeAdapterId(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function listMissingAdapterMembers(adapter) {
    const missing = [];
    if (!normalizeAdapterId(adapter?.id)) missing.push('id');
    if (!normalizeAdapterId(adapter?.modelId)) missing.push('modelId');
    if (typeof adapter?.matches !== 'function') missing.push('matches');
    if (typeof adapter?.getSignature !== 'function') missing.push('getSignature');
    if (typeof adapter?.readEvents !== 'function') missing.push('readEvents');
    return missing;
}

export function createOverlaySourceRegistry(adapters = []) {
    const registered = [];
    const adapterById = new Map();

    (Array.isArray(adapters) ? adapters : []).forEach((adapter) => {
        if (adapter === null || adapter === undefined) return;
        const id = normalizeAdapterId(adapter?.id);
        const missing = listMissingAdapterMembers(adapter);
        if (missing.length > 0) {
            throw new Error(
                `invalid overlay source adapter "${id || '<unknown>'}": missing ${missing.join(', ')}`,
            );
        }
        if (adapterById.has(id)) {
            throw new Error(`duplicate overlay source adapter id: ${id}`);
        }
        adapterById.set(id, adapter);
        registered.push(adapter);
    });

    const snapshot = Object.freeze([...registered]);

    return Object.freeze({
        list() {
            return snapshot;
        },
        get(adapterId) {
            return adapterById.get(normalizeAdapterId(adapterId)) || null;
        },
        match(context) {
            for (const adapter of snapshot) {
                try {
                    if (adapter.matches(context)) return adapter;
                } catch {
                    // 单个来源适配器故障不得让其他合法来源从设置目录中消失。
                }
            }
            return null;
        },
    });
}
