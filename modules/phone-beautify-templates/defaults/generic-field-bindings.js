// modules/phone-beautify-templates/defaults/generic-field-bindings.js
/**
 * 玉子的手机 - 通用模板默认布局与字段绑定
 *
 * 这里集中维护 generic_table 使用的默认布局选项与摘要字段候选名。
 */

export const DEFAULT_GENERIC_LAYOUT_OPTIONS = Object.freeze({
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

export const DEFAULT_GENERIC_FIELD_BINDINGS = Object.freeze({
    summaryTitle: ['标题', '名称', '姓名', '主题', '会话标题', '发帖人', '发帖人网名'],
    summarySubtitle: ['副标题', '分类', '标签', '话题', '位置'],
    summaryStatus: ['状态', '进度', '类型', '审核状态'],
    summaryTime: ['时间', '更新时间', '创建时间', '消息发送时间', '发帖时间'],
    summaryPreview: ['描述', '内容', '备注', '简介', '文案', '消息内容', '正文'],
});
