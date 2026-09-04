import { QQ_V2_BUILT_IN_PROMPT_PRESET_IDS } from '../domain/prompt-preset-ids.js';
import {
    normalizeQQV2TagName,
    normalizeQQV2TagNames,
    parseQQV2TagInput,
} from '../domain/story-context-tags.js';

const STORAGE_KEY = 'qq-v2.runtime-settings';
const LEGACY_WORLDBOOK_ENABLED_KEY = 'worldbookInjectionEnabled';
const WORLDBOOK_LIGHTS = new Set(['blue', 'green']);
const WORLDBOOK_TIME_UNITS = new Set(['hour', 'day', 'month', 'year']);
const DEFAULT_WORLDBOOK_INJECTION_COUNT = 30;
const GLOBAL_PRESET_DEFAULTS = Object.freeze({
    activeApiPresetId: '',
    privateReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply,
    privateProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive,
    groupReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupReply,
    groupProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupProactive,
});
const GLOBAL_RUNTIME_DEFAULTS = Object.freeze({
    hostContextTurns: 3,
    conversationHistoryLimit: 100,
    hostContextExtractTag: 'content',
    hostContextExcludeTags: Object.freeze([]),
    proactive: Object.freeze({ enabled: false, everyTurns: 5, privateWeight: 50 }),
    worldbook: Object.freeze({
        enabled: false,
        timeWindow: Object.freeze({ mode: 'relative', value: 1, unit: 'month' }),
        injectionCount: DEFAULT_WORLDBOOK_INJECTION_COUNT,
        light: 'blue',
        depth: 999,
        keywords: Object.freeze([]),
    }),
});

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clone(value) {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

function normalizeEveryTurns(value, fallback = 5) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function normalizeTimeWindow(value, fallback = GLOBAL_RUNTIME_DEFAULTS.worldbook.timeWindow) {
    if (value?.mode === 'all') return { mode: 'all' };
    const number = Number(value?.value);
    return {
        mode: 'relative',
        value: Number.isInteger(number) && number > 0 ? number : fallback.value,
        unit: WORLDBOOK_TIME_UNITS.has(value?.unit) ? value.unit : fallback.unit,
    };
}

function normalizeKeywords(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map((item) => asText(item, 160)).filter((item) => {
        const normalized = item.toLocaleLowerCase('zh-CN');
        if (!item || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function normalizeSettings(value) {
    const source = asObject(value);
    const proactive = asObject(source.proactive);
    const worldbook = asObject(source.worldbook);
    return {
        activeApiPresetId: asText(source.activeApiPresetId, 256),
        privateReplyPresetId: asText(source.privateReplyPresetId, 256)
            || GLOBAL_PRESET_DEFAULTS.privateReplyPresetId,
        privateProactivePresetId: asText(source.privateProactivePresetId, 256)
            || GLOBAL_PRESET_DEFAULTS.privateProactivePresetId,
        groupReplyPresetId: asText(source.groupReplyPresetId, 256)
            || GLOBAL_PRESET_DEFAULTS.groupReplyPresetId,
        groupProactivePresetId: asText(source.groupProactivePresetId, 256)
            || GLOBAL_PRESET_DEFAULTS.groupProactivePresetId,
        hostContextTurns: normalizeNonNegativeInteger(
            source.hostContextTurns,
            GLOBAL_RUNTIME_DEFAULTS.hostContextTurns,
        ),
        conversationHistoryLimit: normalizeNonNegativeInteger(
            source.conversationHistoryLimit,
            GLOBAL_RUNTIME_DEFAULTS.conversationHistoryLimit,
        ),
        hostContextExtractTag: Object.hasOwn(source, 'hostContextExtractTag')
            && source.hostContextExtractTag !== undefined
            && source.hostContextExtractTag !== null
            ? (asText(source.hostContextExtractTag)
                ? normalizeQQV2TagName(source.hostContextExtractTag) || GLOBAL_RUNTIME_DEFAULTS.hostContextExtractTag
                : '')
            : GLOBAL_RUNTIME_DEFAULTS.hostContextExtractTag,
        hostContextExcludeTags: normalizeQQV2TagNames(source.hostContextExcludeTags),
        worldbook: {
            enabled: worldbook.enabled === true,
            timeWindow: normalizeTimeWindow(worldbook.timeWindow),
            injectionCount: normalizeNonNegativeInteger(
                worldbook.injectionCount,
                DEFAULT_WORLDBOOK_INJECTION_COUNT,
            ),
            light: WORLDBOOK_LIGHTS.has(worldbook.light)
                ? worldbook.light
                : GLOBAL_RUNTIME_DEFAULTS.worldbook.light,
            depth: normalizeNonNegativeInteger(worldbook.depth, GLOBAL_RUNTIME_DEFAULTS.worldbook.depth),
            keywords: normalizeKeywords(worldbook.keywords),
        },
        proactive: {
            enabled: proactive.enabled === true,
            everyTurns: normalizeEveryTurns(proactive.everyTurns),
            privateWeight: Math.max(0, Math.min(100, normalizeNonNegativeInteger(
                proactive.privateWeight,
                GLOBAL_RUNTIME_DEFAULTS.proactive.privateWeight,
            ))),
        },
    };
}

function ensureSharedResources(state) {
    if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
        state.sharedResources = {};
    }
    return state.sharedResources;
}

function legacyScopeSettings(state, scopeId, sharedResources) {
    const scope = state.scopes?.[asText(scopeId, 512)]
        || Object.values(asObject(state.scopes))[0];
    const settings = asObject(scope?.settings);
    const worldbook = asObject(settings.worldbook);
    const enabled = Object.hasOwn(sharedResources, LEGACY_WORLDBOOK_ENABLED_KEY)
        ? sharedResources[LEGACY_WORLDBOOK_ENABLED_KEY] === true
        : worldbook.enabled === true;
    return {
        ...settings,
        worldbook: { ...worldbook, enabled },
    };
}

function backfillSharedSettings(current, legacy) {
    const source = asObject(current);
    const fallback = asObject(legacy);
    const worldbook = asObject(source.worldbook);
    const fallbackWorldbook = asObject(fallback.worldbook);
    const proactive = asObject(source.proactive);
    const fallbackProactive = asObject(fallback.proactive);
    return {
        ...source,
        hostContextTurns: Object.hasOwn(source, 'hostContextTurns')
            ? source.hostContextTurns
            : fallback.hostContextTurns,
        conversationHistoryLimit: Object.hasOwn(source, 'conversationHistoryLimit')
            ? source.conversationHistoryLimit
            : fallback.conversationHistoryLimit,
        hostContextExtractTag: Object.hasOwn(source, 'hostContextExtractTag')
            ? source.hostContextExtractTag
            : fallback.hostContextExtractTag,
        hostContextExcludeTags: Object.hasOwn(source, 'hostContextExcludeTags')
            ? source.hostContextExcludeTags
            : fallback.hostContextExcludeTags,
        worldbook: {
            ...worldbook,
            enabled: Object.hasOwn(worldbook, 'enabled') ? worldbook.enabled : fallbackWorldbook.enabled,
            timeWindow: Object.hasOwn(worldbook, 'timeWindow') ? worldbook.timeWindow : fallbackWorldbook.timeWindow,
            injectionCount: Object.hasOwn(worldbook, 'injectionCount')
                ? worldbook.injectionCount
                : fallbackWorldbook.injectionCount,
            light: Object.hasOwn(worldbook, 'light') ? worldbook.light : fallbackWorldbook.light,
            depth: Object.hasOwn(worldbook, 'depth') ? worldbook.depth : fallbackWorldbook.depth,

            keywords: Object.hasOwn(worldbook, 'keywords') ? worldbook.keywords : fallbackWorldbook.keywords,
        },
        proactive: {
            ...proactive,
            enabled: Object.hasOwn(proactive, 'enabled') ? proactive.enabled : fallbackProactive.enabled,
            everyTurns: Object.hasOwn(proactive, 'everyTurns') ? proactive.everyTurns : fallbackProactive.everyTurns,
            privateWeight: Object.hasOwn(proactive, 'privateWeight')
                ? proactive.privateWeight
                : fallbackProactive.privateWeight,
        },
    };
}

function resolveSettings(state, scopeId) {
    const sharedResources = asObject(state?.sharedResources);
    const legacy = legacyScopeSettings(state, scopeId, sharedResources);
    return Object.hasOwn(sharedResources, STORAGE_KEY)
        ? normalizeSettings(backfillSharedSettings(sharedResources[STORAGE_KEY], legacy))
        : normalizeSettings(legacy);
}

function settingsNeedMigration(state, scopeId) {
    const sharedResources = asObject(state?.sharedResources);
    if (!Object.hasOwn(sharedResources, STORAGE_KEY)) return true;
    if (Object.values(asObject(state?.scopes)).some((scope) => (
        Object.hasOwn(asObject(scope?.settings), 'proactive')
    ))) {
        return true;
    }
    return JSON.stringify(sharedResources[STORAGE_KEY]) !== JSON.stringify(resolveSettings(state, scopeId));
}

function migrateSettings(state, scopeId) {
    const sharedResources = ensureSharedResources(state);
    sharedResources[STORAGE_KEY] = resolveSettings(state, scopeId);
    clearLegacyScopeProactiveSettings(state);
    return sharedResources[STORAGE_KEY];
}

function clearLegacyScopeProactiveSettings(state) {
    for (const scope of Object.values(asObject(state.scopes))) {
        const settings = scope?.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) continue;
        delete settings.proactive;
    }
}

function applyPatch(current, patch) {
    const source = asObject(patch);
    const next = normalizeSettings(current);
    if (Object.hasOwn(source, 'activeApiPresetId')) {
        next.activeApiPresetId = asText(source.activeApiPresetId, 256);
    }
    for (const key of ['privateReplyPresetId', 'privateProactivePresetId', 'groupReplyPresetId', 'groupProactivePresetId']) {
        if (Object.hasOwn(source, key)) next[key] = asText(source[key], 256) || GLOBAL_PRESET_DEFAULTS[key];
    }
    for (const key of ['hostContextTurns', 'conversationHistoryLimit']) {
        if (!Object.hasOwn(source, key)) continue;
        const number = Number(source[key]);
        if (!Number.isInteger(number) || number < 0) throw new RangeError(`${key} must be a non-negative integer`);
        next[key] = number;
    }
    if (Object.hasOwn(source, 'hostContextExtractTag')) {
        const rawTag = asText(source.hostContextExtractTag);
        if (rawTag && !normalizeQQV2TagName(rawTag)) {
            throw new RangeError('hostContextExtractTag must be a valid tag name');
        }
        next.hostContextExtractTag = rawTag ? normalizeQQV2TagName(rawTag) : '';
    }
    if (Object.hasOwn(source, 'hostContextExcludeTags')) {
        const parsedTags = parseQQV2TagInput(source.hostContextExcludeTags);
        if (parsedTags.invalid.length > 0) {
            throw new RangeError('hostContextExcludeTags must contain valid tag names');
        }
        next.hostContextExcludeTags = parsedTags.tags;
    }
    const worldbook = asObject(source.worldbook);
    if (Object.hasOwn(worldbook, 'enabled')) next.worldbook.enabled = worldbook.enabled === true;
    if (Object.hasOwn(worldbook, 'timeWindow')) {
        const timeWindow = worldbook.timeWindow;
        if (timeWindow?.mode !== 'all' && (!WORLDBOOK_TIME_UNITS.has(timeWindow?.unit)
            || !Number.isInteger(Number(timeWindow?.value)) || Number(timeWindow.value) <= 0)) {
            throw new RangeError('worldbook.timeWindow is invalid');
        }
        next.worldbook.timeWindow = normalizeTimeWindow(timeWindow);
    }
    if (Object.hasOwn(worldbook, 'injectionCount')) {
        const injectionCount = Number(worldbook.injectionCount);
        if (!Number.isInteger(injectionCount) || injectionCount < 0) {
            throw new RangeError('worldbook.injectionCount must be a non-negative integer');
        }
        next.worldbook.injectionCount = injectionCount;
    }
    if (Object.hasOwn(worldbook, 'light')) {
        if (!WORLDBOOK_LIGHTS.has(worldbook.light)) throw new RangeError('worldbook.light is invalid');
        next.worldbook.light = worldbook.light;
    }
    if (Object.hasOwn(worldbook, 'depth')) {
        const depth = Number(worldbook.depth);
        if (!Number.isInteger(depth) || depth < 0) throw new RangeError('worldbook.depth must be a non-negative integer');
        next.worldbook.depth = depth;
    }
    if (Object.hasOwn(worldbook, 'keywords')) next.worldbook.keywords = normalizeKeywords(worldbook.keywords);
    const proactive = asObject(source.proactive);
    if (Object.hasOwn(proactive, 'enabled')) next.proactive.enabled = proactive.enabled === true;
    if (Object.hasOwn(proactive, 'everyTurns')) {
        const everyTurns = Number(proactive.everyTurns);
        if (!Number.isInteger(everyTurns) || everyTurns <= 0) {
            throw new RangeError('主动消息轮数必须是正整数');
        }
        next.proactive.everyTurns = everyTurns;
    }
    if (Object.hasOwn(proactive, 'privateWeight')) {
        const privateWeight = Number(proactive.privateWeight);
        if (!Number.isInteger(privateWeight) || privateWeight < 0 || privateWeight > 100) {
            throw new RangeError('私聊主动回复占比必须是 0 到 100 的整数');
        }
        next.proactive.privateWeight = privateWeight;
    }
    return next;
}

export function createQQV2GlobalRuntimeSettings(options = {}) {
    const stateStore = options.stateStore;
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.transact !== 'function') {
        throw new TypeError('QQ v2 global runtime settings need a state store');
    }

    const assertScopeMutationCurrent = (scopeId, operationOptions = {}) => {
        if (operationOptions?.allowInactiveScope === true || !operationOptions?.scopeSession) return;
        const scopeSession = operationOptions.scopeSession;
        try {
            if (asText(scopeSession.scopeId, 512) !== asText(scopeId, 512)) throw new Error('scope mismatch');
            if (typeof scopeSession.assertCurrent === 'function') scopeSession.assertCurrent();
            else if (scopeSession.isCurrent?.() !== true) throw new Error('scope inactive');
            if (scopeSession.signal?.aborted === true) throw new Error('scope aborted');
            return;
        } catch {
            const error = new Error('QQ 作用域已失效');
            error.code = 'scope_inactive';
            throw error;
        }
    };

    const transactScoped = (scopeId, operationOptions, mutator) => stateStore.transact((state) => {
        assertScopeMutationCurrent(scopeId, operationOptions);
        return mutator(state);
    });

    return Object.freeze({
        async get(scopeId = '', operationOptions = {}) {
            assertScopeMutationCurrent(scopeId, operationOptions);
            const state = await stateStore.read();
            assertScopeMutationCurrent(scopeId, operationOptions);
            if (!settingsNeedMigration(state, scopeId)) {
                return clone(resolveSettings(state, scopeId));
            }
            return transactScoped(scopeId, operationOptions, (state) => clone(migrateSettings(state, scopeId)));
        },
        async update(scopeId = '', patch = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const current = migrateSettings(state, scopeId);
                const next = applyPatch(current, patch);
                const proactiveChanged = next.proactive.enabled !== current.proactive.enabled
                    || next.proactive.everyTurns !== current.proactive.everyTurns
                    || next.proactive.privateWeight !== current.proactive.privateWeight;
                state.sharedResources[STORAGE_KEY] = next;
                return { settings: clone(next), proactiveChanged };
            });
        },
        async clearPresetReferences(scopeId = '', presetId, settingKeys = []) {
            const id = asText(presetId, 256);
            if (!id) return 0;
            return stateStore.transact((state) => {
                const settings = migrateSettings(state, scopeId);
                let cleared = 0;
                for (const key of settingKeys) {
                    if (!Object.hasOwn(GLOBAL_PRESET_DEFAULTS, key) || settings[key] !== id) continue;
                    settings[key] = GLOBAL_PRESET_DEFAULTS[key];
                    cleared += 1;
                }
                state.sharedResources[STORAGE_KEY] = normalizeSettings(settings);
                return cleared;
            });
        },
    });
}
