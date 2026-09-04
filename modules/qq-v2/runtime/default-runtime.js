import { createQQV2HostAdapter } from '../host/adapter.js';
import { createQQV2ProductionRuntime } from '../application/production-runtime.js';
import { createMemoryQQV2StateStore } from '../storage/state-store.js';
import { Logger } from '../../error-handler.js';
import { sharedPhoneImageGenerationRuntime } from '../../image-generation/runtime.js';
import { getPhoneSettings } from '../../settings.js';

const IDLE_STATUS = Object.freeze({
    phase: 'idle',
    scopeId: '',
    epoch: 0,
});

export function createQQV2DefaultProductionRuntime(options = {}) {
    const imageGenerationRuntime = options.imageGenerationRuntime
        || sharedPhoneImageGenerationRuntime;
    const createProductionRuntime = typeof options.createProductionRuntime === 'function'
        ? options.createProductionRuntime
        : createQQV2ProductionRuntime;
    return createProductionRuntime({
        host: options.host,
        logger: options.logger,
        ...(options.stateStore ? { stateStore: options.stateStore } : {}),
        imageGenerationService: imageGenerationRuntime,
        getImageGenerationConfig: () => getPhoneSettings()?.imageGeneration,
        composeCharacterImagePrompt: input => (
            imageGenerationRuntime.composeCharacterImagePrompt(input)
        ),
    });
}

/**
 * QQ v2 的默认运行入口。工厂同时是可注入的公开 seam，生产入口只使用其默认依赖。
 */
export function createQQV2RuntimeEntry(options = {}) {
    const logger = options.logger || Logger.withScope({
        scope: 'qq-v2/runtime',
        feature: 'qq-v2',
    });
    const createHostAdapter = typeof options.createHostAdapter === 'function'
        ? options.createHostAdapter
        : () => createQQV2HostAdapter();
    const createRuntime = typeof options.createRuntime === 'function'
        ? options.createRuntime
        : ({ host }) => {
            // The extension always uses IndexedDB in SillyTavern. The tiny
            // non-browser fallback keeps this public entry testable in Node.
            const stateStore = typeof window === 'undefined' && !globalThis.indexedDB
                ? createMemoryQQV2StateStore()
                : undefined;
            return createQQV2DefaultProductionRuntime({
                host,
                logger,
                ...(stateStore ? { stateStore } : {}),
            });
        };
    let runtime = null;
    let hostError = null;

    const ensureRuntime = () => {
        if (runtime) return runtime;
        runtime = createRuntime({ host: createHostAdapter() });
        return runtime;
    };

    const invokeRuntime = async (callback) => {
        try {
            const result = await callback();
            hostError = null;
            return result;
        } catch (error) {
            if (error?.code === 'host_unavailable') {
                hostError = error;
                return null;
            }
            throw error;
        }
    };

    return Object.freeze({
        initialize() {
            return invokeRuntime(() => ensureRuntime().initialize());
        },
        handleChatChanged(...args) {
            return runtime
                ? invokeRuntime(() => runtime.handleChatChanged(...args))
                : Promise.resolve(null);
        },
        handleChatDeleted(...args) {
            return runtime
                ? invokeRuntime(() => runtime.handleChatDeleted(...args))
                : Promise.resolve(null);
        },
        handleGroupChatDeleted(...args) {
            return runtime
                ? invokeRuntime(() => runtime.handleGroupChatDeleted(...args))
                : Promise.resolve(null);
        },
        handleCharacterMessageRendered(...args) {
            return runtime
                ? invokeRuntime(() => runtime.handleCharacterMessageRendered(...args))
                : Promise.resolve(null);
        },
        handleMessageReceived(...args) {
            return runtime
                ? invokeRuntime(() => runtime.handleMessageReceived(...args))
                : Promise.resolve(null);
        },
        getStatus() {
            const status = runtime?.getStatus() || IDLE_STATUS;
            if (!hostError) return status;
            return Object.freeze({
                ...status,
                phase: 'unavailable',
                scopeId: '',
                errorCode: 'host_unavailable',
            });
        },
        getFacade() {
            return runtime?.getFacade?.() || null;
        },
        subscribeProactiveMessages(listener) {
            return runtime?.subscribeProactiveMessages?.(listener) || (() => {});
        },
        destroy() {
            const activeRuntime = runtime;
            runtime = null;
            hostError = null;
            activeRuntime?.destroy();
        },
    });
}

const defaultRuntimeEntry = createQQV2RuntimeEntry();

export const initializeQQV2Runtime = () => defaultRuntimeEntry.initialize();
export const handleQQV2ChatChanged = (...args) => defaultRuntimeEntry.handleChatChanged(...args);
export const handleQQV2ChatDeleted = (...args) => defaultRuntimeEntry.handleChatDeleted(...args);
export const handleQQV2GroupChatDeleted = (...args) => defaultRuntimeEntry.handleGroupChatDeleted(...args);
export const handleQQV2CharacterMessageRendered = (...args) => defaultRuntimeEntry.handleCharacterMessageRendered(...args);
export const handleQQV2MessageReceived = (...args) => defaultRuntimeEntry.handleMessageReceived(...args);
export const getQQV2RuntimeStatus = () => defaultRuntimeEntry.getStatus();
export const getQQV2Facade = () => defaultRuntimeEntry.getFacade();
export const subscribeQQV2ProactiveMessages = listener => (
    defaultRuntimeEntry.subscribeProactiveMessages(listener)
);
export const destroyQQV2Runtime = () => defaultRuntimeEntry.destroy();
