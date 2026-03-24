import { resolveTemplateWithDraftForViewer } from '../template-runtime.js';

export const DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE = Object.freeze({
    message: {
        threadId: ['会话ID', '会话Id', '会话编号', '对话ID', '@const:default_thread'],
        threadTitle: ['会话标题', '会话名称', '群聊标题', '标题', '@tableName'],
        threadSubtitle: ['会话副标题', '会话描述', '备注'],
        sender: ['发送者', '发言者', '作者'],
        senderRole: ['发送者身份', '角色', '身份'],
        chatTarget: ['聊天对象', '对话目标'],
        content: ['消息内容', '三人消息内容', '文案', '正文'],
        sentAt: ['消息发送时间', '发送时间', '时间', '@now'],
        messageStatus: ['消息状态', '状态'],
        requestId: ['请求ID', '请求Id', '请求编号'],
        replyToMessageId: ['回复到消息ID', '回复消息ID', '回复到'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
    },
    moments: {
        poster: ['发帖人', '作者', '发布者', '发送者'],
        title: ['标题'],
        postContent: ['文案', '内容', '正文', '消息内容', '三人消息内容'],
        postTime: ['发帖时间', '时间', '消息发送时间', '@now'],
        topicTag: ['话题', '标签', '主题'],
        location: ['位置', '地点'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
        likes: ['点赞数', '点赞'],
        shares: ['转发数', '转发'],
        viewCount: ['浏览数', '浏览量', '阅读量'],
        commentCount: ['评论数', '评论条数'],
        commentContent: ['评论内容', '评论'],
        playerReply1: ['主角回复选项1'],
        playerReply2: ['主角回复选项2'],
        playerReply3: ['主角回复选项3'],
        publisherReply1: ['发布者回复1', '对方回复1', '三人回复1'],
        publisherReply2: ['发布者回复2', '对方回复2', '三人回复2'],
        publisherReply3: ['发布者回复3', '对方回复3', '三人回复3'],
    },
    forum: {
        poster: ['发帖人网名', '发帖人', '作者'],
        protagonistName: ['主角网名', '主角'],
        title: ['标题'],
        postContent: ['文案', '内容', '正文'],
        postTime: ['发帖时间', '时间', '@now'],
        topicTag: ['话题', '标签', '板块'],
        location: ['位置', '地点'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
        likes: ['点赞数', '点赞'],
        shares: ['转发数', '转发'],
        viewCount: ['浏览数', '浏览量', '阅读量'],
        commentCount: ['评论数', '评论条数'],
        commentContent: ['评论内容', '评论'],
        playerReply1: ['主角回复选项1'],
        playerReply2: ['主角回复选项2'],
        playerReply3: ['主角回复选项3'],
        publisherReply1: ['发布者回复1', '对方回复1', '三人回复1'],
        publisherReply2: ['发布者回复2', '对方回复2', '三人回复2'],
        publisherReply3: ['发布者回复3', '对方回复3', '三人回复3'],
    },
});

export const DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE = Object.freeze({
    message: {
        density: 'normal',
        avatarShape: 'circle',
        bubbleMaxWidthPct: 80,
        conversationTitleMode: 'auto',
        mediaActionTextMode: 'short',
        showAvatar: true,
        showMessageTime: true,
        emptyConversationText: '暂无消息',
        emptyDetailText: '该会话暂无消息',
        emptyMessageText: '（空消息）',
        timeFallbackText: '刚刚',
    },
    moments: {
        density: 'normal',
        cardStyle: 'filled',
        feedOrder: 'desc',
        statsMode: 'full',
        replyOptionMode: 'auto',
        mediaActionTextMode: 'detailed',
        showPosterAvatar: true,
        showPostTime: true,
        showReplyReset: true,
        emptyFeedText: '暂无内容',
        emptyContentText: '（无正文）',
        commentEmptyText: '暂无评论',
        timeFallbackText: '刚刚',
    },
    forum: {
        density: 'normal',
        cardStyle: 'outlined',
        feedOrder: 'desc',
        statsMode: 'full',
        replyOptionMode: 'auto',
        mediaActionTextMode: 'detailed',
        showPosterAvatar: true,
        showPostTime: true,
        showReplyReset: true,
        emptyFeedText: '暂无内容',
        emptyContentText: '（无正文）',
        commentEmptyText: '暂无评论',
        forumMetaPrefix: '由',
        timeFallbackText: '刚刚',
    },
});

export const SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES = Object.freeze({
    density: ['compact', 'normal', 'loose'],
    avatarShape: ['circle', 'rounded', 'square'],
    conversationTitleMode: ['auto', 'sender', 'thread', 'titleField'],
    replyOptionMode: ['auto', 'always', 'hidden'],
    mediaActionTextMode: ['short', 'detailed'],
    cardStyle: ['filled', 'outlined', 'plain'],
    feedOrder: ['desc', 'asc'],
    statsMode: ['full', 'compact', 'hidden'],
});

export const SPECIAL_STYLE_OPTION_NUMERIC_RULES = Object.freeze({
    bubbleMaxWidthPct: { min: 48, max: 96 },
});

export const SPECIAL_STYLE_OPTION_BOOLEAN_KEYS = new Set([
    'showAvatar',
    'showMessageTime',
    'showReplyReset',
    'showPosterAvatar',
    'showPostTime',
]);

export const SPECIAL_STYLE_OPTION_TEXT_LIMITS = Object.freeze({
    emptyConversationText: 48,
    emptyDetailText: 48,
    emptyMessageText: 48,
    timeFallbackText: 24,
    emptyFeedText: 48,
    emptyContentText: 48,
    commentEmptyText: 48,
    forumMetaPrefix: 12,
});

export function normalizeFieldBindingCandidatesForViewer(rawCandidates) {
    const source = Array.isArray(rawCandidates)
        ? rawCandidates
        : (rawCandidates === undefined || rawCandidates === null ? [] : [rawCandidates]);

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        const text = String(item ?? '').trim().slice(0, 80);
        if (!text) return;
        if (/[<>]/.test(text)) return;
        if (text.toLowerCase().includes('javascript:')) return;
        if (seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

export function normalizeSpecialFieldBindingsForViewer(rawFieldBindings, type) {
    const defaults = DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE[type]
        || DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE.message
        || {};

    const src = rawFieldBindings && typeof rawFieldBindings === 'object' && !Array.isArray(rawFieldBindings)
        ? rawFieldBindings
        : {};

    const merged = {};
    const keys = new Set([...Object.keys(defaults), ...Object.keys(src)]);

    keys.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : defaults[fieldKey];

        const normalized = normalizeFieldBindingCandidatesForViewer(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

export function normalizeViewerEnumOption(value, allowedValues, fallback) {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    return Array.isArray(allowedValues) && allowedValues.includes(text) ? text : fallback;
}

export function normalizeViewerBooleanOption(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return fallback;

    if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
    return fallback;
}

export function normalizeSpecialStyleOptionsForViewer(rawStyleOptions, type) {
    const defaults = DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE[type]
        || DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE.message
        || {};

    const src = rawStyleOptions && typeof rawStyleOptions === 'object' && !Array.isArray(rawStyleOptions)
        ? rawStyleOptions
        : {};

    const clampViewerNumber = (value, min, max, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    };

    const normalizeText = (value, maxLength = 80) => String(value ?? '').trim().slice(0, maxLength);

    const merged = {};

    Object.keys(defaults).forEach((optionKey) => {
        const fallbackValue = defaults[optionKey];
        const rawValue = Object.prototype.hasOwnProperty.call(src, optionKey)
            ? src[optionKey]
            : fallbackValue;

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES, optionKey)) {
            const allowed = SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES[optionKey] || [];
            merged[optionKey] = normalizeViewerEnumOption(rawValue, allowed, String(fallbackValue || ''));
            return;
        }

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_NUMERIC_RULES, optionKey)) {
            const rule = SPECIAL_STYLE_OPTION_NUMERIC_RULES[optionKey] || {};
            const min = Number.isFinite(Number(rule.min)) ? Number(rule.min) : 0;
            const max = Number.isFinite(Number(rule.max)) ? Number(rule.max) : 999;
            const fallback = Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : min;
            merged[optionKey] = clampViewerNumber(rawValue, min, max, fallback);
            return;
        }

        if (SPECIAL_STYLE_OPTION_BOOLEAN_KEYS.has(optionKey)) {
            merged[optionKey] = normalizeViewerBooleanOption(rawValue, !!fallbackValue);
            return;
        }

        const maxLength = Number.isFinite(Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey]))
            ? Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey])
            : 80;

        merged[optionKey] = normalizeText(rawValue, maxLength)
            || normalizeText(fallbackValue, maxLength);
    });

    return merged;
}

