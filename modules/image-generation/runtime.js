import { getTableDataAsync } from '../phone-core/data-api.js';
import {
    getPhoneSettings,
    normalizeImageGenerationSettings,
} from '../settings.js';
import { composeCharacterImagePrompt as composePrompt } from './character-mapping.js';
import { createImageGenerationService } from './service.js';

function readImageGenerationConfig(getSettings) {
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    return normalizeImageGenerationSettings(settings?.imageGeneration);
}

/**
 * 将“小手机当前设置”适配为 QQ 运行时需要的两个公开能力：
 * 1. 根据当前表格映射组合人物提示词；
 * 2. 遵守总开关与当前超时配置后调用底层生图服务。
 */
export function createPhoneImageGenerationRuntime(options = {}) {
    const getSettings = typeof options.getPhoneSettings === 'function'
        ? options.getPhoneSettings
        : getPhoneSettings;
    const tableReader = typeof options.tableReader === 'function'
        ? options.tableReader
        : getTableDataAsync;
    const promptComposer = typeof options.composeCharacterImagePrompt === 'function'
        ? options.composeCharacterImagePrompt
        : composePrompt;
    const imageGenerationService = options.imageGenerationService || createImageGenerationService();

    async function composeCharacterImagePrompt(input = {}) {
        const config = readImageGenerationConfig(getSettings);
        let rawData;
        try {
            rawData = await tableReader();
        } catch {
            rawData = {};
        }
        return promptComposer({
            ...input,
            rawData,
            mappings: config.roleMappings,
        });
    }

    async function generateAndStore(input = {}) {
        const config = readImageGenerationConfig(getSettings);
        if (!config.enabled) {
            return {
                ok: false,
                status: 'disabled',
                error: { code: 'image-generation-disabled' },
            };
        }
        const requestedTimeout = Number(input.timeoutMs);
        const timeoutMs = Number.isFinite(requestedTimeout)
            ? Math.max(0, Math.min(config.timeoutMs, requestedTimeout))
            : config.timeoutMs;
        return imageGenerationService.generateAndStore({
            ...input,
            timeoutMs,
        });
    }

    async function deleteStoredImage(input = {}) {
        return imageGenerationService.deleteStoredImage(input);
    }

    return Object.freeze({
        composeCharacterImagePrompt,
        generateAndStore,
        deleteStoredImage,
    });
}

export const sharedImageGenerationService = createImageGenerationService();

export const sharedPhoneImageGenerationRuntime = createPhoneImageGenerationRuntime({
    imageGenerationService: sharedImageGenerationService,
});
