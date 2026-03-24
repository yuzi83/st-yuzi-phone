// modules/phone/phone-beautify-templates.js
/**
 * 玉子的手机 - 美化模板仓库（Phase 1）
 * - 内置默认模板
 * - 用户模板存储
 * - JSON 导入/导出
 * - schema/字段校验
 * - 专属小剧场模板识别
 */

import { getPhoneSettings, savePhoneSetting } from './phone-core.js';

export const PHONE_TEMPLATE_TYPE_SPECIAL = 'special_app_template';
export const PHONE_TEMPLATE_TYPE_GENERIC = 'generic_table_template';

export const PHONE_BEAUTIFY_TEMPLATE_FORMAT = 'yuzi-phone-style-pack';
export const PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION = '1.3.0';
export const PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION = '1.0.0';

const PHONE_BEAUTIFY_STORE_KEY = 'yuziPhoneBeautifyTemplates';
const MAX_IMPORTED_TEMPLATES = 80;
export const PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME = 'runtime';
export const PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED = 'annotated';

const BEAUTIFY_SOURCE_MODE_SETTING_KEY_SPECIAL = 'beautifyTemplateSourceModeSpecial';
const BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC = 'beautifyTemplateSourceModeGeneric';
const BEAUTIFY_SOURCE_MODE_BUILTIN = 'builtin';
const BEAUTIFY_SOURCE_MODE_USER = 'user';
const BEAUTIFY_SOURCE_MODE_ALLOWED = new Set([
    BEAUTIFY_SOURCE_MODE_BUILTIN,
    BEAUTIFY_SOURCE_MODE_USER,
]);

const BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL = 'beautifyActiveTemplateIdsSpecial';
const BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC = 'beautifyActiveTemplateIdGeneric';
const SPECIAL_RENDERER_KEYS = new Set(['special_message', 'special_moments', 'special_forum']);

const DEFAULT_SPECIAL_MIN_SCORE = 70;
const DEFAULT_GENERIC_MIN_SCORE = 55;

const ALLOWED_TEMPLATE_TYPES = new Set([
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
]);

const RENDERER_KEY_TO_SPECIAL_TYPE = Object.freeze({
    special_message: 'message',
    special_moments: 'moments',
    special_forum: 'forum',
});

function inferSpecialRendererKeyByTableName(tableName) {
    const name = normalizeString(tableName, 80);
    if (!name) return '';

    if (name.includes('消息') || name.includes('聊天')) return 'special_message';
    if (name.includes('动态') || name.includes('朋友圈')) return 'special_moments';
    if (name.includes('论坛') || name.includes('帖子')) return 'special_forum';

    return '';
}

const ALLOWED_RENDERER_KEYS = new Set([
    ...Object.keys(RENDERER_KEY_TO_SPECIAL_TYPE),
    'generic_table',
]);

const SPECIAL_FIELD_BINDING_ALLOWED_KEYS = Object.freeze([
    'threadId',
    'threadTitle',
    'threadSubtitle',
    'sender',
    'senderRole',
    'chatTarget',
    'content',
    'sentAt',
    'messageStatus',
    'requestId',
    'replyToMessageId',
    'imageDesc',
    'videoDesc',
    'playerReply1',
    'playerReply2',
    'playerReply3',
    'counterReply1',
    'counterReply2',
    'counterReply3',
    'poster',
    'protagonistName',
    'title',
    'postContent',
    'postTime',
    'topicTag',
    'location',
    'likes',
    'shares',
    'viewCount',
    'commentCount',
    'commentContent',
    'publisherReply1',
    'publisherReply2',
    'publisherReply3',
]);

const DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER = Object.freeze({
    special_message: {
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
    special_moments: {
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
    special_forum: {
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

const DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER = Object.freeze({
    special_message: {
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
    special_moments: {
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
    special_forum: {
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

const SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES = Object.freeze({
    density: ['compact', 'normal', 'loose'],
    avatarShape: ['circle', 'rounded', 'square'],
    conversationTitleMode: ['auto', 'sender', 'thread', 'titleField'],
    replyOptionMode: ['auto', 'always', 'hidden'],
    mediaActionTextMode: ['short', 'detailed'],
    cardStyle: ['filled', 'outlined', 'plain'],
    feedOrder: ['desc', 'asc'],
    statsMode: ['full', 'compact', 'hidden'],
});

const SPECIAL_STYLE_OPTION_NUMERIC_RULES = Object.freeze({
    bubbleMaxWidthPct: { min: 48, max: 96 },
});

const SPECIAL_STYLE_OPTION_BOOLEAN_KEYS = new Set([
    'showAvatar',
    'showMessageTime',
    'showReplyReset',
    'showPosterAvatar',
    'showPostTime',
]);

const SPECIAL_STYLE_OPTION_TEXT_LIMITS = Object.freeze({
    emptyConversationText: 48,
    emptyDetailText: 48,
    emptyMessageText: 48,
    timeFallbackText: 24,
    emptyFeedText: 48,
    emptyContentText: 48,
    commentEmptyText: 48,
    forumMetaPrefix: 12,
});

const GENERIC_LAYOUT_ALLOWED_VALUES = Object.freeze({
    pageMode: ['framed', 'plain'],
    navMode: ['glass', 'solid', 'transparent'],
    listContainerMode: ['card', 'plain', 'table'],
    listItemMode: ['row', 'card', 'compact'],
    listMetaMode: ['inline', 'stacked', 'hidden'],
    detailContainerMode: ['card', 'plain', 'table'],
    detailFieldLayout: ['stack', 'inline', 'grid-2', 'grid-3'],
    detailGroupMode: ['section', 'flat'],
    actionBarMode: ['inline', 'sticky', 'hidden'],
    buttonShape: ['pill', 'rounded', 'square'],
    buttonSize: ['xs', 'sm', 'md', 'lg'],
    density: ['compact', 'normal', 'loose'],
    shadowLevel: ['none', 'soft', 'mid', 'strong'],
    radiusLevel: ['none', 'sm', 'md', 'lg', 'xl'],
});

const DEFAULT_GENERIC_LAYOUT_OPTIONS = Object.freeze({
    pageMode: 'framed',
    navMode: 'solid',
    listContainerMode: 'table',
    listItemMode: 'row',
    listMetaMode: 'inline',
    detailContainerMode: 'plain',
    detailFieldLayout: 'grid-2',
    detailGroupMode: 'section',
    actionBarMode: 'sticky',
    buttonShape: 'rounded',
    buttonSize: 'md',
    density: 'normal',
    shadowLevel: 'soft',
    radiusLevel: 'lg',
    showListDivider: true,
    showDetailDivider: false,
});

const GENERIC_FIELD_BINDING_ALLOWED_KEYS = Object.freeze([
    'summaryTitle',
    'summarySubtitle',
    'summaryStatus',
    'summaryTime',
    'summaryPreview',
]);

const DEFAULT_GENERIC_FIELD_BINDINGS = Object.freeze({
    summaryTitle: ['标题', '名称', '姓名', '主题', '会话标题', '发帖人', '发帖人网名'],
    summarySubtitle: ['副标题', '分类', '标签', '话题', '位置'],
    summaryStatus: ['状态', '进度', '类型', '审核状态'],
    summaryTime: ['时间', '更新时间', '创建时间', '消息发送时间', '发帖时间'],
    summaryPreview: ['描述', '内容', '备注', '简介', '文案', '消息内容', '正文'],
});

const GENERIC_STYLE_TOKEN_ALIAS_MAP = Object.freeze({
    tableBackgroundColor: ['gtBodyBg', 'gtListBg', 'gtDetailBg', 'gtDetailFieldBg'],
    headerBackgroundColor: ['gtNavBg'],
    textColor: ['gtText', 'gtNavText', 'gtListItemText', 'gtDetailValueText', 'gtActionBtnText'],
    borderColor: ['gtNavBorderColor', 'gtListBorder', 'gtDetailBorder', 'gtDetailFieldBorder', 'gtActionBtnBorder'],
    borderRadius: ['gtRadiusLg'],
    boxShadow: ['gtShadowMd'],
    backdropFilter: ['gtBackdropFilter'],
});

const SPECIAL_STYLE_TOKEN_ALIAS_MAP = Object.freeze({
    pageBgColor: ['spPageBg', 'spBodyBg'],
    navBgColor: ['spNavBg'],
    navTextColor: ['spNavTitle', 'spNavBackText'],
    bubbleLeftBg: ['spBubbleLeftBg'],
    bubbleLeftText: ['spBubbleLeftText'],
    bubbleRightBg: ['spBubbleRightBg'],
    bubbleRightText: ['spBubbleRightText'],
    bubbleBorderRadius: ['spRadiusMd'],
    timeTextColor: ['spMetaText', 'spMessageTimeText'],
});

const SPECIAL_BASE_STYLE_TOKENS = Object.freeze({
    spPageBg: 'linear-gradient(180deg, rgba(28, 24, 21, 0.98) 0%, rgba(42, 36, 31, 0.96) 100%)',
    spBodyBg: 'rgba(38, 33, 29, 0.9)',
    spSurfaceBg: 'rgba(42, 36, 31, 0.88)',
    spSurfaceBorder: 'rgba(219, 180, 138, 0.25)',
    spSurfaceShadow: '0 10px 26px rgba(0, 0, 0, 0.35)',
    spNavBg: 'rgba(42, 36, 31, 0.95)',
    spNavBorder: 'rgba(219, 180, 138, 0.28)',
    spNavTitle: 'rgba(232, 217, 199, 0.98)',
    spNavBackText: 'rgba(219, 180, 138, 0.96)',
    spListBg: 'rgba(42, 36, 31, 0.86)',
    spListItemBg: 'rgba(42, 36, 31, 0.92)',
    spListItemHoverBg: 'rgba(219, 180, 138, 0.1)',
    spListDivider: 'rgba(219, 180, 138, 0.25)',
    spCardBg: 'rgba(42, 36, 31, 0.92)',
    spCardBorder: 'rgba(219, 180, 138, 0.26)',
    spMetaText: 'rgba(190, 169, 148, 0.92)',
    spSubText: 'rgba(232, 217, 199, 0.9)',
    spBubbleLeftBg: 'rgba(219, 180, 138, 0.16)',
    spBubbleLeftText: 'rgba(232, 217, 199, 0.96)',
    spBubbleRightBg: 'rgba(219, 180, 138, 0.95)',
    spBubbleRightText: '#2A241F',
    spMessageTimeText: 'rgba(190, 169, 148, 0.9)',
    spContentText: 'rgba(232, 217, 199, 0.92)',
    spQuoteText: 'rgba(232, 217, 199, 0.82)',
    spQuoteBorder: 'rgba(219, 180, 138, 0.3)',
    spMediaBg: 'rgba(219, 180, 138, 0.14)',
    spMediaText: 'rgba(232, 217, 199, 0.95)',
    spBtnBg: 'rgba(219, 180, 138, 0.16)',
    spBtnText: 'rgba(232, 217, 199, 0.96)',
    spBtnBorder: 'rgba(219, 180, 138, 0.36)',
    spInputBg: 'rgba(30, 26, 23, 0.88)',
    spInputText: 'rgba(232, 217, 199, 0.96)',
    spInputBorder: 'rgba(219, 180, 138, 0.32)',
    spInputPlaceholder: 'rgba(190, 169, 148, 0.72)',
    spRadiusXs: '6px',
    spRadiusSm: '10px',
    spRadiusMd: '14px',
    spRadiusLg: '18px',
    spShadowSm: '0 2px 8px rgba(0, 0, 0, 0.25)',
    spShadowMd: '0 6px 16px rgba(0, 0, 0, 0.32)',
    spShadowLg: '0 12px 28px rgba(0, 0, 0, 0.4)',
    spFontSizeXs: '10px',
    spFontSizeSm: '12px',
    spFontSizeMd: '13px',
    spFontSizeLg: '16px',
    spFontWeightRegular: '400',
    spFontWeightMedium: '600',
    spLineHeightTight: '1.35',
    spLineHeightNormal: '1.55',
    spGapXs: '4px',
    spGapSm: '8px',
    spGapMd: '12px',
    spGapLg: '16px',
    spGapXl: '20px',
    spColorSuccess: '#8fe85f',
    spColorWarning: '#f5c441',
    spColorDanger: '#ff7272',
    spColorInfo: '#79b7ff',
    spScrollbarThumb: 'rgba(219, 180, 138, 0.58)',
    spScrollbarTrack: 'rgba(255, 255, 255, 0.08)',
    spDurationFast: '0.15s',
    spDurationNormal: '0.25s',
    spEaseStandard: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
});

const SPECIAL_MESSAGE_DEFAULT_STYLE_TOKENS = Object.freeze({
    ...SPECIAL_BASE_STYLE_TOKENS,
    spPageBg: '#ededed',
    spBodyBg: '#ededed',
    spSurfaceBg: '#ffffff',
    spSurfaceBorder: '#e2e2e2',
    spSurfaceShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
    spNavBg: '#ededed',
    spNavBorder: '#e2e2e2',
    spNavTitle: '#191919',
    spNavBackText: '#191919',
    spListBg: '#f7f7f7',
    spListItemBg: '#ffffff',
    spListItemHoverBg: '#f4f4f4',
    spListDivider: '#ececec',
    spCardBg: '#ffffff',
    spCardBorder: '#e7e7e7',
    spMetaText: '#9f9f9f',
    spSubText: '#191919',
    spBubbleLeftBg: '#ffffff',
    spBubbleLeftText: '#191919',
    spBubbleRightBg: '#95ec69',
    spBubbleRightText: '#111111',
    spMessageTimeText: '#b2b2b2',
    spContentText: '#191919',
    spQuoteText: '#4d4d4d',
    spQuoteBorder: '#d6d6d6',
    spMediaBg: '#f5f5f5',
    spMediaText: '#2d2d2d',
    spBtnBg: '#f5f5f5',
    spBtnText: '#222222',
    spBtnBorder: '#dbdbdb',
    spInputBg: '#ffffff',
    spInputText: '#191919',
    spInputBorder: '#dfe3e8',
    spInputPlaceholder: '#ababab',
    spShadowSm: '0 1px 2px rgba(0, 0, 0, 0.06)',
    spShadowMd: '0 2px 6px rgba(0, 0, 0, 0.08)',
    spShadowLg: '0 8px 18px rgba(0, 0, 0, 0.12)',
    spColorSuccess: '#95ec69',
    spColorWarning: '#f5a623',
    spColorDanger: '#ff5a5f',
    spColorInfo: '#2f8cff',
    spScrollbarThumb: 'rgba(0, 0, 0, 0.24)',
    spScrollbarTrack: 'rgba(0, 0, 0, 0.08)',

});

const SPECIAL_MOMENTS_DEFAULT_STYLE_TOKENS = Object.freeze({
    ...SPECIAL_BASE_STYLE_TOKENS,
    spPageBg: 'linear-gradient(180deg, rgba(24, 21, 28, 0.98) 0%, rgba(36, 31, 42, 0.96) 100%)',
    spBodyBg: 'rgba(34, 30, 40, 0.9)',
    spNavBg: 'rgba(36, 31, 42, 0.95)',
    spNavBorder: 'rgba(174, 154, 242, 0.32)',
    spNavTitle: 'rgba(238, 232, 255, 0.98)',
    spNavBackText: 'rgba(190, 175, 255, 0.98)',
    spListDivider: 'rgba(174, 154, 242, 0.25)',
    spCardBg: 'rgba(45, 40, 58, 0.93)',
    spCardBorder: 'rgba(174, 154, 242, 0.26)',
    spMetaText: 'rgba(194, 180, 241, 0.92)',
    spSubText: 'rgba(240, 235, 255, 0.92)',
    spBubbleLeftBg: 'rgba(174, 154, 242, 0.2)',
    spBubbleRightBg: 'rgba(130, 202, 255, 0.9)',
    spBubbleRightText: '#1f2532',
    spMediaBg: 'rgba(174, 154, 242, 0.18)',
    spBtnBg: 'rgba(174, 154, 242, 0.16)',
    spBtnBorder: 'rgba(174, 154, 242, 0.42)',
    spInputBg: 'rgba(28, 24, 35, 0.9)',
    spInputBorder: 'rgba(174, 154, 242, 0.32)',
    spColorSuccess: '#8be57a',
    spColorWarning: '#ffd36f',
    spColorDanger: '#ff7d9a',
    spColorInfo: '#87c8ff',
    spScrollbarThumb: 'rgba(174, 154, 242, 0.56)',
    spScrollbarTrack: 'rgba(255, 255, 255, 0.08)',
});

const SPECIAL_FORUM_DEFAULT_STYLE_TOKENS = Object.freeze({
    ...SPECIAL_BASE_STYLE_TOKENS,
    spPageBg: 'linear-gradient(180deg, rgba(20, 27, 34, 0.98) 0%, rgba(27, 36, 45, 0.96) 100%)',
    spBodyBg: 'rgba(24, 32, 40, 0.9)',
    spNavBg: 'rgba(27, 36, 45, 0.95)',
    spNavBorder: 'rgba(118, 177, 214, 0.34)',
    spNavTitle: 'rgba(223, 242, 255, 0.98)',
    spNavBackText: 'rgba(126, 198, 242, 0.98)',
    spListDivider: 'rgba(118, 177, 214, 0.26)',
    spCardBg: 'rgba(31, 42, 52, 0.93)',
    spCardBorder: 'rgba(118, 177, 214, 0.3)',
    spMetaText: 'rgba(151, 198, 228, 0.9)',
    spSubText: 'rgba(226, 240, 250, 0.92)',
    spBubbleLeftBg: 'rgba(118, 177, 214, 0.2)',
    spBubbleRightBg: 'rgba(124, 224, 198, 0.88)',
    spBubbleRightText: '#1f2e33',
    spMediaBg: 'rgba(118, 177, 214, 0.16)',
    spBtnBg: 'rgba(118, 177, 214, 0.15)',
    spBtnBorder: 'rgba(118, 177, 214, 0.42)',
    spInputBg: 'rgba(20, 28, 35, 0.92)',
    spInputBorder: 'rgba(118, 177, 214, 0.34)',
    spColorSuccess: '#69d4b4',
    spColorWarning: '#f1c460',
    spColorDanger: '#ff8181',
    spColorInfo: '#74c4ff',
    spScrollbarThumb: 'rgba(118, 177, 214, 0.56)',
    spScrollbarTrack: 'rgba(255, 255, 255, 0.08)',
});

const BUILTIN_TEMPLATES = Object.freeze([
    {
        id: 'builtin.special.message.v1',
        name: '默认-消息记录表',
        templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
        source: 'builtin',
        readOnly: true,
        exportable: true,
        enabled: true,
        matcher: {
            tableNameExact: ['消息记录表'],
            tableNameIncludes: ['消息', '聊天'],
            requiredHeaders: ['会话ID', '发送者', '消息内容'],
            optionalHeaders: ['会话标题', '消息发送时间', '消息状态', '聊天对象', '请求ID', '回复到消息ID', '图片描述', '视频描述'],
            minScore: 70,
        },
        render: {
            rendererKey: 'special_message',
            fieldBindings: {
                ...DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER.special_message,
            },
            styleOptions: {
                ...DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER.special_message,
            },
            styleTokens: {
                ...SPECIAL_MESSAGE_DEFAULT_STYLE_TOKENS,
            },
            structureOptions: {
                conversationList: {
                    showSubtitle: true,
                    showLastMessage: true,
                },
                detailHeader: {
                    showSubtitle: true,
                },
                composeBar: {
                    showStatusText: true,
                    showRetryButton: true,
                    showTemplateNote: true,
                },
            },
            typographyOptions: {
                navTitleFontSize: '16px',
                navTitleFontWeight: '700',
                conversationTitleFontSize: '14px',
                conversationTitleFontWeight: '600',
                conversationPreviewFontSize: '12px',
                conversationMetaFontSize: '11px',
                messageFontSize: '14px',
                messageLineHeight: '1.6',
                messageMetaFontSize: '11px',
                composeStatusFontSize: '11px',
            },
            motionOptions: {
                fastDuration: '0.15s',
                normalDuration: '0.25s',
                hoverLiftY: '-1px',
            },
            customCss: [
                '.phone-special-message .phone-nav-bar { backdrop-filter: blur(6px); }',
                '.phone-special-message .phone-special-conversation-item { border-radius: var(--sp-radius-sm, 10px); margin-bottom: 2px; }',
                '.phone-special-message .phone-special-message-item.media-row .phone-special-message-bubble { font-style: italic; }',
                '.phone-special-message .phone-special-media-preview-modal { max-width: 92%; }',
            ].join('\n'),
        },
        meta: {
            author: 'YuziPhone',
            description: '内置默认专属模板：消息记录表（补齐聊天对象/请求链路字段，并接入结构/排版/动效配置）',
            tags: ['builtin', 'special', 'message', 'structure-runtime'],
            updatedAt: 1760000000000,
        },
    },
    {
        id: 'builtin.special.moments.v1',
        name: '默认-动态表',
        templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
        source: 'builtin',
        readOnly: true,
        exportable: true,
        enabled: true,
        matcher: {
            tableNameExact: ['动态表'],
            tableNameIncludes: ['动态', '朋友圈'],
            requiredHeaders: ['发帖人', '标题', '文案'],
            optionalHeaders: ['发帖时间', '评论内容', '点赞数', '评论数', '转发数', '浏览数', '图片描述', '视频描述', '话题', '位置', '主角回复选项1', '发布者回复1'],
            minScore: 68,
        },
        render: {
            rendererKey: 'special_moments',
            fieldBindings: {
                ...DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER.special_moments,
            },
            styleOptions: {
                ...DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER.special_moments,
            },
            styleTokens: {
                ...SPECIAL_MOMENTS_DEFAULT_STYLE_TOKENS,
            },
            structureOptions: {
                postMeta: {
                    showTopicTag: true,
                    showLocation: true,
                    showViewCount: true,
                    showTime: true,
                },
                commentList: {
                    showCount: true,
                },
            },
            typographyOptions: {
                navTitleFontSize: '16px',
                postTitleFontSize: '15px',
                postTitleFontWeight: '700',
                postMetaFontSize: '11px',
                postBodyFontSize: '14px',
                postBodyLineHeight: '1.7',
                commentFontSize: '13px',
            },
            motionOptions: {
                fastDuration: '0.15s',
                normalDuration: '0.25s',
                hoverLiftY: '-1px',
            },
            customCss: [
                '.phone-special-moments .phone-special-moment-item { backdrop-filter: blur(4px); }',
                '.phone-special-moments .phone-special-moment-stats span { letter-spacing: 0.3px; }',
                '.phone-special-moments .phone-special-reply-option-item:hover { transform: translateY(-1px); }',
                '.phone-special-moments .phone-special-media-item { text-align: center; }',
            ].join('\n'),
        },
        meta: {
            author: 'YuziPhone',
            description: '内置默认专属模板：动态表（新增帖子元信息、浏览数与评论区结构配置）',
            tags: ['builtin', 'special', 'moments', 'structure-runtime'],
            updatedAt: 1760000000000,
        },
    },
    {
        id: 'builtin.special.forum.v1',
        name: '默认-论坛表',
        templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
        source: 'builtin',
        readOnly: true,
        exportable: true,
        enabled: true,
        matcher: {
            tableNameExact: ['论坛表'],
            tableNameIncludes: ['论坛', '帖子'],
            requiredHeaders: ['发帖人网名', '主角网名', '标题', '文案'],
            optionalHeaders: ['发帖时间', '评论内容', '点赞数', '评论数', '转发数', '浏览数', '图片描述', '视频描述', '话题', '位置', '主角回复选项1', '发布者回复1'],
            minScore: 68,
        },
        render: {
            rendererKey: 'special_forum',
            fieldBindings: {
                ...DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER.special_forum,
            },
            styleOptions: {
                ...DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER.special_forum,
            },
            styleTokens: {
                ...SPECIAL_FORUM_DEFAULT_STYLE_TOKENS,
            },
            structureOptions: {
                postMeta: {
                    showTopicTag: true,
                    showLocation: false,
                    showViewCount: true,
                    showTime: true,
                },
                forumMeta: {
                    showPrefix: true,
                },
                commentList: {
                    showCount: true,
                },
            },
            typographyOptions: {
                navTitleFontSize: '16px',
                postTitleFontSize: '16px',
                postTitleFontWeight: '700',
                postMetaFontSize: '11px',
                postBodyFontSize: '14px',
                postBodyLineHeight: '1.7',
                commentFontSize: '13px',
            },
            motionOptions: {
                fastDuration: '0.15s',
                normalDuration: '0.25s',
                hoverLiftY: '-1px',
            },
            customCss: [
                '.phone-special-forum .phone-special-moment-title.forum { text-transform: none; }',
                '.phone-special-forum .phone-special-moment-meta.forum { font-style: italic; }',
                '.phone-special-forum .phone-special-comment { border-left: 2px solid var(--sp-quote-border, rgba(219, 180, 138, 0.3)); padding-left: 6px; }',
                '.phone-special-forum .phone-special-media-item:hover { box-shadow: 0 0 0 1px var(--sp-btn-border, rgba(118, 177, 214, 0.42)); }',
            ].join('\n'),
        },
        meta: {
            author: 'YuziPhone',
            description: '内置默认专属模板：论坛表（新增板块元信息、浏览数与论坛专属结构配置）',
            tags: ['builtin', 'special', 'forum', 'structure-runtime'],
            updatedAt: 1760000000000,
        },
    },
    {
        id: 'builtin.generic.table.v1',
        name: '默认-通用表格',
        templateType: PHONE_TEMPLATE_TYPE_GENERIC,
        source: 'builtin',
        readOnly: true,
        exportable: true,
        enabled: true,
        matcher: {
            tableNameExact: [],
            tableNameIncludes: [],
            requiredHeaders: [],
            optionalHeaders: [],
            minScore: 0,
        },
        render: {
            rendererKey: 'generic_table',
            fieldBindings: {
                ...DEFAULT_GENERIC_FIELD_BINDINGS,
            },
            layoutOptions: {
                pageMode: 'framed',
                navMode: 'solid',
                listContainerMode: 'table',
                listItemMode: 'row',
                listMetaMode: 'inline',
                detailContainerMode: 'plain',
                detailFieldLayout: 'grid-2',
                detailGroupMode: 'section',
                actionBarMode: 'sticky',
                buttonShape: 'rounded',
                buttonSize: 'md',
                density: 'normal',
                shadowLevel: 'soft',
                radiusLevel: 'lg',
                showListDivider: true,
                showDetailDivider: false,
            },
            structureOptions: {
                toolbar: {
                    showSearch: true,
                    showResultCount: true,
                    showHint: true,
                },
                listItem: {
                    showIndex: true,
                    showStatus: true,
                    showTime: true,
                    showArrow: true,
                },
                bottomBar: {
                    showAdd: true,
                    showLock: true,
                    showDelete: true,
                },
            },
            typographyOptions: {
                navTitleFontSize: '16px',
                listTitleFontSize: '14px',
                listPreviewFontSize: '13px',
                detailKeyFontSize: '11px',
                detailValueFontSize: '13px',
                buttonFontSize: '13px',
                chipFontSize: '11px',
            },
            motionOptions: {
                fastDuration: '0.15s',
                normalDuration: '0.25s',
            },
            styleTokens: {
                gtPageBg: 'linear-gradient(180deg, #F4F7FB 0%, #EEF3F8 100%)',
                gtBodyBg: 'transparent',
                gtText: '#0F172A',
                gtMutedText: '#64748B',
                gtNavBg: 'rgba(248, 250, 252, 0.9)',
                gtNavBorderColor: 'rgba(148, 163, 184, 0.18)',
                gtNavText: '#0F172A',
                gtNavBackText: '#2563EB',
                gtListBg: '#FFFFFF',
                gtListBorder: 'rgba(148, 163, 184, 0.18)',
                gtListItemBg: '#FFFFFF',
                gtListItemHoverBg: 'rgba(37, 99, 235, 0.06)',
                gtListItemText: '#0F172A',
                gtDetailBg: '#FFFFFF',
                gtDetailBorder: 'rgba(148, 163, 184, 0.18)',
                gtDetailFieldBg: '#FFFFFF',
                gtDetailFieldBorder: 'rgba(203, 213, 225, 0.95)',
                gtDetailKeyText: '#475569',
                gtDetailValueText: '#0F172A',
                gtActionBtnBg: '#FFFFFF',
                gtActionBtnBorder: 'rgba(148, 163, 184, 0.28)',
                gtActionBtnText: '#334155',
                gtBackdropFilter: 'blur(16px)',
                gtAccent: '#2563EB',
                gtAccentStrong: '#1D4ED8',
                gtAccentSoft: 'rgba(37, 99, 235, 0.12)',
                gtAccentBorder: 'rgba(37, 99, 235, 0.22)',
                gtSuccess: '#16A34A',
                gtWarning: '#D97706',
                gtDanger: '#DC2626',
                gtInfo: '#2563EB',
                gtPanelBg: 'rgba(255, 255, 255, 0.8)',
                gtPanelMutedBg: 'rgba(248, 250, 252, 0.74)',
                gtPanelBorderStrong: 'rgba(148, 163, 184, 0.22)',
                gtRadiusSm: '10px',
                gtRadiusMd: '16px',
                gtRadiusLg: '22px',
                gtShadowSm: '0 8px 18px rgba(15, 23, 42, 0.06)',
                gtShadowMd: '0 18px 40px rgba(15, 23, 42, 0.08)',
                gtShadowLg: '0 24px 56px rgba(15, 23, 42, 0.12)',
                gtGapXs: '4px',
                gtGapSm: '10px',
                gtGapMd: '14px',
                gtGapLg: '20px',
            },
            customCss: [
                '.phone-generic-slot-nav { box-shadow: 0 1px 0 rgba(148, 163, 184, 0.14); }',
                '.phone-generic-slot-list-item.is-row-locked { opacity: 0.74; }',
                '.phone-generic-slot-detail-field.is-locked { border-color: rgba(217, 119, 6, 0.18); background: rgba(245, 158, 11, 0.06); }',
                '.phone-generic-slot-detail-field textarea::placeholder { color: rgba(100, 116, 139, 0.68); }',
            ].join('\n'),
        },
        meta: {
            author: 'YuziPhone',
            description: '内置默认模板：通用表格（支持摘要字段映射、结构开关、排版与动效变量）',
            tags: ['builtin', 'generic', 'summary-bindings', 'structure-runtime'],
            updatedAt: 1760000000000,
        },
    },
]);

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isAnnotatedValueWrapper(raw) {
    return !!raw
        && typeof raw === 'object'
        && !Array.isArray(raw)
        && Object.prototype.hasOwnProperty.call(raw, 'value');
}

function unwrapAnnotatedValue(raw) {
    if (isAnnotatedValueWrapper(raw)) {
        return raw.value;
    }
    return raw;
}

const ANNOTATION_META_KEYS = new Set([
    '_comment',
    '_type',
    '_enum',
    '_range',
    '_example',
    '_risk',
    '_default',
]);

function stripAnnotationStructure(raw) {
    const value = unwrapAnnotatedValue(raw);

    if (Array.isArray(value)) {
        return value.map(item => stripAnnotationStructure(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const result = {};
    Object.entries(value).forEach(([key, item]) => {
        const safeKey = String(key || '');
        if (safeKey.startsWith('_') && ANNOTATION_META_KEYS.has(safeKey)) return;
        result[key] = stripAnnotationStructure(item);
    });

    return result;
}

function toAnnotatedValue(rawValue, comment = '') {
    if (isAnnotatedValueWrapper(rawValue)) {
        return rawValue;
    }

    return {
        value: deepClone(rawValue),
        _comment: normalizeString(comment, 240),
    };
}

function clampNumber(value, min, max, fallback) {
    const n = Number(unwrapAnnotatedValue(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function nowTs() {
    return Date.now();
}

function normalizeString(value, maxLength = 120) {
    return String(unwrapAnnotatedValue(value) ?? '').trim().slice(0, maxLength);
}

function sanitizeId(rawId, fallback = '') {
    const text = normalizeString(rawId, 120)
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .replace(/_{2,}/g, '_');
    return text || fallback;
}

function uniqueStringArray(raw, maxCount = 32, maxLength = 80) {
    const source = unwrapAnnotatedValue(raw);
    if (!Array.isArray(source)) return [];

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        if (result.length >= maxCount) return;
        const text = normalizeString(item, maxLength);
        if (!text || seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

function normalizeTemplateType(rawType, fallback = PHONE_TEMPLATE_TYPE_GENERIC) {
    const text = normalizeString(rawType, 48);
    return ALLOWED_TEMPLATE_TYPES.has(text) ? text : fallback;
}

function defaultRendererKeyByType(templateType) {
    if (templateType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        return 'special_message';
    }
    return 'generic_table';
}

function normalizeStyleTokens(raw) {
    const source = unwrapAnnotatedValue(raw);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

    const tokens = {};
    Object.entries(source).forEach(([key, value]) => {
        if (String(key || '').startsWith('_')) return;

        const safeKey = normalizeString(key, 48).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeKey) return;

        const textValue = normalizeString(value, 120);
        if (!textValue) return;

        const lower = textValue.toLowerCase();
        if (lower.includes('<') || lower.includes('>') || lower.includes('javascript:') || lower.includes('url(')) {
            return;
        }

        tokens[safeKey] = textValue;
    });

    return tokens;
}

function normalizeEnumValue(value, allowedValues, fallback) {
    const text = normalizeString(value, 48);
    if (!text) return fallback;
    return allowedValues.includes(text) ? text : fallback;
}

function normalizeBooleanLike(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const text = normalizeString(value, 16).toLowerCase();
    if (!text) return fallback;
    if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
    return fallback;
}

function normalizeGenericLayoutOptions(rawLayout) {
    const source = unwrapAnnotatedValue(rawLayout);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    return {
        pageMode: normalizeEnumValue(src.pageMode, GENERIC_LAYOUT_ALLOWED_VALUES.pageMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.pageMode),
        navMode: normalizeEnumValue(src.navMode, GENERIC_LAYOUT_ALLOWED_VALUES.navMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.navMode),
        listContainerMode: normalizeEnumValue(src.listContainerMode, GENERIC_LAYOUT_ALLOWED_VALUES.listContainerMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.listContainerMode),
        listItemMode: normalizeEnumValue(src.listItemMode, GENERIC_LAYOUT_ALLOWED_VALUES.listItemMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.listItemMode),
        listMetaMode: normalizeEnumValue(src.listMetaMode, GENERIC_LAYOUT_ALLOWED_VALUES.listMetaMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.listMetaMode),
        detailContainerMode: normalizeEnumValue(src.detailContainerMode, GENERIC_LAYOUT_ALLOWED_VALUES.detailContainerMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.detailContainerMode),
        detailFieldLayout: normalizeEnumValue(src.detailFieldLayout, GENERIC_LAYOUT_ALLOWED_VALUES.detailFieldLayout, DEFAULT_GENERIC_LAYOUT_OPTIONS.detailFieldLayout),
        detailGroupMode: normalizeEnumValue(src.detailGroupMode, GENERIC_LAYOUT_ALLOWED_VALUES.detailGroupMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.detailGroupMode),
        actionBarMode: normalizeEnumValue(src.actionBarMode, GENERIC_LAYOUT_ALLOWED_VALUES.actionBarMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.actionBarMode),
        buttonShape: normalizeEnumValue(src.buttonShape, GENERIC_LAYOUT_ALLOWED_VALUES.buttonShape, DEFAULT_GENERIC_LAYOUT_OPTIONS.buttonShape),
        buttonSize: normalizeEnumValue(src.buttonSize, GENERIC_LAYOUT_ALLOWED_VALUES.buttonSize, DEFAULT_GENERIC_LAYOUT_OPTIONS.buttonSize),
        density: normalizeEnumValue(src.density, GENERIC_LAYOUT_ALLOWED_VALUES.density, DEFAULT_GENERIC_LAYOUT_OPTIONS.density),
        shadowLevel: normalizeEnumValue(src.shadowLevel, GENERIC_LAYOUT_ALLOWED_VALUES.shadowLevel, DEFAULT_GENERIC_LAYOUT_OPTIONS.shadowLevel),
        radiusLevel: normalizeEnumValue(src.radiusLevel, GENERIC_LAYOUT_ALLOWED_VALUES.radiusLevel, DEFAULT_GENERIC_LAYOUT_OPTIONS.radiusLevel),
        showListDivider: normalizeBooleanLike(src.showListDivider, DEFAULT_GENERIC_LAYOUT_OPTIONS.showListDivider),
        showDetailDivider: normalizeBooleanLike(src.showDetailDivider, DEFAULT_GENERIC_LAYOUT_OPTIONS.showDetailDivider),
    };
}

function normalizeGenericStyleTokens(rawStyleTokens) {
    const normalized = normalizeStyleTokens(rawStyleTokens);
    const merged = { ...normalized };

    Object.entries(GENERIC_STYLE_TOKEN_ALIAS_MAP).forEach(([legacyKey, mappedKeys]) => {
        const legacyValue = merged[legacyKey];
        if (!legacyValue || !Array.isArray(mappedKeys)) return;

        mappedKeys.forEach((nextKey) => {
            const safeKey = normalizeString(nextKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeKey) return;
            if (!merged[safeKey]) {
                merged[safeKey] = legacyValue;
            }
        });
    });

    return merged;
}

function normalizeSpecialStyleTokens(rawStyleTokens) {
    const normalized = normalizeStyleTokens(rawStyleTokens);
    const merged = { ...normalized };

    Object.entries(SPECIAL_STYLE_TOKEN_ALIAS_MAP).forEach(([legacyKey, mappedKeys]) => {
        const legacyValue = merged[legacyKey];
        if (!legacyValue || !Array.isArray(mappedKeys)) return;

        mappedKeys.forEach((nextKey) => {
            const safeKey = normalizeString(nextKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeKey) return;
            if (!merged[safeKey]) {
                merged[safeKey] = legacyValue;
            }
        });
    });

    return merged;
}

function normalizeFieldBindingCandidates(rawCandidates) {
    const unwrapped = unwrapAnnotatedValue(rawCandidates);
    const source = Array.isArray(unwrapped)
        ? unwrapped
        : (unwrapped === undefined || unwrapped === null ? [] : [unwrapped]);

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        const text = normalizeString(item, 80);
        if (!text) return;
        if (/[<>]/.test(text)) return;
        if (text.toLowerCase().includes('javascript:')) return;

        if (seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

function normalizeSpecialFieldBindings(rawFieldBindings, rendererKey) {
    const source = unwrapAnnotatedValue(rawFieldBindings);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const defaults = DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER[rendererKey]
        || DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER.special_message
        || {};

    const merged = {};

    SPECIAL_FIELD_BINDING_ALLOWED_KEYS.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : defaults[fieldKey];

        const normalized = normalizeFieldBindingCandidates(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

function normalizeGenericFieldBindings(rawFieldBindings) {
    const source = unwrapAnnotatedValue(rawFieldBindings);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const merged = {};

    GENERIC_FIELD_BINDING_ALLOWED_KEYS.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : DEFAULT_GENERIC_FIELD_BINDINGS[fieldKey];

        const normalized = normalizeFieldBindingCandidates(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

function normalizeSpecialStyleOptions(rawStyleOptions, rendererKey) {
    const defaults = DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER[rendererKey]
        || DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER.special_message
        || {};

    const source = unwrapAnnotatedValue(rawStyleOptions);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const merged = {};

    Object.keys(defaults).forEach((optionKey) => {
        const fallbackValue = defaults[optionKey];
        const rawValue = Object.prototype.hasOwnProperty.call(src, optionKey)
            ? src[optionKey]
            : fallbackValue;

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES, optionKey)) {
            const allowed = SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES[optionKey] || [];
            merged[optionKey] = normalizeEnumValue(rawValue, allowed, String(fallbackValue || ''));
            return;
        }

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_NUMERIC_RULES, optionKey)) {
            const rule = SPECIAL_STYLE_OPTION_NUMERIC_RULES[optionKey] || {};
            const min = Number.isFinite(Number(rule.min)) ? Number(rule.min) : 0;
            const max = Number.isFinite(Number(rule.max)) ? Number(rule.max) : 999;
            const fallback = Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : min;
            merged[optionKey] = clampNumber(rawValue, min, max, fallback);
            return;
        }

        if (SPECIAL_STYLE_OPTION_BOOLEAN_KEYS.has(optionKey)) {
            merged[optionKey] = normalizeBooleanLike(rawValue, !!fallbackValue);
            return;
        }

        const maxLength = Number.isFinite(Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey]))
            ? Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey])
            : 80;

        merged[optionKey] = normalizeString(rawValue, maxLength)
            || normalizeString(fallbackValue, maxLength);
    });

    return merged;
}

function normalizeMatcher(rawMatcher, templateType) {
    const source = unwrapAnnotatedValue(rawMatcher);
    const src = source && typeof source === 'object' ? source : {};
    const minScoreFallback = templateType === PHONE_TEMPLATE_TYPE_SPECIAL
        ? DEFAULT_SPECIAL_MIN_SCORE
        : DEFAULT_GENERIC_MIN_SCORE;

    return {
        tableNameExact: uniqueStringArray(src.tableNameExact, 20, 80),
        tableNameIncludes: uniqueStringArray(src.tableNameIncludes, 20, 40),
        requiredHeaders: uniqueStringArray(src.requiredHeaders, 40, 80),
        optionalHeaders: uniqueStringArray(src.optionalHeaders, 60, 80),
        minScore: clampNumber(src.minScore, 0, 100, minScoreFallback),
    };
}

function sanitizeCustomCss(rawCss) {
    const source = unwrapAnnotatedValue(rawCss);
    if (typeof source !== 'string') return '';

    const text = String(source).trim().slice(0, 12000);
    if (!text) return '';

    const lower = text.toLowerCase();
    const blockedKeywords = [
        '</style',
        '<script',
        'javascript:',
        '@import',
        'expression(',
        'url(',
    ];

    if (blockedKeywords.some(keyword => lower.includes(keyword))) {
        return '';
    }

    return text;
}

function normalizeRenderAdvanced(rawAdvanced, rawCustomCss) {
    const source = unwrapAnnotatedValue(rawAdvanced);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const legacyCustomCss = sanitizeCustomCss(rawCustomCss);
    const candidateCss = sanitizeCustomCss(src.customCss);
    const customCss = candidateCss || legacyCustomCss;

    const hasLegacyCustomCss = !!legacyCustomCss;
    const customCssEnabled = normalizeBooleanLike(src.customCssEnabled, hasLegacyCustomCss);

    return {
        customCssEnabled,
        customCss,
    };
}

function normalizeRenderExtraGroup(rawGroup) {
    const source = unwrapAnnotatedValue(rawGroup);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    return stripAnnotationStructure(source);
}

function normalizeRender(rawRender, templateType) {
    const source = unwrapAnnotatedValue(rawRender);
    const src = source && typeof source === 'object' ? source : {};
    const fallbackRenderer = defaultRendererKeyByType(templateType);

    const requestedRendererKey = normalizeString(src.rendererKey, 48);
    const rendererKey = ALLOWED_RENDERER_KEYS.has(requestedRendererKey)
        ? requestedRendererKey
        : fallbackRenderer;

    const isGenericRenderer = rendererKey === 'generic_table';
    const advanced = normalizeRenderAdvanced(src.advanced, src.customCss);
    const customCss = advanced.customCssEnabled
        ? sanitizeCustomCss(advanced.customCss)
        : '';

    return {
        rendererKey,
        styleTokens: isGenericRenderer
            ? normalizeGenericStyleTokens(src.styleTokens)
            : normalizeSpecialStyleTokens(src.styleTokens),
        fieldBindings: isGenericRenderer
            ? normalizeGenericFieldBindings(src.fieldBindings)
            : normalizeSpecialFieldBindings(src.fieldBindings, rendererKey),
        styleOptions: isGenericRenderer
            ? {}
            : normalizeSpecialStyleOptions(src.styleOptions, rendererKey),
        layoutOptions: isGenericRenderer
            ? normalizeGenericLayoutOptions(src.layoutOptions)
            : {},
        structureOptions: normalizeRenderExtraGroup(src.structureOptions),
        typographyOptions: normalizeRenderExtraGroup(src.typographyOptions),
        motionOptions: normalizeRenderExtraGroup(src.motionOptions),
        stateOptions: normalizeRenderExtraGroup(src.stateOptions),
        fieldDecorators: normalizeRenderExtraGroup(src.fieldDecorators),
        customCss,
        advanced,
    };
}

function normalizeTemplateMeta(rawMeta = {}) {
    const source = unwrapAnnotatedValue(rawMeta);
    const src = source && typeof source === 'object' ? source : {};
    const updatedAt = Number(unwrapAnnotatedValue(src.updatedAt));

    return {
        author: normalizeString(src.author, 60),
        description: normalizeString(src.description, 240),
        tags: uniqueStringArray(src.tags, 12, 24),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : nowTs(),
    };
}

function normalizeTemplate(rawTemplate, options = {}) {
    const sourceTemplate = unwrapAnnotatedValue(rawTemplate);
    if (!sourceTemplate || typeof sourceTemplate !== 'object') return null;

    const sourceFallback = normalizeString(options.sourceFallback || 'user', 24) || 'user';
    const templateType = normalizeTemplateType(sourceTemplate.templateType, options.templateTypeFallback || PHONE_TEMPLATE_TYPE_GENERIC);

    const idFallback = options.idFallback || `user.template.${nowTs().toString(36)}`;
    const nameFallback = options.nameFallback || '未命名模板';

    const id = sanitizeId(sourceTemplate.id, idFallback);
    const name = normalizeString(sourceTemplate.name, 80) || nameFallback;

    const source = normalizeString(sourceTemplate.source, 24) || sourceFallback;
    const readOnly = normalizeBooleanLike(sourceTemplate.readOnly, false);
    const exportable = normalizeBooleanLike(sourceTemplate.exportable, true);
    const enabled = normalizeBooleanLike(sourceTemplate.enabled, true);

    return {
        id,
        name,
        templateType,
        source,
        readOnly,
        exportable,
        enabled,
        matcher: normalizeMatcher(sourceTemplate.matcher, templateType),
        render: normalizeRender(sourceTemplate.render, templateType),
        meta: normalizeTemplateMeta(sourceTemplate.meta),
    };
}

function getBuiltinTemplateMap() {
    const map = new Map();
    BUILTIN_TEMPLATES.forEach((template) => {
        map.set(template.id, deepClone(template));
    });
    return map;
}

function normalizeBindings(rawBindings, validTemplateIdSet) {
    const source = unwrapAnnotatedValue(rawBindings);
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return {};
    }

    const bindings = {};

    Object.entries(source).forEach(([sheetKey, templateId]) => {
        const safeSheetKey = normalizeString(sheetKey, 80);
        if (!safeSheetKey) return;

        const safeTemplateId = sanitizeId(templateId, '');
        if (!safeTemplateId) return;

        if (validTemplateIdSet && !validTemplateIdSet.has(safeTemplateId)) return;
        bindings[safeSheetKey] = safeTemplateId;
    });

    return bindings;
}

function normalizeTemplateStore(rawStore) {
    const source = unwrapAnnotatedValue(rawStore);
    const src = source && typeof source === 'object' ? source : {};
    const builtinMap = getBuiltinTemplateMap();

    const userTemplates = [];
    const userIdSet = new Set();

    if (Array.isArray(src.templates)) {
        src.templates.forEach((rawTemplate, idx) => {
            const normalized = normalizeTemplate(rawTemplate, {
                sourceFallback: 'user',
                idFallback: `user.template.${idx + 1}.${nowTs().toString(36)}`,
            });
            if (!normalized) return;

            if (builtinMap.has(normalized.id)) {
                normalized.id = sanitizeId(`${normalized.id}.user`, `user.template.${idx + 1}`);
            }

            if (!normalized.id || userIdSet.has(normalized.id)) return;

            normalized.source = 'user';
            normalized.readOnly = false;
            normalized.enabled = normalized.enabled !== false;

            userIdSet.add(normalized.id);
            userTemplates.push(normalized);
        });
    }

    const validTemplateIdSet = new Set([...builtinMap.keys(), ...userIdSet]);

    const updatedAt = Number(unwrapAnnotatedValue(src.updatedAt));

    return {
        schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : nowTs(),
        templates: userTemplates,
        bindings: normalizeBindings(src.bindings, validTemplateIdSet),
    };
}

function saveTemplateStore(nextStore) {
    const normalized = normalizeTemplateStore(nextStore);
    normalized.updatedAt = nowTs();
    savePhoneSetting(PHONE_BEAUTIFY_STORE_KEY, normalized);
    return normalized;
}

function readTemplateStore() {
    const raw = getPhoneSettings()?.[PHONE_BEAUTIFY_STORE_KEY];
    return normalizeTemplateStore(raw);
}

function parseSemverParts(rawVersion) {
    const text = normalizeString(rawVersion, 32);
    const matched = text.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!matched) return null;

    return [
        Number(matched[1]),
        Number(matched[2]),
        Number(matched[3]),
    ];
}

function compareSemver(rawA, rawB) {
    const a = parseSemverParts(rawA);
    const b = parseSemverParts(rawB);
    if (!a || !b) return 0;

    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }

    return 0;
}

function isSchemaVersionCompatible(rawVersion) {
    const current = parseSemverParts(PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION);
    const min = parseSemverParts(PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION);
    const next = parseSemverParts(rawVersion);

    if (!current || !min || !next) return false;
    if (next[0] !== current[0]) return false;
    if (compareSemver(rawVersion, PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION) < 0) return false;
    if (compareSemver(rawVersion, PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION) > 0) return false;
    return true;
}

function parsePackInput(input) {
    let parsed = input;

    if (typeof input === 'string') {
        parsed = JSON.parse(input);
    }

    if (Array.isArray(parsed)) {
        return {
            format: PHONE_BEAUTIFY_TEMPLATE_FORMAT,
            schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            templates: parsed,
            packMeta: {},
        };
    }

    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.templates)) {
        const safeFormat = normalizeString(parsed.format, 64) || PHONE_BEAUTIFY_TEMPLATE_FORMAT;
        if (safeFormat !== PHONE_BEAUTIFY_TEMPLATE_FORMAT) {
            throw new Error(`模板包 format 不支持：${safeFormat}`);
        }

        const rawSchemaVersion = normalizeString(parsed.schemaVersion, 32)
            || PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION;

        if (!isSchemaVersionCompatible(rawSchemaVersion)) {
            throw new Error(`模板包 schemaVersion 不兼容：${rawSchemaVersion}（当前支持 ${PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION} ~ ${PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION}）`);
        }

        return {
            format: safeFormat,
            schemaVersion: rawSchemaVersion,
            templates: parsed.templates,
            packMeta: parsed.packMeta,
        };
    }

    if (parsed && typeof parsed === 'object' && parsed.id && parsed.templateType) {
        return {
            format: PHONE_BEAUTIFY_TEMPLATE_FORMAT,
            schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            templates: [parsed],
            packMeta: {},
        };
    }

    throw new Error('模板文件结构不合法：缺少 templates 数组');
}

function ensureUniqueTemplateId(seedId, usedIdSet) {
    const base = sanitizeId(seedId, `user.template.${nowTs().toString(36)}`);
    if (!usedIdSet.has(base)) {
        usedIdSet.add(base);
        return base;
    }

    let idx = 2;
    while (idx < 9999) {
        const nextId = `${base}.${idx}`;
        if (!usedIdSet.has(nextId)) {
            usedIdSet.add(nextId);
            return nextId;
        }
        idx++;
    }

    const fallback = `user.template.${nowTs().toString(36)}`;
    usedIdSet.add(fallback);
    return fallback;
}

function scoreTemplateMatcher(matcher, tableName, headerSet) {
    const m = matcher || {};
    const normalizedTableName = normalizeString(tableName, 80);

    let score = 0;

    if (m.tableNameExact?.some(name => normalizeString(name, 80) === normalizedTableName)) {
        score += 60;
    }

    if (m.tableNameIncludes?.some(keyword => {
        const text = normalizeString(keyword, 40);
        return text && normalizedTableName.includes(text);
    })) {
        score += 22;
    }

    const requiredHeaders = Array.isArray(m.requiredHeaders) ? m.requiredHeaders : [];
    if (requiredHeaders.length > 0) {
        const matchedCount = requiredHeaders.reduce((acc, header) => {
            return acc + (headerSet.has(normalizeString(header, 80)) ? 1 : 0);
        }, 0);

        score += Math.round((matchedCount / requiredHeaders.length) * 34);
        if (matchedCount < requiredHeaders.length) {
            score -= (requiredHeaders.length - matchedCount) * 18;
        }
    }

    const optionalHeaders = Array.isArray(m.optionalHeaders) ? m.optionalHeaders : [];
    optionalHeaders.forEach((header) => {
        if (headerSet.has(normalizeString(header, 80))) {
            score += 4;
        }
    });

    return clampNumber(score, -999, 999, 0);
}

function normalizeHeadersSet(headers = []) {
    const set = new Set();
    if (!Array.isArray(headers)) return set;

    headers.forEach((header) => {
        const text = normalizeString(header, 80);
        if (text) set.add(text);
    });

    return set;
}

function getTemplateById(templateId) {
    const id = sanitizeId(templateId, '');
    if (!id) return null;

    const templates = getAllPhoneBeautifyTemplates({ includeDisabled: true });
    return templates.find(t => t.id === id) || null;
}

function normalizeBeautifySourceMode(rawMode, fallback = BEAUTIFY_SOURCE_MODE_BUILTIN) {
    const mode = normalizeString(rawMode, 24).toLowerCase();
    if (BEAUTIFY_SOURCE_MODE_ALLOWED.has(mode)) return mode;
    return BEAUTIFY_SOURCE_MODE_ALLOWED.has(fallback) ? fallback : BEAUTIFY_SOURCE_MODE_BUILTIN;
}

function normalizeSourceModeForTemplateType(templateType, sourceMode) {
    const safeType = normalizeTemplateType(templateType, '');
    if (!safeType) return BEAUTIFY_SOURCE_MODE_BUILTIN;

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        return normalizeBeautifySourceMode(sourceMode, BEAUTIFY_SOURCE_MODE_BUILTIN);
    }

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        return normalizeBeautifySourceMode(sourceMode, BEAUTIFY_SOURCE_MODE_BUILTIN);
    }

    return BEAUTIFY_SOURCE_MODE_BUILTIN;
}

function getSourceModeSettingKey(templateType) {
    const safeType = normalizeTemplateType(templateType, '');
    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) return BEAUTIFY_SOURCE_MODE_SETTING_KEY_SPECIAL;
    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) return BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC;
    return '';
}

function normalizeSpecialActiveTemplateIds(rawMap) {
    const src = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
        ? rawMap
        : {};

    const normalized = {};
    Object.entries(src).forEach(([rendererKey, templateId]) => {
        const safeRendererKey = normalizeString(rendererKey, 48);
        if (!SPECIAL_RENDERER_KEYS.has(safeRendererKey)) return;

        const safeTemplateId = sanitizeId(templateId, '');
        if (!safeTemplateId) return;

        normalized[safeRendererKey] = safeTemplateId;
    });

    return normalized;
}

function normalizeGenericActiveTemplateId(rawTemplateId) {
    return sanitizeId(rawTemplateId, '');
}

function getSpecialActiveTemplateIdsRaw() {
    const raw = getPhoneSettings()?.[BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL];
    return normalizeSpecialActiveTemplateIds(raw);
}

function getGenericActiveTemplateIdRaw() {
    const raw = getPhoneSettings()?.[BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC];
    return normalizeGenericActiveTemplateId(raw);
}

function getSpecialTemplatesByRendererKey(rendererKey, options = {}) {
    const safeRendererKey = normalizeString(rendererKey, 48);
    if (!SPECIAL_RENDERER_KEYS.has(safeRendererKey)) return [];

    return getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_SPECIAL, {
        includeBuiltin: options.includeBuiltin !== false,
        includeUser: options.includeUser !== false,
        enabledOnly: options.enabledOnly === true,
    }).filter(t => t?.render?.rendererKey === safeRendererKey);
}

function getDefaultSpecialTemplateIdByRenderer(rendererKey) {
    const candidates = getSpecialTemplatesByRendererKey(rendererKey, {
        includeBuiltin: true,
        includeUser: false,
        enabledOnly: true,
    });
    return sanitizeId(candidates[0]?.id, '');
}

function getDefaultGenericTemplateId() {
    const templates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: false,
        enabledOnly: true,
    }).filter(t => t?.render?.rendererKey === 'generic_table');

    return sanitizeId(templates[0]?.id, '');
}

function ensureValidSpecialActiveTemplateIds(rawMap) {
    const normalized = normalizeSpecialActiveTemplateIds(rawMap);
    const result = { ...normalized };

    SPECIAL_RENDERER_KEYS.forEach((rendererKey) => {
        const currentId = sanitizeId(result[rendererKey], '');
        if (!currentId) return;

        const exists = getSpecialTemplatesByRendererKey(rendererKey, {
            includeBuiltin: true,
            includeUser: true,
            enabledOnly: true,
        }).some(t => t.id === currentId);

        if (!exists) {
            delete result[rendererKey];
        }
    });

    return result;
}

function ensureValidGenericActiveTemplateId(rawTemplateId) {
    const id = normalizeGenericActiveTemplateId(rawTemplateId);
    if (!id) return '';

    const exists = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    }).some(t => t.id === id && t?.render?.rendererKey === 'generic_table');

    return exists ? id : '';
}

export function getBeautifyTemplateSourceMode(templateType) {
    const settingKey = getSourceModeSettingKey(templateType);
    if (!settingKey) return BEAUTIFY_SOURCE_MODE_BUILTIN;

    const raw = getPhoneSettings()?.[settingKey];
    return normalizeSourceModeForTemplateType(templateType, raw);
}

export function setBeautifyTemplateSourceMode(templateType, sourceMode) {
    const settingKey = getSourceModeSettingKey(templateType);
    if (!settingKey) {
        return { success: false, message: '模板类型无效' };
    }

    const normalized = normalizeSourceModeForTemplateType(templateType, sourceMode);
    savePhoneSetting(settingKey, normalized);
    return {
        success: true,
        mode: normalized,
        message: normalized === BEAUTIFY_SOURCE_MODE_USER ? '已切换到自定义导入模板' : '已切换到默认模板',
    };
}

export function getActiveBeautifyTemplateIdByType(templateType, options = {}) {
    const safeType = normalizeTemplateType(templateType, '');
    if (!safeType) return '';

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        const valid = ensureValidGenericActiveTemplateId(getGenericActiveTemplateIdRaw());
        if (valid) return valid;

        const fallback = options.withFallback === false ? '' : getDefaultGenericTemplateId();
        if (fallback && options.persist !== false) {
            savePhoneSetting(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, fallback);
        }
        return fallback;
    }

    return '';
}

