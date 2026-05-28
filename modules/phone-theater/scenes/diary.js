import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildTheaterDeleteKey } from '../core/delete-key.js';
import { getCellByHeader, mapTheaterRows, normalizeText, resolveRowIdentity } from '../core/table-index.js';

const DIARY_TABLES = Object.freeze({
    entries: '小日记表',
});

const DIARY_DELETE_ROLE = 'entry';
const DIARY_MAX_ENTRIES = 5;
const POSTSCRIPT_PATTERN = /^\s*(PS|PPS)\s*[：:]/i;
const SECRET_MARKER = '~~';
const DEFAULT_DISPLAY_DATE = '昨日私语';
const DIARY_FIELD_NAMES = Object.freeze({
    rowId: 'row_id',
    date: '日期',
    character: '角色',
    content: '内容',
});

function normalizeDiaryText(value) {
    return normalizeText(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseDiaryInlineTokens(line) {
    const text = String(line ?? '');
    const tokens = [];
    let cursor = 0;

    while (cursor < text.length) {
        const openIndex = text.indexOf(SECRET_MARKER, cursor);
        if (openIndex < 0) {
            tokens.push({ type: 'text', text: text.slice(cursor) });
            break;
        }

        const closeIndex = text.indexOf(SECRET_MARKER, openIndex + SECRET_MARKER.length);
        if (closeIndex < 0) {
            tokens.push({ type: 'text', text: text.slice(cursor) });
            break;
        }

        if (openIndex > cursor) {
            tokens.push({ type: 'text', text: text.slice(cursor, openIndex) });
        }

        tokens.push({
            type: 'secret',
            text: text.slice(openIndex + SECRET_MARKER.length, closeIndex),
        });
        cursor = closeIndex + SECRET_MARKER.length;
    }

    return tokens.filter(token => token.text !== '');
}

function parseDiaryContent(content) {
    const text = normalizeDiaryText(content);
    if (!text) {
        return {
            mainLines: [],
            postscriptLines: [],
        };
    }

    const mainLines = [];
    const postscriptLines = [];
    text.split('\n').forEach((line) => {
        const normalizedLine = String(line ?? '');
        if (!normalizeText(normalizedLine)) return;

        const postscriptMatch = POSTSCRIPT_PATTERN.exec(normalizedLine);
        if (postscriptMatch) {
            const kind = postscriptMatch[1].toUpperCase();
            const body = normalizedLine.slice(postscriptMatch[0].length).trim();
            postscriptLines.push({
                kind,
                tokens: parseDiaryInlineTokens(body),
            });
            return;
        }

        mainLines.push({
            tokens: parseDiaryInlineTokens(normalizedLine),
        });
    });

    return { mainLines, postscriptLines };
}

function renderDiaryTokens(tokens = []) {
    return tokens.map((token) => {
        const text = escapeHtml(token?.text || '');
        if (token?.type === 'secret') {
            return `<span class="phone-theater-diary-secret">${text}</span>`;
        }
        return text;
    }).join('');
}

function renderDiaryLines(lines = []) {
    return lines.map(line => `
        <p class="phone-theater-diary-line">${renderDiaryTokens(line.tokens)}</p>
    `).join('');
}

function renderDiaryPostscript(postscriptLines = []) {
    if (!Array.isArray(postscriptLines) || postscriptLines.length <= 0) return '';
    return `
        <footer class="phone-theater-diary-postscript" aria-label="日记附注">
            ${postscriptLines.map(line => `
                <div class="phone-theater-diary-postscript-line">
                    <span class="phone-theater-diary-postscript-label">${escapeHtml(line.kind)}</span>
                    <span class="phone-theater-diary-postscript-text">${renderDiaryTokens(line.tokens)}</span>
                </div>
            `).join('')}
        </footer>
    `;
}

function resolveDiaryIdentity(entriesTable, row, rowIndex) {
    return resolveRowIdentity(entriesTable, row, DIARY_FIELD_NAMES.rowId, `${DIARY_DELETE_ROLE}_`, rowIndex);
}

function normalizeDiaryRow(entriesTable, row, rowIndex) {
    const date = normalizeText(getCellByHeader(entriesTable, row, DIARY_FIELD_NAMES.date));
    const character = normalizeText(getCellByHeader(entriesTable, row, DIARY_FIELD_NAMES.character));
    const content = normalizeDiaryText(getCellByHeader(entriesTable, row, DIARY_FIELD_NAMES.content));
    if (!content) return null;

    const identity = resolveDiaryIdentity(entriesTable, row, rowIndex);
    const parsedContent = parseDiaryContent(content);
    const displayCharacter = character || '匿名日记主人';

    return {
        rowIndex,
        identity,
        deleteKey: buildTheaterDeleteKey(DIARY_DELETE_ROLE, rowIndex, identity),
        rowId: normalizeText(getCellByHeader(entriesTable, row, DIARY_FIELD_NAMES.rowId)),
        date,
        character: displayCharacter,
        avatarText: [...displayCharacter][0] || '记',
        content,
        parsedContent,
    };
}

function buildViewModel(resolved, helpers) {
    const entriesTable = resolved.tables.entries;
    const entries = mapTheaterRows(entriesTable, (row, rowIndex) => normalizeDiaryRow(entriesTable, row, rowIndex))
        .slice(0, DIARY_MAX_ENTRIES);
    const displayDate = entries.find(entry => entry.date)?.date || DEFAULT_DISPLAY_DATE;

    void helpers;
    return {
        entries,
        displayDate,
        count: entries.length,
        empty: entries.length <= 0,
    };
}

function collectDeletableKeys(viewModel) {
    return (viewModel?.content?.entries || []).map(entry => entry?.deleteKey).filter(Boolean);
}

function deleteEntities(context) {
    const { tables, selectedSet, filterTableRows, buildDeleteTargets, hasDeleteTarget } = context;
    const entriesTable = tables.entries;
    const entryTargets = buildDeleteTargets(selectedSet, DIARY_DELETE_ROLE);

    const entryDeletion = filterTableRows(entriesTable, (row, rowIndex) => {
        const identity = resolveDiaryIdentity(entriesTable, row, rowIndex);
        return hasDeleteTarget(entryTargets, rowIndex, identity);
    });

    return { removed: entryDeletion.removed };
}

function renderDiaryEmpty() {
    return `
        <div class="phone-theater-diary-page is-empty">
            <section class="phone-theater-diary-empty-card" aria-label="暂无小日记">
                <div class="phone-theater-diary-empty-kicker">NO PRIVATE NOTES</div>
                <div class="phone-theater-diary-empty-title">暂无小日记内容</div>
                <p class="phone-theater-diary-empty-text">等角色把昨日的秘密写下来，这里会变成一叠暖白色的私人手帐。</p>
            </section>
        </div>
    `;
}

function renderDiaryCard(entry, uiState = {}, renderKit) {
    const selected = uiState.deleteManageMode && uiState.selectedKeys?.has(entry.deleteKey);
    const postscriptHtml = renderDiaryPostscript(entry.parsedContent.postscriptLines);
    return `
        <article class="phone-theater-diary-card ${selected ? 'is-delete-selected' : ''}" data-diary-entry-id="${escapeHtmlAttr(entry.identity)}" data-theater-delete-key="${escapeHtmlAttr(entry.deleteKey)}">
            ${renderKit.renderDeleteSelectButton(entry.deleteKey, uiState)}
            <div class="phone-theater-diary-card-pin" aria-hidden="true"></div>
            <header class="phone-theater-diary-card-head">
                <span class="phone-theater-diary-date-chip">${escapeHtml(entry.date || DEFAULT_DISPLAY_DATE)}</span>
                <span class="phone-theater-diary-private-mark">PRIVATE</span>
            </header>
            <div class="phone-theater-diary-author-row">
                <span class="phone-theater-diary-avatar" aria-hidden="true">${escapeHtml(entry.avatarText)}</span>
                <div class="phone-theater-diary-author-block">
                    <h3 class="phone-theater-diary-author">${escapeHtml(entry.character)}</h3>
                    <div class="phone-theater-diary-signature">写给自己的日记</div>
                </div>
            </div>
            <div class="phone-theater-diary-content">
                ${renderDiaryLines(entry.parsedContent.mainLines)}
            </div>
            ${postscriptHtml}
        </article>
    `;
}

function renderContent(viewModel, uiState = {}, renderKit) {
    const content = viewModel?.content || {};
    const entries = Array.isArray(content.entries) ? content.entries : [];
    if (entries.length <= 0) return renderDiaryEmpty();

    return `
        <div class="phone-theater-diary-page">
            <section class="phone-theater-diary-stack" aria-label="小日记列表">
                ${entries.map(entry => renderDiaryCard(entry, uiState, renderKit)).join('')}
            </section>
        </div>
    `;
}

export const diaryScene = Object.freeze({
    id: 'diary',
    appKey: '__theater_diary',
    name: '小日记',
    iconText: '记',
    iconColors: ['#D3A45F', '#8F6842'],
    orderNo: 5,
    title: '小日记',
    subtitle: '写给昨日的私人日记',
    emptyText: '暂无小日记内容',
    styleScope: 'diary',
    primaryTableRole: 'entries',
    deletable: true,
    tables: DIARY_TABLES,
    editableTables: Object.freeze([
        Object.freeze({
            role: 'entries',
            label: '编辑小日记表',
            description: '进入原始小日记表列表',
        }),
    ]),
    fieldSchema: Object.freeze({
        entries: Object.freeze({
            identity: 'row_id',
            date: '日期',
            character: '角色',
            content: '内容',
        }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/diary.css',
        requiredClasses: [
            'phone-theater-diary-page',
            'phone-theater-diary-stack',
            'phone-theater-diary-card',
            'phone-theater-diary-content',
            'phone-theater-diary-postscript',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
});
