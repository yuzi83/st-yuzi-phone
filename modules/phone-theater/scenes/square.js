import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildTheaterDeleteKey } from '../core/delete-key.js';
import { getCellByHeader, mapTheaterRows, normalizeText, splitSemicolonText } from '../core/table-index.js';

const SQUARE_TABLES = Object.freeze({
    posts: '广场表',
});

const SQUARE_POST_ID_HEADERS = Object.freeze(['帖子ID', '帖子唯一标识']);
const EMPTY_COMMENT_TEXT = '暂无评论';
const DEFAULT_COMMENT_AUTHOR = '网友';

function resolveCellByHeaderAliases(table, row, headerNames, fallback = '') {
    const headers = Array.isArray(headerNames) ? headerNames : [headerNames];
    for (const headerName of headers) {
        const value = normalizeText(getCellByHeader(table, row, headerName));
        if (value) return value;
    }
    return normalizeText(fallback);
}

function resolveSquarePostId(table, row, rowIndex) {
    const fallback = `post_${rowIndex + 1}`;
    return resolveCellByHeaderAliases(table, row, SQUARE_POST_ID_HEADERS, fallback) || fallback;
}

function normalizeOptionalDescription(value) {
    const text = normalizeText(value);
    if (!text) return '';
    return text.toLowerCase() === 'none' ? '' : text;
}

