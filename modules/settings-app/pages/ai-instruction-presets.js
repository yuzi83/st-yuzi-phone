import { buildAiInstructionPresetsPageHtml } from '../layout/frame.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { downloadTextFile } from '../services/media-upload.js';
import {
    createDefaultPhoneAiInstructionPreset,
    createEmptyPhoneAiInstructionSegment,
    savePhoneAiInstructionPreset,
} from '../../phone-core/chat-support.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';

function sanitizeFilenamePart(value, fallback = 'preset') {
    const safeValue = String(value || '').trim();
    const normalized = safeValue.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
    return normalized || fallback;
}

function normalizeMainSlot(slot, segment = {}) {
    const raw = String(slot || segment.mainSlot || '').trim().toUpperCase();
    if (raw === 'A' || segment.isMain) return 'A';
    if (raw === 'B' || segment.isMain2) return 'B';
    return '';
}

function getPromptGroupFromPreset(preset) {
    if (!preset || typeof preset !== 'object') return [];
    if (Array.isArray(preset.promptGroup)) return preset.promptGroup;
    if (Array.isArray(preset.segments)) return preset.segments;
    return [];
}

function getMediaMarkersFromPreset(preset) {
    const src = preset && typeof preset === 'object' && preset.mediaMarkers && typeof preset.mediaMarkers === 'object'
        ? preset.mediaMarkers
        : {};
    return {
        imagePrefix: String(src.imagePrefix || '[图片]').trim(),
        videoPrefix: String(src.videoPrefix || '[视频]').trim(),
    };
}

function clonePromptGroup(promptGroup = []) {
    return (Array.isArray(promptGroup) ? promptGroup : []).map((segment) => ({ ...segment }));
}

