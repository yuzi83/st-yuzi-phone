import {
    normalizeMainSlot,
} from './draft-helpers.js';
import { createAiInstructionPresetActions } from './preset-actions.js';
import {
    deleteSegmentAt,
    insertSegment,
    moveSegment,
    resolveSegmentIndex,
    syncUniqueMainSlot,
    updateSegmentAt,
} from './state-actions.js';

function resolveImportInput(root) {
    return /** @type {HTMLInputElement | null} */ (root.querySelector('#phone-ai-instruction-import-input'));
}

/**
 * @param {object} deps
 * @returns {() => void}
 */
export function attachAiInstructionPresetsController(deps) {
    const {
        container,
        state,
        render,
        currentPresetName,
        selectedPresetName,
        rerenderKeepScroll,
        createDefaultPhoneAiInstructionPreset,
        createEmptyPhoneAiInstructionSegment,
        savePhoneAiInstructionPreset,
        showConfirmDialog,
        showToast,
        downloadTextFile,
        runtime,
        aiInstructionPresetService,
    } = deps;
    const getPhoneAiInstructionPreset = aiInstructionPresetService.getPhoneAiInstructionPreset;
    const setCurrentPhoneAiInstructionPresetName = aiInstructionPresetService.setCurrentPhoneAiInstructionPresetName;
    const deletePhoneAiInstructionPreset = aiInstructionPresetService.deletePhoneAiInstructionPreset;
    const importPhoneAiInstructionPresetsFromData = aiInstructionPresetService.importPhoneAiInstructionPresetsFromData;
    const exportPhoneAiInstructionPresetPack = aiInstructionPresetService.exportPhoneAiInstructionPresetPack;
    const exportAllPhoneAiInstructionPresetsPack = aiInstructionPresetService.exportAllPhoneAiInstructionPresetsPack;

    const root = container.querySelector('.phone-settings-page') || container;
    const safeRerender = typeof rerenderKeepScroll === 'function' ? rerenderKeepScroll : render;
    const actions = createAiInstructionPresetActions({
        container,
        state,
        currentPresetName,
        selectedPresetName,
        safeRerender,
        createDefaultPhoneAiInstructionPreset,
        savePhoneAiInstructionPreset,
        showConfirmDialog,
        showToast,
        downloadTextFile,
        getPhoneAiInstructionPreset,
        setCurrentPhoneAiInstructionPresetName,
        deletePhoneAiInstructionPreset,
        importPhoneAiInstructionPresetsFromData,
        exportPhoneAiInstructionPresetPack,
        exportAllPhoneAiInstructionPresetsPack,
        runtime,
    });
    const addListener = typeof runtime?.addEventListener === 'function'
        ? runtime.addEventListener.bind(runtime)
        : (target, type, handler, options) => {
            if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
                return () => {};
            }
            target.addEventListener(type, handler, options);
            return () => {
                try {
                    target.removeEventListener(type, handler, options);
                } catch {}
            };
        };

    const handleInput = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.id === 'phone-ai-instruction-preset-name' && target instanceof HTMLInputElement) {
            state.aiInstructionDraftName = String(target.value || '').trim();
            return;
        }

        if (target.id === 'phone-ai-instruction-image-prefix' && target instanceof HTMLInputElement) {
            state.aiInstructionDraftImagePrefix = String(target.value || '').trim();
            return;
        }

        if (target.id === 'phone-ai-instruction-video-prefix' && target instanceof HTMLInputElement) {
            state.aiInstructionDraftVideoPrefix = String(target.value || '').trim();
            return;
        }

        if (target.classList.contains('phone-ai-preset-segment-name-input') && target instanceof HTMLInputElement) {
            const index = resolveSegmentIndex(target);
            if (index < 0) return;
            updateSegmentAt(state, index, (segment) => ({
                ...segment,
                name: String(target.value || '').trim(),
            }));
            return;
        }

        if (target.classList.contains('phone-ai-preset-segment-content-input') && target instanceof HTMLTextAreaElement) {
            const index = resolveSegmentIndex(target);
            if (index < 0) return;
            updateSegmentAt(state, index, (segment) => ({
                ...segment,
                content: String(target.value || ''),
            }));
        }
    };

    const handleChange = async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.id === 'phone-ai-instruction-preset-select' && target instanceof HTMLSelectElement) {
            actions.switchPreset(target.value || '');
            return;
        }

        if (target.classList.contains('phone-ai-preset-segment-role-select') && target instanceof HTMLSelectElement) {
            const index = resolveSegmentIndex(target);
            if (index < 0) return;
            updateSegmentAt(state, index, (segment) => ({
                ...segment,
                role: String(target.value || 'system').trim().toLowerCase() || 'system',
            }));
            return;
        }

        if (target.classList.contains('phone-ai-preset-segment-slot-select') && target instanceof HTMLSelectElement) {
            const index = resolveSegmentIndex(target);
            if (index < 0) return;
            const slot = normalizeMainSlot(target.value || '');
            syncUniqueMainSlot(state, index, slot);
            updateSegmentAt(state, index, (segment) => ({
                ...segment,
                mainSlot: slot,
            }));
            safeRerender();
            return;
        }

        if (target.id === 'phone-ai-instruction-import-input' && target instanceof HTMLInputElement) {
            const file = target.files?.[0];
            if (!file) return;
            await actions.importPresetFile(file);
        }
    };

    const handleClick = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        if (target.closest('.phone-nav-back')) {
            state.mode = 'home';
            render();
            return;
        }

        const button = target.closest('button');
        if (!(button instanceof HTMLButtonElement)) return;

        if (button.classList.contains('phone-ai-preset-segment-move-up')) {
            const index = resolveSegmentIndex(button);
            if (index < 0) return;
            if (moveSegment(state, index, index - 1)) {
                safeRerender();
            }
            return;
        }

        if (button.classList.contains('phone-ai-preset-segment-move-down')) {
            const index = resolveSegmentIndex(button);
            if (index < 0) return;
            if (moveSegment(state, index, index + 1)) {
                safeRerender();
            }
            return;
        }

        if (button.classList.contains('phone-ai-preset-segment-delete')) {
            const index = resolveSegmentIndex(button);
            if (index < 0) return;
            if (deleteSegmentAt(state, index)) {
                safeRerender();
            }
            return;
        }

        switch (button.id) {
            case 'phone-ai-instruction-add-top-btn': {
                insertSegment(state, createEmptyPhoneAiInstructionSegment, 'top');
                safeRerender();
                return;
            }
            case 'phone-ai-instruction-add-bottom-btn': {
                insertSegment(state, createEmptyPhoneAiInstructionSegment, 'bottom');
                safeRerender();
                return;
            }
            case 'phone-ai-instruction-apply-btn': {
                actions.applyPreset();
                return;
            }
            case 'phone-ai-instruction-save-btn': {
                actions.savePreset({
                    originalName: String(state.aiInstructionDraftOriginalName || state.aiInstructionSelectedPresetName || '').trim(),
                    overwrite: true,
                });
                return;
            }
            case 'phone-ai-instruction-save-as-btn': {
                actions.savePreset({
                    originalName: '',
                    overwrite: false,
                });
                return;
            }
            case 'phone-ai-instruction-delete-btn': {
                actions.deletePreset();
                return;
            }
            case 'phone-ai-instruction-reset-btn': {
                actions.resetPresetDraft();
                return;
            }
            case 'phone-ai-instruction-export-btn': {
                actions.exportPreset();
                return;
            }
            case 'phone-ai-instruction-export-all-btn': {
                actions.exportAllPresets();
                return;
            }
            case 'phone-ai-instruction-import-btn': {
                const importInput = resolveImportInput(root);
                if (!importInput) return;
                importInput.value = '';
                importInput.click();
                return;
            }
            default:
                return;
        }
    };

    const removeInputListener = addListener(root, 'input', handleInput);
    const removeChangeListener = addListener(root, 'change', handleChange);
    const removeClickListener = addListener(root, 'click', handleClick);

    return () => {
        removeInputListener();
        removeChangeListener();
        removeClickListener();
    };
}
