// modules/settings.js
/**
 * Yuzi Phone - 设置与存储
 * 增强版：类型安全、错误处理、验证机制
 */

import { showNotification } from './integration.js';

export const extensionName = 'YuziPhone';

/**
 * 设置类型定义
 * @typedef {Object} PhoneSettings
 */
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
};

/**
 * 设置验证规则
 */
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

/**
 * 错误类
 */
class SettingsError extends Error {
    constructor(message, key, value) {
        super(message);
        this.name = 'SettingsError';
        this.key = key;
        this.value = value;
    }
}

/**
 * 获取 SillyTavern 上下文
 * @returns {Object|null} 上下文对象
 */
function getContext() {
    try {
        // 尝试多种方式获取上下文
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            return SillyTavern.getContext();
        }
        
        if (typeof window !== 'undefined' && window.SillyTavern && window.SillyTavern.getContext) {
            return window.SillyTavern.getContext();
        }
        
        return null;
    } catch (error) {
        console.error('[玉子手机] 获取上下文失败:', error);
        return null;
    }
}

/**
 * 深度克隆对象
 * @param {any} value 要克隆的值
 * @returns {any} 克隆后的值
 */
function clone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        console.error('[玉子手机] 克隆对象失败:', error);
        return value;
    }
}

/**
 * 验证单个设置项
 * @param {string} key 设置键名
 * @param {any} value 设置值
 * @returns {{ valid: boolean, value: any, error?: string }} 验证结果
 */
function validateSetting(key, value) {
    const rule = validationRules[key];
    
    // 如果没有验证规则，直接通过
    if (!rule) {
        return { valid: true, value };
    }

    // 处理 null 值
    if (value === null || value === undefined) {
        if (rule.nullable) {
            return { valid: true, value: null };
        }
        // 使用默认值
        return { valid: true, value: defaultSettings[key] };
    }

    // 类型检查
    switch (rule.type) {
        case 'number':
            const num = Number(value);
            if (!Number.isFinite(num)) {
                return {
                    valid: false,
                    value: defaultSettings[key],
                    error: `${key} 必须是有效数字`
                };
            }
            // 范围检查
            const min = rule.min ?? -Infinity;
            const max = rule.max ?? Infinity;
            const clamped = Math.max(min, Math.min(max, Math.round(num)));
            return { valid: true, value: clamped };

        case 'string':
            const str = String(value).trim();
            // 枚举检查
            if (rule.enum && !rule.enum.includes(str)) {
                return {
                    valid: false,
                    value: defaultSettings[key],
                    error: `${key} 必须是 ${rule.enum.join(' | ')} 之一`
                };
            }
            return { valid: true, value: str };

        case 'boolean':
            return { valid: true, value: Boolean(value) };

        case 'object':
            if (typeof value !== 'object' || Array.isArray(value)) {
                return {
                    valid: false,
                    value: defaultSettings[key] || {},
                    error: `${key} 必须是对象`
                };
            }
            return { valid: true, value };

        default:
            return { valid: true, value };
    }
}

/**
 * 验证所有设置
 * @param {Object} settings 设置对象
 * @returns {Object} 验证后的设置对象
 */
function validateSettings(settings) {
    const validated = { ...defaultSettings };
    
    if (!settings || typeof settings !== 'object') {
        return validated;
    }

    // 验证每个设置项
    for (const [key, value] of Object.entries(settings)) {
        const result = validateSetting(key, value);
        if (result.valid) {
            validated[key] = result.value;
        } else {
            console.warn(`[玉子手机] 设置验证失败: ${result.error}, 使用默认值`);
            validated[key] = result.value;
        }
    }

    // 特殊处理对象类型
    if (typeof settings.appIcons === 'object' && !Array.isArray(settings.appIcons)) {
        validated.appIcons = { ...settings.appIcons };
    }
    
    if (typeof settings.hiddenTableApps === 'object' && !Array.isArray(settings.hiddenTableApps)) {
        validated.hiddenTableApps = { ...settings.hiddenTableApps };
    }

    if (typeof settings.beautifyActiveTemplateIdsSpecial === 'object' && !Array.isArray(settings.beautifyActiveTemplateIdsSpecial)) {
        validated.beautifyActiveTemplateIdsSpecial = { ...settings.beautifyActiveTemplateIdsSpecial };
    }

    return validated;
}

/**
 * 确保设置命名空间存在
 * @returns {Object|null} 设置对象
 */
function ensureNamespace() {
    const ctx = getContext();
    if (!ctx?.extensionSettings) {
        console.warn('[玉子手机] 扩展设置不可用');
        return null;
    }

    // 如果命名空间不存在或无效，创建新的
    if (!ctx.extensionSettings[extensionName] || typeof ctx.extensionSettings[extensionName] !== 'object') {
        ctx.extensionSettings[extensionName] = clone(defaultSettings);
        console.log('[玉子手机] 创建新的设置命名空间');
    }

    const settings = ctx.extensionSettings[extensionName];

    // 验证并修复设置
    try {
        const validated = validateSettings(settings);
        ctx.extensionSettings[extensionName] = validated;
        return validated;
    } catch (error) {
        console.error('[玉子手机] 设置验证失败，使用默认值:', error);
        ctx.extensionSettings[extensionName] = clone(defaultSettings);
        return ctx.extensionSettings[extensionName];
    }
}

/**
 * 迁移旧版设置
 * 支持从 TamakoMarket.phone 迁移到 YuziPhone
 */
