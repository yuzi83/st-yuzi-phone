import { deletePhoneSheetRows, getSheetDataByKey } from '../../phone-core/chat-support.js';
import { navigateBack } from '../../phone-core/routing.js';
import { PHONE_ICONS } from '../../phone-home.js';
import { escapeHtml } from '../../utils.js';
import { showConfirmDialog } from '../../settings-app/ui/confirm-dialog.js';
import { bindWheelBridge, showInlineToast } from '../shared-ui.js';
import { createSpecialFieldReader, buildHeaderIndexMap } from './field-reader.js';
import { setSavedChoice, clearSavedChoice } from './choice-store.js';
import {
    normalizeMediaDesc,
    renderInPhoneMediaPreview,
} from './view-utils.js';
import {
    getRowsForRender,
    renderFeedItem,
} from './feed-viewer-helpers.js';

/**
 * @typedef {Object} FeedStyleOptions
 * @property {boolean} [showPosterAvatar]
 * @property {boolean} [showPostTime]
 * @property {boolean} [showReplyReset]
 * @property {string} [statsMode]
 * @property {string} [replyOptionMode]
 * @property {string} [mediaActionTextMode]
 * @property {string} [emptyFeedText]
 * @property {string} [emptyContentText]
 * @property {string} [commentEmptyText]
 * @property {string} [forumMetaPrefix]
 * @property {string} [timeFallbackText]
 */

/**
 * @typedef {Object} FeedStylePayload
 * @property {string} className
 * @property {string} styleAttr
 * @property {string} scopedCss
 * @property {string} templateId
 * @property {string} dataAttrs
 * @property {FeedStyleOptions} styleOptions
 */

