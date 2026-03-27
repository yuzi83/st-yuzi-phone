import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import { getSavedChoice } from './choice-store.js';
import {
    parseCommentPairs,
    normalizeMediaDesc,
    getAvatarText,
    formatTimeLike,
    generateColor,
} from './view-utils.js';

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

export function getRowsForRender(rowsData, styleOptions = {}) {
    const feedOrder = String(styleOptions.feedOrder || 'desc');
    const entries = (Array.isArray(rowsData) ? rowsData : []).map((row, rowIndex) => ({ row, rowIndex }));
    return feedOrder === 'asc' ? entries : entries.slice().reverse();
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
export function renderFeedItem({ row, sourceRowIndex, rowIndex, sheetKey, type, readSpecialField, styleOptions = /** @type {FeedStyleOptions} */ ({}), structureOptions = {}, deleteManageMode = false, selected = false }) {
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
