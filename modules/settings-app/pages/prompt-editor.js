import { createDefaultPhoneAiInstructionPreset } from '../../phone-core/chat-support.js';
import { buildPromptEditorPageHtml } from '../layout/frame.js';
import { showToast } from '../ui/toast.js';

const DEFAULT_PROMPT_EDITOR_MEDIA_MARKERS = Object.freeze({
    imagePrefix: '[图片]',
    videoPrefix: '[视频]',
});

function hasOwn(value, key) {
    return !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizePromptEditorMediaMarkers(raw, fallback = DEFAULT_PROMPT_EDITOR_MEDIA_MARKERS) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const fallbackSrc = fallback && typeof fallback === 'object' ? fallback : DEFAULT_PROMPT_EDITOR_MEDIA_MARKERS;
    const fallbackImagePrefix = fallbackSrc.imagePrefix ?? DEFAULT_PROMPT_EDITOR_MEDIA_MARKERS.imagePrefix;
    const fallbackVideoPrefix = fallbackSrc.videoPrefix ?? DEFAULT_PROMPT_EDITOR_MEDIA_MARKERS.videoPrefix;
    return {
        imagePrefix: String(hasOwn(src, 'imagePrefix') ? src.imagePrefix ?? fallbackImagePrefix : fallbackImagePrefix).trim(),
        videoPrefix: String(hasOwn(src, 'videoPrefix') ? src.videoPrefix ?? fallbackVideoPrefix : fallbackVideoPrefix).trim(),
    };
}

function extractMediaMarkersPatch(sourcePreset) {
    if (!sourcePreset || typeof sourcePreset !== 'object' || !hasOwn(sourcePreset, 'mediaMarkers')) {
        return null;
    }
    return normalizePromptEditorMediaMarkers(sourcePreset.mediaMarkers);
}

