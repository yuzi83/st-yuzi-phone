import { getQQV2Facade } from '../../qq-v2/runtime/default-runtime.js';

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function modelLoadInput(input) {
    const source = asObject(input);
    const apiPresetId = asText(source.apiPresetId, 256);
    if (source.draft === undefined) {
        return apiPresetId ? { apiPresetId } : {};
    }

    const draft = asObject(source.draft);
    return {
        ...(apiPresetId ? { apiPresetId } : {}),
        draft: {
            endpoint: asText(draft.endpoint, 2048),
            apiKey: asText(draft.apiKey, 8192),
            model: asText(draft.model, 240),
            temperature: draft.temperature,
            maxOutput: draft.maxOutput,
        },
    };
}

function unavailable(capability) {
    return Object.freeze({
        ok: false,
        status: 'unavailable',
        reason: 'qq-v2-facade-unavailable',
        capability,
    });
}

function failed(error) {
    return Object.freeze({
        ok: false,
        status: 'failed',
        error: Object.freeze({
            code: String(error?.code || 'settings-facade-failed'),
            message: String(error?.message || 'QQ v2 设置请求失败'),
        }),
    });
}

/**
 * The settings app owns only editing state. QQ v2 Facade remains the sole
 * boundary for shared API and AI instruction resources.
 */
export function createQQV2PresetSettingsService(options = {}) {
    const resolveFacade = typeof options.getFacade === 'function' ? options.getFacade : getQQV2Facade;

    const invoke = async (group, method, input) => {
        const facade = resolveFacade();
        const target = facade?.[group]?.[method];
        if (typeof target !== 'function') return unavailable(method);
        try {
            return await facade[group][method](input);
        } catch (error) {
            return failed(error);
        }
    };

    return Object.freeze({
        readSharedResources() { return invoke('query', 'sharedResources'); },
        saveApiPreset(input) { return invoke('intent', 'saveApiPreset', input); },
        deleteApiPreset(input) { return invoke('intent', 'deleteApiPreset', input); },
        loadModels(input) { return invoke('intent', 'loadModels', modelLoadInput(input)); },
        savePromptPreset(input) { return invoke('intent', 'savePromptPreset', input); },
        deletePromptPreset(input) { return invoke('intent', 'deletePromptPreset', input); },
        importImageGenerationPresets(input) {
            return invoke('intent', 'importImageGenerationPresets', input);
        },
        exportImageGenerationPreset(input) {
            return invoke('intent', 'exportImageGenerationPreset', input);
        },
        deleteImageGenerationPreset(input) {
            return invoke('intent', 'deleteImageGenerationPreset', input);
        },
        translateImagePrompt(input) {
            return invoke('intent', 'translateImagePrompt', input);
        },
        restoreBuiltInPromptPreset(input) { return invoke('intent', 'restoreBuiltInPromptPreset', input); },
        restoreAllBuiltInPromptPresets(input) { return invoke('intent', 'restoreAllBuiltInPromptPresets', input); },
        importPromptPresets(input) { return invoke('intent', 'importPromptPresets', input); },
        exportPromptPreset(input) { return invoke('intent', 'exportPromptPreset', input); },
        exportAllPromptPresets(input) { return invoke('intent', 'exportAllPromptPresets', input); },
    });
}

export const qqV2PresetSettingsService = createQQV2PresetSettingsService();