export function createSpecialFieldReader({ templateMatch, type, headerMap, sheetKey, tableName }) {
    const resolvedTemplate = resolveTemplateWithDraftForViewer(templateMatch?.template);
    const rawFieldBindings = resolvedTemplate?.render?.fieldBindings;
    const rawStyleOptions = resolvedTemplate?.render?.styleOptions;

    const fieldBindings = normalizeSpecialFieldBindingsForViewer(rawFieldBindings, type);
    const styleOptions = normalizeSpecialStyleOptionsForViewer(rawStyleOptions, type);

    const safeSheetKey = String(sheetKey || '').trim();
    const safeTableName = String(tableName || '').trim();

    const readField = (row, fieldKey, fallback = '') => {
        const candidates = Array.isArray(fieldBindings[fieldKey]) ? fieldBindings[fieldKey] : [];

        for (const candidate of candidates) {
            const token = String(candidate || '').trim();
            if (!token) continue;

            if (token === '@now') {
                return new Date().toISOString();
            }

            if (token === '@sheetKey') {
                return safeSheetKey;
            }

            if (token === '@tableName') {
                return safeTableName;
            }

            if (token.startsWith('@const:')) {
                const constValue = token.slice('@const:'.length).trim();
                if (constValue) return constValue;
                continue;
            }

            const value = getCellByHeaders(row, headerMap, [token]);
            if (value !== '') {
                return value;
            }
        }

        return String(fallback ?? '');
    };

    readField.getStyleOption = (optionKey, fallback = '') => {
        if (Object.prototype.hasOwnProperty.call(styleOptions, optionKey)) {
            return styleOptions[optionKey];
        }
        return fallback;
    };

    readField.styleOptions = { ...styleOptions };

    return readField;
}

export function buildHeaderIndexMap(headers) {
    const map = new Map();
    headers.forEach((h, idx) => {
        const key = String(h || '').trim();
        if (!key) return;
        if (!map.has(key)) map.set(key, idx);
    });
    return map;
}

export function getCellByHeaders(row, headerMap, headerNames = []) {
    if (!Array.isArray(row)) return '';
    for (const headerName of headerNames) {
        const idx = headerMap.get(headerName);
        if (idx === undefined) continue;
        const value = row[idx];
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text !== '') return text;
    }
    return '';
}
