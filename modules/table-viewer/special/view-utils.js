import { escapeHtml } from '../../utils/dom-escape.js';

export function buildConversations(rows, readSpecialField, styleOptions = {}) {
    const conversations = {};
    const readStaticField = typeof readSpecialField?.readStaticField === 'function'
        ? (row, fieldKey, fallback = '') => readSpecialField.readStaticField(row, fieldKey, fallback)
        : readSpecialField;

    const buildMessageSortKey = (time, rowIndex) => {
        const timestamp = toTimestamp(time);
        return {
            timestamp,
            hasTimestamp: timestamp > 0,
            rowIndex: Number.isInteger(rowIndex) ? rowIndex : -1,
        };
    };

    const compareMessageSortKey = (left, right) => {
        const leftKey = left || buildMessageSortKey('', -1);
        const rightKey = right || buildMessageSortKey('', -1);
        if (leftKey.hasTimestamp && rightKey.hasTimestamp && leftKey.timestamp !== rightKey.timestamp) {
            return leftKey.timestamp - rightKey.timestamp;
        }
        if (leftKey.hasTimestamp !== rightKey.hasTimestamp) {
            return leftKey.hasTimestamp ? 1 : -1;
        }
        if (leftKey.timestamp !== rightKey.timestamp) {
            return leftKey.timestamp - rightKey.timestamp;
        }
        return leftKey.rowIndex - rightKey.rowIndex;
    };

    rows.forEach((row, rowIndex) => {
        const id = String(readSpecialField(row, 'threadId', `default_thread_${rowIndex + 1}`) || `default_thread_${rowIndex + 1}`)
            .trim() || `default_thread_${rowIndex + 1}`;

        const sender = normalizeSenderName(readSpecialField(row, 'sender', ''));
        const content = readSpecialField(row, 'content', '') || '...';
        const time = readStaticField(row, 'sentAt', '');
        const threadTitle = String(readSpecialField(row, 'threadTitle', '') || '').trim();
        const threadSubtitle = String(readSpecialField(row, 'threadSubtitle', '') || '').trim();
        const sortKey = buildMessageSortKey(time, rowIndex);

        if (!conversations[id]) {
            conversations[id] = {
                id,
                threadTitle,
                threadSubtitle,
                lastMessage: content,
                lastTime: time,
                lastSortKey: sortKey,
                latestSender: sender || '',
                senders: new Set(),
            };
        }

        if (!conversations[id].threadTitle && threadTitle) {
            conversations[id].threadTitle = threadTitle;
        }

        if (!conversations[id].threadSubtitle && threadSubtitle) {
            conversations[id].threadSubtitle = threadSubtitle;
        }

        if (sender) {
            conversations[id].senders.add(sender);
        }

        if (compareMessageSortKey(sortKey, conversations[id]?.lastSortKey) >= 0) {
            conversations[id].lastMessage = content;
            conversations[id].lastTime = time;
            conversations[id].lastSortKey = sortKey;
            conversations[id].latestSender = sender || conversations[id].latestSender || '';
        }
    });

    const feedOrder = String(styleOptions.feedOrder || 'desc');

    const sorted = Object.values(conversations)
        .map(conv => {
            const senderList = Array.from(conv.senders || []).filter(Boolean);
            let titleSender = conv.latestSender || conv.id;
            if (!titleSender) {
                if (senderList.length === 1) {
                    titleSender = senderList[0];
                } else if (senderList.length > 1) {
                    titleSender = '群聊';
                } else {
                    titleSender = conv.id;
                }
            }

            return {
                id: conv.id,
                threadTitle: conv.threadTitle,
                threadSubtitle: conv.threadSubtitle,
                lastMessage: conv.lastMessage,
                lastTime: conv.lastTime,
                latestSender: conv.latestSender || '',
                titleSender,
                sortKey: conv.lastSortKey || buildMessageSortKey(conv.lastTime, -1),
            };
        })
        .sort((a, b) => compareMessageSortKey(b.sortKey, a.sortKey));

    if (feedOrder === 'asc') {
        sorted.reverse();
    }

    return sorted.map(({ sortKey: _sortKey, ...conversation }) => conversation);
}

export function resolveConversationDisplayName(conversation, titleMode = 'auto') {
    const conv = conversation || {};
    const mode = String(titleMode || 'auto');

    if (mode === 'thread' || mode === 'titleField') {
        return conv.threadTitle || conv.latestSender || conv.titleSender || conv.id || '会话';
    }

    if (mode === 'sender') {
        return conv.latestSender || conv.titleSender || conv.threadTitle || conv.id || '会话';
    }

    return conv.latestSender || conv.threadTitle || conv.titleSender || conv.id || '会话';
}

export function parseCommentPairs(rawText) {
    const input = String(rawText || '').trim();
    if (!input) return [];

    const normalized = input
        .replace(/([”’"'])\s*([^:：;；,，\n]{1,24})\s*[:：]/g, '$1;$2:')
        .replace(/；/g, ';');

    return normalized
        .split(';')
        .map(seg => String(seg || '').trim())
        .filter(Boolean)
        .map(seg => {
            const splitIndex = seg.search(/[:：]/);
            if (splitIndex < 0) {
                return {
                    author: '匿名',
                    text: seg,
                };
            }

            const author = String(seg.slice(0, splitIndex) || '匿名').trim() || '匿名';
            const text = String(seg.slice(splitIndex + 1) || '').trim();
            return { author, text };
        });
}

export function normalizeMediaDesc(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const lower = text.toLowerCase();
    if (lower === 'none' || lower === 'null' || lower === 'undefined') return '';
    return text;
}

export function normalizeSenderName(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    if (text === '主角') return '我';
    return text;
}

export function renderInPhoneMediaPreview(title, content) {
    return `
        <div class="phone-special-media-preview-mask">
            <div class="phone-special-media-preview-modal">
                <div class="phone-special-media-preview-title">${escapeHtml(title || '媒体内容')}</div>
                <div class="phone-special-media-preview-content">${escapeHtml(content || '（无内容）')}</div>
                <button type="button" class="phone-special-media-preview-close" data-action="close-media-preview">关闭</button>
            </div>
        </div>
    `;
}

export function getAvatarText(name) {
    const raw = String(name || '').trim();
    if (!raw) return '？';
    return raw.charAt(0);
}

export function toTimestamp(input) {
    const t = new Date(input || '').getTime();
    return Number.isFinite(t) ? t : 0;
}

export function formatTimeLike(input) {
    const d = new Date(input || '');
    if (!Number.isFinite(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

export function generateColor(str) {
    const input = String(str || '');
    if (!input) return '#888888';
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = input.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xff;
        color += (`00${value.toString(16)}`).slice(-2);
    }
    return color;
}