export function getActiveBeautifyTemplateIdsForSpecial(options = {}) {
    const valid = ensureValidSpecialActiveTemplateIds(getSpecialActiveTemplateIdsRaw());
    const withFallback = options.withFallback !== false;

    if (!withFallback) return valid;

    const merged = { ...valid };
    let changed = false;

    SPECIAL_RENDERER_KEYS.forEach((rendererKey) => {
        if (merged[rendererKey]) return;
        const fallbackId = getDefaultSpecialTemplateIdByRenderer(rendererKey);
        if (!fallbackId) return;
        merged[rendererKey] = fallbackId;
        changed = true;
    });

    if (changed && options.persist !== false) {
        savePhoneSetting(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, merged);
    }

    return merged;
}

export function setActiveBeautifyTemplateIdByType(templateType, templateId) {
    const safeType = normalizeTemplateType(templateType, '');
    const safeTemplateId = sanitizeId(templateId, '');
    if (!safeType || !safeTemplateId) {
        return { success: false, message: '模板类型或模板 ID 无效' };
    }

    const template = getTemplateById(safeTemplateId);
    if (!template || template.enabled === false) {
        return { success: false, message: '模板不存在或未启用' };
    }

    if (template.templateType !== safeType) {
        return { success: false, message: '模板类型不匹配' };
    }

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        if (template?.render?.rendererKey !== 'generic_table') {
            return { success: false, message: '通用模板渲染器无效' };
        }

        savePhoneSetting(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, safeTemplateId);
        return {
            success: true,
            templateId: safeTemplateId,
            message: '通用模板已启用',
        };
    }

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const rendererKey = normalizeString(template?.render?.rendererKey, 48);
        if (!SPECIAL_RENDERER_KEYS.has(rendererKey)) {
            return { success: false, message: '专属模板渲染器无效' };
        }

        const currentMap = getActiveBeautifyTemplateIdsForSpecial({ withFallback: false, persist: false });
        const nextMap = {
            ...currentMap,
            [rendererKey]: safeTemplateId,
        };

        savePhoneSetting(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextMap);
        return {
            success: true,
            rendererKey,
            templateId: safeTemplateId,
            message: '专属模板已启用',
        };
    }

    return { success: false, message: '模板类型无效' };
}

