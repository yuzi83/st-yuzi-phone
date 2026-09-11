/** Current-chat diagnostics only: no settings, storage, prompts or network side effects. */
export const QQ_FAILURE_LOG_LIMITS = Object.freeze({ entries: 50, response: 16000, detail: 2000, total: 256000 });

export function redactFailureText(value, secrets = []) {
    let text = String(value ?? '');
    for (const secret of secrets) {
        if (secret) text = text.split(String(secret)).join('[已隐藏]');
    }
    return text
        .replace(/((?:Bearer|Basic)\s+)[^\s"'<>]+/gi, '$1[已隐藏]')
        .replace(/(["']?(?:api[_-]?key|authorization|proxy_password|access_token|secret)["']?\s*[:=]\s*["']?)[^\s"',}<>]+/gi, '$1[已隐藏]')
        .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, '[已隐藏]');
}

function bounded(text, limit) {
    return text.length > limit ? `${text.slice(0, limit)}\n[已截断]` : text;
}

function explain(error, stage) {
    const code = String(error?.code || '');
    if (error?.failureKind === 'empty' || code === 'empty_response') return {
        title: '空回',
        explanation: '这次空回了，没拿到可用的 AI 回复正文。',
        suggestion: '先重 roll 一次；还是空回的话，检查一下预设，也可以试试“预设缝破限”。空回原因不一定是限制拦截，具体还要看接口有没有给出说明。',
    };
    if (code === 'protocol_invalid' && stage !== 'validate') return {
        title: '格式错误',
        explanation: 'AI 给出内容了，但格式错了，小手机没识别出来——“AI 区了”这类情况。',
        suggestion: '先重 roll 一次。恢复过 QQ 默认提示词了吗？没恢复的话可以先试试；还是不行，再考虑换模型。',
    };
    if (error?.name === 'QQV2DomainError' || code.startsWith('manual_action_')
        || (code === 'protocol_invalid' && stage === 'validate')) return {
        title: '动作不合法',
        explanation: 'AI 给出内容了，但其中的人物、会话引用或动作不符合当前 QQ 状态，整批回复没有应用。具体原因见技术详情。',
        suggestion: '先重 roll 一次；仍失败时，检查或恢复 QQ 默认提示词，并检查对应的人物和会话状态。',
    };
    if (/^(preset_|endpoint_|api_key_|model_|invalid_messages|invalid_endpoint|invalid_temperature|invalid_max_output|messages_missing|invalid_prompt_messages)/.test(code)) return {
        title: '配置问题', explanation: 'QQ 请求没能正常发出去，API 或提示词配置不完整或不可用。',
        suggestion: '检查 QQ 当前选择的 API 和提示词预设，确认地址、密钥与模型已正确填写，再回 QQ 重试。',
    };
    if (stage === 'save') return {
        title: '回复保存失败', explanation: 'AI 已经返回，但回复没能成功保存。这不是模型格式问题。',
        suggestion: '检查浏览器本地存储是否可用、空间是否充足，再回 QQ 重试。可以先复制本次返回，避免刷新后丢失。',
    };
    if (stage === 'request' && !code.startsWith('database_api_')) return {
        title: 'API / 网络失败', explanation: '这次请求没有正常完成，或接口返回的数据无法读取。具体错误见技术详情。',
        suggestion: '检查网络和 API 服务是否可用；若接口报告密钥、额度、频率或模型问题，按实际提示处理后再重试。',
    };
    return {
        title: '原因不明', explanation: '这次 QQ 请求失败了，但当前调用通道没有提供足够信息，暂时无法确定具体原因。',
        suggestion: '先查看技术详情；使用“数据库当前 API”时，也检查数据库插件的提示。不要仅凭没有回复就判断为空回或格式错误。',
    };
}

export function createQQFailureLog() {
    let scopeId = '';
    let revision = 0;
    let serial = 0;
    let entries = [];
    let trimmed = false;
    const listeners = new Set();
    const notify = () => {
        for (const listener of listeners) {
            try { listener(); } catch { /* Diagnostics must never break a QQ request. */ }
        }
    };
    const clear = () => {
        revision += 1;
        entries = [];
        trimmed = false;
        notify();
    };
    return Object.freeze({
        setScope(nextScopeId) {
            const next = String(nextScopeId || '');
            if (scopeId === next) return;
            scopeId = next;
            clear();
        },
        clear,
        begin(input = {}) { return { ...input, revision, stage: 'config' }; },
        record(attempt, error) {
            if (!attempt || attempt.recorded || !scopeId || attempt.scopeId !== scopeId || attempt.revision !== revision
                || attempt.stage === 'completed' || error?.name === 'AbortError'
                || ['scope_inactive', 'request_cancelled'].includes(error?.code)) return;
            const clean = (value, limit) => bounded(redactFailureText(value, [attempt.apiKey]), limit);
            const info = explain(error, attempt.stage);
            const entry = Object.freeze({
                id: ++serial,
                time: new Date().toLocaleString('zh-CN', { hour12: false }),
                source: attempt.source || 'QQ · 主动消息',
                conversation: clean(attempt.conversation || '', 240),
                model: clean(attempt.model || '', 240),
                response: clean(attempt.response || '', QQ_FAILURE_LOG_LIMITS.response),
                detail: clean([
                    error?.code, error?.message,
                    error?.status ? `HTTP ${error.status}` : '',
                    error?.responseText,
                    attempt.finishReason ? `finish_reason: ${attempt.finishReason}` : '',
                ].filter(Boolean).join('\n'), QQ_FAILURE_LOG_LIMITS.detail),
                ...info,
            });
            attempt.recorded = true;
            entries.unshift(entry);
            if (entries.length > QQ_FAILURE_LOG_LIMITS.entries) entries.pop();
            let size = entries.reduce((sum, item) => sum + JSON.stringify(item).length, 0);
            while (size > QQ_FAILURE_LOG_LIMITS.total && entries.length > 1) {
                size -= JSON.stringify(entries.pop()).length;
                trimmed = true;
            }
            notify();
        },
        getSnapshot() { return { entries: [...entries], trimmed, revision }; },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    });
}

export const qqFailureLog = createQQFailureLog();
