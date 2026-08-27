import {
    getPhoneSettings as getStoredPhoneSettings,
    savePhoneSetting as persistPhoneSetting,
    normalizeImageGenerationSettings,
} from '../settings.js';
import { filterImagePromptOutput } from './prompt-output-filter.js';

function cloneValue(value) {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function emptyMappingModel() {
    return {
        tables: [],
        resolvedMappings: [],
    };
}

function text(value) {
    return String(value ?? '').trim();
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function cloneSharedResources(result) {
    const source = result && typeof result === 'object' && !Array.isArray(result)
        ? result
        : {};
    return {
        status: text(source.status) || 'ready',
        ...(source.error ? { error: text(source.error?.message || source.error) } : {}),
        apiPresets: cloneValue(asArray(source.apiPresets)),
        imageGenerationPresets: cloneValue(asArray(source.imageGenerationPresets)),
    };
}

function createDefaultTestFilename() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return `settings-test-${globalThis.crypto.randomUUID()}`;
    }
    return `settings-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createImageGenerationSettingsService(options = {}) {
    const getPhoneSettings = typeof options.getPhoneSettings === 'function'
        ? options.getPhoneSettings
        : getStoredPhoneSettings;
    const savePhoneSetting = typeof options.savePhoneSetting === 'function'
        ? options.savePhoneSetting
        : persistPhoneSetting;
    const tableReader = typeof options.tableReader === 'function'
        ? options.tableReader
        : async () => ({});
    const characterMapping = options.characterMapping
        && typeof options.characterMapping === 'object'
        ? options.characterMapping
        : {};
    const imageGenerationService = options.imageGenerationService
        && typeof options.imageGenerationService === 'object'
        ? options.imageGenerationService
        : {};
    const qqV2PresetService = options.qqV2PresetService
        && typeof options.qqV2PresetService === 'object'
        ? options.qqV2PresetService
        : null;
    const now = typeof options.now === 'function' ? options.now : Date.now;

    function readConfig(override) {
        if (override && typeof override === 'object' && !Array.isArray(override)) {
            return normalizeImageGenerationSettings(override);
        }
        const settings = getPhoneSettings();
        return normalizeImageGenerationSettings(settings?.imageGeneration);
    }

    async function readSharedResources() {
        if (typeof qqV2PresetService?.readSharedResources !== 'function') return null;
        try {
            const result = await qqV2PresetService.readSharedResources();
            if (result?.ok === false) {
                return {
                    status: text(result.status) || 'failed',
                    error: text(result.error?.message || result.error) || '生图预设读取失败',
                    apiPresets: [],
                    imageGenerationPresets: [],
                };
            }
            return cloneSharedResources(result);
        } catch (error) {
            return {
                status: 'failed',
                error: text(error?.message) || '生图预设读取失败',
                apiPresets: [],
                imageGenerationPresets: [],
            };
        }
    }

    async function loadViewModel(input = {}) {
        const config = readConfig(input?.config);
        const shouldReadSharedResources = input.includeSharedResources === true
            || !Object.prototype.hasOwnProperty.call(input, 'testInput');
        const [rawData, sharedResources] = await Promise.all([
            Promise.resolve().then(() => tableReader()).catch(() => ({})),
            shouldReadSharedResources ? readSharedResources() : Promise.resolve(null),
        ]);
        const model = typeof characterMapping.buildCharacterMappingModel === 'function'
            ? characterMapping.buildCharacterMappingModel(rawData, config.roleMappings)
            : emptyMappingModel();
        const viewModel = {
            config: normalizeImageGenerationSettings(config),
            tables: cloneValue(Array.isArray(model?.tables) ? model.tables : []),
            resolvedMappings: cloneValue(
                Array.isArray(model?.resolvedMappings) ? model.resolvedMappings : [],
            ),
        };
        if (sharedResources) viewModel.sharedResources = sharedResources;
        if (input?.testInput && typeof input.testInput === 'object') {
            const names = text(input.testInput.names ?? input.testInput.explicitNames);
            const description = text(input.testInput.description);
            const composition = typeof characterMapping.composeCharacterImagePrompt === 'function'
                ? characterMapping.composeCharacterImagePrompt({
                    rawData,
                    mappings: config.roleMappings,
                    explicitNames: names,
                    description,
                    scanDescription: true,
                })
                : null;
            viewModel.testInput = {
                names,
                description,
                finalPrompt: text(composition?.prompt),
            };
        }
        return viewModel;
    }

    async function saveConfig(nextConfig) {
        const normalized = normalizeImageGenerationSettings(nextConfig);
        try {
            const saved = await savePhoneSetting(
                'imageGeneration',
                normalizeImageGenerationSettings(normalized),
            );
            if (saved === false) {
                return {
                    ok: false,
                    status: 'failed',
                    config: normalizeImageGenerationSettings(normalized),
                };
            }
            return {
                ok: true,
                status: 'saved',
                config: normalizeImageGenerationSettings(normalized),
            };
        } catch {
            return {
                ok: false,
                status: 'failed',
                config: normalizeImageGenerationSettings(normalized),
            };
        }
    }

    async function testGenerate(input = {}) {
        if (
            typeof characterMapping.composeCharacterImagePrompt !== 'function'
            || typeof imageGenerationService.generateAndStore !== 'function'
        ) {
            return {
                ok: false,
                status: 'unavailable',
                error: { code: 'image-generation-unavailable' },
            };
        }

        const config = readConfig(input?.config);
        const requestConfig = normalizeImageGenerationSettings({
            ...config,
            timeoutMs: input.timeoutMs ?? config.timeoutMs,
        });
        let rawData;
        try {
            rawData = await tableReader();
        } catch {
            rawData = {};
        }
        const composition = characterMapping.composeCharacterImagePrompt({
            rawData,
            mappings: config.roleMappings,
            explicitNames: text(input.explicitNames ?? input.names),
            description: text(input.description),
            scanDescription: true,
        }) || {};
        const naturalPrompt = text(composition.prompt);
        if (!naturalPrompt) {
            return {
                ok: false,
                status: 'invalid-input',
                prompt: '',
                characters: cloneValue(Array.isArray(composition.characters) ? composition.characters : []),
                unmatchedNames: cloneValue(
                    Array.isArray(composition.unmatchedNames) ? composition.unmatchedNames : [],
                ),
                mappingDiagnostics: cloneValue(
                    Array.isArray(composition.mappingDiagnostics) ? composition.mappingDiagnostics : [],
                ),
                error: { code: 'empty-image-prompt' },
            };
        }

        const shouldTranslate = config.promptTranslationEnabled
            && text(config.promptTranslationApiPresetId)
            && text(config.promptTranslationPresetId)
            && typeof qqV2PresetService?.translateImagePrompt === 'function';
        const startedAt = shouldTranslate ? Number(now()) : Number.NaN;
        const deadline = Number.isFinite(startedAt)
            ? startedAt + requestConfig.timeoutMs
            : null;
        let prompt = naturalPrompt;
        let aiOutput;
        if (shouldTranslate) {
            let translation;
            try {
                translation = await qqV2PresetService.translateImagePrompt({
                    prompt: naturalPrompt,
                    apiPresetId: config.promptTranslationApiPresetId,
                    imageGenerationPresetId: config.promptTranslationPresetId,
                    timeoutMs: deadline === null
                        ? requestConfig.timeoutMs
                        : Math.max(0, deadline - Number(now())),
                    ...(input.signal ? { signal: input.signal } : {}),
                });
            } catch (error) {
                translation = {
                    ok: false,
                    status: 'failed',
                    error: {
                        code: error?.code || 'image-prompt-translation-failed',
                        message: error?.message || '生图提示词转换失败',
                    },
                };
            }

            if (translation?.ok === true) {
                const filteredOutput = filterImagePromptOutput(
                    translation.content,
                    config,
                );
                prompt = filteredOutput;
                aiOutput = filteredOutput;
            } else if (translation?.status === 'timeout' || translation?.status === 'cancelled') {
                return {
                    ok: false,
                    status: translation.status,
                    prompt: naturalPrompt,
                    characters: cloneValue(Array.isArray(composition.characters) ? composition.characters : []),
                    unmatchedNames: cloneValue(
                        Array.isArray(composition.unmatchedNames) ? composition.unmatchedNames : [],
                    ),
                    mappingDiagnostics: cloneValue(
                        Array.isArray(composition.mappingDiagnostics) ? composition.mappingDiagnostics : [],
                    ),
                    error: cloneValue(translation.error || {
                        code: translation.status === 'timeout'
                            ? 'image-prompt-translation-timeout'
                            : 'image-prompt-translation-cancelled',
                    }),
                };
            }

            if (deadline !== null && deadline - Number(now()) <= 0) {
                return {
                    ok: false,
                    status: 'timeout',
                    prompt: naturalPrompt,
                    characters: cloneValue(Array.isArray(composition.characters) ? composition.characters : []),
                    unmatchedNames: cloneValue(
                        Array.isArray(composition.unmatchedNames) ? composition.unmatchedNames : [],
                    ),
                    mappingDiagnostics: cloneValue(
                        Array.isArray(composition.mappingDiagnostics) ? composition.mappingDiagnostics : [],
                    ),
                    error: { code: 'image-generation-timeout', message: '图片生成总超时' },
                };
            }
        }

        let generationResult;
        try {
            generationResult = await imageGenerationService.generateAndStore({
                prompt,
                width: null,
                height: null,
                negativePrompt: text(input.negativePrompt),
                change: text(input.change),
                timeoutMs: deadline === null
                    ? requestConfig.timeoutMs
                    : Math.max(0, deadline - Number(now())),
                folder: text(input.folder) || 'yuzi-phone-generated',
                filename: text(input.filename) || createDefaultTestFilename(),
            });
        } catch {
            generationResult = {
                ok: false,
                status: 'failed',
                error: { code: 'image-generation-failed' },
            };
        }

        return {
            ...(generationResult && typeof generationResult === 'object'
                ? cloneValue(generationResult)
                : {
                    ok: false,
                    status: 'failed',
                    error: { code: 'image-generation-failed' },
                }),
            prompt: naturalPrompt,
            ...(aiOutput !== undefined ? { aiOutput } : {}),
            characters: cloneValue(Array.isArray(composition.characters) ? composition.characters : []),
            unmatchedNames: cloneValue(
                Array.isArray(composition.unmatchedNames) ? composition.unmatchedNames : [],
            ),
            mappingDiagnostics: cloneValue(
                Array.isArray(composition.mappingDiagnostics) ? composition.mappingDiagnostics : [],
            ),
        };
    }

    return Object.freeze({
        loadViewModel,
        saveConfig,
        testGenerate,
    });
}