export function renderFeedTable(container, context, deps = {}) {
    const { createSpecialTemplateStylePayload, viewerEventManager } = deps;
    if (!(container instanceof HTMLElement) || typeof createSpecialTemplateStylePayload !== 'function') return;

    const { sheetKey, tableName, rows, headers, type, templateMatch } = context;
    const headerMap = buildHeaderIndexMap(headers);
    const readSpecialField = createSpecialFieldReader({
        templateMatch,
        type,
        headerMap,
        sheetKey,
        tableName,
    });

    const state = {
        mediaPreview: null,
        rowsData: Array.isArray(rows) ? rows.map(row => (Array.isArray(row) ? [...row] : row)) : [],
        deleteManageMode: false,
        deletingSelection: false,
        selectedRowIndexes: [],
        suppressExternalUpdateUntil: 0,
        skipSheetSyncOnce: false,
    };

    const setSelectedRowIndexes = (rowIndexes = []) => {
        state.selectedRowIndexes = Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
            .map(value => Number(value))
            .filter(Number.isInteger)
            .filter(value => value >= 0)))
            .sort((a, b) => a - b);
    };

    const removeRowsFromState = (rowIndexes = []) => {
        const removeSet = new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
            .map(value => Number(value))
            .filter(Number.isInteger));
        if (removeSet.size === 0) return;
        state.rowsData = state.rowsData.filter((_, rowIndex) => !removeSet.has(rowIndex));
    };

    const clearDeleteState = () => {
        state.deleteManageMode = false;
        state.deletingSelection = false;
        state.selectedRowIndexes = [];
    };

    const patchFeedManageUi = () => {
        if (!state.deleteManageMode) return;

        const selectedSet = new Set(state.selectedRowIndexes);
        const selectAllBtn = container.querySelector('.phone-special-manage-select-all-btn');
        const clearBtn = container.querySelector('.phone-special-manage-clear-btn');
        const deleteBtn = container.querySelector('.phone-special-manage-delete-btn');

        if (selectAllBtn instanceof HTMLButtonElement) {
            selectAllBtn.disabled = state.deletingSelection;
        }
        if (clearBtn instanceof HTMLButtonElement) {
            clearBtn.disabled = state.deletingSelection;
        }
        if (deleteBtn instanceof HTMLButtonElement) {
            deleteBtn.disabled = selectedSet.size === 0 || state.deletingSelection;
            deleteBtn.textContent = state.deletingSelection ? '删除中...' : `删除已选（${selectedSet.size}）`;
        }

        container.querySelectorAll('.phone-special-feed-select-toggle').forEach((btnNode) => {
            const btn = /** @type {HTMLElement} */ (btnNode);
            const rowIndex = Number(btn.getAttribute('data-row-index'));
            if (Number.isNaN(rowIndex)) return;

            const selected = selectedSet.has(rowIndex);
            if (btn instanceof HTMLButtonElement) {
                btn.disabled = state.deletingSelection;
            }
            btn.classList.toggle('is-selected', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            btn.textContent = selected ? '✓' : '';

            const manageRow = btn.closest('.phone-special-feed-manage-row');
            manageRow?.classList.toggle('is-selected', selected);
            manageRow?.querySelector('.phone-special-moment-item')?.classList.toggle('is-selected', selected);
        });
    };

    const closeMediaPreview = () => {
        state.mediaPreview = null;
        renderKeepScroll();
    };

    const syncRowsFromSheet = () => {
        if (state.skipSheetSyncOnce) {
            state.skipSheetSyncOnce = false;
            return true;
        }
        const latestSheet = getSheetDataByKey(sheetKey);
        if (!latestSheet?.rows || !Array.isArray(latestSheet.rows)) return false;
        state.rowsData = latestSheet.rows.map(row => (Array.isArray(row) ? [...row] : row));
        return true;
    };

    const getLiveTableName = () => {
        const latestSheet = getSheetDataByKey(sheetKey);
        return String(latestSheet?.tableName || tableName || sheetKey || '').trim();
    };

    const markLocalTableMutation = (duration = 1200) => {
        state.suppressExternalUpdateUntil = Math.max(state.suppressExternalUpdateUntil, Date.now() + duration);
    };

    const handleExternalTableUpdate = (event) => {
        if (event?.detail?.sheetKey !== sheetKey) return;
        if (Date.now() < state.suppressExternalUpdateUntil) return;
        if (!syncRowsFromSheet()) return;
        renderKeepScroll();
    };

    if (viewerEventManager && typeof viewerEventManager.add === 'function') {
        viewerEventManager.add(window, 'yuzi-phone-table-updated', handleExternalTableUpdate);
    }

    const legacyGetRowsForRender = (styleOptions = {}) => {
        const feedOrder = String(styleOptions.feedOrder || 'desc');
        const entries = state.rowsData.map((row, rowIndex) => ({ row, rowIndex }));
        return feedOrder === 'asc' ? entries : entries.slice().reverse();
    };

    const executeDeleteSelectedRows = async () => {
        const selectedRows = Array.from(new Set(state.selectedRowIndexes)).filter(Number.isInteger);
        if (selectedRows.length === 0) {
            showInlineToast(container, '请先选择要删除的内容');
            return;
        }

        state.deletingSelection = true;
        patchFeedManageUi();

        let toastMessage = '';
        let toastIsError = false;
        const liveTableName = getLiveTableName();

        try {
            markLocalTableMutation();
            const result = await deletePhoneSheetRows(sheetKey, selectedRows, {
                tableName: liveTableName,
            });
            if (!result.ok) {
                syncRowsFromSheet();
                toastMessage = result.message || '删除失败';
                toastIsError = true;
                return;
            }

            const synced = syncRowsFromSheet();
            clearDeleteState();
            if (!synced) {
                toastMessage = `${result.message || `已删除 ${result.deletedCount} 条内容`}，但当前视图未同步到最新表格`;
                toastIsError = true;
                return;
            }
            toastMessage = result.message || `已删除 ${result.deletedCount} 条内容`;
            toastIsError = result.refreshed === false;
        } catch (error) {
            toastMessage = error?.message || '删除过程中发生异常';
            toastIsError = true;
        } finally {
            state.deletingSelection = false;
            renderKeepScroll();
            if (toastMessage) {
                showInlineToast(container, toastMessage, toastIsError);
            }
        }
    };

    const render = () => {
        syncRowsFromSheet();
        const stylePayload = /** @type {any} */ (createSpecialTemplateStylePayload(templateMatch, type, 'list'));
        const rowsForRender = getRowsForRender(state.rowsData, stylePayload.styleOptions);
        const emptyFeedText = String(stylePayload.styleOptions.emptyFeedText || '暂无内容');
        const selectedCount = state.selectedRowIndexes.length;

        container.innerHTML = `
            <div class="phone-app-page phone-special-app ${type === 'forum' ? 'phone-special-forum' : 'phone-special-moments'} ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
                ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(tableName)}</span>
                    <button type="button" class="phone-special-nav-action-btn ${state.deleteManageMode ? 'is-active' : ''}">${state.deleteManageMode ? '完成' : '删除'}</button>
                </div>
                <div class="phone-app-body phone-table-body">
                    ${state.deleteManageMode ? `
                        <div class="phone-special-manage-bar">
                            <button type="button" class="phone-special-manage-btn phone-special-manage-select-all-btn" ${state.deletingSelection ? 'disabled' : ''}>全选</button>
                            <button type="button" class="phone-special-manage-btn phone-special-manage-clear-btn" ${state.deletingSelection ? 'disabled' : ''}>取消全选</button>
                            <button type="button" class="phone-special-manage-btn phone-special-manage-delete-btn" ${selectedCount === 0 || state.deletingSelection ? 'disabled' : ''}>${state.deletingSelection ? '删除中...' : `删除已选（${selectedCount}）`}</button>
                        </div>
                    ` : ''}
                    <div class="phone-special-moments-list">
                        ${rowsForRender.length === 0 ? `<div class="phone-empty-msg">${escapeHtml(emptyFeedText)}</div>` : rowsForRender.map((entry, index) => renderFeedItem({
                            row: entry.row,
                            sourceRowIndex: entry.rowIndex,
                            rowIndex: index,
                            sheetKey,
                            type,
                            readSpecialField,
                            styleOptions: stylePayload.styleOptions,
                            structureOptions: stylePayload.structureOptions,
                            deleteManageMode: state.deleteManageMode,
                            selected: state.selectedRowIndexes.includes(entry.rowIndex),
                        })).join('')}
                    </div>
                </div>
                ${state.mediaPreview ? renderInPhoneMediaPreview(state.mediaPreview.title, state.mediaPreview.content) : ''}
            </div>
        `;

        bindWheelBridge(container);
        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        container.querySelector('.phone-special-nav-action-btn')?.addEventListener('click', () => {
            state.deleteManageMode = !state.deleteManageMode;
            state.deletingSelection = false;
            state.selectedRowIndexes = [];
            renderKeepScroll();
        });

        container.querySelector('.phone-special-manage-select-all-btn')?.addEventListener('click', () => {
            setSelectedRowIndexes(rowsForRender.map(entry => entry.rowIndex));
            patchFeedManageUi();
        });

        container.querySelector('.phone-special-manage-clear-btn')?.addEventListener('click', () => {
            setSelectedRowIndexes([]);
            patchFeedManageUi();
        });

        container.querySelector('.phone-special-manage-delete-btn')?.addEventListener('click', () => {
            if (state.selectedRowIndexes.length === 0 || state.deletingSelection) {
                showInlineToast(container, '请先选择要删除的内容');
                return;
            }

            showConfirmDialog(
                container,
                '确认删除',
                `确定删除已选中的 ${state.selectedRowIndexes.length} 条内容吗？此操作无法撤销。`,
                () => {
                    void executeDeleteSelectedRows();
                },
                '删除',
                '取消'
            );
        });

        container.querySelectorAll('.phone-special-feed-select-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (btn);
                const rowIndex = Number(target.dataset.rowIndex);
                if (Number.isNaN(rowIndex) || state.deletingSelection) return;
                const selectedSet = new Set(state.selectedRowIndexes);
                if (selectedSet.has(rowIndex)) {
                    selectedSet.delete(rowIndex);
                } else {
                    selectedSet.add(rowIndex);
                }
                setSelectedRowIndexes(Array.from(selectedSet));
                patchFeedManageUi();
            });
        });

        container.querySelectorAll('.phone-special-reply-option-item').forEach(optionEl => {
            optionEl.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (optionEl);
                const choiceId = String(target.dataset.choiceId || '');
                const choiceIndex = Number(target.dataset.choiceIndex);
                if (!choiceId || Number.isNaN(choiceIndex)) return;
                setSavedChoice(choiceId, choiceIndex);
                renderKeepScroll();
            });
        });

        container.querySelectorAll('.phone-special-reply-reset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (btn);
                const choiceId = String(target.dataset.choiceId || '');
                if (!choiceId) return;
                clearSavedChoice(choiceId);
                renderKeepScroll();
            });
        });

        container.querySelectorAll('.phone-special-media-item').forEach(mediaEl => {
            mediaEl.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (mediaEl);
                const desc = normalizeMediaDesc(target.dataset.description);
                if (!desc) return;
                const title = String(target.dataset.mediaLabel || '媒体内容').trim() || '媒体内容';
                state.mediaPreview = {
                    title,
                    content: desc,
                };
                renderKeepScroll();
            });
        });

        container.querySelector('.phone-special-media-preview-close')?.addEventListener('click', closeMediaPreview);
        container.querySelector('.phone-special-media-preview-mask')?.addEventListener('click', (e) => {
            if (e.target !== e.currentTarget) return;
            closeMediaPreview();
        });
    };

    const getBodyElement = () => {
        const body = container.querySelector('.phone-app-body');
        return body instanceof HTMLElement ? body : null;
    };

    const clampBodyScrollTop = (body, rawTop) => {
        const maxTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
        return Math.min(Math.max(0, Number(rawTop) || 0), maxTop);
    };

    const restoreBodyScrollInFrames = (targetTop, remainingFrames = 2) => {
        const body = getBodyElement();
        if (!body) return;

        body.scrollTop = clampBodyScrollTop(body, targetTop);
        if (remainingFrames <= 0) return;

        requestAnimationFrame(() => {
            restoreBodyScrollInFrames(targetTop, remainingFrames - 1);
        });
    };

    const renderKeepScroll = () => {
        const body = getBodyElement();
        const prevTop = body ? Math.max(0, Number(body.scrollTop) || 0) : 0;
        const prevContainerHeight = Math.max(0, container.offsetHeight || 0);

        if (prevContainerHeight > 0) {
            container.style.minHeight = `${prevContainerHeight}px`;
        }

        try {
            render();
        } finally {
            restoreBodyScrollInFrames(prevTop, 2);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!container.isConnected) return;
                    container.style.removeProperty('min-height');
                });
            });
        }
    };

    render();
}

