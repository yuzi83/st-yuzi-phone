import { Logger } from '../../error-handler.js';

const logger = Logger.withScope({ scope: 'phone-core/chat-support/template-store', feature: 'chat-support' });
const PROMPT_TEMPLATES_KEY = 'yuzi_phone_prompt_templates';

export function getPromptTemplates() {
    try {
        const raw = localStorage.getItem(PROMPT_TEMPLATES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        logger.warn({
            action: 'prompt-template.read',
            message: '读取提示词模板失败',
            error,
        });
        return [];
    }
}

export function savePromptTemplate(template) {
    if (!template || typeof template !== 'object' || !template.name) {
        return false;
    }

    const templates = getPromptTemplates();
    const index = templates.findIndex((item) => item.name === template.name);
    if (index >= 0) {
        templates[index] = { name: template.name, content: template.content || '' };
    } else {
        templates.push({ name: template.name, content: template.content || '' });
    }

    try {
        localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(templates));
        return true;
    } catch (error) {
        logger.warn({
            action: 'prompt-template.save',
            message: '保存提示词模板失败',
            context: { templateName: String(template.name || '') },
            error,
        });
        return false;
    }
}

export function deletePromptTemplate(name) {
    if (!name) return false;

    const templates = getPromptTemplates();
    const filtered = templates.filter((item) => item.name !== name);
    if (filtered.length === templates.length) {
        return false;
    }

    try {
        localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(filtered));
        return true;
    } catch (error) {
        logger.warn({
            action: 'prompt-template.delete',
            message: '删除提示词模板失败',
            context: { templateName: String(name || '') },
            error,
        });
        return false;
    }
}

export function getPromptTemplate(name) {
    if (!name) return null;
    const templates = getPromptTemplates();
    return templates.find((item) => item.name === name) || null;
}
