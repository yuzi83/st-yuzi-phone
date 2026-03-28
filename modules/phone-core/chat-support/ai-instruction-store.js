import { Logger } from '../../error-handler.js';
import { getPhoneSettings, savePhoneSettingsPatch } from '../../settings.js';

const logger = Logger.withScope({ scope: 'phone-core/chat-support/ai-instruction-store', feature: 'chat-support' });

const LEGACY_PROMPT_TEMPLATES_KEY = 'yuzi_phone_prompt_templates';

export const PHONE_AI_INSTRUCTION_SCOPE_PHONE_MESSAGE_REPLY = 'phone_message_reply';
export const PHONE_AI_INSTRUCTION_PACK_FORMAT = 'yuzi-phone-ai-instruction-presets';
export const PHONE_AI_INSTRUCTION_PACK_VERSION = '1.0.0';
export const PHONE_AI_INSTRUCTION_DEFAULT_PRESET_NAME = '默认实时回复预设';

const DEFAULT_PHONE_CHAT_MAIN_PROMPT = [
    '你是玉子，一个软糯可爱、温柔细心、会认真偏爱用户的聊天陪伴编剧。',
    '你只负责在最开始稳住氛围、校准方向，后续要让对话像 user 与 assistant 交替梳理角色，再落到最终回复。',
    '你的核心目标是帮助当前聊天对象维持稳定人设、情绪连续性和关系分寸，避免 OOC。',
    '最终真正发出去的内容，必须是“{{targetCharacterName}}”此刻会对用户说的话，而不是玉子的说明。',
].join('\n');

const DEFAULT_PHONE_AI_PROMPT_GROUP = Object.freeze([
    {
        id: 'main_prompt',
        name: '玉子总说明',
        role: 'system',
        content: DEFAULT_PHONE_CHAT_MAIN_PROMPT,
        deletable: true,
        mainSlot: 'A',
    },
    {
        id: 'character_excavation_prompt',
        name: '角色与设定联合拆解',
        role: 'user',
        content: [
            '我们先一起拆这轮要扮演的人。',
            '目标角色：{{targetCharacterName}}',
            '',
            '下面这些世界书信息里，哪些内容会直接影响她这次发消息时的语气、边界感、情绪落点和对用户的称呼，请优先抓出来：',
            '{{worldbookText}}',
            '',
            '要求你重点结合挖掘：',
            '1. 她平时怎么说话，什么话会说，什么话不会说。',
            '2. 她对用户现在大概是什么态度，亲近到什么程度。',
            '3. 她此刻最自然的表达方式应该偏克制、偏主动、偏撒娇，还是偏试探。',
            '4. 哪些句子虽然好听，但并不符合她的人设，必须规避。',
        ].join('\n'),
        deletable: true,
        mainSlot: 'B',
    },
    {
        id: 'character_excavation_ack',
        name: '玉子拆解确认',
        role: 'assistant',
        content: '收到呀，我会先顺着角色名和世界书一起往下挖，把真正会影响她这次开口方式的人设核心拎出来，不拿无关设定凑热闹。',
        deletable: true,
    },
    {
        id: 'conversation_title_prompt',
        name: '会话场域判断',
        role: 'user',
        content: [
            '当前手机会话标题：{{conversationTitle}}',
            '请把它当作聊天场域提示，用来判断双方现在说话应有的松弛度、距离感和话题范围。',
        ].join('\n'),
        deletable: true,
    },
    {
        id: 'conversation_title_ack',
        name: '玉子场域确认',
        role: 'assistant',
        content: '好，我会把会话标题当成语境线索，而不是当成要复读的台词，先确定这段对话应该有多亲、多收、多生活化。',
        deletable: true,
    },
    {
        id: 'story_context_prompt',
        name: '前情与情绪续接',
        role: 'user',
        content: [
            '以下是正文最近的 AI 剧情上下文。',
            '请继续结合它判断：这名角色当前情绪有没有余波、和用户的关系有没有刚发生的新变化、这条消息应该承接什么。',
            '不要机械复述原文，只抽取会直接改变回复口吻的部分：',
            '',
            '{{storyContext}}',
        ].join('\n'),
        deletable: true,
    },
    {
        id: 'story_context_ack',
        name: '玉子续接确认',
        role: 'assistant',
        content: '明白，我会把前情里真正影响她这条消息的情绪余温、关系变化和事件后果接住，让回复像同一段故事里自然长出来的。',
        deletable: true,
    },
    {
        id: 'reply_guard_prompt',
        name: '防OOC守则',
        role: 'user',
        content: [
            '最后再确认回复边界：',
            '1. 聊天气泡要短而自然，优先像真实手机消息，而不是小说段落。',
            '2. 先判断角色有没有理由这么说，再判断这句话是否符合她的人设、关系阶段和当前情境。',
            '3. 关系推进要连续；称呼变化、暧昧升温、依赖感加深都必须有前文支撑。',
            '4. 如果信息不足，就保守表达，不要突然知道不该知道的事，也不要突然性格跳变。',
            '5. 你现在需要做的是：吸收以上信息后，直接产出角色本人会发出的最终消息。',
        ].join('\n'),
        deletable: true,
    },
    {
        id: 'reply_guard_ack',
        name: '玉子收束确认',
        role: 'assistant',
        content: '嗯嗯，我会把能说和不能说的边界收紧，再让她自然开口。最终只留下角色本人会发出去的话，不夹带分析腔。',
        deletable: true,
    },
    {
        id: 'media_output_protocol_prompt',
        name: '媒体输出协议',
        role: 'user',
        content: [
            '你的回复必须严格使用以下格式输出：',
            '正文：<聊天正文>',
            '图片描述：<图片描述>',
            '视频描述：<视频描述>',
            '',
            '要求：',
            '1. 正文必须是聊天气泡里真正显示的文字。',
            '2. 图片或视频只在当前语境自然合适时偶尔出现，不需要每次都发。',
            '3. 如果这次没有发图，就写 图片描述：none。',
            '4. 如果这次没有发视频，就写 视频描述：none。',
            '5. 如果同时没有图片和视频，也必须保留这两行并写 none。',
            '6. 不要输出额外解释，不要输出 markdown，不要输出代码块。',
        ].join('\n'),
        deletable: true,
    },
    {
        id: 'media_output_protocol_ack',
        name: '玉子最终确认',
        role: 'assistant',
        content: '收到，我会按上面的边界和格式来收束，最后给出的只会是角色本人自然发出的消息成品。',
        deletable: true,
    },
]);