function renderSquareMediaButtonIcon(kind) {
    if (kind === 'video') {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8 6.5C8 5.67 8.94 5.19 9.61 5.68L16.9 10.98C17.46 11.39 17.46 12.21 16.9 12.62L9.61 17.92C8.94 18.41 8 17.93 8 17.1V6.5Z" fill="currentColor"></path>
                <path d="M4.75 3.75h14.5a1 1 0 0 1 1 1v14.5a1 1 0 0 1-1 1H4.75a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.5"></path>
            </svg>
        `;
    }
    return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4.75 5.25A1.5 1.5 0 0 1 6.25 3.75h11.5a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5V5.25Z" fill="none" stroke="currentColor" stroke-width="1.5"></path>
            <circle cx="8.25" cy="8.25" r="1.5" fill="currentColor"></circle>
            <path d="m6.5 17 3.4-3.65a1 1 0 0 1 1.47.03l1.76 1.98 1.83-2.03a1 1 0 0 1 1.49.02L18 17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
    `;
}

function renderSquareMediaDetailButton(kind, detailTitle, detailContent) {
    const actionText = kind === 'video' ? '查看视频' : '查看图片';
    return `
        <button
            type="button"
            class="phone-theater-square-media"
            data-action="theater-open-detail"
            data-detail-title="${escapeHtmlAttr(detailTitle)}"
            data-detail-content="${escapeHtmlAttr(detailContent)}"
            title="${escapeHtmlAttr(actionText)}"
            aria-label="${escapeHtmlAttr(actionText)}"
        >
            <span class="phone-theater-square-media-icon">${renderSquareMediaButtonIcon(kind)}</span>
        </button>
    `;
}

function parseCommentSegment(segment) {
    const raw = normalizeText(segment);
    if (!raw) return null;

    const separatorIndex = raw.search(/[:：]/);
    if (separatorIndex < 0) {
        return {
            author: DEFAULT_COMMENT_AUTHOR,
            content: raw,
            raw,
        };
    }

    const author = normalizeText(raw.slice(0, separatorIndex)) || DEFAULT_COMMENT_AUTHOR;
    const content = normalizeText(raw.slice(separatorIndex + 1)) || '（空评论）';
    return {
        author,
        content,
        raw,
    };
}

function parseSquareComments(value) {
    const text = normalizeText(value);
    if (!text || text.toLowerCase() === 'none') return [];
    return splitSemicolonText(text)
        .map(parseCommentSegment)
        .filter(Boolean);
}

function buildViewModel(resolved, helpers) {
    const postsTable = resolved.tables.posts;
    const posts = mapTheaterRows(postsTable, (row, rowIndex) => {
        const postId = resolveSquarePostId(postsTable, row, rowIndex);
        return {
            id: postId,
            deleteKey: buildTheaterDeleteKey('post', rowIndex, postId),
            rowIndex,
            author: normalizeText(getCellByHeader(postsTable, row, '发帖账号名', '匿名')) || '匿名',
            tag: normalizeText(getCellByHeader(postsTable, row, '账号标签')),
            title: normalizeText(getCellByHeader(postsTable, row, '帖子标题')),
            body: normalizeText(getCellByHeader(postsTable, row, '帖子正文')),
            topic: normalizeText(getCellByHeader(postsTable, row, '话题/附加信息')),
            imageDescription: normalizeOptionalDescription(getCellByHeader(postsTable, row, '图片描述')),
            videoDescription: normalizeOptionalDescription(getCellByHeader(postsTable, row, '视频描述')),
            interaction: normalizeText(getCellByHeader(postsTable, row, '互动数据')),
            time: normalizeText(getCellByHeader(postsTable, row, '时间文本')),
            comments: parseSquareComments(getCellByHeader(postsTable, row, '评论串')),
        };
    });
    posts.reverse();

    void helpers;
    return { posts };
}

function collectDeletableKeys(viewModel) {
    return (viewModel?.content?.posts || []).map(post => post?.deleteKey).filter(Boolean);
}

function renderMediaDetailButtons(post) {
    const buttons = [];
    if (post.imageDescription) {
        buttons.push(renderSquareMediaDetailButton('image', '图片描述', post.imageDescription));
    }
    if (post.videoDescription) {
        buttons.push(renderSquareMediaDetailButton('video', '视频描述', post.videoDescription));
    }
    return buttons.join('');
}

function renderComments(post) {
    if (!Array.isArray(post.comments) || post.comments.length <= 0) {
        return `
            <section class="phone-theater-square-comments" aria-label="评论区">
                <div class="phone-theater-square-section-title">
                    <span class="phone-theater-square-section-mark" aria-hidden="true">✤</span>
                    <span>评论区</span>
                </div>
                <div class="phone-theater-square-comment-line">${escapeHtml(EMPTY_COMMENT_TEXT)}</div>
            </section>
        `;
    }

    return `
        <section class="phone-theater-square-comments" aria-label="评论区">
            <div class="phone-theater-square-section-title">
                <span class="phone-theater-square-section-mark" aria-hidden="true">✤</span>
                <span>评论区</span>
            </div>
            ${post.comments.map(comment => `
                <div class="phone-theater-square-comment-line">
                    <strong>${escapeHtml(comment.author)}</strong>：${escapeHtml(comment.content || '（空评论）')}
                </div>
            `).join('')}
        </section>
    `;
}

function renderSquarePost(post, uiState = {}, renderKit) {
    const { getInitial, splitTopicTokens } = renderKit;
    const initial = getInitial(post.author);
    const topics = splitTopicTokens(post.topic);
    const mediaButtonsHtml = renderMediaDetailButtons(post);
    const hasMediaButtons = !!normalizeText(mediaButtonsHtml);
    const selected = uiState.deleteManageMode && uiState.selectedKeys?.has(post.deleteKey);
    return `
        <article class="phone-theater-card phone-theater-square-post ${selected ? 'is-delete-selected' : ''}" data-post-id="${escapeHtmlAttr(post.id)}" data-theater-delete-key="${escapeHtmlAttr(post.deleteKey)}">
            ${renderKit.renderDeleteSelectButton(post.deleteKey, uiState)}
            <header class="phone-theater-square-card-head">
                <div class="phone-theater-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
                <div class="phone-theater-square-author-block">
                    <div class="phone-theater-square-author-row">
                        <div class="phone-theater-author">${escapeHtml(post.author)}</div>
                        ${post.tag ? `<span class="phone-theater-square-author-tag">${escapeHtml(post.tag)}</span>` : ''}
                    </div>
                    ${post.time ? `<div class="phone-theater-square-time">${escapeHtml(post.time)}</div>` : ''}
                </div>
            </header>
            ${post.title ? `<h3 class="phone-theater-title">${escapeHtml(post.title)}</h3>` : ''}
            <div class="phone-theater-body-text">${escapeHtml(post.body || '（无正文）')}</div>
            ${(topics.length > 0 || hasMediaButtons) ? `
                <div class="phone-theater-square-topic-row">
                    ${topics.map(topic => `<span class="phone-theater-square-topic">#${escapeHtml(topic)}</span>`).join('')}
                    ${mediaButtonsHtml}
                </div>
            ` : ''}
            ${renderComments(post)}
            ${post.interaction ? `
                <footer class="phone-theater-square-footer">
                    <div class="phone-theater-square-action-row">
                        <span class="phone-theater-square-action">♡ 点赞</span>
                        <span class="phone-theater-square-action">○ 评论</span>
                        <span class="phone-theater-square-interaction-text">${escapeHtml(post.interaction)}</span>
                    </div>
                </footer>
            ` : ''}
        </article>
    `;
}

function renderContent(viewModel, uiState = {}, renderKit) {
    const posts = viewModel?.content?.posts || [];
    if (posts.length <= 0) return renderKit.renderEmpty(viewModel.emptyText);
    return `
        <div class="phone-theater-square-feed">
            ${posts.map(post => renderSquarePost(post, uiState, renderKit)).join('')}
        </div>
    `;
}

function deleteEntities(context) {
    const { tables, selectedSet, filterTableRows, buildDeleteTargets, hasDeleteTarget } = context;
    const postsTable = tables.posts;
    const postTargets = buildDeleteTargets(selectedSet, 'post');

    const postDeletion = filterTableRows(postsTable, (row, rowIndex) => {
        const postId = resolveSquarePostId(postsTable, row, rowIndex);
        return hasDeleteTarget(postTargets, rowIndex, postId);
    });

    return { removed: postDeletion.removed };
}

export const squareScene = Object.freeze({
    id: 'square',
    appKey: '__theater_square',
    name: '广场',
    iconText: '广',
    iconColors: ['#FF7A59', '#FF3D7F'],
    orderNo: 1,
    title: '广场',
    subtitle: '社交动态流',
    emptyText: '暂无广场动态',
    styleScope: 'square',
    primaryTableRole: 'posts',
    tables: SQUARE_TABLES,
    editableTables: Object.freeze([
        Object.freeze({
            role: 'posts',
            label: '编辑广场表',
            description: '进入原始广场表格列表',
        }),
    ]),
    fieldSchema: Object.freeze({
        posts: Object.freeze({ identity: '帖子ID', identityAliases: SQUARE_POST_ID_HEADERS }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/square.css',
        requiredClasses: [
            'phone-theater-square-feed',
            'phone-theater-square-post',
            'phone-theater-square-card-head',
            'phone-theater-square-comments',
            'phone-theater-square-footer',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
});
