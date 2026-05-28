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
                gtBackdropFilter: 'none',
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
                '.phone-generic-slot-nav { background: transparent !important; backdrop-filter: var(--_gt-backdrop) !important; border-bottom: 1px solid var(--_gt-nav-border) !important; }',
                /* === 搜索栏：去掉卡片包裹 === */
                '.phone-generic-toolbar-card { border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; padding: 8px 0 4px 0 !important; }',
                /* === 搜索输入框：主题语义色 === */
                '.phone-generic-search-input { background: var(--_gt-detail-bg) !important; border: 1px solid var(--_gt-detail-field-border) !important; border-radius: 4px !important; font-size: 13px !important; color: var(--_gt-text) !important; }',
                '.phone-generic-search-input::placeholder { color: var(--_gt-muted-text) !important; }',
                '.phone-generic-search-input:focus { border-color: var(--_gt-accent-border) !important; box-shadow: 0 0 0 2px var(--_gt-accent-soft) !important; }',
                /* === 搜索标签和结果计数：极淡 === */
                '.phone-generic-search-label, .phone-generic-toolbar-hint { color: var(--_gt-muted-text) !important; font-size: 11px !important; letter-spacing: 0.04em; }',
                '.phone-generic-result-pill { border-color: var(--_gt-action-btn-border) !important; background: transparent !important; color: var(--_gt-muted-text) !important; font-size: 11px !important; }',
                /* === 列表面板：去掉外框 === */
                '.phone-generic-list-panel { border: none !important; border-radius: 0 !important; background: transparent !important; overflow: visible !important; }',
                '.phone-generic-list-header { display: none !important; }',
                /* === 列表条目：行式 + 极细分隔线 === */
                '.phone-generic-slot-list { gap: 0 !important; border: none !important; border-radius: 0 !important; background: transparent !important; }',
                '.phone-generic-slot-list-item { border-bottom: 1px solid var(--_gt-list-border) !important; border-radius: 0 !important; background: transparent !important; padding: 10px 2px !important; transition: background 0.2s ease; }',
                '.phone-generic-slot-list-item:last-child { border-bottom: none !important; }',
                '.phone-generic-slot-list-item:hover { background: var(--_gt-list-item-hover-bg) !important; }',
                '.phone-generic-slot-list-item:active { background: var(--_gt-accent-soft) !important; }',
                /* === 序号：极淡印章感 === */
                '.phone-generic-list-index { color: var(--_gt-muted-text) !important; font-size: calc(10px * var(--yuzi-phone-readable-text-scale, 1)) !important; font-weight: 400 !important; letter-spacing: 0.06em; min-width: 22px !important; opacity: 0.6; }',
                /* === 标题/预览文本 === */
                '.phone-generic-slot-list-main { font-size: calc(14px * var(--yuzi-phone-readable-text-scale, 1)) !important; font-weight: 500 !important; color: var(--_gt-list-item-text) !important; letter-spacing: 0.03em; line-height: 1.5; }',
                '.phone-generic-list-preview { color: var(--_gt-muted-text) !important; font-size: calc(12px * var(--yuzi-phone-readable-text-scale, 1)) !important; line-height: 1.5 !important; -webkit-line-clamp: 1 !important; letter-spacing: 0.01em; }',
                /* === 状态标签：低饱和 + 极小 === */
                '.phone-generic-status-chip { font-size: 10px !important; padding: 1px 6px !important; border-radius: 3px !important; letter-spacing: 0.04em; }',
                '.phone-generic-status-chip.is-neutral { border-color: var(--_gt-action-btn-border) !important; background: color-mix(in srgb, var(--_gt-text) 8%, transparent) !important; color: var(--_gt-muted-text) !important; }',
                '.phone-generic-status-chip.is-success { border-color: color-mix(in srgb, var(--_gt-success) 28%, transparent) !important; background: color-mix(in srgb, var(--_gt-success) 12%, transparent) !important; color: var(--_gt-success) !important; }',
                '.phone-generic-status-chip.is-warning { border-color: color-mix(in srgb, var(--_gt-warning) 28%, transparent) !important; background: color-mix(in srgb, var(--_gt-warning) 12%, transparent) !important; color: var(--_gt-warning) !important; }',
                '.phone-generic-status-chip.is-danger { border-color: color-mix(in srgb, var(--_gt-danger) 28%, transparent) !important; background: color-mix(in srgb, var(--_gt-danger) 12%, transparent) !important; color: var(--_gt-danger) !important; }',
                '.phone-generic-status-chip.is-info { border-color: color-mix(in srgb, var(--_gt-info) 28%, transparent) !important; background: color-mix(in srgb, var(--_gt-info) 12%, transparent) !important; color: var(--_gt-info) !important; }',
                /* === 元信息：极淡 === */
                '.phone-generic-list-time { color: var(--_gt-muted-text) !important; font-size: 10px !important; opacity: 0.7; }',
                '.phone-generic-slot-list-meta { color: var(--_gt-muted-text) !important; font-size: 10px !important; opacity: 0.7; }',
                '.phone-generic-slot-list-arrow { color: var(--_gt-accent) !important; font-size: 11px !important; opacity: 0.5; }',
                /* === 底部操作栏 === */
                '.phone-list-bottom-bar { border-top: 1px solid var(--_gt-panel-border-strong) !important; background: var(--_gt-panel-bg) !important; backdrop-filter: blur(8px) !important; }',
                '.phone-list-bottom-btn { border-color: var(--_gt-action-btn-border) !important; background: var(--_gt-action-btn-bg) !important; color: var(--_gt-action-btn-text) !important; border-radius: 4px !important; font-size: 12px !important; letter-spacing: 0.04em; transition: all 0.2s ease; }',
                '.phone-list-bottom-btn:hover { background: var(--_gt-accent-soft) !important; border-color: var(--_gt-accent-border) !important; }',
                '.phone-list-bottom-btn:active { transform: translateY(1px); }',
                '.phone-list-bottom-btn.active { border-color: color-mix(in srgb, var(--_gt-danger) 32%, transparent) !important; background: color-mix(in srgb, var(--_gt-danger) 12%, transparent) !important; color: var(--_gt-danger) !important; }',
                /* === 空状态：安静 === */
                '.phone-generic-empty-state { color: var(--_gt-muted-text) !important; }',
                '.phone-generic-empty-title { color: var(--_gt-text) !important; font-weight: 500 !important; letter-spacing: 0.04em; }',
                '.phone-generic-empty-action { border-color: var(--_gt-accent-border) !important; color: var(--_gt-accent) !important; background: transparent !important; border-radius: 4px !important; }',
                '.phone-generic-empty-action:hover { background: var(--_gt-accent-soft) !important; }',
                /* === 锁定行：降低不透明度 === */
                '.phone-generic-slot-list-item.is-row-locked { opacity: 0.55 !important; }',
                /* === 详情页：纯留白分隔 === */
                '.phone-generic-detail-page-flow { gap: 0 !important; }',
                '.phone-generic-detail-flow-list { gap: 0 !important; background: transparent !important; border: none !important; border-radius: 0 !important; }',
                /* === 详情字段行：留白代替线条 === */
                '.phone-generic-slot-detail-field { border-bottom: none !important; padding: 12px 2px !important; background: transparent !important; }',
                '.phone-generic-slot-detail-field:not(:last-child) { border-bottom: 1px solid var(--_gt-panel-divider) !important; }',
                '.phone-generic-slot-detail-field:hover { background: transparent !important; border-color: var(--_gt-panel-divider) !important; }',
                /* === 字段名/字段值 === */
                '.phone-row-detail-key { color: var(--_gt-detail-key-text) !important; font-size: calc(11px * var(--yuzi-phone-readable-text-scale, 1)) !important; font-weight: 400 !important; letter-spacing: 0.06em; margin-bottom: 3px; }',
                '.phone-row-detail-value { color: var(--_gt-detail-value-text) !important; font-size: calc(14px * var(--yuzi-phone-readable-text-scale, 1)) !important; line-height: 1.7 !important; letter-spacing: 0.01em; }',
                /* === 长内容字段：更多留白 === */
                '.phone-generic-slot-detail-field.is-long-content { padding: 14px 2px !important; }',
                '.phone-generic-slot-detail-field.is-long-content .phone-row-detail-value { line-height: 1.8 !important; }',
                /* === 锁定字段：主题 warning 混合色 === */
                '.phone-generic-slot-detail-field.is-locked { background: color-mix(in srgb, var(--_gt-warning) 10%, transparent) !important; border-color: color-mix(in srgb, var(--_gt-warning) 24%, transparent) !important; }',
                /* === 编辑态输入框 === */
                '.phone-row-detail-input { background: var(--_gt-detail-bg) !important; border: 1px solid var(--_gt-detail-field-border) !important; border-radius: 4px !important; color: var(--_gt-text) !important; font-size: calc(14px * var(--yuzi-phone-readable-text-scale, 1)) !important; line-height: 1.7 !important; }',
                '.phone-row-detail-input:focus { border-color: var(--_gt-accent-border) !important; box-shadow: 0 0 0 2px var(--_gt-accent-soft) !important; }',
                '.phone-row-detail-input::placeholder { color: var(--_gt-muted-text) !important; opacity: 0.6; }',
                /* === 字段锁定标签 === */
                '.phone-generic-field-lock-state { border-color: color-mix(in srgb, var(--_gt-warning) 28%, transparent) !important; background: color-mix(in srgb, var(--_gt-warning) 12%, transparent) !important; color: var(--_gt-warning) !important; font-size: 10px !important; }',
                /* === 详情底部操作栏 === */
                '.phone-detail-bottom-bar { border-top: 1px solid var(--_gt-panel-border-strong) !important; background: var(--_gt-panel-bg) !important; backdrop-filter: blur(8px) !important; }',
                '.phone-detail-bottom-btn { border-color: var(--_gt-action-btn-border) !important; background: var(--_gt-action-btn-bg) !important; color: var(--_gt-action-btn-text) !important; border-radius: 4px !important; font-size: 12px !important; letter-spacing: 0.04em; transition: all 0.2s ease; }',
                '.phone-detail-bottom-btn:hover { background: var(--_gt-accent-soft) !important; border-color: var(--_gt-accent-border) !important; }',
                '.phone-detail-bottom-btn:active { transform: translateY(1px); }',
                '.phone-detail-bottom-btn:disabled { opacity: 0.4 !important; }',
                '.phone-detail-bottom-btn.active { border-color: color-mix(in srgb, var(--_gt-warning) 32%, transparent) !important; background: color-mix(in srgb, var(--_gt-warning) 12%, transparent) !important; color: var(--_gt-warning) !important; }',
                '#phone-save-row:not(:disabled) { border-color: var(--_gt-accent-border) !important; background: var(--_gt-accent-soft) !important; color: var(--_gt-accent-strong) !important; }',
                /* === 单元格锁定按钮 === */
                '.phone-cell-lock-btn { border-color: var(--_gt-action-btn-border) !important; background: transparent !important; color: var(--_gt-muted-text) !important; font-size: 10px !important; border-radius: 3px !important; }',
                '.phone-cell-lock-btn.locked { border-color: color-mix(in srgb, var(--_gt-warning) 32%, transparent) !important; color: var(--_gt-warning) !important; background: color-mix(in srgb, var(--_gt-warning) 12%, transparent) !important; }',
                /* === 手机端 <640px 特化 === */
                '@media screen and (max-width: 640px) {',
                '  .phone-generic-slot-list-item { padding: 8px 0 !important; }',
                '  .phone-generic-list-preview { -webkit-line-clamp: 1 !important; }',
                '  .phone-generic-slot-list-side { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 8px !important; }',
                '  .phone-generic-list-side-meta { flex-direction: row !important; gap: 6px !important; }',
                '  .phone-generic-slot-detail-field { padding: 10px 0 !important; }',
                '  .phone-row-detail-key { font-size: calc(10px * var(--yuzi-phone-readable-text-scale, 1)) !important; }',
                '  .phone-row-detail-value { font-size: calc(13px * var(--yuzi-phone-readable-text-scale, 1)) !important; }',
                '}',
                /* === 手机端 <420px 极端压缩 === */
                '@media screen and (max-width: 420px) {',
                '  .phone-generic-slot-list-item { padding: 6px 0 !important; }',
                '  .phone-generic-list-index { display: none !important; }',
                '  .phone-generic-slot-list-main { font-size: calc(13px * var(--yuzi-phone-readable-text-scale, 1)) !important; }',
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
