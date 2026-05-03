// modules/phone-beautify-templates/defaults/builtin-templates.js
/**
 * 玉子的手机 - 内置美化模板
 *
 * 这里保留体积最大的 BUILTIN_TEMPLATES，避免字段绑定 / 默认样式常量与内置模板混在同一个 36KB 文件里。
 */

import {
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_TEMPLATE_TYPE_SPECIAL,
} from '../constants.js';
import {
    DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER,
    DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER,
    SPECIAL_MESSAGE_DEFAULT_STYLE_TOKENS,
} from './special-field-bindings.js';
import { DEFAULT_GENERIC_FIELD_BINDINGS } from './generic-field-bindings.js';

export const BUILTIN_TEMPLATES = Object.freeze([
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
                pageMode: 'plain',
                navMode: 'transparent',
                listContainerMode: 'plain',
                listItemMode: 'compact',
                listMetaMode: 'stacked',
                detailContainerMode: 'plain',
                detailFieldLayout: 'stack',
                detailGroupMode: 'flat',
                actionBarMode: 'sticky',
                buttonShape: 'rounded',
                buttonSize: 'sm',
                density: 'normal',
                shadowLevel: 'none',
                radiusLevel: 'sm',
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
                navTitleFontSize: '15px',
                listTitleFontSize: '14px',
                listPreviewFontSize: '12px',
                detailKeyFontSize: '11px',
                detailValueFontSize: '14px',
                buttonFontSize: '12px',
                chipFontSize: '10px',
            },
            motionOptions: {
                fastDuration: '0.2s',
                normalDuration: '0.32s',
            },
            styleTokens: {
                gtPageBg: 'linear-gradient(180deg, #F5F3EF 0%, #EDEAE4 100%)',
                gtBodyBg: 'transparent',
                gtText: '#3A3731',
                gtMutedText: '#7A7772',
                gtNavBg: 'rgba(245, 243, 239, 0.92)',
                gtNavBorderColor: 'rgba(58, 55, 49, 0.06)',
                gtNavText: '#3A3731',
                gtNavBackText: '#5B7A6A',
                gtListBg: 'transparent',
                gtListBorder: 'rgba(58, 55, 49, 0.08)',
                gtListItemBg: 'transparent',
                gtListItemHoverBg: 'rgba(58, 55, 49, 0.03)',
                gtListItemText: '#3A3731',
                gtDetailBg: 'transparent',
                gtDetailBorder: 'rgba(58, 55, 49, 0.06)',
                gtDetailFieldBg: 'transparent',
                gtDetailFieldBorder: 'rgba(58, 55, 49, 0.06)',
                gtDetailKeyText: '#5B7A6A',
                gtDetailValueText: '#3A3731',
                gtActionBtnBg: 'rgba(245, 243, 239, 0.8)',
                gtActionBtnBorder: 'rgba(58, 55, 49, 0.12)',
                gtActionBtnText: '#3A3731',
                gtBackdropFilter: 'none',
                gtAccent: '#5B7A6A',
                gtAccentStrong: '#4A6558',
                gtAccentSoft: 'rgba(91, 122, 106, 0.08)',
                gtAccentBorder: 'rgba(91, 122, 106, 0.18)',
                gtSuccess: '#6B8F71',
                gtWarning: '#A68B5B',
                gtDanger: '#8B5E5E',
                gtInfo: '#5B7A6A',
                gtPanelBg: 'rgba(245, 243, 239, 0.88)',
                gtPanelMutedBg: 'rgba(237, 234, 228, 0.8)',
                gtPanelBorderStrong: 'rgba(58, 55, 49, 0.08)',
                gtRadiusSm: '4px',
                gtRadiusMd: '6px',
                gtRadiusLg: '8px',
                gtShadowSm: 'none',
                gtShadowMd: 'none',
                gtShadowLg: 'none',
                gtGapXs: '3px',
                gtGapSm: '8px',
                gtGapMd: '14px',
                gtGapLg: '22px',
            },
            customCss: [
                /* === 导航：透明 + 极细底线 === */
                '.phone-generic-slot-nav { background: transparent !important; backdrop-filter: none !important; border-bottom: 1px solid rgba(58,55,49,0.06) !important; }',
                /* === 搜索栏：去掉卡片包裹 === */
                '.phone-generic-toolbar-card { border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; padding: 8px 0 4px 0 !important; }',
                /* === 搜索输入框：米白底 + 极细边框 === */
                '.phone-generic-search-input { background: rgba(245,243,239,0.6) !important; border: 1px solid rgba(58,55,49,0.08) !important; border-radius: 4px !important; font-size: 13px !important; color: #3A3731 !important; }',
                '.phone-generic-search-input::placeholder { color: #7A7772 !important; }',
                '.phone-generic-search-input:focus { border-color: rgba(91,122,106,0.24) !important; box-shadow: 0 0 0 2px rgba(91,122,106,0.06) !important; }',
                /* === 搜索标签和结果计数：极淡 === */
                '.phone-generic-search-label, .phone-generic-toolbar-hint { color: #7A7772 !important; font-size: 11px !important; letter-spacing: 0.04em; }',
                '.phone-generic-result-pill { border-color: rgba(58,55,49,0.06) !important; background: transparent !important; color: #7A7772 !important; font-size: 11px !important; }',
                /* === 列表面板：去掉外框 === */
                '.phone-generic-list-panel { border: none !important; border-radius: 0 !important; background: transparent !important; overflow: visible !important; }',
                '.phone-generic-list-header { display: none !important; }',
                /* === 列表条目：行式 + 极细分隔线 === */
                '.phone-generic-slot-list { gap: 0 !important; border: none !important; border-radius: 0 !important; background: transparent !important; }',
                '.phone-generic-slot-list-item { border-bottom: 1px solid rgba(58,55,49,0.06) !important; border-radius: 0 !important; background: transparent !important; padding: 10px 2px !important; transition: background 0.2s ease; }',
                '.phone-generic-slot-list-item:last-child { border-bottom: none !important; }',
                '.phone-generic-slot-list-item:hover { background: rgba(58,55,49,0.02) !important; }',
                '.phone-generic-slot-list-item:active { background: rgba(58,55,49,0.04) !important; }',
                /* === 序号：极淡印章感 === */
                '.phone-generic-list-index { color: #7A7772 !important; font-size: 10px !important; font-weight: 400 !important; letter-spacing: 0.06em; min-width: 22px !important; opacity: 0.6; }',
                /* === 标题：炭灰 + 微增字距 === */
                '.phone-generic-slot-list-main { font-size: 14px !important; font-weight: 500 !important; color: #3A3731 !important; letter-spacing: 0.03em; line-height: 1.5; }',
                /* === 预览文本：灰褐 + 一行截断 === */
                '.phone-generic-list-preview { color: #7A7772 !important; font-size: 12px !important; line-height: 1.5 !important; -webkit-line-clamp: 1 !important; letter-spacing: 0.01em; }',
                /* === 状态标签：低饱和 + 极小 === */
                '.phone-generic-status-chip { font-size: 10px !important; padding: 1px 6px !important; border-radius: 3px !important; letter-spacing: 0.04em; }',
                '.phone-generic-status-chip.is-neutral { border-color: rgba(58,55,49,0.1) !important; background: rgba(58,55,49,0.03) !important; color: #7A7772 !important; }',
                '.phone-generic-status-chip.is-success { border-color: rgba(107,143,113,0.18) !important; background: rgba(107,143,113,0.06) !important; color: #5B7A6A !important; }',
                '.phone-generic-status-chip.is-warning { border-color: rgba(166,139,91,0.18) !important; background: rgba(166,139,91,0.06) !important; color: #A68B5B !important; }',
                '.phone-generic-status-chip.is-danger { border-color: rgba(139,94,94,0.18) !important; background: rgba(139,94,94,0.06) !important; color: #8B5E5E !important; }',
                '.phone-generic-status-chip.is-info { border-color: rgba(91,122,106,0.18) !important; background: rgba(91,122,106,0.06) !important; color: #5B7A6A !important; }',
                /* === 元信息：极淡 === */
                '.phone-generic-list-time { color: #7A7772 !important; font-size: 10px !important; opacity: 0.7; }',
                '.phone-generic-slot-list-meta { color: #7A7772 !important; font-size: 10px !important; opacity: 0.7; }',
                /* === 右侧箭头：苔绿 + 小字 === */
                '.phone-generic-slot-list-arrow { color: #5B7A6A !important; font-size: 11px !important; opacity: 0.5; }',
                /* === 底部操作栏：米白 + 极细顶线 === */
                '.phone-list-bottom-bar { border-top: 1px solid rgba(58,55,49,0.06) !important; background: rgba(245,243,239,0.92) !important; backdrop-filter: blur(8px) !important; }',
                '.phone-list-bottom-btn { border-color: rgba(58,55,49,0.1) !important; background: rgba(245,243,239,0.6) !important; color: #3A3731 !important; border-radius: 4px !important; font-size: 12px !important; letter-spacing: 0.04em; transition: all 0.2s ease; }',
                '.phone-list-bottom-btn:hover { background: rgba(245,243,239,0.9) !important; border-color: rgba(91,122,106,0.18) !important; }',
                '.phone-list-bottom-btn:active { transform: translateY(1px); }',
                '.phone-list-bottom-btn.active { border-color: rgba(139,94,94,0.2) !important; background: rgba(139,94,94,0.06) !important; color: #8B5E5E !important; }',
                /* === 空状态：安静 === */
                '.phone-generic-empty-state { color: #7A7772 !important; }',
                '.phone-generic-empty-title { color: #3A3731 !important; font-weight: 500 !important; letter-spacing: 0.04em; }',
                '.phone-generic-empty-action { border-color: rgba(91,122,106,0.18) !important; color: #5B7A6A !important; background: transparent !important; border-radius: 4px !important; }',
                '.phone-generic-empty-action:hover { background: rgba(91,122,106,0.06) !important; }',
                /* === 锁定行：降低不透明度 === */
                '.phone-generic-slot-list-item.is-row-locked { opacity: 0.55 !important; }',
                /* === 详情页：纯留白分隔 === */
                '.phone-generic-detail-page-flow { gap: 0 !important; }',
                '.phone-generic-detail-flow-list { gap: 0 !important; background: transparent !important; border: none !important; border-radius: 0 !important; }',
                /* === 详情字段行：留白代替线条 === */
                '.phone-generic-slot-detail-field { border-bottom: none !important; padding: 12px 2px !important; background: transparent !important; }',
                '.phone-generic-slot-detail-field:not(:last-child) { border-bottom: 1px solid rgba(58,55,49,0.04) !important; }',
                '.phone-generic-slot-detail-field:hover { background: transparent !important; border-color: rgba(58,55,49,0.04) !important; }',
                /* === 字段名：苔绿 + 小字 + 微增字距 === */
                '.phone-row-detail-key { color: #5B7A6A !important; font-size: 11px !important; font-weight: 400 !important; letter-spacing: 0.06em; margin-bottom: 3px; }',
                /* === 字段值：炭灰正文 === */
                '.phone-row-detail-value { color: #3A3731 !important; font-size: 14px !important; line-height: 1.7 !important; letter-spacing: 0.01em; }',
                /* === 长内容字段：更多留白 === */
                '.phone-generic-slot-detail-field.is-long-content { padding: 14px 2px !important; }',
                '.phone-generic-slot-detail-field.is-long-content .phone-row-detail-value { line-height: 1.8 !important; }',
                /* === 锁定字段：极淡底色 === */
                '.phone-generic-slot-detail-field.is-locked { background: rgba(166,139,91,0.03) !important; border-color: rgba(166,139,91,0.08) !important; }',
                /* === 编辑态输入框 === */
                '.phone-row-detail-input { background: rgba(245,243,239,0.5) !important; border: 1px solid rgba(58,55,49,0.08) !important; border-radius: 4px !important; color: #3A3731 !important; font-size: 14px !important; line-height: 1.7 !important; }',
                '.phone-row-detail-input:focus { border-color: rgba(91,122,106,0.24) !important; box-shadow: 0 0 0 2px rgba(91,122,106,0.06) !important; }',
                '.phone-row-detail-input::placeholder { color: #7A7772 !important; opacity: 0.6; }',
                /* === 字段锁定标签 === */
                '.phone-generic-field-lock-state { border-color: rgba(166,139,91,0.15) !important; background: rgba(166,139,91,0.05) !important; color: #A68B5B !important; font-size: 10px !important; }',
                /* === 详情底部操作栏 === */
                '.phone-detail-bottom-bar { border-top: 1px solid rgba(58,55,49,0.06) !important; background: rgba(245,243,239,0.92) !important; backdrop-filter: blur(8px) !important; }',
                '.phone-detail-bottom-btn { border-color: rgba(58,55,49,0.1) !important; background: rgba(245,243,239,0.6) !important; color: #3A3731 !important; border-radius: 4px !important; font-size: 12px !important; letter-spacing: 0.04em; transition: all 0.2s ease; }',
                '.phone-detail-bottom-btn:hover { background: rgba(245,243,239,0.9) !important; border-color: rgba(91,122,106,0.18) !important; }',
                '.phone-detail-bottom-btn:active { transform: translateY(1px); }',
                '.phone-detail-bottom-btn:disabled { opacity: 0.4 !important; }',
                '.phone-detail-bottom-btn.active { border-color: rgba(166,139,91,0.2) !important; background: rgba(166,139,91,0.06) !important; color: #A68B5B !important; }',
                /* === 保存按钮：苔绿强调 === */
                '#phone-save-row:not(:disabled) { border-color: rgba(91,122,106,0.24) !important; background: rgba(91,122,106,0.08) !important; color: #4A6558 !important; }',
                /* === 单元格锁定按钮 === */
                '.phone-cell-lock-btn { border-color: rgba(58,55,49,0.1) !important; background: transparent !important; color: #7A7772 !important; font-size: 10px !important; border-radius: 3px !important; }',
                '.phone-cell-lock-btn.locked { border-color: rgba(166,139,91,0.2) !important; color: #A68B5B !important; background: rgba(166,139,91,0.05) !important; }',
                /* === 手机端 <640px 特化 === */
                '@media screen and (max-width: 640px) {',
                '  .phone-generic-slot-list-item { padding: 8px 0 !important; }',
                '  .phone-generic-list-preview { -webkit-line-clamp: 1 !important; }',
                '  .phone-generic-slot-list-side { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 8px !important; }',
                '  .phone-generic-list-side-meta { flex-direction: row !important; gap: 6px !important; }',
                '  .phone-generic-slot-detail-field { padding: 10px 0 !important; }',
                '  .phone-row-detail-key { font-size: 10px !important; }',
                '  .phone-row-detail-value { font-size: 13px !important; }',
                '}',
                /* === 手机端 <420px 极端压缩 === */
                '@media screen and (max-width: 420px) {',
                '  .phone-generic-slot-list-item { padding: 6px 0 !important; }',
                '  .phone-generic-list-index { display: none !important; }',
                '  .phone-generic-slot-list-main { font-size: 13px !important; }',
                '}',
            ].join('\n'),
        },
        meta: {
            author: 'YuziPhone',
            description: '内置默认模板：侘寂禅意·通用表格（米白/炭灰/苔绿，紧凑行式列表，留白详情页）',
            tags: ['builtin', 'generic', 'wabi-sabi', 'summary-bindings', 'structure-runtime'],
            updatedAt: 1761000000000,
        },
    },
]);
