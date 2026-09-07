// modules/phone-beautify-templates/defaults/builtin-templates.js
/**
 * 玉子的手机 - 内置美化模板
 *
 * 这里保留体积最大的 BUILTIN_TEMPLATES，避免字段绑定 / 默认样式常量与内置模板混在同一个 36KB 文件里。
 */

import {
    PHONE_TEMPLATE_TYPE_GENERIC,
} from '../constants.js';
import { DEFAULT_GENERIC_FIELD_BINDINGS } from './generic-field-bindings.js';

export const BUILTIN_TEMPLATES = Object.freeze([
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
                yuziGenericTemplateBackdropFilter: 'none',
                yuziGenericTemplateRadiusSm: '4px',
                yuziGenericTemplateRadiusMd: '6px',
                yuziGenericTemplateRadiusLg: '8px',
                yuziGenericTemplateShadowSm: 'none',
                yuziGenericTemplateShadowMd: 'none',
                yuziGenericTemplateShadowLg: 'none',
                yuziGenericTemplateGapXs: '3px',
                yuziGenericTemplateGapSm: '8px',
                yuziGenericTemplateGapMd: '14px',
                yuziGenericTemplateGapLg: '22px',
            },
            customCss: [
                /* === 导航：透明 + 极细底线 === */
                '.phone-generic-slot-nav { background: transparent !important; backdrop-filter: var(--yuzi-generic-template-resolved-backdrop) !important; border-bottom: 1px solid var(--yuzi-generic-template-resolved-nav-border) !important; }',
                /* === 搜索栏：去掉卡片包裹 === */
                '.phone-generic-toolbar-card { border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; padding: 8px 0 4px 0 !important; }',
                /* === 搜索输入框：主题语义色 === */
                '.phone-generic-search-input { background: var(--yuzi-generic-template-resolved-detail-bg) !important; border: 1px solid var(--yuzi-generic-template-resolved-detail-field-border) !important; border-radius: 4px !important; font-size: 13px !important; color: var(--yuzi-generic-template-resolved-text) !important; }',
                '.phone-generic-search-input::placeholder { color: var(--yuzi-generic-template-resolved-muted-text) !important; }',
                '.phone-generic-search-input:focus { border-color: var(--yuzi-generic-template-resolved-accent-border) !important; box-shadow: 0 0 0 2px var(--yuzi-generic-template-resolved-accent-soft) !important; }',
                /* === 搜索标签和结果计数：极淡 === */
                '.phone-generic-search-label, .phone-generic-toolbar-hint { color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: 11px !important; letter-spacing: 0.04em; }',
                '.phone-generic-result-pill { border-color: var(--yuzi-generic-template-resolved-action-btn-border) !important; background: transparent !important; color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: 11px !important; }',
                /* === 列表面板：去掉外框 === */
                '.phone-generic-list-panel { border: none !important; border-radius: 0 !important; background: transparent !important; overflow: visible !important; }',
                '.phone-generic-list-header { display: none !important; }',
                /* === 列表条目：行式 + 极细分隔线 === */
                '.phone-generic-slot-list { gap: 0 !important; border: none !important; border-radius: 0 !important; background: transparent !important; }',
                '.phone-generic-slot-list-item { border-bottom: 1px solid var(--yuzi-generic-template-resolved-list-border) !important; border-radius: 0 !important; background: transparent !important; padding: 10px 2px !important; transition: background 0.2s ease; }',
                '.phone-generic-slot-list-item:last-child { border-bottom: none !important; }',
                '.phone-generic-slot-list-item:hover { background: var(--yuzi-generic-template-resolved-list-item-hover-bg) !important; }',
                '.phone-generic-slot-list-item:active { background: var(--yuzi-generic-template-resolved-accent-soft) !important; }',
                /* === 序号：极淡印章感 === */
                '.phone-generic-list-index { color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: calc(10px * var(--yuzi-phone-readable-text-scale, 1)) !important; font-weight: 400 !important; letter-spacing: 0.06em; min-width: 22px !important; opacity: 0.6; }',
                /* === 标题/预览文本 === */
                '.phone-generic-slot-list-main { font-size: calc(14px * var(--yuzi-phone-readable-text-scale, 1)) !important; font-weight: 500 !important; color: var(--yuzi-generic-template-resolved-list-item-text) !important; letter-spacing: 0.03em; line-height: 1.5; }',
                '.phone-generic-list-preview { color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: calc(12px * var(--yuzi-phone-readable-text-scale, 1)) !important; line-height: 1.5 !important; -webkit-line-clamp: 1 !important; letter-spacing: 0.01em; }',
                /* === 状态标签：低饱和 + 极小 === */
                '.phone-generic-status-chip { font-size: 10px !important; padding: 1px 6px !important; border-radius: 3px !important; letter-spacing: 0.04em; }',
                '.phone-generic-status-chip.is-neutral { border-color: var(--yuzi-generic-template-resolved-action-btn-border) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-text) 8%, transparent) !important; color: var(--yuzi-generic-template-resolved-muted-text) !important; }',
                '.phone-generic-status-chip.is-success { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-success) 28%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-success) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-success) !important; }',
                '.phone-generic-status-chip.is-warning { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 28%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-warning) !important; }',
                '.phone-generic-status-chip.is-danger { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-danger) 28%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-danger) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-danger) !important; }',
                '.phone-generic-status-chip.is-info { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-info) 28%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-info) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-info) !important; }',
                /* === 元信息：极淡 === */
                '.phone-generic-list-time { color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: 10px !important; opacity: 0.7; }',
                '.phone-generic-slot-list-meta { color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: 10px !important; opacity: 0.7; }',
                '.phone-generic-slot-list-arrow { color: var(--yuzi-generic-template-resolved-accent) !important; font-size: 11px !important; opacity: 0.5; }',
                /* === 底部操作栏 === */
                '.phone-list-bottom-bar { border-top: 1px solid var(--yuzi-generic-template-resolved-panel-border-strong) !important; background: var(--yuzi-generic-template-resolved-panel-bg) !important; backdrop-filter: blur(8px) !important; }',
                '.phone-list-bottom-btn { border-color: var(--yuzi-generic-template-resolved-action-btn-border) !important; background: var(--yuzi-generic-template-resolved-action-btn-bg) !important; color: var(--yuzi-generic-template-resolved-action-btn-text) !important; border-radius: 4px !important; font-size: 12px !important; letter-spacing: 0.04em; transition: all 0.2s ease; }',
                '.phone-list-bottom-btn:hover { background: var(--yuzi-generic-template-resolved-accent-soft) !important; border-color: var(--yuzi-generic-template-resolved-accent-border) !important; }',
                '.phone-list-bottom-btn:active { transform: translateY(1px); }',
                '.phone-list-bottom-btn.active { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-danger) 32%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-danger) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-danger) !important; }',
                /* === 空状态：安静 === */
                '.phone-generic-empty-state { color: var(--yuzi-generic-template-resolved-muted-text) !important; }',
                '.phone-generic-empty-title { color: var(--yuzi-generic-template-resolved-text) !important; font-weight: 500 !important; letter-spacing: 0.04em; }',
                '.phone-generic-empty-action { border-color: var(--yuzi-generic-template-resolved-accent-border) !important; color: var(--yuzi-generic-template-resolved-accent) !important; background: transparent !important; border-radius: 4px !important; }',
                '.phone-generic-empty-action:hover { background: var(--yuzi-generic-template-resolved-accent-soft) !important; }',
                /* === 锁定行：降低不透明度 === */
                '.phone-generic-slot-list-item.is-row-locked { opacity: 0.55 !important; }',
                /* === 详情页：纯留白分隔 === */
                '.phone-generic-detail-page-flow { gap: 0 !important; }',
                '.phone-generic-detail-flow-list { gap: 0 !important; background: transparent !important; border: none !important; border-radius: 0 !important; }',
                /* === 详情字段行：留白代替线条 === */
                '.phone-generic-slot-detail-field { border-bottom: none !important; padding: 12px 2px !important; background: transparent !important; }',
                '.phone-generic-slot-detail-field:not(:last-child) { border-bottom: 1px solid var(--yuzi-generic-template-resolved-panel-divider) !important; }',
                '.phone-generic-slot-detail-field:hover { background: transparent !important; border-color: var(--yuzi-generic-template-resolved-panel-divider) !important; }',
                /* === 字段名/字段值 === */
                '.phone-row-detail-key { color: var(--yuzi-generic-template-resolved-detail-key-text) !important; font-size: calc(11px * var(--yuzi-phone-readable-text-scale, 1)) !important; font-weight: 400 !important; letter-spacing: 0.06em; margin-bottom: 3px; }',
                '.phone-row-detail-value { color: var(--yuzi-generic-template-resolved-detail-value-text) !important; font-size: calc(14px * var(--yuzi-phone-readable-text-scale, 1)) !important; line-height: 1.7 !important; letter-spacing: 0.01em; }',
                /* === 长内容字段：更多留白 === */
                '.phone-generic-slot-detail-field.is-long-content { padding: 14px 2px !important; }',
                '.phone-generic-slot-detail-field.is-long-content .phone-row-detail-value { line-height: 1.8 !important; }',
                /* === 锁定字段：主题 warning 混合色 === */
                '.phone-generic-slot-detail-field.is-locked { background: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 10%, transparent) !important; border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 24%, transparent) !important; }',
                /* === 编辑态输入框 === */
                '.phone-row-detail-input { background: var(--yuzi-generic-template-resolved-detail-bg) !important; border: 1px solid var(--yuzi-generic-template-resolved-detail-field-border) !important; border-radius: 4px !important; color: var(--yuzi-generic-template-resolved-text) !important; font-size: calc(14px * var(--yuzi-phone-readable-text-scale, 1)) !important; line-height: 1.7 !important; }',
                '.phone-row-detail-input:focus { border-color: var(--yuzi-generic-template-resolved-accent-border) !important; box-shadow: 0 0 0 2px var(--yuzi-generic-template-resolved-accent-soft) !important; }',
                '.phone-row-detail-input::placeholder { color: var(--yuzi-generic-template-resolved-muted-text) !important; opacity: 0.6; }',
                /* === 字段锁定标签 === */
                '.phone-generic-field-lock-state { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 28%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-warning) !important; font-size: 10px !important; }',
                /* === 详情底部操作栏 === */
                '.phone-detail-bottom-bar { border-top: 1px solid var(--yuzi-generic-template-resolved-panel-border-strong) !important; background: var(--yuzi-generic-template-resolved-panel-bg) !important; backdrop-filter: blur(8px) !important; }',
                '.phone-detail-bottom-btn { border-color: var(--yuzi-generic-template-resolved-action-btn-border) !important; background: var(--yuzi-generic-template-resolved-action-btn-bg) !important; color: var(--yuzi-generic-template-resolved-action-btn-text) !important; border-radius: 4px !important; font-size: 12px !important; letter-spacing: 0.04em; transition: all 0.2s ease; }',
                '.phone-detail-bottom-btn:hover { background: var(--yuzi-generic-template-resolved-accent-soft) !important; border-color: var(--yuzi-generic-template-resolved-accent-border) !important; }',
                '.phone-detail-bottom-btn:active { transform: translateY(1px); }',
                '.phone-detail-bottom-btn:disabled { opacity: 0.4 !important; }',
                '.phone-detail-bottom-btn.active { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 32%, transparent) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 12%, transparent) !important; color: var(--yuzi-generic-template-resolved-warning) !important; }',
                '#phone-save-row:not(:disabled) { border-color: var(--yuzi-generic-template-resolved-accent-border) !important; background: var(--yuzi-generic-template-resolved-accent-soft) !important; color: var(--yuzi-generic-template-resolved-accent-strong) !important; }',
                /* === 单元格锁定按钮 === */
                '.phone-cell-lock-btn { border-color: var(--yuzi-generic-template-resolved-action-btn-border) !important; background: transparent !important; color: var(--yuzi-generic-template-resolved-muted-text) !important; font-size: 10px !important; border-radius: 3px !important; }',
                '.phone-cell-lock-btn.locked { border-color: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 32%, transparent) !important; color: var(--yuzi-generic-template-resolved-warning) !important; background: color-mix(in srgb, var(--yuzi-generic-template-resolved-warning) 12%, transparent) !important; }',
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
