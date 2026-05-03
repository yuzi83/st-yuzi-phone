import {
    PHONE_AI_INSTRUCTION_MAIN_SLOT_OPTIONS,
    normalizePhoneAiInstructionMainSlot,
} from '../../../phone-core/chat-support.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { normalizeSegmentDraft } from './draft-helpers.js';

function buildRoleOptionsHtml(role) {
    const safeRole = String(role || 'system').trim().toLowerCase() || 'system';
    return `
        <option value="system" ${safeRole === 'system' ? 'selected' : ''}>system</option>
        <option value="user" ${safeRole === 'user' ? 'selected' : ''}>user</option>
        <option value="assistant" ${safeRole === 'assistant' ? 'selected' : ''}>assistant</option>
    `;
}

function buildMainSlotOptionsHtml(mainSlot) {
    const safeMainSlot = normalizePhoneAiInstructionMainSlot(mainSlot);
    return PHONE_AI_INSTRUCTION_MAIN_SLOT_OPTIONS.map((option) => {
        const value = String(option.value || '');
        const label = String(option.label || value || '普通片段');
        return `<option value="${escapeHtmlAttr(value)}" ${value === safeMainSlot ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
}

function buildSegmentCardHtml(segment, index, totalCount) {
    const normalizedSegment = normalizeSegmentDraft(segment, index);
    const moveUpDisabled = index === 0 ? 'disabled' : '';
    const moveDownDisabled = index === totalCount - 1 ? 'disabled' : '';

    return `
        <article class="phone-ai-preset-segment-card" data-segment-index="${index}">
            <div class="phone-ai-preset-segment-toolbar">
                <div class="phone-ai-preset-segment-toolbar-main">
                    <span class="phone-ai-preset-segment-index">#${index + 1}</span>
                    <input type="text" class="phone-settings-input phone-ai-preset-segment-name-input" data-segment-index="${index}" value="${escapeHtmlAttr(normalizedSegment.name || '')}" placeholder="片段名称">
                </div>
                <div class="phone-ai-preset-segment-toolbar-actions">
                    <button type="button" class="phone-settings-btn phone-ai-preset-segment-move-up" data-segment-index="${index}" ${moveUpDisabled}>上移</button>
                    <button type="button" class="phone-settings-btn phone-ai-preset-segment-move-down" data-segment-index="${index}" ${moveDownDisabled}>下移</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger phone-ai-preset-segment-delete" data-segment-index="${index}">删除</button>
                </div>
            </div>
            <div class="phone-ai-preset-segment-config">
                <label class="phone-ai-preset-segment-field">
                    <span>角色</span>
                    <select class="phone-settings-select phone-ai-preset-segment-role-select" data-segment-index="${index}">
                        ${buildRoleOptionsHtml(normalizedSegment.role)}
                    </select>
                </label>
                <label class="phone-ai-preset-segment-field">
                    <span>主槽位</span>
                    <select class="phone-settings-select phone-ai-preset-segment-slot-select" data-segment-index="${index}">
                        ${buildMainSlotOptionsHtml(normalizedSegment.mainSlot)}
                    </select>
                </label>
            </div>
            <textarea class="phone-settings-textarea phone-ai-preset-segment-content-input" data-segment-index="${index}" rows="8" placeholder="请输入该段提示词内容...">${escapeHtml(normalizedSegment.content || '')}</textarea>
        </article>
    `;
}

export function buildPresetOptionsHtml(presets = [], selectedPresetName = '') {
    const safeSelectedPresetName = String(selectedPresetName || '').trim();
    const safePresets = Array.isArray(presets) ? presets : [];

    if (safePresets.length === 0) {
        return '<option value="">暂无预设</option>';
    }

    const optionsHtml = safePresets.map((preset) => {
        const presetName = String(preset?.name || '').trim();
        if (!presetName) return '';
        return `<option value="${escapeHtmlAttr(presetName)}" ${presetName === safeSelectedPresetName ? 'selected' : ''}>${escapeHtml(presetName)}</option>`;
    }).join('');

    return optionsHtml || '<option value="">暂无预设</option>';
}

export function buildSegmentCardsHtml(promptGroup = []) {
    const normalizedGroup = (Array.isArray(promptGroup) ? promptGroup : [])
        .map((segment, index) => normalizeSegmentDraft(segment, index));

    if (normalizedGroup.length === 0) {
        return '<div class="phone-empty-msg">暂无分段内容</div>';
    }

    return normalizedGroup
        .map((segment, index) => buildSegmentCardHtml(segment, index, normalizedGroup.length))
        .join('');
}
