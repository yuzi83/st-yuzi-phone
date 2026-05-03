import {
    createDefaultPhoneAiInstructionPreset,
    normalizePhoneAiInstructionSegmentMainSlot,
    normalizePhoneAiInstructionMediaMarkers,
} from '../../../phone-core/chat-support.js';

export function sanitizeFilenamePart(value, fallback = 'preset') {
    const safeValue = String(value || '').trim();
    const normalized = safeValue.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
    return normalized || fallback;
}

export function normalizeMainSlot(slot, segment = {}) {
    return normalizePhoneAiInstructionSegmentMainSlot(slot, segment);
}

export function getPromptGroupFromPreset(preset) {
    if (!preset || typeof preset !== 'object') return [];
    if (Array.isArray(preset.promptGroup)) return preset.promptGroup;
    if (Array.isArray(preset.segments)) return preset.segments;
    return [];
}

export function getMediaMarkersFromPreset(preset) {
    const src = preset && typeof preset === 'object' ? preset.mediaMarkers : null;
    return normalizePhoneAiInstructionMediaMarkers(src);
}

export function clonePromptGroup(promptGroup = []) {
    return (Array.isArray(promptGroup) ? promptGroup : []).map((segment) => ({ ...segment }));
}

export function buildDraftFromPreset(preset) {
    const sourcePreset = preset && typeof preset === 'object'
        ? preset
        : createDefaultPhoneAiInstructionPreset();
    const mediaMarkers = getMediaMarkersFromPreset(sourcePreset);
    return {
        name: String(sourcePreset.name || '').trim(),
        originalName: String(sourcePreset.name || '').trim(),
        imagePrefix: mediaMarkers.imagePrefix,
        videoPrefix: mediaMarkers.videoPrefix,
        promptGroup: clonePromptGroup(getPromptGroupFromPreset(sourcePreset)),
    };
}

export function normalizeSegmentDraft(segment = {}, index = 0) {
    const slot = normalizeMainSlot('', segment);
    const safeRole = String(segment.role || 'system').trim().toLowerCase();
    const fallbackId = `phone_segment_${Date.now()}_${index}`;
    return {
        id: String(segment.id || fallbackId).trim() || fallbackId,
        name: String(segment.name || `片段 ${index + 1}`).trim() || `片段 ${index + 1}`,
        role: ['system', 'user', 'assistant'].includes(safeRole) ? safeRole : 'system',
        content: String(segment.content || ''),
        deletable: segment.deletable !== false,
        mainSlot: slot,
    };
}

export function loadDraftIntoState(state, preset) {
    const draft = buildDraftFromPreset(preset);
    state.aiInstructionSelectedPresetName = draft.originalName;
    state.aiInstructionDraftName = draft.name;
    state.aiInstructionDraftOriginalName = draft.originalName;
    state.aiInstructionDraftImagePrefix = draft.imagePrefix;
    state.aiInstructionDraftVideoPrefix = draft.videoPrefix;
    state.aiInstructionDraftPromptGroup = draft.promptGroup;
}

export function ensureDraftState(state, preset) {
    const selectedPresetName = String(state.aiInstructionSelectedPresetName || '').trim();
    const selectedPreset = preset && typeof preset === 'object' ? preset : null;
    const presetName = String(selectedPreset?.name || '').trim();

    if (!Array.isArray(state.aiInstructionDraftPromptGroup)) {
        state.aiInstructionDraftPromptGroup = [];
    }

    if (!state.aiInstructionDraftName && !state.aiInstructionDraftOriginalName && selectedPreset) {
        loadDraftIntoState(state, selectedPreset);
        return;
    }

    if (presetName && selectedPresetName && presetName !== selectedPresetName) {
        loadDraftIntoState(state, selectedPreset);
        return;
    }

    if (!presetName && !selectedPresetName && state.aiInstructionDraftPromptGroup.length === 0) {
        const defaultPreset = createDefaultPhoneAiInstructionPreset();
        loadDraftIntoState(state, defaultPreset);
    }
}

export function buildPresetPayload(state, fallbackName = '') {
    return {
        name: String(state.aiInstructionDraftName || '').trim() || String(fallbackName || '').trim() || '未命名预设',
        description: '消息记录表实时回复专用 AI 指令预设',
        mediaMarkers: {
            imagePrefix: String(state.aiInstructionDraftImagePrefix || '').trim(),
            videoPrefix: String(state.aiInstructionDraftVideoPrefix || '').trim(),
        },
        promptGroup: (Array.isArray(state.aiInstructionDraftPromptGroup) ? state.aiInstructionDraftPromptGroup : [])
            .map((segment, index) => normalizeSegmentDraft(segment, index)),
    };
}
