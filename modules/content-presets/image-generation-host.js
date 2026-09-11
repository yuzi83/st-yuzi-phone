import { createImageFileBridge } from '../integration/image-file-bridge.js';
import { getTableData } from '../phone-core/data-api.js';
import { resolveStableChatId } from '../integration/chat-identity.js';
import { getPhoneSettings, normalizeImageGenerationSettings, subscribePhoneSettingsUpdates } from '../settings.js';
import { createImageGenerationOrchestrator } from '../image-generation/orchestration.js';
import { sharedPhoneImageGenerationRuntime } from '../image-generation/runtime.js';
import { createStableImageOwnershipRepository } from '../image-generation/stable-image-ownership-repository.js';
import { createStableImageOwnershipService } from '../image-generation/stable-image-ownership.js';
import { createTableDisplayImageGenerationService } from '../image-generation/table-display-image-generation-service.js';
import { getQQV2Facade } from '../qq-v2/runtime/default-runtime.js';
import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import { buildActiveContentPresetDisplayDirectory, contentPresetDisplayModelId } from './display-directory.js';
import { buildActiveContentPresetImageGenerationDirectory } from './image-generation-directory.js';
import { createContentPresetImageActions } from './image-actions.js';
import { getContentPresetIndexSnapshot } from './index-state.js';
import { listPresetRecords } from './repository.js';

const OWNERSHIP_DB_NAME = 'yuzi-phone-table-image-ownership';
const OWNERSHIP_DB_VERSION = 1;
const OWNERSHIP_STORE_NAME = 'ownership';

function text(value) {
    return String(value ?? '').trim();
}

function asMap(value) {
    return value instanceof Map ? value : new Map(Object.entries(value || {}));
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('图片归属 IndexedDB 请求失败'));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('图片归属 IndexedDB 事务失败'));
        transaction.onabort = () => reject(transaction.error || new Error('图片归属 IndexedDB 事务中止'));
    });
}

/**
 * 小而封闭的浏览器持久层；领域 ownership service 继续只依赖 read/write seam。
 * 无 IndexedDB 的 Node 环境仅在测试注入替身时使用，不把内存回退伪装成持久化。
 */