function getEffectiveTemplatesBySourceMode(templates, sourceMode) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    const mode = normalizeBeautifySourceMode(sourceMode, BEAUTIFY_SOURCE_MODE_BUILTIN);

    const builtin = safeTemplates.filter(t => t?.source === 'builtin');
    const user = safeTemplates.filter(t => t?.source !== 'builtin');

    if (mode === BEAUTIFY_SOURCE_MODE_USER) {
        if (user.length > 0) {
            return {
                templates: user,
                fallbackApplied: false,
                mode: BEAUTIFY_SOURCE_MODE_USER,
            };
        }

        return {
            templates: builtin,
            fallbackApplied: true,
            mode: BEAUTIFY_SOURCE_MODE_BUILTIN,
        };
    }

    return {
        templates: builtin,
        fallbackApplied: false,
        mode: BEAUTIFY_SOURCE_MODE_BUILTIN,
    };
}

export function getBeautifyTemplateSourceModeRuntime(templateType, options = {}) {
    const mode = getBeautifyTemplateSourceMode(templateType);
    const templates = getPhoneBeautifyTemplatesByType(templateType, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: options.enabledOnly === true,
    });

    const safeType = normalizeTemplateType(templateType, '');

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const activeMap = getActiveBeautifyTemplateIdsForSpecial({ withFallback: true, persist: true });
        const selected = templates.filter((t) => {
            const rendererKey = normalizeString(t?.render?.rendererKey, 48);
            if (!SPECIAL_RENDERER_KEYS.has(rendererKey)) return false;
            return sanitizeId(activeMap[rendererKey], '') === t.id;
        });

        if (selected.length > 0) {
            return {
                preferredMode: mode,
                effectiveMode: 'active_template',
                fallbackApplied: false,
                hasUserTemplates: templates.some(t => t?.source !== 'builtin'),
                templates: selected,
            };
        }
    }

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
            withFallback: true,
            persist: true,
        });

        const selected = activeTemplateId
            ? templates.filter(t => t.id === activeTemplateId && t?.render?.rendererKey === 'generic_table')
            : [];

        if (selected.length > 0) {
            return {
                preferredMode: mode,
                effectiveMode: 'active_template',
                fallbackApplied: false,
                hasUserTemplates: templates.some(t => t?.source !== 'builtin'),
                templates: selected,
            };
        }
    }

    const filtered = getEffectiveTemplatesBySourceMode(templates, mode);
    return {
        preferredMode: mode,
        effectiveMode: filtered.mode,
        fallbackApplied: filtered.fallbackApplied,
        hasUserTemplates: templates.some(t => t?.source !== 'builtin'),
        templates: filtered.templates,
    };
}