const DEFAULT_PHONE_AI_MEDIA_MARKERS = Object.freeze({
    imagePrefix: '[图片]',
    videoPrefix: '[视频]',
});

function cloneValue(value, fallback = null) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return fallback;
    }
}

function normalizeRole(role) {
    const safeRole = String(role || '').trim().toLowerCase();
    if (safeRole === 'assistant' || safeRole === 'user') {
        return safeRole;
    }
    return 'system';
}

function normalizeMainSlot(raw) {
    const slot = String(raw || '').trim().toUpperCase();
    return slot === 'A' || slot === 'B' ? slot : '';
}

function normalizeMediaMarkers(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        imagePrefix: String(src.imagePrefix ?? DEFAULT_PHONE_AI_MEDIA_MARKERS.imagePrefix).trim(),
        videoPrefix: String(src.videoPrefix ?? DEFAULT_PHONE_AI_MEDIA_MARKERS.videoPrefix).trim(),
    };
}

function sanitizePresetId(value, fallback = 'phone_ai_preset') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

function createDefaultSegmentId(index = 0) {
    return `segment_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyPhoneAiInstructionSegment(overrides = {}) {
    const src = overrides && typeof overrides === 'object' ? overrides : {};
    const mainSlot = normalizeMainSlot(src.mainSlot || (src.isMain ? 'A' : (src.isMain2 ? 'B' : '')));
    return {
        id: String(src.id || createDefaultSegmentId(0)).trim() || createDefaultSegmentId(0),
        name: String(src.name || '新片段').trim() || '新片段',
        role: normalizeRole(src.role),
        content: String(src.content || ''),
        deletable: true,
        mainSlot,
    };
}

function normalizeSegment(segment, index = 0) {
    const src = segment && typeof segment === 'object' ? segment : {};
    const mainSlot = normalizeMainSlot(src.mainSlot || (src.isMain ? 'A' : (src.isMain2 ? 'B' : '')));
    return {
        id: String(src.id || createDefaultSegmentId(index)).trim() || createDefaultSegmentId(index),
        name: String(src.name || `片段 ${index + 1}`).trim() || `片段 ${index + 1}`,
        role: normalizeRole(src.role),
        content: String(src.content || ''),
        deletable: true,
        mainSlot,
    };
}

export function createDefaultPhoneAiInstructionPreset(overrides = {}) {
    const src = overrides && typeof overrides === 'object' ? overrides : {};
    const name = String(src.name || PHONE_AI_INSTRUCTION_DEFAULT_PRESET_NAME).trim() || PHONE_AI_INSTRUCTION_DEFAULT_PRESET_NAME;
    const promptGroup = Array.isArray(src.promptGroup) && src.promptGroup.length > 0
        ? src.promptGroup.map((segment, index) => normalizeSegment(segment, index))
        : (Array.isArray(src.segments) && src.segments.length > 0
            ? src.segments.map((segment, index) => normalizeSegment(segment, index))
            : cloneValue(DEFAULT_PHONE_AI_PROMPT_GROUP, []).map((segment, index) => normalizeSegment(segment, index)));

    return {
        id: sanitizePresetId(src.id || name, 'phone_chat_default'),
        name,
        description: String(src.description || '消息记录表实时回复默认预设').trim(),
        scope: PHONE_AI_INSTRUCTION_SCOPE_PHONE_MESSAGE_REPLY,
        updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : Date.now(),
        promptGroup,
        mediaMarkers: normalizeMediaMarkers(src.mediaMarkers),
    };
}

function buildDefaultPhoneAiInstructionSettings() {
    const preset = createDefaultPhoneAiInstructionPreset();
    return {
        currentPresetName: preset.name,
        lastOpenedPresetName: preset.name,
        migratedLegacyTemplates: false,
        presets: [preset],
    };
}

function normalizePreset(preset, index = 0) {
    const src = preset && typeof preset === 'object' ? preset : {};
    const fallbackPreset = index === 0 ? createDefaultPhoneAiInstructionPreset() : null;
    const fallbackName = fallbackPreset?.name || `AI 指令预设 ${index + 1}`;
    const name = String(src.name || fallbackName).trim() || fallbackName;
    const normalizedPromptGroup = Array.isArray(src.promptGroup) && src.promptGroup.length > 0
        ? src.promptGroup.map((segment, segmentIndex) => normalizeSegment(segment, segmentIndex))
        : (Array.isArray(src.segments) && src.segments.length > 0
            ? src.segments.map((segment, segmentIndex) => normalizeSegment(segment, segmentIndex))
            : (fallbackPreset?.promptGroup || [createEmptyPhoneAiInstructionSegment()]).map((segment, segmentIndex) => normalizeSegment(segment, segmentIndex)));

    return {
        id: sanitizePresetId(src.id || name, `phone_ai_preset_${index + 1}`),
        name,
        description: String(src.description || fallbackPreset?.description || '').trim(),
        scope: PHONE_AI_INSTRUCTION_SCOPE_PHONE_MESSAGE_REPLY,
        updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : Date.now(),
        promptGroup: normalizedPromptGroup,
        mediaMarkers: normalizeMediaMarkers(src.mediaMarkers || fallbackPreset?.mediaMarkers),
    };
}

function normalizePhoneAiInstructionSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const base = buildDefaultPhoneAiInstructionSettings();
    const presets = Array.isArray(src.presets) && src.presets.length > 0
        ? src.presets.map((preset, index) => normalizePreset(preset, index))
        : base.presets;

    const presetNames = new Set(presets.map((preset) => preset.name));
    const currentPresetNameRaw = String(src.currentPresetName || '').trim();
    const lastOpenedPresetNameRaw = String(src.lastOpenedPresetName || '').trim();
    const currentPresetName = presetNames.has(currentPresetNameRaw)
        ? currentPresetNameRaw
        : presets[0]?.name || base.currentPresetName;
    const lastOpenedPresetName = presetNames.has(lastOpenedPresetNameRaw)
        ? lastOpenedPresetNameRaw
        : currentPresetName;

    return {
        currentPresetName,
        lastOpenedPresetName,
        migratedLegacyTemplates: src.migratedLegacyTemplates === true,
        presets,
    };
}

function isSameJson(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (error) {
        return false;
    }
}

function ensureUniquePresetName(name, takenNames = new Set()) {
    const safeName = String(name || '').trim() || '未命名预设';
    if (!takenNames.has(safeName)) {
        return safeName;
    }

    for (let index = 2; index <= 999; index++) {
        const candidate = `${safeName} (${index})`;
        if (!takenNames.has(candidate)) {
            return candidate;
        }
    }

    return `${safeName} (${Date.now()})`;
}

function buildLegacyTemplatePreset(template, index = 0, takenNames = new Set()) {
    const src = template && typeof template === 'object' ? template : {};
    const baseName = String(src.name || `旧模板迁移 ${index + 1}`).trim() || `旧模板迁移 ${index + 1}`;
    const finalName = ensureUniquePresetName(baseName, takenNames);
    const defaultPreset = createDefaultPhoneAiInstructionPreset({
        name: finalName,
        description: '从旧提示词模板仓库自动迁移',
    });

    const nextPromptGroup = defaultPreset.promptGroup.map((segment) => {
        if (segment.id === 'main_prompt') {
            return {
                ...segment,
                content: String(src.content || segment.content || '').trim() || segment.content,
            };
        }
        return segment;
    });

    return {
        ...defaultPreset,
        name: finalName,
        id: sanitizePresetId(finalName, `legacy_ai_preset_${index + 1}`),
        updatedAt: Date.now(),
        promptGroup: nextPromptGroup,
    };
}

function readLegacyPromptTemplates() {
    try {
        if (typeof localStorage === 'undefined') return [];
        const raw = localStorage.getItem(LEGACY_PROMPT_TEMPLATES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        logger.warn({
            action: 'legacy-template.read',
            message: '读取旧提示词模板仓库失败',
            error,
        });
        return [];
    }
}

function persistPhoneAiInstructionSettings(nextSettings) {
    savePhoneSettingsPatch({ phoneAiInstruction: nextSettings });
    return nextSettings;
}

function ensurePhoneAiInstructionSettings() {
    const raw = getPhoneSettings()?.phoneAiInstruction;
    let normalized = normalizePhoneAiInstructionSettings(raw);
    let changed = !isSameJson(raw, normalized);

    if (normalized.migratedLegacyTemplates !== true) {
        const takenNames = new Set(normalized.presets.map((preset) => preset.name));
        const migratedPresets = readLegacyPromptTemplates()
            .map((template, index) => buildLegacyTemplatePreset(template, index, takenNames))
            .filter(Boolean);

        migratedPresets.forEach((preset) => {
            if (!preset || !preset.name) return;
            takenNames.add(preset.name);
            normalized.presets.push(normalizePreset(preset, normalized.presets.length));
        });

        normalized.migratedLegacyTemplates = true;
        changed = true;
    }

    normalized = normalizePhoneAiInstructionSettings(normalized);

    if (changed) {
        persistPhoneAiInstructionSettings(normalized);
    }

    return normalized;
}

export function getPhoneAiInstructionSettings() {
    return ensurePhoneAiInstructionSettings();
}

export function getPhoneAiInstructionPresets() {
    return cloneValue(getPhoneAiInstructionSettings().presets, []);
}

export function getPhoneAiInstructionPreset(name = '') {
    const safeName = String(name || '').trim();
    if (!safeName) return null;
    return getPhoneAiInstructionSettings().presets.find((preset) => preset.name === safeName) || null;
}

export function getCurrentPhoneAiInstructionPresetName() {
    return getPhoneAiInstructionSettings().currentPresetName;
}

export function getCurrentPhoneAiInstructionPreset() {
    const settings = getPhoneAiInstructionSettings();
    return settings.presets.find((preset) => preset.name === settings.currentPresetName) || settings.presets[0] || null;
}

export function setCurrentPhoneAiInstructionPresetName(name) {
    const settings = getPhoneAiInstructionSettings();
    const safeName = String(name || '').trim();
    const nextName = settings.presets.some((preset) => preset.name === safeName)
        ? safeName
        : (settings.presets[0]?.name || PHONE_AI_INSTRUCTION_DEFAULT_PRESET_NAME);

    if (settings.currentPresetName === nextName && settings.lastOpenedPresetName === nextName) {
        return {
            success: true,
            message: '当前预设未发生变化',
            presetName: nextName,
        };
    }

    const nextSettings = {
        ...settings,
        currentPresetName: nextName,
        lastOpenedPresetName: nextName,
    };
    persistPhoneAiInstructionSettings(nextSettings);
    return {
        success: true,
        message: '当前预设已更新',
        presetName: nextName,
    };
}

export function savePhoneAiInstructionPreset(preset, options = {}) {
    const settings = getPhoneAiInstructionSettings();
    const originalName = String(options.originalName || '').trim();
    const switchTo = options.switchTo !== false;
    const overwrite = options.overwrite === true;
    const normalizedPreset = normalizePreset(preset, settings.presets.length);
    const presetName = normalizedPreset.name;
    const presets = [...settings.presets];
    const originalIndex = originalName ? presets.findIndex((item) => item.name === originalName) : -1;
    const sameNameIndex = presets.findIndex((item) => item.name === presetName);
    const hasNameConflict = sameNameIndex >= 0 && sameNameIndex !== originalIndex;

    if (hasNameConflict && !overwrite) {
        return {
            success: false,
            message: `已存在同名预设：${presetName}`,
            presetName,
        };
    }

    const nextPresets = presets.filter((item) => item.name !== originalName && item.name !== presetName);
    nextPresets.push({
        ...normalizedPreset,
        updatedAt: Date.now(),
    });

    const nextCurrentName = switchTo
        ? presetName
        : (settings.currentPresetName && nextPresets.some((item) => item.name === settings.currentPresetName)
            ? settings.currentPresetName
            : (nextPresets[0]?.name || presetName));

    const nextSettings = normalizePhoneAiInstructionSettings({
        ...settings,
        currentPresetName: nextCurrentName,
        lastOpenedPresetName: presetName,
        presets: nextPresets,
        migratedLegacyTemplates: true,
    });

    persistPhoneAiInstructionSettings(nextSettings);
    return {
        success: true,
        message: originalIndex >= 0 ? '预设已保存' : '预设已创建',
        presetName,
        preset: cloneValue(nextPresets.find((item) => item.name === presetName), null),
    };
}

export function deletePhoneAiInstructionPreset(name) {
    const settings = getPhoneAiInstructionSettings();
    const safeName = String(name || '').trim();
    if (!safeName) {
        return {
            success: false,
            message: '未指定要删除的预设',
        };
    }

    if (settings.presets.length <= 1) {
        return {
            success: false,
            message: '至少保留一个 AI 指令预设',
        };
    }

    const nextPresets = settings.presets.filter((preset) => preset.name !== safeName);
    if (nextPresets.length === settings.presets.length) {
        return {
            success: false,
            message: `未找到预设：${safeName}`,
        };
    }

    const nextCurrentName = settings.currentPresetName === safeName
        ? (nextPresets[0]?.name || PHONE_AI_INSTRUCTION_DEFAULT_PRESET_NAME)
        : settings.currentPresetName;

    const nextSettings = normalizePhoneAiInstructionSettings({
        ...settings,
        currentPresetName: nextCurrentName,
        lastOpenedPresetName: nextCurrentName,
        presets: nextPresets,
        migratedLegacyTemplates: true,
    });

    persistPhoneAiInstructionSettings(nextSettings);
    return {
        success: true,
        message: '预设已删除',
        presetName: nextCurrentName,
    };
}

function normalizeImportedPresetsPayload(data) {
    let parsed = data;
    if (typeof data === 'string') {
        parsed = JSON.parse(data);
    }

    if (Array.isArray(parsed)) {
        return parsed;
    }

    if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.presets)) {
            return parsed.presets;
        }
        if (parsed.name || Array.isArray(parsed.promptGroup) || Array.isArray(parsed.segments)) {
            return [parsed];
        }
    }

    return [];
}

export function importPhoneAiInstructionPresetsFromData(data, options = {}) {
    try {
        const presets = normalizeImportedPresetsPayload(data);
        if (!Array.isArray(presets) || presets.length === 0) {
            return {
                success: false,
                message: '未找到可导入的 AI 指令预设',
                imported: 0,
                overwritten: 0,
                failed: 0,
                presetNames: [],
            };
        }

        const overwrite = options.overwrite === true;
        const switchTo = options.switchTo !== false;
        const details = [];
        let imported = 0;
        let overwritten = 0;
        let failed = 0;
        let lastSuccessName = '';
        const existingNames = new Set(getPhoneAiInstructionPresets().map((preset) => preset.name));

        presets.forEach((preset) => {
            const safeName = String(preset?.name || '').trim();
            const result = savePhoneAiInstructionPreset(preset, {
                overwrite,
                switchTo: false,
            });
            details.push(result);
            if (result.success) {
                imported++;
                if (safeName && existingNames.has(safeName)) {
                    overwritten++;
                }
                if (result.presetName) {
                    lastSuccessName = result.presetName;
                }
            } else {
                failed++;
            }
        });

        if (switchTo && lastSuccessName) {
            setCurrentPhoneAiInstructionPresetName(lastSuccessName);
        }

        return {
            success: imported > 0,
            message: `导入完成：成功 ${imported} 个，失败 ${failed} 个`,
            imported,
            overwritten,
            failed,
            presetNames: details.filter((item) => item.success && item.presetName).map((item) => item.presetName),
            currentPresetName: getCurrentPhoneAiInstructionPresetName(),
        };
    } catch (error) {
        logger.warn({
            action: 'preset.import',
            message: '导入 AI 指令预设失败',
            error,
        });
        return {
            success: false,
            message: error?.message || '导入失败',
            imported: 0,
            overwritten: 0,
            failed: 1,
            presetNames: [],
        };
    }
}

export function exportPhoneAiInstructionPresetPack(name = '') {
    const preset = name
        ? getPhoneAiInstructionPreset(name)
        : getCurrentPhoneAiInstructionPreset();
    if (!preset) return null;

    return {
        format: PHONE_AI_INSTRUCTION_PACK_FORMAT,
        version: PHONE_AI_INSTRUCTION_PACK_VERSION,
        scope: PHONE_AI_INSTRUCTION_SCOPE_PHONE_MESSAGE_REPLY,
        exportedAt: new Date().toISOString(),
        presets: [cloneValue(preset, null)],
    };
}

export function exportAllPhoneAiInstructionPresetsPack() {
    return {
        format: PHONE_AI_INSTRUCTION_PACK_FORMAT,
        version: PHONE_AI_INSTRUCTION_PACK_VERSION,
        scope: PHONE_AI_INSTRUCTION_SCOPE_PHONE_MESSAGE_REPLY,
        exportedAt: new Date().toISOString(),
        presets: getPhoneAiInstructionPresets(),
    };
}

function renderTemplateWithVariables(content, variables = {}) {
    const safeContent = String(content || '');
    return safeContent.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const value = variables && Object.prototype.hasOwnProperty.call(variables, key)
            ? variables[key]
            : '';
        return String(value ?? '');
    });
}

function extractTemplateVariableKeys(content) {
    const keys = new Set();
    const safeContent = String(content || '');
    safeContent.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        keys.add(String(key || '').trim());
        return '';
    });
    return Array.from(keys).filter(Boolean);
}

export function resolvePhoneAiInstructionMediaMarkers(presetOrName) {
    const preset = typeof presetOrName === 'string'
        ? getPhoneAiInstructionPreset(presetOrName)
        : normalizePreset(presetOrName, 0);
    return normalizeMediaMarkers(preset?.mediaMarkers);
}

export function materializePhoneAiInstructionPresetMessages(presetOrName, variables = {}) {
    const preset = typeof presetOrName === 'string'
        ? getPhoneAiInstructionPreset(presetOrName)
        : normalizePreset(presetOrName, 0);

    if (!preset) return [];

    const normalizedVariables = Object.entries(variables && typeof variables === 'object' ? variables : {})
        .reduce((result, [key, value]) => {
            result[key] = String(value ?? '').trim();
            return result;
        }, {});

    const promptGroup = Array.isArray(preset.promptGroup) && preset.promptGroup.length > 0
        ? preset.promptGroup
        : (Array.isArray(preset.segments) ? preset.segments : []);
    const resolveMainSlotOrder = (slot) => {
        if (slot === 'A') return 0;
        if (slot === 'B') return 1;
        return 2;
    };

    return promptGroup
        .map((segment, index) => ({
            ...normalizeSegment(segment, index),
            __segmentIndex: index,
        }))
        .sort((a, b) => {
            const slotOrder = resolveMainSlotOrder(a.mainSlot) - resolveMainSlotOrder(b.mainSlot);
            return slotOrder || (a.__segmentIndex - b.__segmentIndex);
        })
        .filter((segment) => {
            const variableKeys = extractTemplateVariableKeys(segment.content);
            return variableKeys.every((key) => String(normalizedVariables[key] || '').trim());
        })
        .map((segment) => {
            const content = renderTemplateWithVariables(segment.content, normalizedVariables).trim();
            if (!content) return null;
            return {
                role: normalizeRole(segment.role),
                content,
            };
        })
        .filter(Boolean);
}
