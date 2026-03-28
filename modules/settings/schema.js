import { Logger } from '../error-handler.js';

export const extensionName = 'YuziPhone';

export const defaultSettings = {
    enabled: true,
    phoneToggleX: null,
    phoneToggleY: null,
    phoneContainerX: null,
    phoneContainerY: null,
    phoneContainerWidth: 320,
    phoneContainerHeight: 640,
    backgroundImage: null,
    appIcons: {},
    hideTableCountBadge: false,
    hiddenTableApps: {},
    beautifyTemplateSourceModeSpecial: 'builtin',
    beautifyTemplateSourceModeGeneric: 'builtin',
    beautifyActiveTemplateIdsSpecial: {
        special_message: 'builtin.special.message.v1',
        special_moments: 'builtin.special.moments.v1',
        special_forum: 'builtin.special.forum.v1',
    },
    beautifyActiveTemplateIdGeneric: 'builtin.generic.table.v1',
    dockIconSize: 48,
    phoneToggleStyleSize: 44,
    phoneToggleStyleShape: 'rounded',
    phoneToggleCoverImage: null,
    phoneChat: {
        useStoryContext: true,
        storyContextTurns: 3,
        apiPresetName: '',
        maxHistoryMessages: 12,
        maxReplyTokens: 900,
        requestTimeoutMs: 90000,
        worldbookMaxEntries: 24,
        worldbookMaxChars: 6000,
    },
    phoneAiInstruction: {
        currentPresetName: '',
        lastOpenedPresetName: '',
        migratedLegacyTemplates: false,
        presets: [],
    },
    worldbookSelection: {
        sourceMode: 'manual',
        selectedWorldbook: '',
        entries: {},
    },
};

const validationRules = {
    phoneContainerWidth: { min: 200, max: 800, type: 'number' },
    phoneContainerHeight: { min: 400, max: 1200, type: 'number' },
    phoneToggleX: { min: 0, max: 10000, type: 'number', nullable: true },
    phoneToggleY: { min: 0, max: 10000, type: 'number', nullable: true },
    phoneContainerX: { min: 0, max: 10000, type: 'number', nullable: true },
    phoneContainerY: { min: 0, max: 10000, type: 'number', nullable: true },
    dockIconSize: { min: 32, max: 72, type: 'number' },
    phoneToggleStyleSize: { min: 32, max: 72, type: 'number' },
    phoneToggleStyleShape: { enum: ['circle', 'rounded'], type: 'string' },
    enabled: { type: 'boolean' },
    hideTableCountBadge: { type: 'boolean' },
    backgroundImage: { type: 'string', nullable: true },
    phoneToggleCoverImage: { type: 'string', nullable: true },
};

export function cloneSettingsValue(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        Logger.error('[玉子手机] 克隆对象失败:', error);
        return value;
    }
}

export function validateSetting(key, value) {
    const rule = validationRules[key];

    if (!rule) {
        return { valid: true, value };
    }

    if (value === null || value === undefined) {
        if (rule.nullable) {
            return { valid: true, value: null };
        }
        return { valid: true, value: defaultSettings[key] };
    }

    switch (rule.type) {
        case 'number': {
            const num = Number(value);
            if (!Number.isFinite(num)) {
                return {
                    valid: false,
                    value: defaultSettings[key],
                    error: `${key} 必须是有效数字`,
                };
            }
            const min = rule.min ?? -Infinity;
            const max = rule.max ?? Infinity;
            const clamped = Math.max(min, Math.min(max, Math.round(num)));
            return { valid: true, value: clamped };
        }

        case 'string': {
            const str = String(value).trim();
            if (rule.enum && !rule.enum.includes(str)) {
                return {
                    valid: false,
                    value: defaultSettings[key],
                    error: `${key} 必须是 ${rule.enum.join(' | ')} 之一`,
                };
            }
            return { valid: true, value: str };
        }

        case 'boolean':
            return { valid: true, value: Boolean(value) };

        case 'object':
            if (typeof value !== 'object' || Array.isArray(value)) {
                return {
                    valid: false,
                    value: defaultSettings[key] || {},
                    error: `${key} 必须是对象`,
                };
            }
            return { valid: true, value };

        default:
            return { valid: true, value };
    }
}

export function validateSettings(settings) {
    const validated = { ...defaultSettings };

    if (!settings || typeof settings !== 'object') {
        return validated;
    }

    for (const [key, value] of Object.entries(settings)) {
        const result = validateSetting(key, value);
        if (result.valid) {
            validated[key] = result.value;
        } else {
            Logger.warn(`[玉子手机] 设置验证失败: ${result.error}, 使用默认值`);
            validated[key] = result.value;
        }
    }

    if (typeof settings.appIcons === 'object' && !Array.isArray(settings.appIcons)) {
        validated.appIcons = { ...settings.appIcons };
    }

    if (typeof settings.hiddenTableApps === 'object' && !Array.isArray(settings.hiddenTableApps)) {
        validated.hiddenTableApps = { ...settings.hiddenTableApps };
    }

    if (typeof settings.beautifyActiveTemplateIdsSpecial === 'object' && !Array.isArray(settings.beautifyActiveTemplateIdsSpecial)) {
        validated.beautifyActiveTemplateIdsSpecial = { ...settings.beautifyActiveTemplateIdsSpecial };
    }

    if (typeof settings.phoneChat === 'object' && !Array.isArray(settings.phoneChat)) {
        validated.phoneChat = cloneSettingsValue(settings.phoneChat);
    }

    if (typeof settings.phoneAiInstruction === 'object' && !Array.isArray(settings.phoneAiInstruction)) {
        validated.phoneAiInstruction = cloneSettingsValue(settings.phoneAiInstruction);
    }

    if (typeof settings.worldbookSelection === 'object' && !Array.isArray(settings.worldbookSelection)) {
        validated.worldbookSelection = cloneSettingsValue(settings.worldbookSelection);
    }

    return validated;
}