export function getBuiltinPhoneBeautifyTemplates() {
    return deepClone(BUILTIN_TEMPLATES);
}

export function getPhoneBeautifyTemplateStore() {
    return readTemplateStore();
}

export function getAllPhoneBeautifyTemplates(options = {}) {
    const includeDisabled = options.includeDisabled !== false;

    const store = readTemplateStore();
    const builtin = getBuiltinPhoneBeautifyTemplates();
    const user = deepClone(store.templates || []);

    const merged = [...builtin, ...user];
    return includeDisabled ? merged : merged.filter(t => t.enabled !== false);
}

export function getPhoneBeautifyTemplatesByType(templateType, options = {}) {
    const type = normalizeTemplateType(templateType, '');
    if (!type) return [];

    const includeBuiltin = options.includeBuiltin !== false;
    const includeUser = options.includeUser !== false;
    const enabledOnly = options.enabledOnly === true;

    const all = getAllPhoneBeautifyTemplates({ includeDisabled: !enabledOnly });

    return all
        .filter((template) => {
            if (template.templateType !== type) return false;
            if (!includeBuiltin && template.source === 'builtin') return false;
            if (!includeUser && template.source !== 'builtin') return false;
            if (enabledOnly && template.enabled === false) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.source !== b.source) {
                return a.source === 'builtin' ? -1 : 1;
            }
            return Number(b.meta?.updatedAt || 0) - Number(a.meta?.updatedAt || 0);
        });
}

