import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildTheaterDeleteKey } from '../core/delete-key.js';
import { getCellByHeader, mapTheaterRows, normalizeText, resolveRowIdentity, splitSemicolonText } from '../core/table-index.js';

const FORUM_COVER_PALETTE = [
    'phone-theater-cover-mist',
    'phone-theater-cover-cream',
    'phone-theater-cover-sage',
    'phone-theater-cover-rose',
];

const FORUM_TABLES = Object.freeze({
    threads: '论坛表',
});

const DEFAULT_FORUM_REPLY_AUTHOR = '网友';

function parseForumReplySegment(segment) {
    const raw = normalizeText(segment);
    if (!raw) return null;

    const separatorIndex = raw.search(/[:：]/);
    if (separatorIndex < 0) {
        return {
            author: DEFAULT_FORUM_REPLY_AUTHOR,
            content: raw,
            raw,
        };
    }

    const author = normalizeText(raw.slice(0, separatorIndex)) || DEFAULT_FORUM_REPLY_AUTHOR;
    const content = normalizeText(raw.slice(separatorIndex + 1)) || '（空回应）';
    return {
        author,
        content,
        raw,
    };
}

function parseForumReplies(value) {
    const text = normalizeText(value);
    if (!text || text.toLowerCase() === 'none') return [];
    return splitSemicolonText(text)
        .map(parseForumReplySegment)
        .filter(Boolean);
}

function buildViewModel(resolved) {
    const threadsTable = resolved.tables.threads;

    const threads = mapTheaterRows(threadsTable, (row, rowIndex) => {
        const title = resolveRowIdentity(threadsTable, row, '帖子标题', '帖子 ', rowIndex);
        return {
            deleteKey: buildTheaterDeleteKey('thread', rowIndex, title),
            rowIndex,
            board: normalizeText(getCellByHeader(threadsTable, row, '分区/版面名')),
            author: normalizeText(getCellByHeader(threadsTable, row, '发帖账号名', '匿名')) || '匿名',
            tag: normalizeText(getCellByHeader(threadsTable, row, '账号标签')),
            title,
            body: normalizeText(getCellByHeader(threadsTable, row, '帖子正文')),
            meta: normalizeText(getCellByHeader(threadsTable, row, '附加信息')),
            interaction: normalizeText(getCellByHeader(threadsTable, row, '热度/回应数据')),
            time: normalizeText(getCellByHeader(threadsTable, row, '时间文本')),
            replies: parseForumReplies(getCellByHeader(threadsTable, row, '评论串')),
        };
    });
    threads.reverse();

    return { threads };
}

function collectDeletableKeys(viewModel) {
    return (viewModel?.content?.threads || []).map(thread => thread?.deleteKey).filter(Boolean);
}

function pickForumCoverClass(seed, renderKit) {
    const index = renderKit.hashStringToIndex(seed, FORUM_COVER_PALETTE.length);
    return FORUM_COVER_PALETTE[index];
}

function renderForumFloors(replies, renderKit) {
    if (!Array.isArray(replies) || replies.length <= 0) return '';
    return `
        <section class="phone-theater-forum-featured-floors" aria-label="评论区">
            ${replies.map((reply) => `
                <article class="phone-theater-forum-floor-reply">
                    <header class="phone-theater-forum-floor-head">
                        <span class="phone-theater-forum-floor-author">${escapeHtml(reply.author)}</span>
                    </header>
                    <div class="phone-theater-forum-floor-body">${escapeHtml(reply.content || '（空回应）')}</div>
                    ${renderKit.renderMetaLine([])}
                </article>
            `).join('')}
        </section>
    `;
}

function renderForumNoteCard(thread, uiState = {}, renderKit) {
    const coverClass = pickForumCoverClass(thread.title || thread.board || thread.author || '', renderKit);
    const topics = renderKit.splitTopicTokens(thread.meta);
    const board = normalizeText(thread.board);
    const selected = uiState.deleteManageMode && uiState.selectedKeys?.has(thread.deleteKey);
    return `
        <article class="phone-theater-card phone-theater-forum-note-card ${selected ? 'is-delete-selected' : ''}" data-theater-delete-key="${escapeHtmlAttr(thread.deleteKey)}">
            ${renderKit.renderDeleteSelectButton(thread.deleteKey, uiState)}
            <div class="phone-theater-forum-cover ${coverClass}" aria-hidden="true">
                <div class="phone-theater-forum-cover-kicker">${escapeHtml(board || '主贴')}</div>
            </div>
            <header class="phone-theater-forum-thread-head">
                ${board ? `<span class="phone-theater-board">${escapeHtml(board)}</span>` : ''}
            </header>
            <h3 class="phone-theater-forum-thread-title">${escapeHtml(thread.title)}</h3>
            <div class="phone-theater-forum-thread-body">${escapeHtml(thread.body || '（无正文）')}</div>
            ${topics.length > 0 ? `
                <div class="phone-theater-forum-topic-row">
                    ${topics.map(topic => `<span class="phone-theater-forum-topic-pill">#${escapeHtml(topic)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="phone-theater-forum-author-row">
                <span class="phone-theater-forum-author-name">${escapeHtml(thread.author)}</span>
                ${thread.tag ? `<span class="phone-theater-forum-author-tag">${escapeHtml(thread.tag)}</span>` : ''}
                ${thread.time ? `<span class="phone-theater-forum-author-time">${escapeHtml(thread.time)}</span>` : ''}
            </div>
            ${thread.interaction ? `<div class="phone-theater-forum-stats-row">${escapeHtml(thread.interaction)}</div>` : ''}
            ${renderForumFloors(thread.replies || [], renderKit)}
        </article>
    `;
}

function renderContent(viewModel, uiState = {}, renderKit) {
    const threads = viewModel?.content?.threads || [];
    if (threads.length <= 0) return renderKit.renderEmpty(viewModel.emptyText);
    const threadList = `
        <div class="phone-theater-forum-thread-list">
            ${threads.map(thread => renderForumNoteCard(thread, uiState, renderKit)).join('')}
        </div>
    `;
    return `
        <div class="phone-theater-forum-home">
            ${threadList}
        </div>
    `;
}

function deleteEntities(context) {
    const { tables, selectedSet, filterTableRows, buildDeleteTargets, hasDeleteTarget } = context;
    const threadsTable = tables.threads;
    const threadTargets = buildDeleteTargets(selectedSet, 'thread');

    const threadDeletion = filterTableRows(threadsTable, (row, rowIndex) => {
        const title = resolveRowIdentity(threadsTable, row, '帖子标题', '帖子 ', rowIndex);
        return hasDeleteTarget(threadTargets, rowIndex, title);
    });

    return { removed: threadDeletion.removed };
}

export const forumScene = Object.freeze({
    id: 'forum',
    appKey: '__theater_forum',
    name: '论坛',
    iconText: '坛',
    iconColors: ['#5AC8FA', '#007AFF'],
    orderNo: 2,
    title: '论坛',
    subtitle: '帖子讨论页',
    emptyText: '暂无论坛帖子',
    styleScope: 'forum',
    primaryTableRole: 'threads',
    tables: FORUM_TABLES,
    editableTables: Object.freeze([
        Object.freeze({
            role: 'threads',
            label: '编辑论坛表',
            description: '进入原始论坛表格列表',
        }),
    ]),
    fieldSchema: Object.freeze({
        threads: Object.freeze({ identity: '帖子标题' }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/forum.css',
        requiredClasses: [
            'phone-theater-forum-home',
            'phone-theater-forum-note-card',
            'phone-theater-forum-cover',
            'phone-theater-forum-floor-reply',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
});
