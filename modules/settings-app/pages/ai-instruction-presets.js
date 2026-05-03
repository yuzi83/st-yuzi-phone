import { buildAiInstructionPresetsPageHtml } from '../layout/frame.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { downloadTextFile } from '../services/media-upload.js';
import {
    createDefaultPhoneAiInstructionPreset,
    createEmptyPhoneAiInstructionSegment,
    savePhoneAiInstructionPreset,
} from '../../phone-core/chat-support.js';
import {
    ensureDraftState,
    getMediaMarkersFromPreset,
} from './ai-instruction-presets/draft-helpers.js';
import { buildPresetOptionsHtml, buildSegmentCardsHtml } from './ai-instruction-presets/template-builders.js';
import { attachAiInstructionPresetsController } from './ai-instruction-presets/controller.js';

export function createAiInstructionPresetsPage(ctx) {
    return {
        mount() {
            renderAiInstructionPresetsPage(ctx);
        },
        update() {
            renderAiInstructionPresetsPage(ctx);
        },
        dispose() {},
    };
}

export function renderAiInstructionPresetsPage(ctx) {
    const {
        container,
        state,
        render,
        rerenderApiPromptConfigKeepScroll,
        registerCleanup,
        pageRuntime,
        aiInstructionPresetService,
    } = ctx;
    const getPhoneAiInstructionPresets = aiInstructionPresetService.getPhoneAiInstructionPresets;
    const getPhoneAiInstructionPreset = aiInstructionPresetService.getPhoneAiInstructionPreset;
    const getCurrentPhoneAiInstructionPresetName = aiInstructionPresetService.getCurrentPhoneAiInstructionPresetName;
    const setCurrentPhoneAiInstructionPresetName = aiInstructionPresetService.setCurrentPhoneAiInstructionPresetName;
    const deletePhoneAiInstructionPreset = aiInstructionPresetService.deletePhoneAiInstructionPreset;
    const importPhoneAiInstructionPresetsFromData = aiInstructionPresetService.importPhoneAiInstructionPresetsFromData;
    const exportPhoneAiInstructionPresetPack = aiInstructionPresetService.exportPhoneAiInstructionPresetPack;
    const exportAllPhoneAiInstructionPresetsPack = aiInstructionPresetService.exportAllPhoneAiInstructionPresetsPack;

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

    const selectedMediaMarkers = getMediaMarkersFromPreset(selectedPreset);
    const draftPresetName = String(state.aiInstructionDraftName || selectedPresetName || currentPresetName || '默认实时回复预设').trim() || '默认实时回复预设';
    const draftImagePrefix = String(state.aiInstructionDraftImagePrefix || selectedMediaMarkers.imagePrefix || '').trim();
    const draftVideoPrefix = String(state.aiInstructionDraftVideoPrefix || selectedMediaMarkers.videoPrefix || '').trim();
    const draftPromptGroup = Array.isArray(state.aiInstructionDraftPromptGroup)
        ? state.aiInstructionDraftPromptGroup
        : [];

    container.innerHTML = buildAiInstructionPresetsPageHtml({
        currentPresetName,
        draftPresetName,
        presetOptions: buildPresetOptionsHtml(presets, selectedPresetName),
        presetCount: presets.length,
        imageMarkerValue: draftImagePrefix,
        videoMarkerValue: draftVideoPrefix,
        segmentCardsHtml: buildSegmentCardsHtml(draftPromptGroup),
    });

    const rerenderKeepScroll = typeof rerenderApiPromptConfigKeepScroll === 'function'
        ? rerenderApiPromptConfigKeepScroll
        : render;
    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;

    const cleanupController = attachAiInstructionPresetsController({
        container,
        state,
        render,
        currentPresetName,
        selectedPresetName,
        rerenderKeepScroll,
        getPhoneAiInstructionPreset,
        setCurrentPhoneAiInstructionPresetName,
        deletePhoneAiInstructionPreset,
        importPhoneAiInstructionPresetsFromData,
        exportPhoneAiInstructionPresetPack,
        exportAllPhoneAiInstructionPresetsPack,
        createDefaultPhoneAiInstructionPreset,
        createEmptyPhoneAiInstructionSegment,
        savePhoneAiInstructionPreset,
        showConfirmDialog,
        showToast,
        downloadTextFile,
        runtime,
        aiInstructionPresetService,
    });

    if (typeof cleanupController === 'function') {
        if (runtime?.registerCleanup) {
            runtime.registerCleanup(cleanupController);
        } else if (typeof registerCleanup === 'function') {
            registerCleanup(cleanupController);
        }
    }
}