function buildDraftFromPreset(preset) {
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

function normalizeSegmentDraft(segment = {}, index = 0) {
    const slot = normalizeMainSlot('', segment);
    const safeRole = String(segment.role || 'system').trim().toLowerCase();
    return {
        id: String(segment.id || `phone_segment_${Date.now()}_${index}`).trim() || `phone_segment_${Date.now()}_${index}`,
        name: String(segment.name || `片段 ${index + 1}`).trim() || `片段 ${index + 1}`,
        role: ['system', 'user', 'assistant'].includes(safeRole) ? safeRole : 'system',
        content: String(segment.content || ''),
        deletable: segment.deletable !== false,
        mainSlot: slot,
    };
}

function buildSegmentCardsHtml(promptGroup = []) {
    const normalizedGroup = (Array.isArray(promptGroup) ? promptGroup : []).map((segment, index) => normalizeSegmentDraft(segment, index));
    if (normalizedGroup.length === 0) {
        return '<div class="phone-empty-msg">暂无分段内容</div>';
    }

    return normalizedGroup.map((segment, index) => {
        const role = String(segment.role || 'system').trim().toLowerCase();
        const mainSlot = normalizeMainSlot('', segment);
        const moveUpDisabled = index === 0 ? 'disabled' : '';
        const moveDownDisabled = index === normalizedGroup.length - 1 ? 'disabled' : '';

        return `
            <article class="phone-ai-preset-segment-card" data-segment-index="${index}">
                <div class="phone-ai-preset-segment-toolbar">
                    <div class="phone-ai-preset-segment-toolbar-main">
                        <span class="phone-ai-preset-segment-index">#${index + 1}</span>
                        <input type="text" class="phone-settings-input phone-ai-preset-segment-name-input" data-segment-index="${index}" value="${escapeHtmlAttr(segment.name || '')}" placeholder="片段名称">
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
                            <option value="system" ${role === 'system' ? 'selected' : ''}>system</option>
                            <option value="user" ${role === 'user' ? 'selected' : ''}>user</option>
                            <option value="assistant" ${role === 'assistant' ? 'selected' : ''}>assistant</option>
                        </select>
                    </label>
                    <label class="phone-ai-preset-segment-field">
                        <span>主槽位</span>
                        <select class="phone-settings-select phone-ai-preset-segment-slot-select" data-segment-index="${index}">
                            <option value="" ${!mainSlot ? 'selected' : ''}>普通片段</option>
                            <option value="A" ${mainSlot === 'A' ? 'selected' : ''}>主槽位 A</option>
                            <option value="B" ${mainSlot === 'B' ? 'selected' : ''}>主槽位 B</option>
                        </select>
                    </label>
                </div>
                <textarea class="phone-settings-textarea phone-ai-preset-segment-content-input" data-segment-index="${index}" rows="8" placeholder="请输入该段提示词内容...">${escapeHtml(segment.content || '')}</textarea>
            </article>
        `;
    }).join('');
}

function loadDraftIntoState(state, preset) {
    const draft = buildDraftFromPreset(preset);
    state.aiInstructionSelectedPresetName = draft.originalName;
    state.aiInstructionDraftName = draft.name;
    state.aiInstructionDraftOriginalName = draft.originalName;
    state.aiInstructionDraftImagePrefix = draft.imagePrefix;
    state.aiInstructionDraftVideoPrefix = draft.videoPrefix;
    state.aiInstructionDraftPromptGroup = draft.promptGroup;
}

function ensureDraftState(state, preset) {
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

export function renderAiInstructionPresetsPage(ctx) {
    const {
        container,
        state,
        render,
        rerenderApiPromptConfigKeepScroll,
        getPhoneAiInstructionPresets,
        getPhoneAiInstructionPreset,
        getCurrentPhoneAiInstructionPresetName,
        setCurrentPhoneAiInstructionPresetName,
        deletePhoneAiInstructionPreset,
        importPhoneAiInstructionPresetsFromData,
        exportPhoneAiInstructionPresetPack,
        exportAllPhoneAiInstructionPresetsPack,
    } = ctx;

    const presets = getPhoneAiInstructionPresets();
    const currentPresetName = String(getCurrentPhoneAiInstructionPresetName() || '').trim();
    const selectedPresetName = String(
        state.aiInstructionSelectedPresetName
        || currentPresetName
        || (presets[0]?.name || '')
    ).trim();
    state.aiInstructionSelectedPresetName = selectedPresetName;

    const selectedPreset = selectedPresetName
        ? (getPhoneAiInstructionPreset(selectedPresetName) || presets.find((preset) => preset.name === selectedPresetName) || null)
        : null;

    ensureDraftState(state, selectedPreset);

    const draftPresetName = String(state.aiInstructionDraftName || selectedPresetName || currentPresetName || '默认实时回复预设').trim() || '默认实时回复预设';
    const draftImagePrefix = String(state.aiInstructionDraftImagePrefix || getMediaMarkersFromPreset(selectedPreset).imagePrefix || '').trim();
    const draftVideoPrefix = String(state.aiInstructionDraftVideoPrefix || getMediaMarkersFromPreset(selectedPreset).videoPrefix || '').trim();
    const draftPromptGroup = Array.isArray(state.aiInstructionDraftPromptGroup)
        ? state.aiInstructionDraftPromptGroup
        : [];

    const presetOptions = presets.length > 0
        ? presets.map((preset) => (
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === selectedPresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        )).join('')
        : '<option value="">暂无预设</option>';

    container.innerHTML = buildAiInstructionPresetsPageHtml({
        currentPresetName,
        draftPresetName,
        presetOptions,
        presetCount: presets.length,
        imageMarkerValue: draftImagePrefix,
        videoMarkerValue: draftVideoPrefix,
        segmentCardsHtml: buildSegmentCardsHtml(draftPromptGroup),
    });

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'home';
        render();
    });

    const rerenderKeepScroll = typeof rerenderApiPromptConfigKeepScroll === 'function'
        ? rerenderApiPromptConfigKeepScroll
        : render;

    const draftNameInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-ai-instruction-preset-name'));
    draftNameInput?.addEventListener('input', () => {
        state.aiInstructionDraftName = String(draftNameInput.value || '').trim();
    });

    const imagePrefixInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-ai-instruction-image-prefix'));
    imagePrefixInput?.addEventListener('input', () => {
        state.aiInstructionDraftImagePrefix = String(imagePrefixInput.value || '').trim();
    });

    const videoPrefixInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-ai-instruction-video-prefix'));
    videoPrefixInput?.addEventListener('input', () => {
        state.aiInstructionDraftVideoPrefix = String(videoPrefixInput.value || '').trim();
    });

    const presetSelect = /** @type {HTMLSelectElement | null} */ (container.querySelector('#phone-ai-instruction-preset-select'));
    presetSelect?.addEventListener('change', () => {
        const nextName = String(presetSelect.value || '').trim();
        state.aiInstructionSelectedPresetName = nextName;
        const nextPreset = nextName ? getPhoneAiInstructionPreset(nextName) : createDefaultPhoneAiInstructionPreset();
        loadDraftIntoState(state, nextPreset);
        rerenderKeepScroll();
    });

    const syncUniqueMainSlot = (index, nextSlot) => {
        const safeSlot = normalizeMainSlot(nextSlot);
        if (!safeSlot) return;
        state.aiInstructionDraftPromptGroup = state.aiInstructionDraftPromptGroup.map((segment, currentIndex) => {
            if (currentIndex === index) return segment;
            const currentSlot = normalizeMainSlot('', segment);
            if (currentSlot !== safeSlot) return segment;
            return {
                ...segment,
                mainSlot: '',
            };
        });
    };

    const updateSegmentAt = (index, updater) => {
        const current = Array.isArray(state.aiInstructionDraftPromptGroup) ? [...state.aiInstructionDraftPromptGroup] : [];
        const segment = normalizeSegmentDraft(current[index], index);
        current[index] = typeof updater === 'function' ? updater(segment) : segment;
        state.aiInstructionDraftPromptGroup = current;
    };

    container.querySelectorAll('.phone-ai-preset-segment-name-input').forEach((inputEl) => {
        inputEl.addEventListener('input', () => {
            const index = Number(inputEl.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            updateSegmentAt(index, (segment) => ({
                ...segment,
                name: String(inputEl.value || '').trim(),
            }));
        });
    });

    container.querySelectorAll('.phone-ai-preset-segment-role-select').forEach((selectEl) => {
        selectEl.addEventListener('change', () => {
            const index = Number(selectEl.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            updateSegmentAt(index, (segment) => ({
                ...segment,
                role: String(selectEl.value || 'system').trim().toLowerCase() || 'system',
            }));
        });
    });

    container.querySelectorAll('.phone-ai-preset-segment-slot-select').forEach((selectEl) => {
        selectEl.addEventListener('change', () => {
            const index = Number(selectEl.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            const slot = normalizeMainSlot(selectEl.value || '');
            syncUniqueMainSlot(index, slot);
            updateSegmentAt(index, (segment) => ({
                ...segment,
                mainSlot: slot,
            }));
            rerenderKeepScroll();
        });
    });

    container.querySelectorAll('.phone-ai-preset-segment-content-input').forEach((textareaEl) => {
        textareaEl.addEventListener('input', () => {
            const index = Number(textareaEl.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            updateSegmentAt(index, (segment) => ({
                ...segment,
                content: String(textareaEl.value || ''),
            }));
        });
    });

    const moveSegment = (fromIndex, toIndex) => {
        const list = Array.isArray(state.aiInstructionDraftPromptGroup) ? [...state.aiInstructionDraftPromptGroup] : [];
        if (fromIndex < 0 || fromIndex >= list.length) return;
        if (toIndex < 0 || toIndex >= list.length) return;
        const [picked] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, picked);
        state.aiInstructionDraftPromptGroup = list;
        rerenderKeepScroll();
    };

    container.querySelectorAll('.phone-ai-preset-segment-move-up').forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = Number(btn.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            moveSegment(index, index - 1);
        });
    });

    container.querySelectorAll('.phone-ai-preset-segment-move-down').forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = Number(btn.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            moveSegment(index, index + 1);
        });
    });

    container.querySelectorAll('.phone-ai-preset-segment-delete').forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = Number(btn.getAttribute('data-segment-index'));
            if (Number.isNaN(index)) return;
            const segment = state.aiInstructionDraftPromptGroup[index];
            if (!segment) return;
            state.aiInstructionDraftPromptGroup = state.aiInstructionDraftPromptGroup.filter((_, currentIndex) => currentIndex !== index);
            rerenderKeepScroll();
        });
    });

    const insertSegment = (position = 'bottom') => {
        const nextSegment = createEmptyPhoneAiInstructionSegment();
        const current = Array.isArray(state.aiInstructionDraftPromptGroup) ? [...state.aiInstructionDraftPromptGroup] : [];
        if (position === 'top') {
            current.unshift(nextSegment);
        } else {
            current.push(nextSegment);
        }
        state.aiInstructionDraftPromptGroup = current;
        rerenderKeepScroll();
    };

    container.querySelector('#phone-ai-instruction-add-top-btn')?.addEventListener('click', () => insertSegment('top'));
    container.querySelector('#phone-ai-instruction-add-bottom-btn')?.addEventListener('click', () => insertSegment('bottom'));

    const buildPresetPayload = () => ({
        name: String(state.aiInstructionDraftName || '').trim() || String(currentPresetName || '').trim() || '未命名预设',
        description: '消息记录表实时回复专用 AI 指令预设',
        mediaMarkers: {
            imagePrefix: String(state.aiInstructionDraftImagePrefix || '').trim(),
            videoPrefix: String(state.aiInstructionDraftVideoPrefix || '').trim(),
        },
        promptGroup: (Array.isArray(state.aiInstructionDraftPromptGroup) ? state.aiInstructionDraftPromptGroup : []).map((segment, index) => normalizeSegmentDraft(segment, index)),
    });

    container.querySelector('#phone-ai-instruction-apply-btn')?.addEventListener('click', () => {
        const targetName = String(state.aiInstructionSelectedPresetName || selectedPresetName || '').trim();
        if (!targetName) {
            showToast(container, '请先选择预设', true);
            return;
        }
        const result = setCurrentPhoneAiInstructionPresetName(targetName);
        if (result?.success) {
            showToast(container, `当前实时回复预设已切换为：${targetName}`);
            rerenderKeepScroll();
        } else {
            showToast(container, result?.message || '切换预设失败', true);
        }
    });

    container.querySelector('#phone-ai-instruction-save-btn')?.addEventListener('click', () => {
        const payload = buildPresetPayload();
        if (!payload.name) {
            showToast(container, '请输入预设名称', true);
            return;
        }
        const result = savePhoneAiInstructionPreset(payload, {
            originalName: String(state.aiInstructionDraftOriginalName || state.aiInstructionSelectedPresetName || '').trim(),
            overwrite: true,
            switchTo: false,
        });
        if (result?.success) {
            state.aiInstructionSelectedPresetName = String(result.presetName || payload.name).trim();
            state.aiInstructionDraftOriginalName = state.aiInstructionSelectedPresetName;
            state.aiInstructionDraftName = state.aiInstructionSelectedPresetName;
            state.apiPromptConfigSelectedTemplate = state.aiInstructionSelectedPresetName;
            showToast(container, result.message || '预设已保存');
            rerenderKeepScroll();
        } else {
            showToast(container, result?.message || '保存失败', true);
        }
    });

    container.querySelector('#phone-ai-instruction-save-as-btn')?.addEventListener('click', () => {
        const payload = buildPresetPayload();
        if (!payload.name) {
            showToast(container, '请输入预设名称', true);
            return;
        }
        const result = savePhoneAiInstructionPreset(payload, {
            originalName: '',
            overwrite: false,
            switchTo: false,
        });
        if (result?.success) {
            state.aiInstructionSelectedPresetName = String(result.presetName || payload.name).trim();
            state.aiInstructionDraftOriginalName = state.aiInstructionSelectedPresetName;
            state.aiInstructionDraftName = state.aiInstructionSelectedPresetName;
            state.apiPromptConfigSelectedTemplate = state.aiInstructionSelectedPresetName;
            showToast(container, result.message || '已另存为新预设');
            rerenderKeepScroll();
        } else {
            showToast(container, result?.message || '另存失败', true);
        }
    });

    container.querySelector('#phone-ai-instruction-delete-btn')?.addEventListener('click', () => {
        const targetName = String(state.aiInstructionSelectedPresetName || selectedPresetName || '').trim();
        if (!targetName) return;
        showConfirmDialog(
            container,
            '确认删除',
            `确定要删除 AI 指令预设「${targetName}」吗？此操作无法撤销。`,
            () => {
                const result = deletePhoneAiInstructionPreset(targetName);
                if (result?.success) {
                    const nextName = String(result.presetName || '').trim();
                    const nextPreset = nextName ? getPhoneAiInstructionPreset(nextName) : createDefaultPhoneAiInstructionPreset();
                    loadDraftIntoState(state, nextPreset);
                    state.apiPromptConfigSelectedTemplate = nextName;
                    showToast(container, result.message || '预设已删除');
                    rerenderKeepScroll();
                } else {
                    showToast(container, result?.message || '删除失败', true);
                }
            },
            '删除',
            '取消'
        );
    });

    container.querySelector('#phone-ai-instruction-reset-btn')?.addEventListener('click', () => {
        const defaultPreset = createDefaultPhoneAiInstructionPreset({ name: String(state.aiInstructionDraftName || '').trim() || undefined });
        const mediaMarkers = getMediaMarkersFromPreset(defaultPreset);
        state.aiInstructionDraftPromptGroup = clonePromptGroup(getPromptGroupFromPreset(defaultPreset));
        state.aiInstructionDraftImagePrefix = mediaMarkers.imagePrefix;
        state.aiInstructionDraftVideoPrefix = mediaMarkers.videoPrefix;
        if (!String(state.aiInstructionDraftName || '').trim()) {
            state.aiInstructionDraftName = String(defaultPreset.name || '').trim();
        }
        rerenderKeepScroll();
        showToast(container, '已恢复为默认提示词结构');
    });

    container.querySelector('#phone-ai-instruction-export-btn')?.addEventListener('click', () => {
        const targetName = String(state.aiInstructionSelectedPresetName || selectedPresetName || '').trim();
        if (!targetName) {
            showToast(container, '请先选择要导出的预设', true);
            return;
        }
        const pack = exportPhoneAiInstructionPresetPack(targetName);
        if (!pack) {
            showToast(container, '导出失败：未找到预设', true);
            return;
        }
        const filename = `yuzi_phone_ai_preset_${sanitizeFilenamePart(targetName, 'preset')}.json`;
        downloadTextFile(filename, JSON.stringify(pack, null, 2), 'application/json');
        showToast(container, `已导出预设：${targetName}`);
    });

    container.querySelector('#phone-ai-instruction-export-all-btn')?.addEventListener('click', () => {
        const pack = exportAllPhoneAiInstructionPresetsPack();
        downloadTextFile('yuzi_phone_ai_presets_all.json', JSON.stringify(pack, null, 2), 'application/json');
        showToast(container, '已导出全部 AI 指令预设');
    });

    const importInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-ai-instruction-import-input'));
    container.querySelector('#phone-ai-instruction-import-btn')?.addEventListener('click', () => {
        if (!importInput) return;
        importInput.value = '';
        importInput.click();
    });

    importInput?.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const result = importPhoneAiInstructionPresetsFromData(text, {
                overwrite: true,
                switchTo: false,
            });
            if (result?.success) {
                const nextName = String(result.presetNames?.[0] || result.currentPresetName || '').trim();
                const nextPreset = nextName ? getPhoneAiInstructionPreset(nextName) : null;
                if (nextPreset) {
                    loadDraftIntoState(state, nextPreset);
                }
                state.apiPromptConfigSelectedTemplate = nextName || state.apiPromptConfigSelectedTemplate;
                showToast(container, result.message || 'AI 指令预设导入成功');
                rerenderKeepScroll();
            } else {
                showToast(container, result?.message || '导入失败', true);
            }
        } catch (error) {
            showToast(container, error?.message || '读取导入文件失败', true);
        }
    });
}
