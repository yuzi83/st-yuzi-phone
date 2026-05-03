import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildTheaterDeleteKey } from '../core/delete-key.js';
import { getCellByHeader, mapTheaterRows, normalizeText, splitSemicolonText } from '../core/table-index.js';

const SQUARE_TABLES = Object.freeze({
    posts: '广场主贴表',
    featuredComments: '广场精选评论表',
    commentBands: '广场普通评论分栏表',
});

const SQUARE_POST_ID_HEADERS = Object.freeze(['帖子ID', '帖子唯一标识']);

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

function buildViewModel(resolved, helpers) {
    const postsTable = resolved.tables.posts;
    const featuredCommentsTable = resolved.tables.featuredComments;
    const commentBandsTable = resolved.tables.commentBands;

    const featuredByPost = new Map();
    mapTheaterRows(featuredCommentsTable, (row) => {
        const postRef = normalizeText(getCellByHeader(featuredCommentsTable, row, '关联帖子ID'));
        if (!postRef) return null;
        const item = {
            author: normalizeText(getCellByHeader(featuredCommentsTable, row, '评论账号名', '匿名')) || '匿名',
            tag: normalizeText(getCellByHeader(featuredCommentsTable, row, '账号标签')),
            body: normalizeText(getCellByHeader(featuredCommentsTable, row, '评论正文')),
            stance: normalizeText(getCellByHeader(featuredCommentsTable, row, '评论立场')),
            interaction: normalizeText(getCellByHeader(featuredCommentsTable, row, '点赞/回复数据')),
            time: normalizeText(getCellByHeader(featuredCommentsTable, row, '时间文本')),
            status: normalizeText(getCellByHeader(featuredCommentsTable, row, '状态标签')),
        };
        if (!featuredByPost.has(postRef)) featuredByPost.set(postRef, []);
        featuredByPost.get(postRef).push(item);
        return item;
    });

    const bandsByPost = new Map();
    mapTheaterRows(commentBandsTable, (row) => {
        const postRef = normalizeText(getCellByHeader(commentBandsTable, row, '关联帖子ID'));
        if (!postRef) return null;
        const item = {
            front: splitSemicolonText(getCellByHeader(commentBandsTable, row, '前排普通评论串')),
            passerby: splitSemicolonText(getCellByHeader(commentBandsTable, row, '路人评论串')),
            noise: splitSemicolonText(getCellByHeader(commentBandsTable, row, '杂音/拱火评论串')),
            time: normalizeText(getCellByHeader(commentBandsTable, row, '时间文本')),
            status: normalizeText(getCellByHeader(commentBandsTable, row, '状态标签')),
        };
        if (!bandsByPost.has(postRef)) bandsByPost.set(postRef, []);
        bandsByPost.get(postRef).push(item);
        return item;
    });

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
            media: normalizeText(getCellByHeader(postsTable, row, '媒体信息')),
            heat: normalizeText(getCellByHeader(postsTable, row, '热度标签')),
            interaction: normalizeText(getCellByHeader(postsTable, row, '互动数据')),
            time: normalizeText(getCellByHeader(postsTable, row, '时间文本')),
            status: normalizeText(getCellByHeader(postsTable, row, '状态标签')),
            featuredComments: featuredByPost.get(postId) || [],
            commentBands: bandsByPost.get(postId) || [],
        };
    });

    void helpers;
    return { posts };
}

function collectDeletableKeys(viewModel) {
    return (viewModel?.content?.posts || []).map(post => post?.deleteKey).filter(Boolean);
}