export function validatePhoneBeautifyTemplate(rawTemplate) {
    const errors = [];
    const warnings = [];

    const normalized = normalizeTemplate(rawTemplate, {
        sourceFallback: 'user',
    });

    if (!normalized) {
        errors.push('模板不是有效对象');
        return { ok: false, errors, warnings, template: null };
    }

    if (!normalized.id) {
        errors.push('模板缺少 id');
    }

    if (!normalized.name) {
        errors.push('模板缺少 name');
    }

    if (!ALLOWED_TEMPLATE_TYPES.has(normalized.templateType)) {
        errors.push(`不支持的 templateType：${normalized.templateType}`);
    }

    if (!ALLOWED_RENDERER_KEYS.has(normalized.render?.rendererKey)) {
        errors.push(`不支持的 rendererKey：${normalized.render?.rendererKey || ''}`);
    }

    if (normalized.templateType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[normalized.render.rendererKey];
        if (!specialType) {
            errors.push('专属模板的 rendererKey 必须是 special_message/special_moments/special_forum');
        }
    }

    if ((normalized.matcher?.requiredHeaders || []).length === 0
        && (normalized.matcher?.tableNameExact || []).length === 0
        && (normalized.matcher?.tableNameIncludes || []).length === 0) {
        warnings.push('模板未配置明显匹配特征，可能无法稳定识别');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        template: normalized,
    };
}

