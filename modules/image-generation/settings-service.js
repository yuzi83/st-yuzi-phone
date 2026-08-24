import {
    getPhoneSettings as getStoredPhoneSettings,
    savePhoneSetting as persistPhoneSetting,
    normalizeImageGenerationSettings,
} from '../settings.js';

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

    function readConfig(override) {
        if (override && typeof override === 'object' && !Array.isArray(override)) {
            return normalizeImageGenerationSettings(override);
        }
        const settings = getPhoneSettings();
        return normalizeImageGenerationSettings(settings?.imageGeneration);
    }

    async function loadViewModel(input = {}) {
        const config = readConfig(input?.config);
        let rawData;
        try {
            rawData = await tableReader();
        } catch {
            rawData = {};
        }
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

        const config = readConfig();
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
        const prompt = text(composition.prompt);
        if (!prompt) {
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

        let generationResult;
        try {
            generationResult = await imageGenerationService.generateAndStore({
                prompt,
                width: null,
                height: null,
                negativePrompt: text(input.negativePrompt),
                change: text(input.change),
                timeoutMs: requestConfig.timeoutMs,
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
            prompt,
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
