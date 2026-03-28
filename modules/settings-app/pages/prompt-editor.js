import { createDefaultPhoneAiInstructionPreset } from '../../phone-core/chat-support.js';
import { buildPromptEditorPageHtml } from '../layout/frame.js';
import { showToast } from '../ui/toast.js';

function resolvePresetPayloadFromText(text) {
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
        if (Array.isArray(sourcePreset.promptGroup)) {
            return {
                ok: true,
                presetPatch: {
                    description: String(sourcePreset.description || '').trim(),
                    promptGroup: sourcePreset.promptGroup,
                },
            };
        }
        if (Array.isArray(sourcePreset.segments)) {
            return {
                ok: true,
                presetPatch: {
                    description: String(sourcePreset.description || '').trim(),
                    promptGroup: sourcePreset.segments,
                },
            };
        }
    }

    return {
        ok: false,
        message: '请输入有效的 promptGroup 数组，或包含 promptGroup 的预设 JSON',
    };
}

export function renderPromptEditorPage(ctx) {
    const {
        container,
        state,
        render,
        getPhoneAiInstructionPreset,
        savePhoneAiInstructionPreset,
    } = ctx;

    const isNew = state.promptEditorIsNew;
    const title = isNew ? '新建 AI 指令预设' : '兼容 JSON 编辑器';

    container.innerHTML = buildPromptEditorPageHtml({
        title,
        isNew,
        promptEditorName: state.promptEditorName,
        promptEditorContent: state.promptEditorContent,
    });

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'ai_instruction_presets';
        render();
    });

    const nameInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-prompt-editor-name'));
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            state.promptEditorName = String(nameInput.value || '').trim();
        });
    }

    const contentInput = /** @type {HTMLTextAreaElement | null} */ (container.querySelector('#phone-prompt-editor-content'));
    if (contentInput) {
        contentInput.addEventListener('input', () => {
            state.promptEditorContent = String(contentInput.value || '');
        });
    }

    container.querySelector('#phone-prompt-upload-btn')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const resolved = resolvePresetPayloadFromText(text);
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
                            state.promptEditorName = importedName;
                            nameInput.value = importedName;
                        }
                    } catch (error) {
                        // ignore
                    }
                }

                state.promptEditorContent = JSON.stringify(resolved.presetPatch?.promptGroup || [], null, 2);
                if (contentInput) {
                    contentInput.value = state.promptEditorContent;
                }
                showToast(container, 'JSON 已导入编辑器');
            } catch (error) {
                showToast(container, error?.message || '文件读取失败', true);
            }
        });
        input.click();
    });

    container.querySelector('#phone-prompt-reset-default-btn')?.addEventListener('click', () => {
        const defaultPreset = createDefaultPhoneAiInstructionPreset({ name: state.promptEditorName || undefined });
        state.promptEditorContent = JSON.stringify(defaultPreset.promptGroup || [], null, 2);
        if (contentInput) {
            contentInput.value = state.promptEditorContent;
        }
        showToast(container, '已重置为默认分段');
    });

    container.querySelector('#phone-prompt-save-btn')?.addEventListener('click', () => {
        const name = String(state.promptEditorName || '').trim();
        const content = String(state.promptEditorContent || '');

        if (!name) {
            showToast(container, '请输入预设名称', true);
            return;
        }

        if (isNew) {
            const existing = getPhoneAiInstructionPreset(name);
            if (existing) {
                showToast(container, '预设名称已存在', true);
                return;
            }
        }

        const resolved = resolvePresetPayloadFromText(content);
        if (!resolved.ok) {
            showToast(container, resolved.message || '分段 JSON 无效', true);
            return;
        }

        const result = savePhoneAiInstructionPreset({
            name,
            description: String(resolved.presetPatch?.description || '').trim(),
            promptGroup: resolved.presetPatch?.promptGroup || [],
        }, {
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