const TEMPLATE_FIELD_COMMENT_MAP = Object.freeze({
    id: '模板唯一标识，建议保持稳定，避免覆盖冲突。',
    name: '模板显示名称，用于设置页与导出识别。',
    templateType: '模板类型：special_app_template 或 generic_table_template。',
    source: '模板来源：builtin（内置）/ user（用户导入）。',
    readOnly: '是否只读；内置模板通常为 true。',
    exportable: '是否允许导出。',
    enabled: '模板启用状态。',
    'matcher.tableNameExact': '表名精确匹配列表。',
    'matcher.tableNameIncludes': '表名包含关键词列表。',
    'matcher.requiredHeaders': '必须命中的表头列表。',
    'matcher.optionalHeaders': '可选加分表头列表。',
    'matcher.minScore': '匹配阈值（0~100）。',
    'render.rendererKey': '渲染器键：special_message/special_moments/special_forum/generic_table。',
    'render.customCss': '自定义样式，建议仅在高级模式启用并逐步验证。',
    'render.advanced.customCssEnabled': '高级模式 customCss 开关；false 时 customCss 不生效。',
    'render.advanced.customCss': '高级模式 customCss 原始内容。',
    'meta.author': '模板作者。',
    'meta.description': '模板说明描述。',
    'meta.tags': '模板标签数组。',
    'meta.updatedAt': '模板更新时间时间戳（ms）。',
});

function getTemplateFieldComment(path = '') {
    const exact = TEMPLATE_FIELD_COMMENT_MAP[path];
    if (exact) return exact;

    if (path.startsWith('render.styleTokens.')) {
        return '样式 Token 值（颜色/尺寸/圆角/阴影等），建议与主题整体一致。';
    }

    if (path.startsWith('render.styleOptions.')) {
        return '样式选项字段，通常为枚举/布尔/数值。';
    }

    if (path.startsWith('render.layoutOptions.')) {
        return '布局选项字段，控制列表与详情结构。';
    }

    if (path.startsWith('render.fieldBindings.')) {
        return '字段映射候选列表，可填写列名或 @const/@now 等标记。';
    }

    if (path.startsWith('render.structureOptions.')) {
        return '结构开关配置，用于控制模块显隐与骨架布局。';
    }

    if (path.startsWith('render.typographyOptions.')) {
        return '排版配置（字体、字号、行高、字重等）。';
    }

    if (path.startsWith('render.motionOptions.')) {
        return '动效配置（时长、缓动、过渡行为等）。';
    }

    if (path.startsWith('render.stateOptions.')) {
        return '状态样式配置（hover/active/focus/disabled 等）。';
    }

    if (path.startsWith('render.fieldDecorators.')) {
        return '字段修饰配置（角标、徽章、高亮、边框强调等）。';
    }

    if (path.startsWith('matcher.')) {
        return '模板匹配策略字段。';
    }

    return path ? `配置字段：${path}` : '模板根对象';
}

function shouldWrapAsAnnotatedLeaf(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return true;
    return typeof value !== 'object';
}

function annotateTemplateNode(rawValue, path = '') {
    const value = stripAnnotationStructure(rawValue);

    if (shouldWrapAsAnnotatedLeaf(value)) {
        return toAnnotatedValue(value, getTemplateFieldComment(path));
    }

    const result = {};
    Object.entries(value).forEach(([key, child]) => {
        if (String(key || '').startsWith('_')) return;
        const nextPath = path ? `${path}.${key}` : key;
        result[key] = annotateTemplateNode(child, nextPath);
    });

    return result;
}

function serializeTemplateForExport(template, exportMode = PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME) {
    const runtimeTemplate = stripAnnotationStructure(deepClone(template));
    if (exportMode === PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME) {
        return runtimeTemplate;
    }
    return annotateTemplateNode(runtimeTemplate);
}

export function exportPhoneBeautifyPack(options = {}) {
    const templateTypeRaw = normalizeString(options.templateType, 48);
    const templateType = templateTypeRaw ? normalizeTemplateType(templateTypeRaw, '') : '';

    const builtinOnly = !!options.builtinOnly;
    const userOnly = !!options.userOnly;
    const templateIdSet = Array.isArray(options.templateIds)
        ? new Set(options.templateIds.map(id => sanitizeId(id, '')).filter(Boolean))
        : null;

    const exportModeRaw = normalizeString(options.exportMode, 24).toLowerCase();
    const exportMode = exportModeRaw === PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME
        ? PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME
        : PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED;

    const templates = getAllPhoneBeautifyTemplates({ includeDisabled: true })
        .filter((template) => {
            if (templateType && template.templateType !== templateType) return false;
            if (builtinOnly && template.source !== 'builtin') return false;
            if (userOnly && template.source === 'builtin') return false;
            if (templateIdSet && !templateIdSet.has(template.id)) return false;
            if (template.exportable === false) return false;
            return true;
        })
        .map((template) => serializeTemplateForExport(template, exportMode));

    return {
        success: true,
        count: templates.length,
        pack: {
            format: PHONE_BEAUTIFY_TEMPLATE_FORMAT,
            schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            packMeta: {
                name: normalizeString(options.packName, 80) || '手机美化模板包',
                exportedAt: new Date().toISOString(),
                exporter: 'YuziPhone',
                exportMode,
                schemaCompatMin: PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION,
                schemaCompatMax: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            },
            templates,
        },
    };
}

export function importPhoneBeautifyPackFromData(input, options = {}) {
    const overwrite = !!options.overwrite;
    const typeFilterRaw = normalizeString(options.templateTypeFilter, 48);
    const typeFilter = typeFilterRaw ? normalizeTemplateType(typeFilterRaw, '') : '';

    try {
        const parsedPack = parsePackInput(input);
        const rawTemplates = Array.isArray(parsedPack.templates) ? parsedPack.templates : [];

        const warnings = [];
        const errors = [];

        if (parsedPack.schemaVersion
            && compareSemver(parsedPack.schemaVersion, PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION) < 0) {
            warnings.push(`模板包 schemaVersion=${parsedPack.schemaVersion}，已按当前 ${PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION} 兼容归一化`);
        }

        if (rawTemplates.length === 0) {
            return {
                success: false,
                imported: 0,
                replaced: 0,
                skipped: 0,
                errors: ['模板包中没有可导入模板'],
                warnings,
                message: '模板包为空',
            };
        }

        if (rawTemplates.length > MAX_IMPORTED_TEMPLATES) {
            return {
                success: false,
                imported: 0,
                replaced: 0,
                skipped: rawTemplates.length,
                errors: [`单次最多导入 ${MAX_IMPORTED_TEMPLATES} 个模板`],
                warnings,
                message: '导入数量超限',
            };
        }

        const store = readTemplateStore();
        const builtinIds = new Set(getBuiltinPhoneBeautifyTemplates().map(t => t.id));
        const nextUserTemplates = deepClone(store.templates || []);
        const existingUserMap = new Map(nextUserTemplates.map(t => [t.id, t]));
        const usedIds = new Set([
            ...builtinIds,
            ...nextUserTemplates.map(t => t.id),
        ]);

        let imported = 0;
        let replaced = 0;
        let skipped = 0;

        rawTemplates.forEach((rawTemplate, idx) => {
            const validated = validatePhoneBeautifyTemplate(rawTemplate);
            if (!validated.ok || !validated.template) {
                skipped++;
                errors.push(`模板 #${idx + 1} 校验失败：${validated.errors.join('；')}`);
                return;
            }

            const template = deepClone(validated.template);

            if (typeFilter && template.templateType !== typeFilter) {
                skipped++;
                return;
            }

            if (validated.warnings.length > 0) {
                warnings.push(...validated.warnings.map(msg => `模板 #${idx + 1}：${msg}`));
            }

            // 导入后统一转为用户模板
            template.source = 'user';
            template.readOnly = false;
            template.exportable = true;
            template.enabled = template.enabled !== false;
            template.meta.updatedAt = nowTs();

            // 内置模板 ID 不允许直接覆盖，自动改为用户 ID
            if (builtinIds.has(template.id)) {
                const originalId = template.id;
                template.id = `user.imported.${originalId}`;
                warnings.push(`模板“${template.name}”引用了内置 ID，已重命名为 ${template.id}`);
            }

            if (existingUserMap.has(template.id)) {
                if (overwrite) {
                    const oldIdx = nextUserTemplates.findIndex(t => t.id === template.id);
                    if (oldIdx >= 0) {
                        nextUserTemplates[oldIdx] = template;
                        existingUserMap.set(template.id, template);
                        replaced++;
                        imported++;
                        return;
                    }
                }

                const nextId = ensureUniqueTemplateId(template.id, usedIds);
                warnings.push(`模板“${template.name}”ID 冲突，已自动改为 ${nextId}`);
                template.id = nextId;
            } else {
                // 首次出现时登记 ID
                usedIds.add(template.id);
            }

            nextUserTemplates.push(template);
            existingUserMap.set(template.id, template);
            imported++;
        });

        if (imported <= 0) {
            return {
                success: false,
                imported,
                replaced,
                skipped,
                errors,
                warnings,
                message: errors.length > 0 ? '没有模板通过校验' : '没有匹配当前分区的模板',
            };
        }

        saveTemplateStore({
            ...store,
            templates: nextUserTemplates,
        });

        return {
            success: true,
            imported,
            replaced,
            skipped,
            errors,
            warnings,
            message: replaced > 0
                ? `导入完成：新增 ${imported - replaced}，覆盖 ${replaced}`
                : `导入完成：成功 ${imported} 项`,
        };
    } catch (e) {
        return {
            success: false,
            imported: 0,
            replaced: 0,
            skipped: 0,
            errors: [e?.message || '未知错误'],
            warnings: [],
            message: `导入失败：${e?.message || '未知错误'}`,
        };
    }
}