export function migrateLegacyPhoneSettings() {
    const ctx = getContext();
    if (!ctx?.extensionSettings) {
        console.warn('[玉子手机] 无法迁移设置：上下文不可用');
        return;
    }

    // 检查是否已有设置
    const current = ctx.extensionSettings[extensionName];
    if (current && typeof current === 'object' && Object.keys(current).length > 0) {
        console.log('[玉子手机] 设置已存在，跳过迁移');
        return;
    }

    try {
        // 尝试从旧版本迁移
        const legacy = ctx.extensionSettings?.TamakoMarket?.phone;
        if (legacy && typeof legacy === 'object') {
            console.log('[玉子手机] 从 TamakoMarket.phone 迁移设置...');
            
            const migrated = {
                ...clone(defaultSettings),
                ...clone(legacy),
                __migratedFromTamako: true,
                __migratedAt: Date.now(),
            };
            
            // 验证迁移的设置
            ctx.extensionSettings[extensionName] = validateSettings(migrated);
            
            showNotification('设置已从旧版本迁移', 'success');
        } else {
            // 创建新的默认设置
            ctx.extensionSettings[extensionName] = clone(defaultSettings);
            console.log('[玉子手机] 创建新的默认设置');
        }

        // 保存设置
        if (typeof ctx.saveSettingsDebounced === 'function') {
            ctx.saveSettingsDebounced();
        }
    } catch (error) {
        console.error('[玉子手机] 迁移设置失败:', error);
        // 创建默认设置作为后备
        ctx.extensionSettings[extensionName] = clone(defaultSettings);
        showNotification('设置迁移失败，使用默认设置', 'warning');
    }
}

/**
 * 获取手机设置
 * @returns {Object} 设置对象
 */
export function getPhoneSettings() {
    try {
        const settings = ensureNamespace();
        return settings || clone(defaultSettings);
    } catch (error) {
        console.error('[玉子手机] 获取设置失败:', error);
        return clone(defaultSettings);
    }
}

/**
 * 保存设置的防抖定时器
 */
let saveSettingsDebounceTimer = null;

/**
 * 调度设置保存（防抖）
 * @param {Object} ctx SillyTavern 上下文
 * @param {number} delay 延迟时间（毫秒）
 */
function schedulePersistSettings(ctx, delay = 120) {
    if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') {
        console.warn('[玉子手机] 无法保存设置：上下文不可用');
        return;
    }

    // 清除之前的定时器
    if (saveSettingsDebounceTimer !== null) {
        window.clearTimeout(saveSettingsDebounceTimer);
    }

    // 设置新的定时器
    saveSettingsDebounceTimer = window.setTimeout(() => {
        saveSettingsDebounceTimer = null;
        try {
            ctx.saveSettingsDebounced();
            console.log('[玉子手机] 设置已保存');
        } catch (error) {
            console.error('[玉子手机] 保存设置失败:', error);
            showNotification('保存设置失败', 'error');
        }
    }, delay);
}

/**
 * 立即保存设置
 */
export function flushPhoneSettingsSave() {
    const ctx = getContext();
    if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') {
        console.warn('[玉子手机] 无法立即保存设置：上下文不可用');
        return;
    }

    // 清除待处理的定时器
    if (saveSettingsDebounceTimer !== null) {
        window.clearTimeout(saveSettingsDebounceTimer);
        saveSettingsDebounceTimer = null;
    }

    try {
        ctx.saveSettingsDebounced();
        console.log('[玉子手机] 设置已立即保存');
    } catch (error) {
        console.error('[玉子手机] 立即保存设置失败:', error);
        showNotification('保存设置失败', 'error');
    }
}

/**
 * 保存单个设置项
 * @param {string} key 设置键名
 * @param {any} value 设置值
 * @returns {boolean} 是否保存成功
 */
export function savePhoneSetting(key, value) {
    try {
        const ctx = getContext();
        const settings = ensureNamespace();
        
        if (!ctx?.extensionSettings || !settings) {
            console.warn('[玉子手机] 无法保存设置：上下文或命名空间不可用');
            return false;
        }

        // 验证设置项
        const result = validateSetting(key, value);
        if (!result.valid) {
            console.warn(`[玉子手机] 设置验证失败: ${result.error}`);
            showNotification(`设置验证失败: ${result.error}`, 'warning');
        }

        // 保存设置
        settings[key] = result.value;
        schedulePersistSettings(ctx);

        return true;
    } catch (error) {
        console.error('[玉子手机] 保存设置失败:', error);
        showNotification('保存设置失败', 'error');
        return false;
    }
}

export function savePhoneSettingsPatch(patch = {}) {
    const ctx = getContext();
    const settings = ensureNamespace();
    if (!ctx?.extensionSettings || !settings) return;

    Object.assign(settings, patch);
    schedulePersistSettings(ctx);
}

export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth <= 768
        || ('ontouchstart' in window);
}

export function getDefaultPhoneTogglePosition() {
    const isMobile = isMobileDevice();
    return isMobile
        ? { x: Math.max(10, window.innerWidth - 130), y: Math.max(10, window.innerHeight - 220) }
        : { x: Math.max(10, window.innerWidth - 330), y: 60 };
}

export function constrainPosition(x, y, width, height) {
    return {
        x: Math.max(0, Math.min(x, Math.max(0, window.innerWidth - width))),
        y: Math.max(0, Math.min(y, Math.max(0, window.innerHeight - height))),
    };
}