export function resolvePresetPayloadFromText(text) {
    const rawText = String(text || '').trim();
    if (!rawText) {
        return {
            ok: false,
            message: '请输入分段 JSON',
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (error) {
        return {
            ok: false,
            message: `JSON 解析失败：${error?.message || '格式错误'}`,
        };
    }

    let sourcePreset = parsed;
    if (Array.isArray(parsed?.presets) && parsed.presets.length > 0) {
        sourcePreset = parsed.presets[0];
    }

    if (Array.isArray(sourcePreset)) {
        return {
            ok: true,
            presetPatch: {
                promptGroup: sourcePreset,
            },
        };
    }

    if (sourcePreset && typeof sourcePreset === 'object') {
        const mediaMarkers = extractMediaMarkersPatch(sourcePreset);
        if (Array.isArray(sourcePreset.promptGroup)) {
            return {
                ok: true,
                presetPatch: {
                    description: String(sourcePreset.description || '').trim(),
                    promptGroup: sourcePreset.promptGroup,
                    ...(mediaMarkers ? { mediaMarkers } : {}),
                },
            };
        }
        if (Array.isArray(sourcePreset.segments)) {
            return {
                ok: true,
                presetPatch: {
                    description: String(sourcePreset.description || '').trim(),
                    promptGroup: sourcePreset.segments,
                    ...(mediaMarkers ? { mediaMarkers } : {}),
                },
            };
        }
    }

    return {
        ok: false,
        message: '请输入有效的 promptGroup 数组，或包含 promptGroup 的预设 JSON',
    };
}

export function resolvePromptEditorMediaMarkers({ presetPatch, stateMediaMarkers, existingPreset, defaultPreset } = {}) {
    if (presetPatch && typeof presetPatch === 'object' && hasOwn(presetPatch, 'mediaMarkers')) {
        return normalizePromptEditorMediaMarkers(presetPatch.mediaMarkers);
    }
    if (stateMediaMarkers && typeof stateMediaMarkers === 'object') {
        return normalizePromptEditorMediaMarkers(stateMediaMarkers);
    }
    if (existingPreset && typeof existingPreset === 'object' && existingPreset.mediaMarkers) {
        return normalizePromptEditorMediaMarkers(existingPreset.mediaMarkers);
    }
    return normalizePromptEditorMediaMarkers(defaultPreset?.mediaMarkers);
}

export function buildPromptEditorPresetPayload({ name, resolved, stateMediaMarkers, existingPreset, defaultPreset } = {}) {
    const presetPatch = resolved?.presetPatch || {};
    return {
        name: String(name || '').trim(),
        description: String(presetPatch.description || '').trim(),
        mediaMarkers: resolvePromptEditorMediaMarkers({
            presetPatch,
            stateMediaMarkers,
            existingPreset,
            defaultPreset,
        }),
        promptGroup: Array.isArray(presetPatch.promptGroup) ? presetPatch.promptGroup : [],
    };
}

export function resolvePromptEditorNameConflict({ isNew, name, originalName, getPreset } = {}) {
    const safeName = String(name || '').trim();
    const safeOriginalName = String(originalName || '').trim();
    if (!safeName || typeof getPreset !== 'function') {
        return { conflict: false };
    }

    let existingPreset = null;
    try {
        existingPreset = getPreset(safeName);
    } catch (error) {
        return { conflict: false };
    }

    if (!existingPreset) {
        return { conflict: false };
    }

    if (isNew) {
        return {
            conflict: true,
            message: '预设名称已存在',
            presetName: safeName,
        };
    }

    if (!safeOriginalName) {
        return {
            conflict: true,
            message: `已存在同名预设：${safeName}`,
            presetName: safeName,
        };
    }

    if (safeName !== safeOriginalName) {
        return {
            conflict: true,
            message: `不能将预设「${safeOriginalName}」重命名为已存在的「${safeName}」，请先更换名称或删除目标预设`,
            presetName: safeName,
            originalName: safeOriginalName,
        };
    }

    return { conflict: false };
}

export function createPromptEditorImportLifecycleGuard(runtime) {
    const pageRuntime = runtime && typeof runtime === 'object' ? runtime : null;
    let importToken = 0;
    let disposed = false;

    const invalidate = () => {
        importToken += 1;
    };

    const dispose = () => {
        disposed = true;
        invalidate();
    };

    const createToken = () => {
        invalidate();
        return importToken;
    };

    const isRuntimeDisposed = () => !!(pageRuntime
        && typeof pageRuntime.isDisposed === 'function'
        && pageRuntime.isDisposed());

    const isActive = (token) => (
        Number.isInteger(token)
        && token === importToken
        && !disposed
        && !isRuntimeDisposed()
    );

    if (pageRuntime && typeof pageRuntime.registerCleanup === 'function') {
        pageRuntime.registerCleanup(dispose);
    }

    return {
        createToken,
        isActive,
        invalidate,
        dispose,
    };
}

export function createPromptEditorPage(ctx) {
    return {
        mount() {
            renderPromptEditorPage(ctx);
        },
        update() {
            renderPromptEditorPage(ctx);
        },
        dispose() {},
    };
}

export function renderPromptEditorPage(ctx) {
    const {
        container,
        state,
        render,
        pageRuntime,
        promptEditorService,
    } = ctx;
    const getPhoneAiInstructionPreset = promptEditorService.getPhoneAiInstructionPreset;
    const savePhoneAiInstructionPreset = promptEditorService.savePhoneAiInstructionPreset;

    const isNew = state.promptEditorIsNew;
    const title = isNew ? '新建 AI 指令预设' : '兼容 JSON 编辑器';

    container.innerHTML = buildPromptEditorPageHtml({
        title,
        isNew,
        promptEditorName: state.promptEditorName,
        promptEditorContent: state.promptEditorContent,
    });

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    const addListener = (target, type, listener, options) => {
        if (runtime?.addEventListener) {
            return runtime.addEventListener(target, type, listener, options);
        }
        if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
            return () => {};
        }
        target.addEventListener(type, listener, options);
        return () => target.removeEventListener(type, listener, options);
    };
    const importLifecycle = createPromptEditorImportLifecycleGuard(runtime);

    addListener(container.querySelector('.phone-nav-back'), 'click', () => {
        state.mode = 'ai_instruction_presets';
        render();
    });

    const nameInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-prompt-editor-name'));
    if (nameInput) {
        addListener(nameInput, 'input', () => {
            state.promptEditorName = String(nameInput.value || '').trim();
        });
    }

    const contentInput = /** @type {HTMLTextAreaElement | null} */ (container.querySelector('#phone-prompt-editor-content'));
    if (contentInput) {
        addListener(contentInput, 'input', () => {
            state.promptEditorContent = String(contentInput.value || '');
        });
    }

    addListener(container.querySelector('#phone-prompt-upload-btn'), 'click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt';
        addListener(input, 'change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            const currentImportToken = importLifecycle.createToken();

            try {
                const text = await file.text();
                if (!importLifecycle.isActive(currentImportToken)) return;

                const resolved = resolvePresetPayloadFromText(text);
                if (!importLifecycle.isActive(currentImportToken)) return;
                if (!resolved.ok) {
                    showToast(container, resolved.message || '导入内容无效', true);
                    return;
                }

                if (nameInput && !String(nameInput.value || '').trim()) {
                    try {
                        const parsed = JSON.parse(text);
                        const sourcePreset = Array.isArray(parsed?.presets) && parsed.presets.length > 0 ? parsed.presets[0] : parsed;
                        const importedName = String(sourcePreset?.name || '').trim();
                        if (importedName) {
                            if (!importLifecycle.isActive(currentImportToken)) return;
                            state.promptEditorName = importedName;
                            nameInput.value = importedName;
                        }
                    } catch (error) {
                        // ignore
                    }
                }

                if (!importLifecycle.isActive(currentImportToken)) return;
                state.promptEditorContent = JSON.stringify(resolved.presetPatch?.promptGroup || [], null, 2);
                if (resolved.presetPatch && hasOwn(resolved.presetPatch, 'mediaMarkers')) {
                    state.promptEditorMediaMarkers = normalizePromptEditorMediaMarkers(resolved.presetPatch.mediaMarkers);
                }
                if (contentInput) {
                    contentInput.value = state.promptEditorContent;
                }
                showToast(container, 'JSON 已导入编辑器');
            } catch (error) {
                if (!importLifecycle.isActive(currentImportToken)) return;
                showToast(container, error?.message || '文件读取失败', true);
            }
        });
        input.click();
    });

    addListener(container.querySelector('#phone-prompt-reset-default-btn'), 'click', () => {
        const defaultPreset = createDefaultPhoneAiInstructionPreset({ name: state.promptEditorName || undefined });
        state.promptEditorContent = JSON.stringify(defaultPreset.promptGroup || [], null, 2);
        state.promptEditorMediaMarkers = normalizePromptEditorMediaMarkers(defaultPreset.mediaMarkers);
        if (contentInput) {
            contentInput.value = state.promptEditorContent;
        }
        showToast(container, '已重置为默认分段');
    });

    addListener(container.querySelector('#phone-prompt-save-btn'), 'click', () => {
        const name = String(state.promptEditorName || '').trim();
        const content = String(state.promptEditorContent || '');

        if (!name) {
            showToast(container, '请输入预设名称', true);
            return;
        }

        const nameConflict = resolvePromptEditorNameConflict({
            isNew,
            name,
            originalName: state.promptEditorOriginalName,
            getPreset: getPhoneAiInstructionPreset,
        });
        if (nameConflict.conflict) {
            showToast(container, nameConflict.message || '预设名称冲突', true);
            return;
        }

        const resolved = resolvePresetPayloadFromText(content);
        if (!resolved.ok) {
            showToast(container, resolved.message || '分段 JSON 无效', true);
            return;
        }

        const existingPreset = String(state.promptEditorOriginalName || '').trim()
            ? getPhoneAiInstructionPreset(String(state.promptEditorOriginalName || '').trim())
            : null;
        const defaultPreset = createDefaultPhoneAiInstructionPreset({ name });
        const presetPayload = buildPromptEditorPresetPayload({
            name,
            resolved,
            stateMediaMarkers: state.promptEditorMediaMarkers,
            existingPreset,
            defaultPreset,
        });
        state.promptEditorMediaMarkers = presetPayload.mediaMarkers;

        const result = savePhoneAiInstructionPreset(presetPayload, {
            originalName: String(state.promptEditorOriginalName || '').trim(),
            overwrite: !isNew,
            switchTo: true,
        });

        if (result?.success) {
            showToast(container, isNew ? 'AI 指令预设已创建' : 'AI 指令预设已保存');
            state.aiInstructionSelectedPresetName = String(result.presetName || name).trim();
            state.promptEditorOriginalName = state.aiInstructionSelectedPresetName;
            state.mode = 'ai_instruction_presets';
            render();
        } else {
            showToast(container, result?.message || '保存失败', true);
        }
    });
}