export function savePhoneBeautifyUserTemplate(rawTemplate, options = {}) {
    const overwrite = options.overwrite !== false;

    const validated = validatePhoneBeautifyTemplate(rawTemplate);
    if (!validated.ok || !validated.template) {
        return {
            success: false,
            warnings: validated.warnings || [],
            errors: validated.errors?.length > 0 ? validated.errors : ['模板校验失败'],
            message: validated.errors?.[0] || '模板校验失败',
            template: null,
        };
    }

    const template = deepClone(validated.template);
    template.source = 'user';
    template.readOnly = false;
    template.exportable = true;
    template.enabled = template.enabled !== false;
    template.meta = normalizeTemplateMeta(template.meta);
    template.meta.updatedAt = nowTs();

    const store = readTemplateStore();
    const userTemplates = deepClone(store.templates || []);
    const userMap = new Map(userTemplates.map((t, idx) => [t.id, idx]));
    const builtinIds = new Set(getBuiltinPhoneBeautifyTemplates().map(t => t.id));
    const usedIds = new Set([
        ...builtinIds,
        ...userTemplates.map(t => t.id),
    ]);

    const warnings = [];

    if (builtinIds.has(template.id)) {
        const nextId = ensureUniqueTemplateId(`user.edited.${template.id}`, usedIds);
        warnings.push(`内置模板 ID 不可直接覆盖，已自动转存为 ${nextId}`);
        template.id = nextId;
    }

    let replaced = false;

    if (userMap.has(template.id)) {
        if (overwrite) {
            const idx = Number(userMap.get(template.id));
            if (Number.isInteger(idx) && idx >= 0) {
                userTemplates[idx] = template;
                replaced = true;
            } else {
                userTemplates.push(template);
            }
        } else {
            const nextId = ensureUniqueTemplateId(template.id, usedIds);
            warnings.push(`模板 ID 冲突，已自动改为 ${nextId}`);
            template.id = nextId;
            userTemplates.push(template);
        }
    } else {
        if (usedIds.has(template.id)) {
            template.id = ensureUniqueTemplateId(template.id, usedIds);
        } else {
            usedIds.add(template.id);
        }
        userTemplates.push(template);
    }

    saveTemplateStore({
        ...store,
        templates: userTemplates,
    });

    return {
        success: true,
        warnings,
        errors: [],
        replaced,
        template: deepClone(template),
        message: replaced ? '模板已覆盖保存' : '模板已保存为用户模板',
    };
}

export function deletePhoneBeautifyUserTemplate(templateId) {
    const safeId = sanitizeId(templateId, '');
    if (!safeId) {
        return { success: false, message: '模板 ID 无效' };
    }

    const store = readTemplateStore();
    const prevLength = store.templates.length;

    const nextTemplates = store.templates.filter((template) => template.id !== safeId);
    if (nextTemplates.length === prevLength) {
        return { success: false, message: '未找到可删除的用户模板' };
    }

    const nextBindings = { ...store.bindings };
    Object.entries(nextBindings).forEach(([sheetKey, bindTemplateId]) => {
        if (bindTemplateId === safeId) {
            delete nextBindings[sheetKey];
        }
    });

    saveTemplateStore({
        ...store,
        templates: nextTemplates,
        bindings: nextBindings,
    });

    return { success: true, message: '模板已删除' };
}

export function detectSpecialTemplateForTable({ sheetKey, tableName, headers = [] } = /** @type {any} */ ({}) ) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) return null;

    const safeTableName = normalizeString(tableName, 80);
    const headerSet = normalizeHeadersSet(headers);

    const activeMap = getActiveBeautifyTemplateIdsForSpecial({ withFallback: true, persist: true });
    const sourceRuntime = getBeautifyTemplateSourceModeRuntime(PHONE_TEMPLATE_TYPE_SPECIAL, {
        enabledOnly: true,
    });
    const specialTemplates = sourceRuntime.templates;

    if (specialTemplates.length <= 0) return null;

    const templateMap = new Map(specialTemplates.map(t => [t.id, t]));
    const store = readTemplateStore();

    // 人工绑定优先
    const boundTemplateId = sanitizeId(store.bindings?.[safeSheetKey], '');
    if (boundTemplateId) {
        const boundTemplate = getTemplateById(boundTemplateId);
        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[boundTemplate?.render?.rendererKey];
        if (boundTemplate?.enabled !== false
            && boundTemplate?.templateType === PHONE_TEMPLATE_TYPE_SPECIAL
            && specialType) {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(boundTemplate),
                specialType,
                score: 999,
                reason: 'manual_binding',
            };
        }
    }

    // 勾选启用优先：若能从表名识别子类型，直接使用该子类型的启用模板。
    const hintedRendererKey = inferSpecialRendererKeyByTableName(safeTableName);
    if (hintedRendererKey) {
        const activeTemplateId = sanitizeId(activeMap[hintedRendererKey], '');
        const activeTemplate = activeTemplateId ? templateMap.get(activeTemplateId) : null;
        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[activeTemplate?.render?.rendererKey];
        if (activeTemplate && specialType) {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(activeTemplate),
                specialType,
                score: 999,
                reason: 'active_template',
                sourceMode: sourceRuntime.effectiveMode,
                sourceModePreferred: sourceRuntime.preferredMode,
                sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
            };
        }
    }

    const scored = [];

    specialTemplates.forEach((template) => {
        const score = scoreTemplateMatcher(template.matcher, safeTableName, headerSet);
        const threshold = clampNumber(
            template.matcher?.minScore,
            0,
            100,
            DEFAULT_SPECIAL_MIN_SCORE,
        );

        if (score < threshold) return;

        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[template.render?.rendererKey];
        if (!specialType) return;

        scored.push({
            template,
            score,
            threshold,
            sourcePriority: template.source === 'user' ? 2 : 1,
            updatedAt: Number(template.meta?.updatedAt || 0),
            specialType,
        });
    });

    if (scored.length <= 0) return null;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sourcePriority !== a.sourcePriority) return b.sourcePriority - a.sourcePriority;
        return b.updatedAt - a.updatedAt;
    });

    const best = scored[0];
    return {
        sheetKey: safeSheetKey,
        tableName: safeTableName,
        template: deepClone(best.template),
        specialType: best.specialType,
        score: best.score,
        threshold: best.threshold,
        reason: sourceRuntime.fallbackApplied ? 'matcher_builtin_fallback' : 'matcher',
        sourceMode: sourceRuntime.effectiveMode,
        sourceModePreferred: sourceRuntime.preferredMode,
        sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
    };
}

export function detectGenericTemplateForTable({ sheetKey, tableName, headers = [] } = /** @type {any} */ ({}) ) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) return null;

    const safeTableName = normalizeString(tableName, 80);
    const headerSet = normalizeHeadersSet(headers);

    const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        withFallback: true,
        persist: true,
    });
    const sourceRuntime = getBeautifyTemplateSourceModeRuntime(PHONE_TEMPLATE_TYPE_GENERIC, {
        enabledOnly: true,
    });
    const genericTemplates = sourceRuntime.templates;

    if (genericTemplates.length <= 0) return null;

    const templateMap = new Map(genericTemplates.map(t => [t.id, t]));
    const store = readTemplateStore();

    // 人工绑定优先（若绑定到通用模板）
    const boundTemplateId = sanitizeId(store.bindings?.[safeSheetKey], '');
    if (boundTemplateId) {
        const boundTemplate = getTemplateById(boundTemplateId);
        if (boundTemplate?.enabled !== false
            && boundTemplate?.templateType === PHONE_TEMPLATE_TYPE_GENERIC
            && boundTemplate?.render?.rendererKey === 'generic_table') {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(boundTemplate),
                score: 999,
                reason: 'manual_binding',
            };
        }
    }

    // 勾选启用优先：通用模板分区只启用一个，直接返回。
    if (activeTemplateId && templateMap.has(activeTemplateId)) {
        const activeTemplate = templateMap.get(activeTemplateId);
        if (activeTemplate?.render?.rendererKey === 'generic_table') {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(activeTemplate),
                score: 999,
                threshold: 0,
                reason: 'active_template',
                sourceMode: sourceRuntime.effectiveMode,
                sourceModePreferred: sourceRuntime.preferredMode,
                sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
            };
        }
    }

    const scored = [];

    genericTemplates.forEach((template) => {
        if (template?.render?.rendererKey !== 'generic_table') return;

        const score = scoreTemplateMatcher(template.matcher, safeTableName, headerSet);
        const threshold = clampNumber(
            template.matcher?.minScore,
            0,
            100,
            DEFAULT_GENERIC_MIN_SCORE,
        );

        if (score < threshold) return;

        scored.push({
            template,
            score,
            threshold,
            sourcePriority: template.source === 'user' ? 2 : 1,
            updatedAt: Number(template.meta?.updatedAt || 0),
        });
    });

    if (scored.length <= 0) return null;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sourcePriority !== a.sourcePriority) return b.sourcePriority - a.sourcePriority;
        return b.updatedAt - a.updatedAt;
    });

    const best = scored[0];
    return {
        sheetKey: safeSheetKey,
        tableName: safeTableName,
        template: deepClone(best.template),
        score: best.score,
        threshold: best.threshold,
        reason: sourceRuntime.fallbackApplied ? 'matcher_builtin_fallback' : 'matcher',
        sourceMode: sourceRuntime.effectiveMode,
        sourceModePreferred: sourceRuntime.preferredMode,
        sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
    };
}

export function bindSheetToBeautifyTemplate(sheetKey, templateId) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    const safeTemplateId = sanitizeId(templateId, '');
    if (!safeSheetKey || !safeTemplateId) {
        return { success: false, message: '绑定参数无效' };
    }

    const template = getTemplateById(safeTemplateId);
    if (!template) {
        return { success: false, message: '模板不存在' };
    }

    const store = readTemplateStore();
    const nextBindings = {
        ...store.bindings,
        [safeSheetKey]: safeTemplateId,
    };

    saveTemplateStore({
        ...store,
        bindings: nextBindings,
    });

    return { success: true, message: '绑定已保存' };
}

export function clearSheetBeautifyBinding(sheetKey) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) {
        return { success: false, message: '表格标识无效' };
    }

    const store = readTemplateStore();
    if (!store.bindings[safeSheetKey]) {
        return { success: true, message: '当前无绑定' };
    }

    const nextBindings = { ...store.bindings };
    delete nextBindings[safeSheetKey];

    saveTemplateStore({
        ...store,
        bindings: nextBindings,
    });

    return { success: true, message: '绑定已清除' };
}
