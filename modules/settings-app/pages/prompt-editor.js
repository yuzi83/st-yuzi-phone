import { buildPromptEditorPageHtml } from '../layout/frame.js';
import { showToast } from '../ui/toast.js';

export function renderPromptEditorPage(ctx) {
    const {
        container,
        state,
        render,
        getPromptTemplate,
        savePromptTemplate,
    } = ctx;

    const isNew = state.promptEditorIsNew;
    const title = isNew ? '新建提示词模板' : '编辑提示词模板';

    container.innerHTML = buildPromptEditorPageHtml({
        title,
        isNew,
        promptEditorName: state.promptEditorName,
        promptEditorContent: state.promptEditorContent,
    });

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'api_prompt_config';
        render();
    });

    const nameInput = container.querySelector('#phone-prompt-editor-name');
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            state.promptEditorName = String(nameInput.value || '').trim();
        });
    }

    const contentInput = container.querySelector('#phone-prompt-editor-content');
    if (contentInput) {
        contentInput.addEventListener('input', () => {
            state.promptEditorContent = String(contentInput.value || '');
        });
    }

    container.querySelector('#phone-prompt-upload-btn')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                state.promptEditorContent = text;
                if (contentInput) {
                    contentInput.value = text;
                }
                showToast(container, '文件已加载');
            } catch (e) {
                showToast(container, '文件读取失败', true);
            }
        });
        input.click();
    });

    container.querySelector('#phone-prompt-save-btn')?.addEventListener('click', () => {
        const name = String(state.promptEditorName || '').trim();
        const content = String(state.promptEditorContent || '');

        if (!name) {
            showToast(container, '请输入模板名称', true);
            return;
        }

        if (isNew) {
            const existing = getPromptTemplate(name);
            if (existing) {
                showToast(container, '模板名称已存在', true);
                return;
            }
        }

        const success = savePromptTemplate({ name, content });
        if (success) {
            showToast(container, isNew ? '模板已创建' : '模板已保存');
            state.apiPromptConfigSelectedTemplate = name;
            state.mode = 'api_prompt_config';
            render();
        } else {
            showToast(container, '保存失败', true);
        }
    });
}
