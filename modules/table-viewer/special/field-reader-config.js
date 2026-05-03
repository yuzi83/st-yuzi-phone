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
        requestId: ['请求ID', '请求Id', '请求编号'],
        replyToMessageId: ['回复到消息ID', '回复消息ID', '回复到'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
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
});

export const SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES = Object.freeze({
    density: ['compact', 'normal', 'loose'],
    avatarShape: ['circle', 'rounded', 'square'],
    conversationTitleMode: ['auto', 'sender', 'thread', 'titleField'],
    mediaActionTextMode: ['short', 'detailed'],
});

export const SPECIAL_STYLE_OPTION_NUMERIC_RULES = Object.freeze({
    bubbleMaxWidthPct: { min: 48, max: 96 },
});

export const SPECIAL_STYLE_OPTION_BOOLEAN_KEYS = new Set([
    'showAvatar',
    'showMessageTime',
]);

export const SPECIAL_STYLE_OPTION_TEXT_LIMITS = Object.freeze({
    emptyConversationText: 48,
    emptyDetailText: 48,
    emptyMessageText: 48,
    timeFallbackText: 24,
});