function renderSquarePost(post, uiState = {}, renderKit) {
    const { getInitial, renderMetaLine, renderTag, splitTopicTokens } = renderKit;
    const initial = getInitial(post.author);
    const topics = splitTopicTokens(post.topic);
    const showHeat = post.heat && post.heat !== '普通';
    const showStatus = post.status && post.status !== '正常';
    const showMedia = post.media && post.media !== '无图';

    const featuredHtml = post.featuredComments.length > 0 ? `
        <section class="phone-theater-square-featured" aria-label="精选评论">
            ${post.featuredComments.map(comment => `
                <div class="phone-theater-square-featured-item ${comment.status === '封神评论' ? 'is-godlike' : ''}">
                    <div class="phone-theater-square-featured-author">${escapeHtml(comment.author)}</div>
                    <div class="phone-theater-square-featured-body">${escapeHtml(comment.body || '（空评论）')}</div>
                    ${renderMetaLine([comment.stance, comment.interaction, comment.status, comment.time])}
                </div>
            `).join('')}
        </section>
    ` : '';

    const passerbyAndFront = [];
    const noiseLines = [];
    post.commentBands.forEach((band) => {
        passerbyAndFront.push(...band.front, ...band.passerby);
        noiseLines.push(...band.noise);
    });

    const commentsHtml = passerbyAndFront.length > 0 ? `
        <section class="phone-theater-square-comments" aria-label="普通评论">
            ${passerbyAndFront.map(text => `<div class="phone-theater-square-comment-line">${escapeHtml(text)}</div>`).join('')}
        </section>
    ` : '';

    const noiseHtml = noiseLines.length > 0 ? `
        <section class="phone-theater-square-noise" aria-label="杂音">
            ${noiseLines.map(text => `<div class="phone-theater-square-comment-line is-noise">${escapeHtml(text)}</div>`).join('')}
        </section>
    ` : '';

    const selected = uiState.deleteManageMode && uiState.selectedKeys?.has(post.deleteKey);
    return `
        <article class="phone-theater-card phone-theater-square-post ${selected ? 'is-delete-selected' : ''}" data-post-id="${escapeHtmlAttr(post.id)}" data-theater-delete-key="${escapeHtmlAttr(post.deleteKey)}">
            ${renderKit.renderDeleteSelectButton(post.deleteKey, uiState)}
            <header class="phone-theater-square-card-head">
                <div class="phone-theater-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
                <div class="phone-theater-square-author-block">
                    <div class="phone-theater-author">${escapeHtml(post.author)}</div>
                    ${renderMetaLine([post.tag, post.time])}
                </div>
                <div class="phone-theater-square-heat">
                    ${showHeat ? renderTag(post.heat, 'is-heat') : ''}
                    ${showStatus ? renderTag(post.status, 'is-status') : ''}
                </div>
            </header>
            ${post.title ? `<h3 class="phone-theater-title">${escapeHtml(post.title)}</h3>` : ''}
            <div class="phone-theater-body-text">${escapeHtml(post.body || '（无正文）')}</div>
            ${(topics.length > 0 || showMedia) ? `
                <div class="phone-theater-square-topic-row">
                    ${topics.map(topic => `<span class="phone-theater-square-topic">#${escapeHtml(topic)}</span>`).join('')}
                    ${showMedia ? `<span class="phone-theater-square-media">${escapeHtml(post.media)}</span>` : ''}
                </div>
            ` : ''}
            ${featuredHtml}
            ${commentsHtml}
            ${noiseHtml}
            ${post.interaction ? `<footer class="phone-theater-square-footer">${escapeHtml(post.interaction)}</footer>` : ''}
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
    const featuredCommentsTable = tables.featuredComments;
    const commentBandsTable = tables.commentBands;
    const postTargets = buildDeleteTargets(selectedSet, 'post');
    const postIds = new Set();

    const postDeletion = filterTableRows(postsTable, (row, rowIndex) => {
        const postId = resolveSquarePostId(postsTable, row, rowIndex);
        const matched = hasDeleteTarget(postTargets, rowIndex, postId);
        if (matched) postIds.add(postId);
        return matched;
    });

    let removed = postDeletion.removed;
    if (postIds.size > 0) {
        removed += filterTableRows(featuredCommentsTable, (row) => {
            const postRef = normalizeText(getCellByHeader(featuredCommentsTable, row, '关联帖子ID'));
            return postIds.has(postRef);
        }).removed;
        removed += filterTableRows(commentBandsTable, (row) => {
            const postRef = normalizeText(getCellByHeader(commentBandsTable, row, '关联帖子ID'));
            return postIds.has(postRef);
        }).removed;
    }

    return { removed };
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
    fieldSchema: Object.freeze({
        posts: Object.freeze({ identity: '帖子ID', identityAliases: SQUARE_POST_ID_HEADERS }),
        featuredComments: Object.freeze({ parentRef: '关联帖子ID' }),
        commentBands: Object.freeze({ parentRef: '关联帖子ID' }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/square.css',
        requiredClasses: [
            'phone-theater-square-feed',
            'phone-theater-square-post',
            'phone-theater-square-card-head',
            'phone-theater-square-featured',
            'phone-theater-square-comments',
            'phone-theater-square-noise',
            'phone-theater-square-footer',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
});
