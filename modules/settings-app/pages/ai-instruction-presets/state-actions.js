import {
    normalizeMainSlot,
    normalizeSegmentDraft,
} from './draft-helpers.js';

export function resolveSegmentIndex(element) {
    const rawIndex = String(element?.getAttribute('data-segment-index') || '').trim();
    const index = Number(rawIndex);
    return Number.isInteger(index) ? index : -1;
}

export function syncUniqueMainSlot(state, index, nextSlot) {
    const safeSlot = normalizeMainSlot(nextSlot);
    if (!safeSlot) return;
    state.aiInstructionDraftPromptGroup = (Array.isArray(state.aiInstructionDraftPromptGroup)
        ? state.aiInstructionDraftPromptGroup
        : []).map((segment, currentIndex) => {
        if (currentIndex === index) return segment;
        const currentSlot = normalizeMainSlot('', segment);
        if (currentSlot !== safeSlot) return segment;
        return {
            ...segment,
            mainSlot: '',
        };
    });
}

export function updateSegmentAt(state, index, updater) {
    const current = Array.isArray(state.aiInstructionDraftPromptGroup)
        ? [...state.aiInstructionDraftPromptGroup]
        : [];
    if (index < 0 || index >= current.length) return;
    const segment = normalizeSegmentDraft(current[index], index);
    current[index] = typeof updater === 'function' ? updater(segment) : segment;
    state.aiInstructionDraftPromptGroup = current;
}

export function moveSegment(state, fromIndex, toIndex) {
    const list = Array.isArray(state.aiInstructionDraftPromptGroup)
        ? [...state.aiInstructionDraftPromptGroup]
        : [];
    if (fromIndex < 0 || fromIndex >= list.length) return false;
    if (toIndex < 0 || toIndex >= list.length) return false;
    const [picked] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, picked);
    state.aiInstructionDraftPromptGroup = list;
    return true;
}

export function insertSegment(state, createEmptyPhoneAiInstructionSegment, position = 'bottom') {
    const nextSegment = createEmptyPhoneAiInstructionSegment();
    const current = Array.isArray(state.aiInstructionDraftPromptGroup)
        ? [...state.aiInstructionDraftPromptGroup]
        : [];
    if (position === 'top') {
        current.unshift(nextSegment);
    } else {
        current.push(nextSegment);
    }
    state.aiInstructionDraftPromptGroup = current;
}

export function deleteSegmentAt(state, index) {
    const current = Array.isArray(state.aiInstructionDraftPromptGroup)
        ? state.aiInstructionDraftPromptGroup
        : [];
    if (index < 0 || index >= current.length) return false;
    state.aiInstructionDraftPromptGroup = current.filter((_, currentIndex) => currentIndex !== index);
    return true;
}
