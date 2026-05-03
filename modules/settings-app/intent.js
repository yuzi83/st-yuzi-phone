// modules/settings-app/intent.js
/**
 * 玉子的手机 - 设置 App 跳转意图
 *
 * 通过 globalThis 上的隐藏 key 让外部脚本能在打开设置面板前预设跳转目标：
 *   - mode：'prompt_editor' | 'ai_instruction_presets' | 'api_prompt_config'
 *   - presetName：要选中的预设名称
 *
 * 写入示例：
 *   ```javascript
 *   window.__YUZI_PHONE_SETTINGS_INTENT__ = {
 *       mode: 'prompt_editor',
 *       presetName: 'mySpecial',
 *   };
 *   ```
 *
 * 由 [`renderSettings()`](modules/settings-app/render.js:1) 在初始化阶段消费一次后立即清理，
 * 避免后续二次 navigation 误吃旧 intent。
 */

import { createDefaultPhoneAiInstructionPreset, getPhoneAiInstructionPreset } from '../phone-core/chat-support.js';

export const SETTINGS_INTENT_GLOBAL_KEY = '__YUZI_PHONE_SETTINGS_INTENT__';

function presetExists(getPreset, name) {
    if (typeof getPreset !== 'function') return false;
    const safeName = String(name || '').trim();
    if (!safeName) return false;

    try {
        return !!getPreset(safeName);
    } catch (error) {
        return false;
    }
}

export function resolveUniquePromptEditorPresetName(baseName, getPreset = getPhoneAiInstructionPreset) {
    const safeBaseName = String(baseName || '').trim() || '未命名预设';
    if (!presetExists(getPreset, safeBaseName)) {
        return safeBaseName;
    }

    for (let index = 2; index <= 999; index++) {
        const candidate = `${safeBaseName} (${index})`;
        if (!presetExists(getPreset, candidate)) {
            return candidate;
        }
    }

    return `${safeBaseName} (${Date.now()})`;
}

function extractPromptEditorMediaMarkers(preset) {
    const src = preset && typeof preset === 'object' && preset.mediaMarkers && typeof preset.mediaMarkers === 'object'
        ? preset.mediaMarkers
        : {};
    return {
        imagePrefix: String(src.imagePrefix ?? '[图片]').trim(),
        videoPrefix: String(src.videoPrefix ?? '[视频]').trim(),
    };
}

/**
 * 消费并清理待处理的 settings intent。
 * @returns {{ mode?: string, presetName?: string } | null}
 */
export function consumePendingSettingsIntent() {
    try {
        const safeWindow = typeof window !== 'undefined' ? window : null;
        const intent = safeWindow?.[SETTINGS_INTENT_GLOBAL_KEY] || null;
        if (safeWindow && Object.prototype.hasOwnProperty.call(safeWindow, SETTINGS_INTENT_GLOBAL_KEY)) {
            delete safeWindow[SETTINGS_INTENT_GLOBAL_KEY];
        }
        return intent && typeof intent === 'object' ? intent : null;
    } catch (error) {
        return null;
    }
}

/**
 * 把 intent 翻译成 state 字段的初值（不修改 state，由调用方决定如何写）。
 * @param {{ mode?: string, presetName?: string } | null} intent
 * @returns {{
 *   aiInstructionSelectedPresetName?: string,
 *   promptEditorName?: string,
 *   promptEditorContent?: string,
 *   promptEditorIsNew?: boolean,
 *   promptEditorOriginalName?: string,
 *   promptEditorMediaMarkers?: { imagePrefix: string, videoPrefix: string },
 *   mode?: string,
 * } | null}
 */
export function projectIntentToStatePatch(intent) {
    if (!intent || typeof intent !== 'object') return null;

    const targetPresetName = String(intent.presetName || '').trim();
    /** @type {Record<string, unknown>} */
    const patch = {};

    if (targetPresetName) {
        patch.aiInstructionSelectedPresetName = targetPresetName;
    }

    if (intent.mode === 'prompt_editor') {
        const preset = targetPresetName
            ? getPhoneAiInstructionPreset(targetPresetName)
            : createDefaultPhoneAiInstructionPreset();
        const promptGroup = preset?.promptGroup || preset?.segments
            || createDefaultPhoneAiInstructionPreset().promptGroup
            || [];
        const promptEditorName = targetPresetName
            ? String(preset?.name || targetPresetName).trim()
            : resolveUniquePromptEditorPresetName(preset?.name, getPhoneAiInstructionPreset);
        patch.promptEditorName = promptEditorName;
        patch.promptEditorContent = JSON.stringify(promptGroup, null, 2);
        patch.promptEditorIsNew = !preset || !targetPresetName;
        patch.promptEditorOriginalName = targetPresetName ? String(preset?.name || '').trim() : promptEditorName;
        patch.promptEditorMediaMarkers = extractPromptEditorMediaMarkers(preset);
        patch.mode = 'prompt_editor';
    } else if (intent.mode === 'ai_instruction_presets') {
        patch.mode = 'ai_instruction_presets';
    } else if (intent.mode === 'api_prompt_config') {
        patch.mode = 'api_prompt_config';
    }

    return patch;
}
