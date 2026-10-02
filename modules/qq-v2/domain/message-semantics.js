const SELF_ID = '__self__';

const TRANSFER_STATUS_LABELS = Object.freeze({
    pending: '待收款',
    accepted: '已收款',
    rejected: '已拒收',
    returned: '已退还',
});

function asText(value) {
    return String(value ?? '');
}

function trimmedText(value) {
    return asText(value).trim();
}

function durationSuffix(message) {
    const voicedMs = Number(message?.voice?.durationMs);
    if (Number.isFinite(voicedMs) && voicedMs > 0) return `（${Math.max(1, Math.round(voicedMs / 1000))}秒）`;
    const duration = Number(message?.media?.duration ?? message?.duration);
    return Number.isFinite(duration) && duration > 0 ? `（${duration}秒）` : '';
}

function recipientName(message, options) {
    const recipientId = trimmedText(message?.transfer?.recipientId);
    if (recipientId === SELF_ID) return trimmedText(options.selfName) || '用户';
    if (recipientId && typeof options.resolvePersonName === 'function') {
        const resolved = trimmedText(options.resolvePersonName(recipientId));
        if (resolved) return resolved;
    }
    return '对方';
}

export function qqV2MessageType(message) {
    return trimmedText(message?.type) || 'text';
}

/** Turn a persisted QQ message into one canonical, human-readable semantic line. */
export function formatQQV2MessageSemantic(message, options = {}) {
    const content = asText(message?.content ?? message?.text ?? message?.body);
    switch (qqV2MessageType(message)) {
    case 'voice':
        return `语音${durationSuffix(message)}：${content}`;
    case 'image':
        return `图片：${content}`;
    case 'video':
        return `视频${durationSuffix(message)}：${content}`;
    case 'sticker':
        return `表情：${content}`;
    case 'transfer': {
        const transfer = message?.transfer || {};
        const amount = trimmedText(transfer.amount);
        const currency = trimmedText(transfer.currency);
        const value = [amount, currency].filter(Boolean).join(' ');
        const status = TRANSFER_STATUS_LABELS[trimmedText(transfer.status)] || '待处理';
        const note = trimmedText(transfer.note);
        return [
            '转账',
            `金额：${value || '未填写'}`,
            `收款人：${recipientName(message, options)}`,
            `状态：${status}`,
            ...(note ? [`备注：${note}`] : []),
        ].join('，');
    }
    default:
        return content;
    }
}