/**
 * @param {{
 *   row:any,
 *   sourceRowIndex:number,
 *   rowIndex:number,
 *   sheetKey:string,
 *   type:string,
 *   readSpecialField:Function,
 *   styleOptions:FeedStyleOptions,
 *   structureOptions?:Object,
 *   deleteManageMode?:boolean,
 *   selected?:boolean,
 * }} params
 */
function legacyRenderFeedItem({ row, sourceRowIndex, rowIndex, sheetKey, type, readSpecialField, styleOptions = /** @type {FeedStyleOptions} */ ({}), structureOptions = {}, deleteManageMode = false, selected = false }) {
    const poster = type === 'forum'
        ? (readSpecialField(row, 'poster', '') || '匿名网友')
        : (readSpecialField(row, 'poster', '') || '未知用户');

    const protagonistName = type === 'forum'
        ? (readSpecialField(row, 'protagonistName', '') || '我')
        : '我';

    const title = readSpecialField(row, 'title', '') || '无标题';
    const content = readSpecialField(row, 'postContent', '') || '';
    const postTime = readSpecialField(row, 'postTime', '');
    const topicTag = String(readSpecialField(row, 'topicTag', '') || '').trim();
    const location = String(readSpecialField(row, 'location', '') || '').trim();

    const likes = Number.parseInt(readSpecialField(row, 'likes', '0') || '0', 10);
    const shares = Number.parseInt(readSpecialField(row, 'shares', '0') || '0', 10);
    const boundViewCount = Number.parseInt(readSpecialField(row, 'viewCount', '') || '', 10);
    const boundCommentCount = Number.parseInt(readSpecialField(row, 'commentCount', '') || '', 10);
    const imageDesc = normalizeMediaDesc(readSpecialField(row, 'imageDesc', ''));
    const videoDesc = normalizeMediaDesc(readSpecialField(row, 'videoDesc', ''));

    const showPosterAvatar = styleOptions.showPosterAvatar !== false;
    const showPostTime = styleOptions.showPostTime !== false;
    const showReplyReset = styleOptions.showReplyReset !== false;

    const statsMode = String(styleOptions.statsMode || 'full');
    const replyOptionMode = String(styleOptions.replyOptionMode || 'auto');
    const mediaActionTextMode = String(styleOptions.mediaActionTextMode || 'detailed');

    const emptyContentText = String(styleOptions.emptyContentText || '（无正文）');
    const commentEmptyText = String(styleOptions.commentEmptyText || '暂无评论');
    const forumMetaPrefix = String(styleOptions.forumMetaPrefix || '由');
    const timeFallbackText = String(styleOptions.timeFallbackText || '刚刚');
    const postMetaOptions = structureOptions?.postMeta && typeof structureOptions.postMeta === 'object'
        ? structureOptions.postMeta
        : {};
    const forumMetaOptions = structureOptions?.forumMeta && typeof structureOptions.forumMeta === 'object'
        ? structureOptions.forumMeta
        : {};
    const commentListOptions = structureOptions?.commentList && typeof structureOptions.commentList === 'object'
        ? structureOptions.commentList
        : {};
    const showTopicTag = postMetaOptions.showTopicTag === true;
    const showLocation = postMetaOptions.showLocation === true;
    const showViewCount = postMetaOptions.showViewCount === true;
    const showMetaTime = postMetaOptions.showTime === false ? false : showPostTime;
    const showForumPrefix = forumMetaOptions.showPrefix === false ? false : true;
    const showCommentCount = commentListOptions.showCount === true;

    const replyOptions = [
        readSpecialField(row, 'playerReply1', ''),
        readSpecialField(row, 'playerReply2', ''),
        readSpecialField(row, 'playerReply3', ''),
    ];

    const publisherReplies = [
        readSpecialField(row, 'publisherReply1', ''),
        readSpecialField(row, 'publisherReply2', ''),
        readSpecialField(row, 'publisherReply3', ''),
    ];

    const choiceId = `${type}_${sheetKey}_${poster}_${rowIndex}`;
    const chosenIndex = getSavedChoice(choiceId);
    const hasChosen = Number.isInteger(chosenIndex) && chosenIndex >= 0 && chosenIndex <= 2;

    let commentsContent = readSpecialField(row, 'commentContent', '') || '';
    if (hasChosen) {
        const myReply = replyOptions[chosenIndex] || '';
        const authorReply = publisherReplies[chosenIndex] || '';
        if (myReply) commentsContent += (commentsContent ? ';' : '') + `${protagonistName}:${myReply}`;
        if (authorReply) commentsContent += (commentsContent ? ';' : '') + `${poster}:${authorReply}`;
    }

    const comments = parseCommentPairs(commentsContent);

    const mediaItems = [];
    if (imageDesc) {
        mediaItems.push({
            label: '图片内容',
            text: imageDesc,
            actionText: mediaActionTextMode === 'short' ? '查看图片' : '点击查看图片详情',
        });
    }
    if (videoDesc) {
        mediaItems.push({
            label: '视频内容',
            text: videoDesc,
            actionText: mediaActionTextMode === 'short' ? '查看视频' : '点击查看视频详情',
        });
    }

    const mediaHtml = mediaItems.length > 0
        ? `<div class="phone-special-moment-media-wrap">
            ${mediaItems.map(item => `
                <div class="phone-special-media-item" data-media-label="${escapeHtmlAttr(item.label)}" data-description="${escapeHtmlAttr(item.text)}">${escapeHtml(item.actionText)}</div>
            `).join('')}
        </div>`
        : '';

    const showReplyOptions = replyOptionMode !== 'hidden';

    const optionsHtml = !hasChosen && showReplyOptions
        ? `<div class="phone-special-reply-options-container">
            ${replyOptions.map((opt, index) => opt
                ? `<div class="phone-special-reply-option-item" data-choice-id="${escapeHtmlAttr(choiceId)}" data-choice-index="${index}">${escapeHtml(opt)}</div>`
                : ''
            ).join('')}
        </div>`
        : '';

    const resetReplyHtml = hasChosen && showReplyReset
        ? `<div class="phone-special-reply-actions"><button type="button" class="phone-special-reply-reset-btn" data-choice-id="${escapeHtmlAttr(choiceId)}">重新回复</button></div>`
        : '';

    const commentCount = Number.isFinite(boundCommentCount) ? boundCommentCount : comments.length;
    const viewCount = Number.isFinite(boundViewCount) ? boundViewCount : 0;
    const postMetaItems = [];
    if (showTopicTag && topicTag) postMetaItems.push(`话题 ${topicTag}`);
    if (showLocation && location) postMetaItems.push(`位置 ${location}`);
    if (showMetaTime && postTime) postMetaItems.push(formatTimeLike(postTime) || timeFallbackText);
    if (showViewCount && viewCount > 0) postMetaItems.push(`浏览 ${viewCount}`);
    const postMetaHtml = postMetaItems.length > 0
        ? `<div class="phone-special-post-meta">${postMetaItems.map(item => `<span class="phone-special-post-meta-item">${escapeHtml(item)}</span>`).join('')}</div>`
        : '';
    const commentsHeadHtml = showCommentCount
        ? `<div class="phone-special-comments-head"><span class="phone-special-comments-count">评论 ${escapeHtml(String(commentCount))}</span></div>`
        : '';

    const statsHtml = statsMode === 'hidden'
        ? ''
        : (statsMode === 'compact'
            ? `<div class="phone-special-moment-stats"><span>互动 ${Number.isNaN(likes) ? 0 : likes}/${Number.isNaN(commentCount) ? 0 : commentCount}/${Number.isNaN(shares) ? 0 : shares}${showViewCount ? `/${viewCount}` : ''}</span></div>`
            : `<div class="phone-special-moment-stats">
                <span>点赞 ${Number.isNaN(likes) ? 0 : likes}</span>
                <span>评论 ${Number.isNaN(commentCount) ? 0 : commentCount}</span>
                <span>转发 ${Number.isNaN(shares) ? 0 : shares}</span>
                ${showViewCount ? `<span>浏览 ${viewCount}</span>` : ''}
            </div>`);

    const itemHtml = `
        <div class="phone-special-moment-item ${deleteManageMode && selected ? 'is-selected' : ''}">
            ${type === 'forum'
                ? `
                    <div class="phone-special-moment-title forum">${escapeHtml(title)}</div>
                    <div class="phone-special-moment-meta forum">${showForumPrefix ? `${escapeHtml(forumMetaPrefix)} ` : ''}${escapeHtml(poster)} 发布</div>
                    ${postMetaHtml}
                `
                : `
                    <div class="phone-special-moment-header">
                        ${showPosterAvatar ? `<div class="phone-special-name-avatar" style="background-color:${escapeHtmlAttr(generateColor(poster))};">${escapeHtml(getAvatarText(poster))}</div>` : ''}
                        <div class="phone-special-moment-user">
                            <div class="phone-special-moment-name">${escapeHtml(poster)}</div>
                            ${showPostTime ? `<div class="phone-special-moment-time">${escapeHtml(formatTimeLike(postTime) || timeFallbackText)}</div>` : ''}
                        </div>
                    </div>
                    <div class="phone-special-moment-title">${escapeHtml(title)}</div>
                    ${postMetaHtml}
                `
            }
            <div class="phone-special-moment-content">${escapeHtml(content || emptyContentText)}</div>
            ${mediaHtml}
            ${statsHtml}
            <div class="phone-special-comments-section">
                ${commentsHeadHtml}
                ${comments.length > 0
                    ? comments.map(c => `<div class="phone-special-comment"><div class="phone-special-comment-author-row"><span class="phone-special-comment-author">${escapeHtml(c.author)}</span></div><div class="phone-special-comment-text">${escapeHtml(c.text)}</div></div>`).join('')
                    : `<div class="phone-special-comment">${escapeHtml(commentEmptyText)}</div>`
                }
            </div>
            ${optionsHtml}
            ${resetReplyHtml}
        </div>
    `;

    if (!deleteManageMode) {
        return itemHtml;
    }

    return `
        <div class="phone-special-feed-manage-row ${selected ? 'is-selected' : ''}">
            <button type="button" class="phone-special-feed-select-toggle ${selected ? 'is-selected' : ''}" data-row-index="${escapeHtmlAttr(String(sourceRowIndex))}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓' : ''}</button>
            <div class="phone-special-feed-manage-main">${itemHtml}</div>
        </div>
    `;
}
