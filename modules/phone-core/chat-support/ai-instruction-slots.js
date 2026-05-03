export const PHONE_AI_INSTRUCTION_MAIN_SLOT_A = 'A';
export const PHONE_AI_INSTRUCTION_MAIN_SLOT_B = 'B';
export const PHONE_AI_INSTRUCTION_DEFAULT_MAIN_SLOT = '';

export const PHONE_AI_INSTRUCTION_MAIN_SLOT_OPTIONS = Object.freeze([
    Object.freeze({ value: PHONE_AI_INSTRUCTION_DEFAULT_MAIN_SLOT, label: '普通片段' }),
    Object.freeze({ value: PHONE_AI_INSTRUCTION_MAIN_SLOT_A, label: '主槽位 A' }),
    Object.freeze({ value: PHONE_AI_INSTRUCTION_MAIN_SLOT_B, label: '主槽位 B' }),
]);

export const PHONE_AI_INSTRUCTION_MAIN_SLOT_ORDER = Object.freeze({
    [PHONE_AI_INSTRUCTION_MAIN_SLOT_A]: 0,
    [PHONE_AI_INSTRUCTION_MAIN_SLOT_B]: 1,
    [PHONE_AI_INSTRUCTION_DEFAULT_MAIN_SLOT]: 2,
});

const SUPPORTED_MAIN_SLOTS = new Set(
    PHONE_AI_INSTRUCTION_MAIN_SLOT_OPTIONS
        .map((option) => option.value)
        .filter(Boolean),
);

export function normalizePhoneAiInstructionMainSlot(raw) {
    const slot = String(raw || '').trim().toUpperCase();
    return SUPPORTED_MAIN_SLOTS.has(slot) ? slot : PHONE_AI_INSTRUCTION_DEFAULT_MAIN_SLOT;
}

export function normalizePhoneAiInstructionSegmentMainSlot(slot, segment = {}) {
    const src = segment && typeof segment === 'object' ? segment : {};
    const explicitSlot = normalizePhoneAiInstructionMainSlot(slot || src.mainSlot || '');
    if (explicitSlot) return explicitSlot;
    if (src.isMain) return PHONE_AI_INSTRUCTION_MAIN_SLOT_A;
    if (src.isMain2) return PHONE_AI_INSTRUCTION_MAIN_SLOT_B;
    return PHONE_AI_INSTRUCTION_DEFAULT_MAIN_SLOT;
}

export function resolvePhoneAiInstructionMainSlotOrder(slot) {
    const normalizedSlot = normalizePhoneAiInstructionMainSlot(slot);
    return PHONE_AI_INSTRUCTION_MAIN_SLOT_ORDER[normalizedSlot] ?? PHONE_AI_INSTRUCTION_MAIN_SLOT_ORDER[PHONE_AI_INSTRUCTION_DEFAULT_MAIN_SLOT];
}