function createIndexedDbOwnershipStore(indexedDb = globalThis.indexedDB) {
    let databasePromise = null;
    const openDatabase = () => {
        if (databasePromise) return databasePromise;
        if (!indexedDb?.open) return Promise.reject(new Error('浏览器不支持图片归属 IndexedDB'));
        databasePromise = new Promise((resolve, reject) => {
            let request;
            try {
                request = indexedDb.open(OWNERSHIP_DB_NAME, OWNERSHIP_DB_VERSION);
            } catch (error) {
                reject(error);
                return;
            }
            request.onerror = () => reject(request.error || new Error('打开图片归属 IndexedDB 失败'));
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(OWNERSHIP_STORE_NAME)) {
                    database.createObjectStore(OWNERSHIP_STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
        return databasePromise;
    };

    return Object.freeze({
        async read(key) {
            const database = await openDatabase();
            const transaction = database.transaction(OWNERSHIP_STORE_NAME, 'readonly');
            const result = await requestResult(transaction.objectStore(OWNERSHIP_STORE_NAME).get(key));
            await transactionDone(transaction);
            return result || null;
        },
        async write(record) {
            const database = await openDatabase();
            const transaction = database.transaction(OWNERSHIP_STORE_NAME, 'readwrite');
            transaction.objectStore(OWNERSHIP_STORE_NAME).put(record);
            await transactionDone(transaction);
        },
    });
}

function normalizeConfig(getSettings) {
    return normalizeImageGenerationSettings(getSettings()?.imageGeneration);
}

function tableEnabled(config, sheetKey) {
    return config?.enabled === true && tableDisplayEnabled(config, sheetKey);
}

function tableDisplayEnabled(config, sheetKey) {
    const choices = config?.tableDisplayEnabledBySheetKey;
    return !choices || typeof choices !== 'object' || choices[sheetKey] !== false;
}

function composeDescription(promptValues = {}) {
    return Object.entries(promptValues)
        .map(([field, value]) => {
            const rendered = text(value);
            return rendered ? `${text(field)}：${rendered}` : '';
        })
        .filter(Boolean)
        .join('\n');
}

function tableLabelBySheetKey(rawData, sheetKey) {
    return buildTableNavigationCatalog(rawData)
        .find(entry => entry.sheetKey === sheetKey)?.tableName || sheetKey;
}

function pageBindingIsActive(index, source) {
    const binding = asMap(index?.pageByTable || index?.activeByTable).get(source.originSheetKey);
    return text(binding?.presetId) === text(source.presetId)
        && text(binding?.itemId) === text(source.itemId);
}

function displayBindingIsActive(index, rawData, source) {
    const directory = buildActiveContentPresetDisplayDirectory(rawData, asMap(index?.popupByTable));
    const modelId = text(source.modelId) || contentPresetDisplayModelId(source.presetId, source.displayId);
    const definition = directory.byModelId.get(modelId);
    return Boolean(definition
        && text(definition.presetId) === text(source.presetId)
        && text(definition.displayId) === text(source.displayId));
}

function createDefaultTableImageService(options) {
    const getSettings = options.getPhoneSettings || getPhoneSettings;
    const imageRuntime = options.imageGenerationRuntime || sharedPhoneImageGenerationRuntime;
    const imageFiles = options.imageFiles || createImageFileBridge();
    const getFacade = options.getQQV2Facade || getQQV2Facade;
    const store = options.ownershipStore || createIndexedDbOwnershipStore(options.indexedDB);
    const repository = options.ownershipRepository || createStableImageOwnershipRepository({ store });
    const ownershipService = options.ownershipService || createStableImageOwnershipService({
        store: repository,
        now: options.now,
    });
    const translateImagePrompt = async input => {
        const facade = getFacade?.();
        if (typeof facade?.intent?.translateImagePrompt !== 'function') {
            return {
                ok: false,
                status: 'unavailable',
                error: { code: 'image-prompt-translation-unavailable', message: 'QQ 提示词转换服务不可用' },
            };
        }
        return facade.intent.translateImagePrompt(input);
    };
    const sharedOrchestrator = createImageGenerationOrchestrator({
        generateAndStore: imageRuntime?.generateAndStore?.bind(imageRuntime),
        translateImagePrompt,
        now: options.now,
    });
    const orchestrator = Object.freeze({
        async generate(input = {}) {
            const config = normalizeConfig(getSettings);
            return sharedOrchestrator.generate({
                ...input,
                timeoutMs: config.timeoutMs,
                ...(config.promptTranslationEnabled
                    ? {
                        translation: {
                            apiPresetId: config.promptTranslationApiPresetId,
                            imageGenerationPresetId: config.promptTranslationPresetId,
                        },
                    }
                    : {}),
                filterSettings: config,
            });
        },
    });

    return createTableDisplayImageGenerationService({
        async storeImage(image) {
            if (!(image instanceof Blob) || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.type) || image.size === 0 || image.size > 8 * 1024 * 1024) {
                return { ok: false, status: 'invalid-input', reason: 'invalid-image' };
            }
            const bytes = new Uint8Array(await image.arrayBuffer());
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            return imageFiles.save({ imageData: btoa(binary), format: image.type.slice(6), folder: 'yuzi-phone-generated' });
        },
        ownershipService,
        orchestrator,
        isTableEnabled: async ({ tableName }) => tableEnabled(normalizeConfig(getSettings), text(tableName)),
        isCurrentTarget: async ({ target, requestContext }) => {
            if (typeof requestContext?.isStillCurrent !== 'function') return false;
            return requestContext.isStillCurrent(target);
        },
        composePrompt: async ({ promptValues, canvas }) => {
            const description = [composeDescription(promptValues), text(canvas?.promptSuffix)].filter(Boolean).join('\n');
            if (!description || typeof imageRuntime?.composeCharacterImagePrompt !== 'function') return '';
            const composition = await imageRuntime.composeCharacterImagePrompt({
                explicitNames: [],
                description,
                scanDescription: true,
            });
            return text(typeof composition === 'string' ? composition : composition?.prompt);
        },
    });
}

/**
 * Host composition for page and inline display image actions.
 *
 * It is the only place where image configuration, QQ's shared prompt path,
 * stable ownership persistence, currently applied bindings and the author
 * action layer meet. Renderers merely ask it for actions.
 */
export function createContentPresetImageGenerationHost(options = {}) {
    const getSettings = options.getPhoneSettings || getPhoneSettings;
    const getIndex = options.getContentPresetIndexSnapshot || getContentPresetIndexSnapshot;
    const getRawData = options.getRawData || getTableData;
    const getChatScope = options.getChatScope || resolveStableChatId;
    const listRecords = options.listPresetRecords || listPresetRecords;
    const subscribeSettings = options.subscribeSettings || subscribePhoneSettingsUpdates;
    const imageGenerationService = options.imageGenerationService || createDefaultTableImageService({
        ...options,
        getPhoneSettings: getSettings,
    });

    const isImageGenerationEnabled = async () => normalizeConfig(getSettings)?.enabled === true;
    const isTableEnabled = async ({ sheetKey }) => tableDisplayEnabled(normalizeConfig(getSettings), sheetKey);
    const isSourceActive = async ({ source }) => {
        const index = getIndex?.() || {};
        const rawData = getRawData?.() || {};
        return source?.kind === 'page'
            ? pageBindingIsActive(index, source)
            : source?.kind === 'display'
                ? displayBindingIsActive(index, rawData, source)
                : false;
    };
    const makeActions = ({ declaration, source, isCurrent }) => createContentPresetImageActions({
        declaration,
        source,
        getRawData,
        getChatScope,
        isSourceActive,
        isCurrent,
        isImageGenerationEnabled,
        isTableEnabled,
        subscribeSettings,
        imageGenerationService,
    });

    return Object.freeze({
        createPageActions({ item, presetId, itemId, sheetKey, isCurrent } = {}) {
            if (!item?.imageGeneration) return Object.freeze({});
            return makeActions({
                declaration: item,
                source: Object.freeze({
                    kind: 'page',
                    presetId: text(presetId),
                    itemId: text(itemId),
                    originSheetKey: text(sheetKey),
                }),
                isCurrent,
            });
        },
        createInlineDisplayActions({ display, presetId, displayId, modelId, isCurrent } = {}) {
            if (display?.kind !== 'inline' || !display?.imageGeneration) return Object.freeze({});
            return makeActions({
                declaration: display,
                source: Object.freeze({
                    kind: 'display',
                    presetId: text(presetId),
                    displayId: text(displayId),
                    modelId: text(modelId),
                }),
                isCurrent,
            });
        },
        async getTableDisplaySources({ rawData = getRawData?.() || {} } = {}) {
            let records;
            try {
                records = await listRecords();
            } catch {
                return Object.freeze([]);
            }
            const directory = buildActiveContentPresetImageGenerationDirectory(
                rawData,
                records,
                asMap(getIndex?.()?.pageByTable || getIndex?.()?.activeByTable),
                asMap(getIndex?.()?.popupByTable),
            );
            return Object.freeze([...directory.bySheetKey.entries()].map(([sheetKey, registrations]) => Object.freeze({
                sheetKey,
                tableName: tableLabelBySheetKey(rawData, sheetKey),
                usageCount: registrations.length,
            })));
        },
    });
}

export const contentPresetImageGenerationHost = createContentPresetImageGenerationHost();
