import { callApiWithTimeout, clampPositiveInteger, getDB } from '../db-bridge.js';

function sanitizePhoneChatMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
        .map((message) => ({
            role: ['system', 'assistant', 'user'].includes(String(message?.role || '').trim())
                ? String(message.role).trim()
                : 'user',
            content: String(message?.content || '').trim(),
        }))
        .filter((message) => message.content);
}

export async function callPhoneChatAI(messages, options = {}) {
    const api = getDB();
    if (!api || typeof api.callAI !== 'function') {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '数据库 AI 接口不可用',
            text: '',
        };
    }

    const safeMessages = sanitizePhoneChatMessages(messages);
    if (safeMessages.length === 0) {
        return {
            ok: false,
            code: 'invalid_messages',
            message: '未提供有效的 AI 消息数组',
            text: '',
        };
    }

    const requestedPresetName = String(options.apiPresetName || '').trim();

    try {
        if (requestedPresetName) {
            if (typeof api.loadApiPreset !== 'function') {
                return {
                    ok: false,
                    code: 'preset_api_unavailable',
                    message: '数据库未暴露 loadApiPreset，无法应用聊天API预设',
                    text: '',
                };
            }

            const presetLoaded = !!api.loadApiPreset(requestedPresetName);
            if (!presetLoaded) {
                return {
                    ok: false,
                    code: 'preset_load_failed',
                    message: `聊天API预设加载失败：${requestedPresetName}`,
                    text: '',
                };
            }
        }

        const maxTokensRaw = Number(options.maxTokens ?? options.max_tokens);
        const maxTokens = Number.isFinite(maxTokensRaw)
            ? Math.max(64, Math.min(4096, Math.round(maxTokensRaw)))
            : 800;

        const text = await callApiWithTimeout(
            () => api.callAI(safeMessages, { max_tokens: maxTokens }),
            Math.max(15000, clampPositiveInteger(options.timeout, 90000)),
            'callPhoneChatAI',
        );

        const safeText = String(text || '').trim();
        if (!safeText) {
            return {
                ok: false,
                code: 'empty',
                message: 'AI 未返回有效内容',
                text: '',
            };
        }

        return {
            ok: true,
            code: 'ok',
            message: 'AI 调用成功',
            text: safeText,
        };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: error?.message || 'AI 调用失败',
            text: '',
        };
    }
}
