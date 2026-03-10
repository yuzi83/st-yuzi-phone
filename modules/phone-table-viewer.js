// modules/phone/phone-table-viewer.js
/**
 * 玉子的手机 - 表格查看器
 * 通用表：列表 + 详情
 * 三张专属表（消息记录表 / 动态表 / 论坛表）：对齐游戏界面中的手机交互风格
 */

import {
    getTableData,
    navigateBack,
    saveTableData,
    getTableLockState,
    setTableRowLock,
    isTableRowLocked,
    setTableCellLock,
    isTableCellLocked,
    bindPhoneScrollGuards,
} from './phone-core.js';
import { PHONE_ICONS } from './phone-home.js';
import { detectSpecialTemplateForTable, detectGenericTemplateForTable } from './phone-beautify-templates.js';
import { createStorageManager, getSessionStorageNamespace } from './storage-manager.js';
import { escapeHtml, escapeHtmlAttr, safeText } from './utils.js';

const SPECIAL_SCOPE_CLASS = 'phone-special-template-scope';
const TEMPLATE_DRAFT_STORE_KEY = '__YUZI_PHONE_TEMPLATE_DRAFT_PATCHES';

const VIEWER_ANNOTATION_META_KEYS = new Set([
    '_comment',
    '_type',
    '_enum',
    '_range',
    '_example',
    '_risk',
    '_default',
]);

function isAnnotatedValueWrapperForViewer(raw) {
    return !!raw
        && typeof raw === 'object'
        && !Array.isArray(raw)
        && Object.prototype.hasOwnProperty.call(raw, 'value');
}

function unwrapAnnotatedValueForViewer(raw) {
    return isAnnotatedValueWrapperForViewer(raw) ? raw.value : raw;
}

function stripAnnotationStructureForViewer(raw) {
    const value = unwrapAnnotatedValueForViewer(raw);

    if (Array.isArray(value)) {
        return value.map(item => stripAnnotationStructureForViewer(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const result = {};
    Object.entries(value).forEach(([key, item]) => {
        const safeKey = String(key || '');
        if (safeKey.startsWith('_') && VIEWER_ANNOTATION_META_KEYS.has(safeKey)) return;
        result[key] = stripAnnotationStructureForViewer(item);
    });

    return result;
}

function isPlainObjectForViewer(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeForViewer(base, patch) {
    const left = stripAnnotationStructureForViewer(base);
    const right = stripAnnotationStructureForViewer(patch);

    if (!isPlainObjectForViewer(left)) {
        return right;
    }

    if (!isPlainObjectForViewer(right)) {
        return left;
    }

    const result = { ...left };
    Object.entries(right).forEach(([key, value]) => {
        if (isPlainObjectForViewer(value) && isPlainObjectForViewer(result[key])) {
            result[key] = deepMergeForViewer(result[key], value);
        } else {
            result[key] = stripAnnotationStructureForViewer(value);
        }
    });

    return result;
}

function getTemplateDraftStoreForViewer() {
    try {
        const host = window;
        if (!host[TEMPLATE_DRAFT_STORE_KEY] || typeof host[TEMPLATE_DRAFT_STORE_KEY] !== 'object') {
            host[TEMPLATE_DRAFT_STORE_KEY] = {};
        }
        return host[TEMPLATE_DRAFT_STORE_KEY];
    } catch {
        return {};
    }
}

function resolveTemplateWithDraftForViewer(template) {
    const src = stripAnnotationStructureForViewer(template);
    if (!src || typeof src !== 'object') return src;

    const templateId = String(src.id || '').trim();
    if (!templateId) return src;

    const draftStore = getTemplateDraftStoreForViewer();
    const patch = draftStore?.[templateId];
    if (!patch || typeof patch !== 'object') {
        return src;
    }

    const patchSource = stripAnnotationStructureForViewer(patch);
    const renderPatch = patchSource?.render && typeof patchSource.render === 'object'
        ? patchSource.render
        : patchSource;

    const next = JSON.parse(JSON.stringify(src));
    const mergedRender = deepMergeForViewer(next.render || {}, renderPatch || {});
    next.render = mergedRender;

    const advanced = stripAnnotationStructureForViewer(next.render?.advanced || {});
    const hasLegacyCss = typeof next.render?.customCss === 'string' && next.render.customCss.trim();
    const enabled = typeof advanced?.customCssEnabled === 'boolean'
        ? advanced.customCssEnabled
        : !!hasLegacyCss;

    const candidateCss = String(unwrapAnnotatedValueForViewer(advanced?.customCss ?? next.render?.customCss) || '').trim();
    next.render.advanced = {
        customCssEnabled: enabled,
        customCss: candidateCss,
    };
    next.render.customCss = enabled ? candidateCss : '';

    return next;
}

function buildScopedCustomCss(customCssText, scopeSelector) {
    const css = String(customCssText || '').trim();
    const scope = String(scopeSelector || '').trim();
    if (!css || !scope) return '';

    const skipWhitespace = (text, start) => {
        let i = start;
        while (i < text.length && /\s/.test(text[i])) i += 1;
        return i;
    };

    const findMatchingBrace = (text, openBraceIndex) => {
        if (openBraceIndex < 0 || openBraceIndex >= text.length || text[openBraceIndex] !== '{') return -1;

        let depth = 0;
        let inString = '';
        let inComment = false;

        for (let i = openBraceIndex; i < text.length; i += 1) {
            const ch = text[i];
            const next = text[i + 1];

            if (inComment) {
                if (ch === '*' && next === '/') {
                    inComment = false;
                    i += 1;
                }
                continue;
            }

            if (inString) {
                if (ch === '\\') {
                    i += 1;
                    continue;
                }
                if (ch === inString) {
                    inString = '';
                }
                continue;
            }

            if (ch === '/' && next === '*') {
                inComment = true;
                i += 1;
                continue;
            }

            if (ch === '"' || ch === '\'') {
                inString = ch;
                continue;
            }

            if (ch === '{') {
                depth += 1;
                continue;
            }

            if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    return i;
                }
            }
        }

        return -1;
    };

    const splitSelectorList = (selectorText) => {
        const selectors = [];
        let current = '';
        let depthParen = 0;
        let depthBracket = 0;
        let inString = '';

        for (let i = 0; i < selectorText.length; i += 1) {
            const ch = selectorText[i];

            if (inString) {
                current += ch;
                if (ch === '\\') {
                    const next = selectorText[i + 1];
                    if (next) {
                        current += next;
                        i += 1;
                    }
                    continue;
                }
                if (ch === inString) {
                    inString = '';
                }
                continue;
            }

            if (ch === '"' || ch === '\'') {
                inString = ch;
                current += ch;
                continue;
            }

            if (ch === '(') depthParen += 1;
            if (ch === ')') depthParen = Math.max(0, depthParen - 1);
            if (ch === '[') depthBracket += 1;
            if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);

            if (ch === ',' && depthParen === 0 && depthBracket === 0) {
                const part = current.trim();
                if (part) selectors.push(part);
                current = '';
                continue;
            }

            current += ch;
        }

        const tail = current.trim();
        if (tail) selectors.push(tail);
        return selectors;
    };

    const scopeSelectorList = (selectorText) => {
        const list = splitSelectorList(selectorText);
        if (list.length <= 0) return '';

        const scopedList = list.map((sel) => {
            if (sel.startsWith(scope)) return sel;
            if (sel.startsWith(':root')) {
                return sel.replace(/^:root\b/, scope);
            }
            return `${scope} ${sel}`;
        });

        return scopedList.join(', ');
    };

    const transformRules = (source) => {
        let result = '';
        let cursor = 0;

        while (cursor < source.length) {
            const ruleStart = skipWhitespace(source, cursor);
            if (ruleStart >= source.length) break;

            const braceIndex = source.indexOf('{', ruleStart);
            if (braceIndex < 0) {
                result += source.slice(ruleStart).trim();
                break;
            }

            const prelude = source.slice(ruleStart, braceIndex).trim();
            const closeIndex = findMatchingBrace(source, braceIndex);
            if (closeIndex < 0) {
                break;
            }

            const blockBody = source.slice(braceIndex + 1, closeIndex);

            if (!prelude) {
                cursor = closeIndex + 1;
                continue;
            }

            if (prelude.startsWith('@')) {
                const atRule = prelude.toLowerCase();
                if (atRule.startsWith('@media') || atRule.startsWith('@supports') || atRule.startsWith('@document') || atRule.startsWith('@layer')) {
                    const nested = transformRules(blockBody);
                    result += `${prelude} { ${nested} }\n`;
                } else {
                    result += `${prelude} { ${blockBody} }\n`;
                }
                cursor = closeIndex + 1;
                continue;
            }

            const scopedPrelude = scopeSelectorList(prelude);
            if (scopedPrelude) {
                result += `${scopedPrelude} { ${blockBody} }\n`;
            }

            cursor = closeIndex + 1;
        }

        return result.trim();
    };

    return transformRules(css);
}

function bindTemplateDraftPreviewForViewer(container, sheetKey) {
    if (!(container instanceof HTMLElement)) return;

    const prev = container.__yuziDraftPreviewListeners;
    if (prev?.onDraftUpdate) {
        window.removeEventListener('yuzi-phone-style-draft-updated', prev.onDraftUpdate);
    }
    if (prev?.onDraftClear) {
        window.removeEventListener('yuzi-phone-style-draft-cleared', prev.onDraftClear);
    }
    if (prev?.observer) {
        try { prev.observer.disconnect(); } catch {}
    }

    const rerender = () => {
        if (!container.isConnected) return;
        renderTableViewer(container, sheetKey);
    };

    const onDraftUpdate = () => rerender();
    const onDraftClear = () => rerender();

    window.addEventListener('yuzi-phone-style-draft-updated', onDraftUpdate);
    window.addEventListener('yuzi-phone-style-draft-cleared', onDraftClear);

    const observer = new MutationObserver(() => {
        if (container.isConnected) return;
        window.removeEventListener('yuzi-phone-style-draft-updated', onDraftUpdate);
        window.removeEventListener('yuzi-phone-style-draft-cleared', onDraftClear);
        try { observer.disconnect(); } catch {}
    });
    observer.observe(container, { childList: true, subtree: true });

    container.__yuziDraftPreviewListeners = {
        onDraftUpdate,
        onDraftClear,
        observer,
    };
}

const SPECIAL_TABLE_TYPES = {
    '消息记录表': 'message',
    '动态表': 'moments',
    '论坛表': 'forum',
};

const STORAGE_KEYS = {
    specialChoices: 'yzp_special_choices_v1',
    specialChoicesLegacy: 'tamako_phone_special_choices_v1',
};

const choiceStore = createStorageManager({
    maxEntries: 900,
    maxBytes: 1024 * 1024,
    defaultTTL: 1000 * 60 * 60 * 24 * 30,
});

const choiceStoreSessionNs = getSessionStorageNamespace('specialChoices');
const choiceStorePersistentNs = 'specialChoices:global';
let choiceStoreMigrated = false;

function ensureChoiceStoreMigrated() {
    if (choiceStoreMigrated) return;
    choiceStoreMigrated = true;

    try {
        const modern = localStorage.getItem(STORAGE_KEYS.specialChoices);
        const legacy = localStorage.getItem(STORAGE_KEYS.specialChoicesLegacy);
        const source = modern || legacy;
        if (!source) return;

        const map = JSON.parse(source);
        if (!map || typeof map !== 'object') return;

        Object.entries(map).forEach(([choiceId, idx]) => {
            if (!choiceId) return;
            if (!Number.isInteger(idx)) return;
            choiceStore.set(choiceStorePersistentNs, choiceId, idx, {
                ttl: 1000 * 60 * 60 * 24 * 30,
            });
        });

        // 迁移成功后删除旧大对象，避免持续膨胀。
        localStorage.removeItem(STORAGE_KEYS.specialChoices);
        localStorage.removeItem(STORAGE_KEYS.specialChoicesLegacy);
        choiceStore.maintenance();
    } catch {
        // ignore
    }
}

const DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE = Object.freeze({
    message: {
        threadId: ['会话ID', '会话Id', '会话编号', '对话ID', '@const:default_thread'],
        threadTitle: ['会话标题', '会话名称', '群聊标题', '标题', '@tableName'],
        threadSubtitle: ['会话副标题', '会话描述', '备注'],
        sender: ['发送者', '发言者', '作者'],
        senderRole: ['发送者身份', '角色', '身份'],
        content: ['消息内容', '三人消息内容', '文案', '正文'],
        sentAt: ['消息发送时间', '发送时间', '时间', '@now'],
        messageStatus: ['消息状态', '状态'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
        playerReply1: ['主角回复选项1'],
        playerReply2: ['主角回复选项2'],
        playerReply3: ['主角回复选项3'],
        counterReply1: ['对方回复1', '三人回复1', '发布者回复1'],
        counterReply2: ['对方回复2', '三人回复2', '发布者回复2'],
        counterReply3: ['对方回复3', '三人回复3', '发布者回复3'],
    },
    moments: {
        poster: ['发帖人', '作者', '发布者', '发送者'],
        title: ['标题'],
        postContent: ['文案', '内容', '正文', '消息内容', '三人消息内容'],
        postTime: ['发帖时间', '时间', '消息发送时间', '@now'],
        topicTag: ['话题', '标签', '主题'],
        location: ['位置', '地点'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
        likes: ['点赞数', '点赞'],
        shares: ['转发数', '转发'],
        viewCount: ['浏览数', '浏览量', '阅读量'],
        commentCount: ['评论数', '评论条数'],
        commentContent: ['评论内容', '评论'],
        playerReply1: ['主角回复选项1'],
        playerReply2: ['主角回复选项2'],
        playerReply3: ['主角回复选项3'],
        publisherReply1: ['发布者回复1', '对方回复1', '三人回复1'],
        publisherReply2: ['发布者回复2', '对方回复2', '三人回复2'],
        publisherReply3: ['发布者回复3', '对方回复3', '三人回复3'],
    },
    forum: {
        poster: ['发帖人网名', '发帖人', '作者'],
        protagonistName: ['主角网名', '主角'],
        title: ['标题'],
        postContent: ['文案', '内容', '正文'],
        postTime: ['发帖时间', '时间', '@now'],
        topicTag: ['话题', '标签', '板块'],
        location: ['位置', '地点'],
        imageDesc: ['图片描述'],
        videoDesc: ['视频描述'],
        likes: ['点赞数', '点赞'],
        shares: ['转发数', '转发'],
        viewCount: ['浏览数', '浏览量', '阅读量'],
        commentCount: ['评论数', '评论条数'],
        commentContent: ['评论内容', '评论'],
        playerReply1: ['主角回复选项1'],
        playerReply2: ['主角回复选项2'],
        playerReply3: ['主角回复选项3'],
        publisherReply1: ['发布者回复1', '对方回复1', '三人回复1'],
        publisherReply2: ['发布者回复2', '对方回复2', '三人回复2'],
        publisherReply3: ['发布者回复3', '对方回复3', '三人回复3'],
    },
});

const DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE = Object.freeze({
    message: {
        density: 'normal',
        avatarShape: 'circle',
        bubbleMaxWidthPct: 80,
        conversationTitleMode: 'auto',
        replyOptionMode: 'auto',
        mediaActionTextMode: 'short',
        showAvatar: true,
        showMessageTime: true,
        showReplyReset: true,
        emptyConversationText: '暂无消息',
        emptyDetailText: '该会话暂无消息',
        emptyMessageText: '（空消息）',
        timeFallbackText: '刚刚',
    },
    moments: {
        density: 'normal',
        cardStyle: 'filled',
        feedOrder: 'desc',
        statsMode: 'full',
        replyOptionMode: 'auto',
        mediaActionTextMode: 'detailed',
        showPosterAvatar: true,
        showPostTime: true,
        showReplyReset: true,
        emptyFeedText: '暂无内容',
        emptyContentText: '（无正文）',
        commentEmptyText: '暂无评论',
        timeFallbackText: '刚刚',
    },
    forum: {
        density: 'normal',
        cardStyle: 'outlined',
        feedOrder: 'desc',
        statsMode: 'full',
        replyOptionMode: 'auto',
        mediaActionTextMode: 'detailed',
        showPosterAvatar: true,
        showPostTime: true,
        showReplyReset: true,
        emptyFeedText: '暂无内容',
        emptyContentText: '（无正文）',
        commentEmptyText: '暂无评论',
        forumMetaPrefix: '由',
        timeFallbackText: '刚刚',
    },
});

const SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES = Object.freeze({
    density: ['compact', 'normal', 'loose'],
    avatarShape: ['circle', 'rounded', 'square'],
    conversationTitleMode: ['auto', 'sender', 'thread', 'titleField'],
    replyOptionMode: ['auto', 'always', 'hidden'],
    mediaActionTextMode: ['short', 'detailed'],
    cardStyle: ['filled', 'outlined', 'plain'],
    feedOrder: ['desc', 'asc'],
    statsMode: ['full', 'compact', 'hidden'],
});

const SPECIAL_STYLE_OPTION_NUMERIC_RULES = Object.freeze({
    bubbleMaxWidthPct: { min: 48, max: 96 },
});

const SPECIAL_STYLE_OPTION_BOOLEAN_KEYS = new Set([
    'showAvatar',
    'showMessageTime',
    'showReplyReset',
    'showPosterAvatar',
    'showPostTime',
]);

const SPECIAL_STYLE_OPTION_TEXT_LIMITS = Object.freeze({
    emptyConversationText: 48,
    emptyDetailText: 48,
    emptyMessageText: 48,
    timeFallbackText: 24,
    emptyFeedText: 48,
    emptyContentText: 48,
    commentEmptyText: 48,
    forumMetaPrefix: 12,
});

export function renderTableViewer(container, sheetKey) {
    bindTemplateDraftPreviewForViewer(container, sheetKey);

    const rawData = getTableData();
    const sheet = rawData?.[sheetKey];

    if (!sheet || !sheet.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(sheetKey)}</span>
                </div>
                <div class="phone-app-body">
                    <div class="phone-empty-msg">无法加载表格数据</div>
                </div>
            </div>
        `;
        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);
        return;
    }

    const rawHeaders = Array.isArray(sheet.content[0]) ? sheet.content[0] : [];
    const headers = rawHeaders.map((h, i) => String(h || '').trim() || `列${i + 1}`);
    const rows = sheet.content.slice(1);
    const tableName = sheet.name || sheetKey;

    const specialMatch = detectSpecialTemplateForTable({
        sheetKey,
        tableName,
        headers,
    });

    const specialType = specialMatch?.specialType || detectSpecialTableType(tableName);
    if (specialType) {
        renderSpecialTableViewer(container, {
            sheetKey,
            tableName,
            rows,
            headers,
            type: specialType,
            templateMatch: specialMatch || null,
        });
        return;
    }

    const genericMatch = detectGenericTemplateForTable({
        sheetKey,
        tableName,
        headers,
    });

    // ===== 通用表格渲染（主列表：行锁定+删除；子页面：字段锁定+编辑保存） =====
    const state = {
        mode: 'list', // list | detail
        rowIndex: -1,
        editMode: false,
        draftValues: {},
        lockState: getTableLockState(sheetKey),
        saving: false,
        lockManageMode: false,
        deleteManageMode: false,
        deletingRowIndex: -1,
        listScrollTop: 0,
    };

    const getRuntimeApi = () => {
        const w = window.parent || window;
        return (/** @type {any} */ (w)).AutoCardUpdaterAPI || (/** @type {any} */ (window)).AutoCardUpdaterAPI || null;
    };

    const normalizeLockStateForRemap = (lockState) => {
        if (!lockState || typeof lockState !== 'object') {
            return { rows: [], cols: [], cells: [] };
        }

        const rows = Array.isArray(lockState.rows)
            ? lockState.rows.map(v => Number(v)).filter(Number.isInteger)
            : [];

        const cols = Array.isArray(lockState.cols)
            ? lockState.cols.map(v => Number(v)).filter(Number.isInteger)
            : [];

        const cells = Array.isArray(lockState.cells)
            ? lockState.cells.map((entry) => {
                if (Array.isArray(entry) && entry.length >= 2) {
                    const r = Number(entry[0]);
                    const c = Number(entry[1]);
                    if (Number.isInteger(r) && Number.isInteger(c)) return `${r}:${c}`;
                    return null;
                }

                const text = String(entry || '').trim();
                const parts = text.split(':');
                if (parts.length < 2) return null;
                const r = Number(parts[0]);
                const c = Number(parts[1]);
                if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
                return `${r}:${c}`;
            }).filter(Boolean)
            : [];

        return {
            rows: Array.from(new Set(rows)),
            cols: Array.from(new Set(cols)),
            cells: Array.from(new Set(cells)),
        };
    };

    const remapLockStateAfterRowDelete = (lockState, deletedRowIndex) => {
        const idx = Number(deletedRowIndex);
        if (!Number.isInteger(idx) || idx < 0) {
            return normalizeLockStateForRemap(lockState);
        }

        const current = normalizeLockStateForRemap(lockState);

        const rowsNext = current.rows
            .filter(rowIdx => rowIdx !== idx)
            .map(rowIdx => (rowIdx > idx ? rowIdx - 1 : rowIdx));

        const cellsNext = current.cells
            .map((key) => {
                const [rowPart, colPart] = String(key).split(':');
                const rowIdx = Number(rowPart);
                const colIdx = Number(colPart);
                if (!Number.isInteger(rowIdx) || !Number.isInteger(colIdx)) return null;
                if (rowIdx === idx) return null;
                const nextRowIdx = rowIdx > idx ? rowIdx - 1 : rowIdx;
                return `${nextRowIdx}:${colIdx}`;
            })
            .filter(Boolean);

        return {
            rows: Array.from(new Set(rowsNext)),
            cols: current.cols,
            cells: Array.from(new Set(cellsNext)),
        };
    };

    const applyLockStateAfterRowDelete = (deletedRowIndex) => {
        const api = getRuntimeApi();
        if (!api || typeof api.getTableLockState !== 'function' || typeof api.setTableLockState !== 'function') {
            return;
        }

        try {
            const current = api.getTableLockState(sheetKey);
            const next = remapLockStateAfterRowDelete(current, deletedRowIndex);
            api.setTableLockState(sheetKey, next, { merge: false });
        } catch (e) {
            console.warn('[玉子的手机] 删除后重排锁状态失败:', e);
        }
    };

    const deleteRowFromList = async (rowIndex) => {
        const latest = getTableData();
        const targetSheet = latest?.[sheetKey];
        if (!targetSheet?.content || !Array.isArray(targetSheet.content)) {
            showInlineToast(container, '删除失败：表格不存在');
            return false;
        }

        const realRowIndex = rowIndex + 1;
        if (!Array.isArray(targetSheet.content[realRowIndex])) {
            showInlineToast(container, '删除失败：行不存在');
            return false;
        }

        if (isTableRowLocked(sheetKey, rowIndex)) {
            showInlineToast(container, '删除失败：条目已锁定');
            return false;
        }

        targetSheet.content.splice(realRowIndex, 1);

        const ok = await saveTableData(latest);
        if (!ok) {
            showInlineToast(container, '删除失败：API回写失败');
            return false;
        }

        rows.splice(rowIndex, 1);
        applyLockStateAfterRowDelete(rowIndex);

        if (rows.length === 0) {
            state.mode = 'list';
            state.rowIndex = -1;
            state.editMode = false;
            state.draftValues = {};
            state.lockManageMode = false;
            state.deleteManageMode = false;
        } else if (state.rowIndex >= 0) {
            if (state.rowIndex === rowIndex) {
                state.rowIndex = Math.min(state.rowIndex, rows.length - 1);
            } else if (state.rowIndex > rowIndex) {
                state.rowIndex -= 1;
            }
        }

        return true;
    };

    const render = () => {
        if (state.mode === 'detail' && state.rowIndex >= 0) {
            renderDetailPage();
            return;
        }
        renderListPage();
    };

    const renderKeepScroll = () => {
        const body = container.querySelector('.phone-app-body');
        const prevTop = body ? Math.max(0, Number(body.scrollTop) || 0) : 0;

        render();
        // 使用双重 requestAnimationFrame 确保 DOM 布局完成
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const nextBody = container.querySelector('.phone-app-body');
                if (!nextBody) return;
                const maxTop = Math.max(0, (nextBody.scrollHeight || 0) - (nextBody.clientHeight || 0));
                nextBody.scrollTop = Math.min(prevTop, maxTop);
            });
        });
    };

    const captureListScroll = () => {
        const body = container.querySelector('.phone-app-body');
        if (!body || state.mode !== 'list') return;
        state.listScrollTop = Math.max(0, Number(body.scrollTop) || 0);
    };

    const restoreListScroll = () => {
        if (state.mode !== 'list') return;
        const body = container.querySelector('.phone-app-body');
        if (!body) return;
        const maxTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
        const targetTop = Math.min(Math.max(0, Number(state.listScrollTop) || 0), maxTop);
        // 使用双重 requestAnimationFrame 确保 DOM 布局完成
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                body.scrollTop = targetTop;
            });
        });
    };

    const getGenericTemplateStylePayload = (viewMode = 'list') => {
        const template = resolveTemplateWithDraftForViewer(genericMatch?.template);

        const defaultLayoutOptions = {
            pageMode: 'framed',
            navMode: 'glass',
            listContainerMode: 'card',
            listItemMode: 'row',
            listMetaMode: 'inline',
            detailContainerMode: 'card',
            detailFieldLayout: 'stack',
            detailGroupMode: 'section',
            actionBarMode: 'inline',
            buttonShape: 'rounded',
            buttonSize: 'sm',
            density: 'normal',
            shadowLevel: 'soft',
            radiusLevel: 'md',
            showListDivider: true,
            showDetailDivider: true,
        };

        const allowedLayoutOptions = {
            pageMode: ['framed', 'plain'],
            navMode: ['glass', 'solid', 'transparent'],
            listContainerMode: ['card', 'plain', 'table'],
            listItemMode: ['row', 'card', 'compact'],
            listMetaMode: ['inline', 'stacked', 'hidden'],
            detailContainerMode: ['card', 'plain', 'table'],
            detailFieldLayout: ['stack', 'inline', 'grid-2', 'grid-3'],
            detailGroupMode: ['section', 'flat'],
            actionBarMode: ['inline', 'sticky', 'hidden'],
            buttonShape: ['pill', 'rounded', 'square'],
            buttonSize: ['xs', 'sm', 'md', 'lg'],
            density: ['compact', 'normal', 'loose'],
            shadowLevel: ['none', 'soft', 'mid', 'strong'],
            radiusLevel: ['none', 'sm', 'md', 'lg', 'xl'],
        };

        const toVarName = (key) => String(key || '')
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .replace(/^([^a-zA-Z_])/, '_$1');

        const normalizeEnum = (value, allowed, fallback) => {
            const text = String(value ?? '').trim();
            if (!text) return fallback;
            return allowed.includes(text) ? text : fallback;
        };

        const normalizeBool = (value, fallback) => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            const text = String(value ?? '').trim().toLowerCase();
            if (!text) return fallback;
            if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
            if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
            return fallback;
        };

        const normalizeLayoutOptions = (rawLayoutOptions) => {
            const src = rawLayoutOptions && typeof rawLayoutOptions === 'object' && !Array.isArray(rawLayoutOptions)
                ? rawLayoutOptions
                : {};

            return {
                pageMode: normalizeEnum(src.pageMode, allowedLayoutOptions.pageMode, defaultLayoutOptions.pageMode),
                navMode: normalizeEnum(src.navMode, allowedLayoutOptions.navMode, defaultLayoutOptions.navMode),
                listContainerMode: normalizeEnum(src.listContainerMode, allowedLayoutOptions.listContainerMode, defaultLayoutOptions.listContainerMode),
                listItemMode: normalizeEnum(src.listItemMode, allowedLayoutOptions.listItemMode, defaultLayoutOptions.listItemMode),
                listMetaMode: normalizeEnum(src.listMetaMode, allowedLayoutOptions.listMetaMode, defaultLayoutOptions.listMetaMode),
                detailContainerMode: normalizeEnum(src.detailContainerMode, allowedLayoutOptions.detailContainerMode, defaultLayoutOptions.detailContainerMode),
                detailFieldLayout: normalizeEnum(src.detailFieldLayout, allowedLayoutOptions.detailFieldLayout, defaultLayoutOptions.detailFieldLayout),
                detailGroupMode: normalizeEnum(src.detailGroupMode, allowedLayoutOptions.detailGroupMode, defaultLayoutOptions.detailGroupMode),
                actionBarMode: normalizeEnum(src.actionBarMode, allowedLayoutOptions.actionBarMode, defaultLayoutOptions.actionBarMode),
                buttonShape: normalizeEnum(src.buttonShape, allowedLayoutOptions.buttonShape, defaultLayoutOptions.buttonShape),
                buttonSize: normalizeEnum(src.buttonSize, allowedLayoutOptions.buttonSize, defaultLayoutOptions.buttonSize),
                density: normalizeEnum(src.density, allowedLayoutOptions.density, defaultLayoutOptions.density),
                shadowLevel: normalizeEnum(src.shadowLevel, allowedLayoutOptions.shadowLevel, defaultLayoutOptions.shadowLevel),
                radiusLevel: normalizeEnum(src.radiusLevel, allowedLayoutOptions.radiusLevel, defaultLayoutOptions.radiusLevel),
                showListDivider: normalizeBool(src.showListDivider, defaultLayoutOptions.showListDivider),
                showDetailDivider: normalizeBool(src.showDetailDivider, defaultLayoutOptions.showDetailDivider),
            };
        };

        if (!template || template?.render?.rendererKey !== 'generic_table') {
            return {
                className: '',
                styleAttr: '',
                scopedCss: '',
                templateId: '',
                dataAttrs: '',
                layoutOptions: { ...defaultLayoutOptions },
            };
        }

        const styleTokens = template.render?.styleTokens && typeof template.render.styleTokens === 'object'
            ? template.render.styleTokens
            : {};

        const safeVarEntries = Object.entries(styleTokens)
            .map(([rawKey, rawValue]) => {
                const varName = toVarName(rawKey);
                const value = String(rawValue ?? '').trim();
                if (!varName || !value) return null;
                if (/[<>]/.test(value)) return null;
                return [`--${varName}`, value];
            })
            .filter(Boolean);

        const styleAttr = safeVarEntries
            .map(([name, value]) => `${name}: ${escapeHtmlAttr(value)};`)
            .join(' ');

        const templateId = String(template.id || '').trim() || 'generic';
        const safeTemplateIdForClass = templateId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const className = `phone-generic-template-scope phone-generic-template-${safeTemplateIdForClass}`;
        const layoutOptions = normalizeLayoutOptions(template.render?.layoutOptions);

        const dataAttrEntries = [
            ['data-generic-view-mode', String(viewMode || 'list').trim() || 'list'],
            ['data-layout-page-mode', layoutOptions.pageMode],
            ['data-layout-nav-mode', layoutOptions.navMode],
            ['data-layout-list-container-mode', layoutOptions.listContainerMode],
            ['data-layout-list-item-mode', layoutOptions.listItemMode],
            ['data-layout-list-meta-mode', layoutOptions.listMetaMode],
            ['data-layout-detail-container-mode', layoutOptions.detailContainerMode],
            ['data-layout-detail-field-layout', layoutOptions.detailFieldLayout],
            ['data-layout-detail-group-mode', layoutOptions.detailGroupMode],
            ['data-layout-action-bar-mode', layoutOptions.actionBarMode],
            ['data-layout-button-shape', layoutOptions.buttonShape],
            ['data-layout-button-size', layoutOptions.buttonSize],
            ['data-layout-density', layoutOptions.density],
            ['data-layout-shadow-level', layoutOptions.shadowLevel],
            ['data-layout-radius-level', layoutOptions.radiusLevel],
            ['data-layout-show-list-divider', layoutOptions.showListDivider ? '1' : '0'],
            ['data-layout-show-detail-divider', layoutOptions.showDetailDivider ? '1' : '0'],
        ];

        const dataAttrs = dataAttrEntries
            .map(([name, value]) => `${name}="${escapeHtmlAttr(String(value || ''))}"`)
            .join(' ');

        const customCss = String(template.render?.customCss || '').trim();
        const scopedCss = customCss
            ? buildScopedCustomCss(customCss, `.phone-generic-template-${safeTemplateIdForClass}`)
            : '';

        return {
            className,
            styleAttr,
            scopedCss,
            templateId,
            dataAttrs,
            layoutOptions,
        };
    };

    const renderListPage = () => {
        state.lockState = getTableLockState(sheetKey);

        const rowCount = rows.length;
        const lockRows = new Set((state.lockState?.rows || []).filter(Number.isInteger));
        const deletingAny = state.deletingRowIndex >= 0;

        const genericStylePayload = getGenericTemplateStylePayload('list');

        container.innerHTML = `
            <div class="phone-app-page phone-generic-root ${genericStylePayload.className}" data-generic-template-id="${escapeHtmlAttr(genericStylePayload.templateId)}" ${genericStylePayload.dataAttrs} style="${genericStylePayload.styleAttr}">
                ${genericStylePayload.scopedCss ? `<style class="phone-generic-template-inline-style">${genericStylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar phone-generic-slot-nav">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(tableName)}</span>
                    ${rowCount > 0
                        ? `<div class="phone-table-manage-actions phone-generic-slot-actions">
                            <button type="button" class="phone-settings-btn phone-table-lock-manage-btn ${state.lockManageMode ? 'active' : ''}" id="phone-table-lock-manage-btn">${state.lockManageMode ? '完成' : '锁定'}</button>
                            <button type="button" class="phone-settings-btn phone-table-delete-manage-btn ${state.deleteManageMode ? 'active' : ''}" id="phone-table-delete-manage-btn">${state.deleteManageMode ? '完成' : '删除'}</button>
                        </div>`
                        : ''}
                </div>
                <div class="phone-app-body phone-table-body phone-generic-slot-body">
                    ${rowCount === 0 ? `
                        <div class="phone-empty-msg">此表格暂无数据</div>
                    ` : `
                        <div class="phone-nav-list phone-generic-slot-list">
                            ${rows.map((row, rowIndex) => {
                                const entryTitle = getRowEntryTitle(row);
                                const nonEmptyCount = countNonEmptyInRow(row);
                                const rowLocked = lockRows.has(rowIndex);
                                const deletingCurrent = state.deletingRowIndex === rowIndex;
                                const deleteDisabled = rowLocked || deletingAny;

                                return `
                                    <button type="button" class="phone-nav-list-item phone-generic-slot-list-item ${rowLocked ? 'is-row-locked' : ''}" data-row-index="${rowIndex}">
                                        <span class="phone-nav-list-main phone-generic-slot-list-main">${escapeHtml(entryTitle)}</span>
                                        <span class="phone-nav-list-side phone-generic-slot-list-side">
                                            <span class="phone-nav-list-meta phone-generic-slot-list-meta">${nonEmptyCount} 项</span>
                                            ${state.lockManageMode
                                                ? `<span class="phone-row-lock-chip ${rowLocked ? 'locked' : ''}" data-row-lock="${rowIndex}" role="button" tabindex="0">${rowLocked ? '已锁定' : '锁定'}</span>`
                                                : state.deleteManageMode
                                                    ? `<span class="phone-row-delete-chip ${rowLocked ? 'locked' : ''} ${deletingCurrent ? 'pending' : ''} ${deleteDisabled ? 'disabled' : ''}" data-row-delete="${rowIndex}" role="button" tabindex="0" aria-disabled="${deleteDisabled ? 'true' : 'false'}">${rowLocked ? '已锁定' : (deletingCurrent ? '删除中...' : '删除')}</span>`
                                                    : `<span class="phone-nav-list-arrow phone-generic-slot-list-arrow">›</span>`
                                            }
                                        </span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

        bindWheelBridge(container);

        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        container.querySelector('#phone-table-lock-manage-btn')?.addEventListener('click', () => {
            state.lockManageMode = !state.lockManageMode;
            if (state.lockManageMode) {
                state.deleteManageMode = false;
            }
            renderKeepScroll();
        });

        container.querySelector('#phone-table-delete-manage-btn')?.addEventListener('click', () => {
            state.deleteManageMode = !state.deleteManageMode;
            if (state.deleteManageMode) {
                state.lockManageMode = false;
            }
            renderKeepScroll();
        });

        const bindToggleRowLock = (el) => {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const idx = Number(el.getAttribute('data-row-lock'));
                if (Number.isNaN(idx)) return;

                const nextLocked = !isTableRowLocked(sheetKey, idx);
                const ok = setTableRowLock(sheetKey, idx, nextLocked);
                if (!ok) {
                    showInlineToast(container, '锁定切换失败');
                    return;
                }
                state.lockState = getTableLockState(sheetKey);
                showInlineToast(container, nextLocked ? '条目已锁定' : '条目已解锁');
                renderKeepScroll();
            });

            el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    el.click();
                }
            });
        };

        const bindDeleteRow = (el) => {
            el.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                if (state.deletingRowIndex >= 0) return;

                const idx = Number(el.getAttribute('data-row-delete'));
                if (Number.isNaN(idx)) return;

                if (isTableRowLocked(sheetKey, idx)) {
                    showInlineToast(container, '删除失败：条目已锁定');
                    return;
                }

                state.deletingRowIndex = idx;
                renderKeepScroll();

                try {
                    const ok = await deleteRowFromList(idx);
                    if (ok) {
                        showInlineToast(container, '删除成功');
                    }
                } catch (err) {
                    showInlineToast(container, `删除异常: ${err?.message || '未知错误'}`);
                } finally {
                    state.deletingRowIndex = -1;
                    state.lockState = getTableLockState(sheetKey);
                    renderKeepScroll();
                }
            });

            el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    el.click();
                }
            });
        };

        container.querySelectorAll('[data-row-lock]').forEach(bindToggleRowLock);
        container.querySelectorAll('[data-row-delete]').forEach(bindDeleteRow);

        container.querySelectorAll('.phone-nav-list-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.rowIndex);
                if (Number.isNaN(idx)) return;

                if (state.lockManageMode || state.deleteManageMode) return;

                captureListScroll();
                state.mode = 'detail';
                state.rowIndex = idx;
                state.editMode = false;
                state.draftValues = {};
                render();
            });
        });
    };

    const renderDetailPage = () => {
        const row = rows[state.rowIndex];
        if (!row) {
            state.mode = 'list';
            state.rowIndex = -1;
            state.editMode = false;
            state.draftValues = {};
            render();
            return;
        }

        state.lockState = getTableLockState(sheetKey);

        const title = getRowEntryTitle(row);
        const rowIndexForLock = state.rowIndex;
        const rowLocked = isTableRowLocked(sheetKey, rowIndexForLock);

        const firstRawHeader = String(rawHeaders[0] ?? '').trim();
        const firstRawValue = row?.[0];
        const shouldHideLeadingPlaceholder = firstRawHeader === '' && String(firstRawValue ?? '').trim() === '';

        const toLockColIndex = (rawColIndex) => {
            const idx = Number(rawColIndex);
            if (!Number.isInteger(idx) || idx < 0) return -1;
            return shouldHideLeadingPlaceholder ? idx - 1 : idx;
        };

        const kvPairs = headers
            .map((header, rawColIndex) => {
                const rawValue = row?.[rawColIndex];
                const originValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
                const draftValue = Object.prototype.hasOwnProperty.call(state.draftValues, rawColIndex)
                    ? String(state.draftValues[rawColIndex] ?? '')
                    : originValue;
                const rawHeader = String(rawHeaders[rawColIndex] ?? '').trim();
                const isPlaceholderCol = shouldHideLeadingPlaceholder && rawColIndex === 0 && rawHeader === '' && originValue.trim() === '';

                if (isPlaceholderCol) return null;

                const lockColIndex = toLockColIndex(rawColIndex);
                const cellLocked = lockColIndex >= 0 && isTableCellLocked(sheetKey, rowIndexForLock, lockColIndex);

                return {
                    key: header,
                    value: draftValue,
                    originValue,
                    rawColIndex,
                    lockColIndex,
                    isLocked: rowLocked || cellLocked,
                    cellLocked,
                };
            })
            .filter(Boolean);

        const genericStylePayload = getGenericTemplateStylePayload('detail');

        container.innerHTML = `
            <div class="phone-app-page phone-generic-root ${genericStylePayload.className}" data-generic-template-id="${escapeHtmlAttr(genericStylePayload.templateId)}" ${genericStylePayload.dataAttrs} style="${genericStylePayload.styleAttr}">
                ${genericStylePayload.scopedCss ? `<style class="phone-generic-template-inline-style">${genericStylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar phone-generic-slot-nav">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(title)}</span>
                </div>
                <div class="phone-app-body phone-table-body phone-generic-slot-body">
                    <div class="phone-table-detail-actions phone-generic-slot-actions">
                        <button type="button" class="phone-settings-btn" id="phone-toggle-edit-mode">${state.editMode ? '退出编辑' : '进入编辑'}</button>
                        <button type="button" class="phone-settings-btn" id="phone-save-row" ${state.editMode && !rowLocked ? '' : 'disabled'}>${state.saving ? '保存中...' : '保存'}</button>
                        <span class="phone-table-detail-lock-hint">字段锁定</span>
                    </div>
                    <div class="phone-row-detail-card phone-generic-slot-detail">
                        ${kvPairs.map(pair => `
                            <div class="phone-row-detail-kv phone-generic-slot-detail-field ${pair.isLocked ? 'is-locked' : ''}" data-col-index="${pair.rawColIndex}">
                                <span class="phone-row-detail-key">${escapeHtml(pair.key)}</span>
                                ${state.editMode
                                    ? `<textarea class="phone-row-detail-input" data-input-col="${pair.rawColIndex}" ${pair.isLocked ? 'disabled' : ''}>${escapeHtml(pair.value)}</textarea>`
                                    : `<span class="phone-row-detail-value">${escapeHtml(pair.value || '—')}</span>`
                                }
                                <div class="phone-row-detail-tools phone-generic-slot-detail-tools">
                                    <button type="button" class="phone-cell-lock-btn ${pair.cellLocked ? 'locked' : ''}" data-cell-lock="${pair.lockColIndex}" data-cell-raw="${pair.rawColIndex}" ${rowLocked ? 'disabled' : ''}>${pair.cellLocked ? '已锁定' : '锁定'}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        bindWheelBridge(container);

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'list';
            state.rowIndex = -1;
            state.editMode = false;
            state.draftValues = {};
            render();
            restoreListScroll();
        });

        container.querySelector('#phone-toggle-edit-mode')?.addEventListener('click', () => {
            if (rowLocked && !state.editMode) {
                showInlineToast(container, '当前条目已锁定，无法编辑');
                return;
            }
            state.editMode = !state.editMode;
            if (!state.editMode) {
                state.draftValues = {};
            }
            renderKeepScroll();
        });

        const bindToggleCellLock = (el) => {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                const lockColIndex = Number(el.getAttribute('data-cell-lock'));
                const rawColIndex = Number(el.getAttribute('data-cell-raw'));
                if (Number.isNaN(lockColIndex) || lockColIndex < 0) return;

                if (isTableRowLocked(sheetKey, rowIndexForLock)) {
                    showInlineToast(container, '当前条目已锁定，无法切换字段锁');
                    return;
                }

                const nextLocked = !isTableCellLocked(sheetKey, rowIndexForLock, lockColIndex);
                const ok = setTableCellLock(sheetKey, rowIndexForLock, lockColIndex, nextLocked);
                if (!ok) {
                    showInlineToast(container, '字段锁定切换失败');
                    return;
                }

                state.lockState = getTableLockState(sheetKey);
                if (nextLocked && state.editMode && Number.isInteger(rawColIndex)) {
                    delete state.draftValues[rawColIndex];
                }
                showInlineToast(container, nextLocked ? '字段已锁定' : '字段已解锁');
                renderKeepScroll();
            });
        };

        container.querySelectorAll('[data-cell-lock]').forEach(bindToggleCellLock);

        container.querySelectorAll('[data-input-col]').forEach(inputEl => {
            inputEl.addEventListener('input', () => {
                const colIndex = Number(inputEl.getAttribute('data-input-col'));
                if (Number.isNaN(colIndex)) return;
                state.draftValues[colIndex] = inputEl.value;
            });
        });

        container.querySelector('#phone-save-row')?.addEventListener('click', async () => {
            if (!state.editMode || state.saving || rowLocked) return;

            state.saving = true;
            renderKeepScroll();

            try {
                const latest = getTableData();
                const targetSheet = latest?.[sheetKey];
                if (!targetSheet?.content || !Array.isArray(targetSheet.content)) {
                    showInlineToast(container, '保存失败：表格不存在');
                    return;
                }

                const realRowIndex = state.rowIndex + 1; // content[0] 是 header
                const targetRow = targetSheet.content[realRowIndex];
                if (!Array.isArray(targetRow)) {
                    showInlineToast(container, '保存失败：行不存在');
                    return;
                }

                if (isTableRowLocked(sheetKey, rowIndexForLock)) {
                    showInlineToast(container, '保存失败：条目已锁定');
                    return;
                }

                const updatedRow = [...targetRow];
                Object.entries(state.draftValues).forEach(([colKey, draft]) => {
                    const rawColIndex = Number(colKey);
                    if (Number.isNaN(rawColIndex)) return;

                    const lockColIndex = toLockColIndex(rawColIndex);
                    if (lockColIndex < 0) return;
                    if (isTableCellLocked(sheetKey, rowIndexForLock, lockColIndex)) return;

                    updatedRow[rawColIndex] = draft;
                });

                targetSheet.content[realRowIndex] = updatedRow;

                const ok = await saveTableData(latest);
                if (!ok) {
                    showInlineToast(container, '保存失败：API回写失败');
                    return;
                }

                rows[state.rowIndex] = updatedRow;
                state.draftValues = {};
                state.editMode = false;
                showInlineToast(container, '保存成功');
            } catch (err) {
                showInlineToast(container, `保存异常: ${err?.message || '未知错误'}`);
            } finally {
                state.saving = false;
                renderKeepScroll();
            }
        });

    };

    render();
}

function showInlineToast(container, msg) {
    const root = container.querySelector('.phone-app-page') || container;
    const existed = root.querySelector('.phone-inline-toast');
    if (existed) existed.remove();

    const el = document.createElement('div');
    el.className = 'phone-inline-toast';
    el.textContent = String(msg || '');
    root.appendChild(el);

    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 220);
    }, 1400);
}

function getPhoneBody(container) {
    return container.querySelector('.phone-app-body');
}

function bindWheelBridge(container) {
    // 兼容旧调用点：统一滚动逻辑已迁移到 phone-core
    bindPhoneScrollGuards(container);
}

function createSpecialTemplateStylePayload(templateMatch, specialType, viewMode = 'list') {
    const template = resolveTemplateWithDraftForViewer(templateMatch?.template);
    const specialTypeSafe = String(specialType || '').trim() || 'message';

    const defaultStyleOptions = normalizeSpecialStyleOptionsForViewer({}, specialTypeSafe);

    if (!template || !template.render) {
        return {
            className: `${SPECIAL_SCOPE_CLASS} phone-special-template-default`,
            styleAttr: '',
            scopedCss: '',
            templateId: '',
            styleOptions: defaultStyleOptions,
            dataAttrs: `data-special-type="${escapeHtmlAttr(specialTypeSafe)}" data-special-view-mode="${escapeHtmlAttr(String(viewMode || 'list').trim() || 'list')}"`,
        };
    }

    const toVarName = (key) => String(key || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/^([^a-zA-Z_])/, '_$1');

    const styleTokens = template.render?.styleTokens && typeof template.render.styleTokens === 'object'
        ? template.render.styleTokens
        : {};

    const styleOptions = normalizeSpecialStyleOptionsForViewer(template.render?.styleOptions, specialTypeSafe);

    const safeVarEntries = Object.entries(styleTokens)
        .map(([rawKey, rawValue]) => {
            const varName = toVarName(rawKey);
            const value = String(rawValue ?? '').trim();
            if (!varName || !value) return null;
            if (/[<>]/.test(value)) return null;
            return [`--${varName}`, value];
        })
        .filter(Boolean);

    const styleOptionCssEntries = [
        ['--sp-opt-bubble-max-width-pct', `${Number(styleOptions.bubbleMaxWidthPct || 80)}%`],
        ['--sp-opt-avatar-radius',
            styleOptions.avatarShape === 'square'
                ? '0px'
                : (styleOptions.avatarShape === 'rounded' ? '10px' : '999px')],
    ];

    const styleAttr = [...safeVarEntries, ...styleOptionCssEntries]
        .map(([name, value]) => `${name}: ${escapeHtmlAttr(String(value || ''))};`)
        .join(' ');

    const templateId = String(template.id || '').trim();
    const safeTemplateIdForClass = templateId
        ? templateId.replace(/[^a-zA-Z0-9_-]/g, '_')
        : 'default';

    const className = `${SPECIAL_SCOPE_CLASS} phone-special-template-${safeTemplateIdForClass}`;

    const dataAttrEntries = [
        ['data-special-template-id', templateId],
        ['data-special-renderer-key', String(template.render?.rendererKey || '').trim()],
        ['data-special-type', specialTypeSafe],
        ['data-special-view-mode', String(viewMode || 'list').trim() || 'list'],
        ['data-style-density', String(styleOptions.density || '')],
        ['data-style-reply-mode', String(styleOptions.replyOptionMode || '')],
        ['data-style-stats-mode', String(styleOptions.statsMode || '')],
    ];

    const dataAttrs = dataAttrEntries
        .filter(([name]) => !!name)
        .map(([name, value]) => `${name}="${escapeHtmlAttr(String(value || ''))}"`)
        .join(' ');

    const customCss = String(template.render?.customCss || '').trim();
    const scopedCss = customCss
        ? buildScopedCustomCss(customCss, `.phone-special-template-${safeTemplateIdForClass}`)
        : '';

    return {
        className,
        styleAttr,
        scopedCss,
        templateId,
        dataAttrs,
        styleOptions,
    };
}

function renderSpecialTableViewer(container, context) {
    const { sheetKey, tableName, rows, headers, type, templateMatch } = context;

    if (type === 'message') {
        renderMessageTable(container, { sheetKey, tableName, rows, headers, templateMatch, type });
        return;
    }

    renderFeedTable(container, { sheetKey, tableName, rows, headers, type, templateMatch });
}

function renderMessageTable(container, context) {
    const { sheetKey, tableName, rows, headers, templateMatch, type } = context;
    const headerMap = buildHeaderIndexMap(headers);
    const readSpecialField = createSpecialFieldReader({
        templateMatch,
        type,
        headerMap,
        sheetKey,
        tableName,
    });

    const state = {
        mode: 'conversation', // conversation | detail
        conversationId: null,
        mediaPreview: null, // { title, content }
    };

    const render = () => {
        if (state.mode === 'detail' && state.conversationId) {
            renderMessageDetail();
            return;
        }
        renderConversationList();
    };

    const renderKeepScroll = () => {
        const body = container.querySelector('.phone-app-body');
        const prevTop = body ? Math.max(0, Number(body.scrollTop) || 0) : 0;

        render();
        // 使用双重 requestAnimationFrame 确保 DOM 布局完成
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const nextBody = container.querySelector('.phone-app-body');
                if (!nextBody) return;
                const maxTop = Math.max(0, (nextBody.scrollHeight || 0) - (nextBody.clientHeight || 0));
                nextBody.scrollTop = Math.min(prevTop, maxTop);
            });
        });
    };

    const closeMediaPreview = () => {
        state.mediaPreview = null;
        renderKeepScroll();
    };

    const renderConversationList = () => {
        const stylePayload = createSpecialTemplateStylePayload(templateMatch, type, 'conversation');
        const conversations = buildConversations(rows, readSpecialField, stylePayload.styleOptions);
        const showAvatar = stylePayload.styleOptions.showAvatar !== false;
        const titleMode = 'sender';
        const emptyConversationText = String(stylePayload.styleOptions.emptyConversationText || '暂无消息');
        const timeFallbackText = String(stylePayload.styleOptions.timeFallbackText || '刚刚');

        container.innerHTML = `
            <div class="phone-app-page phone-special-app phone-special-message ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
                ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(tableName)}</span>
                </div>
                <div class="phone-app-body phone-table-body">
                    ${conversations.length === 0
                        ? `<div class="phone-empty-msg">${escapeHtml(emptyConversationText)}</div>`
                        : `<div class="phone-special-conversation-list">
                            ${conversations.map(conv => {
                                const displayName = resolveConversationDisplayName(conv, titleMode);
                                return `
                                    <button type="button" class="phone-special-conversation-item" data-conv-id="${escapeHtmlAttr(conv.id)}">
                                        ${showAvatar
                                            ? `<span class="phone-special-conversation-avatar" style="background-color:${escapeHtmlAttr(generateColor(displayName))};">${escapeHtml(getAvatarText(displayName))}</span>`
                                            : ''}
                                        <span class="phone-special-conversation-info">
                                            <span class="phone-special-conversation-name">${escapeHtml(displayName)}</span>
                                            <span class="phone-special-conversation-last">${escapeHtml(conv.lastMessage || '...')}</span>
                                        </span>
                                        <span class="phone-special-conversation-meta">${escapeHtml(formatTimeLike(conv.lastTime) || timeFallbackText)}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>`
                    }
                </div>
            </div>
        `;

        bindWheelBridge(container);

        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        container.querySelectorAll('.phone-special-conversation-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const convId = String(btn.dataset.convId || '').trim();
                if (!convId) return;
                state.mode = 'detail';
                state.conversationId = convId;
                state.mediaPreview = null;
                render();
            });
        });
    };

    const renderMessageDetail = () => {
        const conversationId = String(state.conversationId || 'default_thread').trim() || 'default_thread';
        const rowsInConv = rows.filter((row, rowIndex) => {
            const fallbackConversationId = `default_thread_${rowIndex + 1}`;
            const rowConversationId = String(readSpecialField(row, 'threadId', fallbackConversationId) || fallbackConversationId).trim() || fallbackConversationId;
            return rowConversationId === conversationId;
        });
        const stylePayload = createSpecialTemplateStylePayload(templateMatch, type, 'detail');
        const emptyDetailText = String(stylePayload.styleOptions.emptyDetailText || '该会话暂无消息');
        const allConversations = buildConversations(rows, readSpecialField, stylePayload.styleOptions);
        const currentConversation = allConversations.find((conv) => conv.id === conversationId);
        const detailTitle = currentConversation
            ? (currentConversation.latestSender || resolveConversationDisplayName(currentConversation, 'sender') || tableName)
            : tableName;

        container.innerHTML = `
            <div class="phone-app-page phone-special-app phone-special-message ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
                ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(detailTitle || tableName)}</span>
                </div>
                <div class="phone-app-body phone-table-body">
                    <div class="phone-special-message-list">
                        ${rowsInConv.length === 0 ? `<div class="phone-empty-msg">${escapeHtml(emptyDetailText)}</div>` : rowsInConv.map((row, messageIndex) => renderOneMessageRow({
                            row,
                            readSpecialField,
                            conversationId,
                            sheetKey,
                            messageIndex,
                            styleOptions: stylePayload.styleOptions,
                        })).join('')}
                    </div>
                </div>
                ${state.mediaPreview ? renderInPhoneMediaPreview(state.mediaPreview.title, state.mediaPreview.content) : ''}
            </div>
        `;

        bindWheelBridge(container);

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'conversation';
            state.conversationId = null;
            state.mediaPreview = null;
            render();
        });

        container.querySelectorAll('.phone-special-reply-option-item').forEach(optionEl => {
            optionEl.addEventListener('click', () => {
                const choiceId = String(optionEl.dataset.choiceId || '');
                const choiceIndex = Number(optionEl.dataset.choiceIndex);
                if (!choiceId || Number.isNaN(choiceIndex)) return;
                setSavedChoice(choiceId, choiceIndex);
                renderKeepScroll();
            });
        });

        container.querySelectorAll('.phone-special-reply-reset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const choiceId = String(btn.dataset.choiceId || '');
                if (!choiceId) return;
                clearSavedChoice(choiceId);
                renderKeepScroll();
            });
        });

        container.querySelectorAll('.phone-special-media-item').forEach(mediaEl => {
            mediaEl.addEventListener('click', () => {
                const desc = normalizeMediaDesc(mediaEl.dataset.description);
                if (!desc) return;
                const title = String(mediaEl.dataset.mediaLabel || '媒体内容').trim() || '媒体内容';
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

    render();
}

function renderOneMessageRow({ row, readSpecialField, conversationId, sheetKey, messageIndex, styleOptions = {} }) {
    const sender = normalizeSenderName(readSpecialField(row, 'sender', '')) || '';
    const content = readSpecialField(row, 'content', '') || '';
    const time = readSpecialField(row, 'sentAt', '');
    const imageDesc = normalizeMediaDesc(readSpecialField(row, 'imageDesc', ''));
    const videoDesc = normalizeMediaDesc(readSpecialField(row, 'videoDesc', ''));

    const isSelf = sender === '我';
    const senderLabel = isSelf ? '我' : (sender || '对方');
    const senderColor = isSelf ? '#4A90E2' : generateColor(senderLabel);

    const showAvatar = styleOptions.showAvatar !== false;
    const showMessageTime = styleOptions.showMessageTime !== false;
    const showReplyReset = styleOptions.showReplyReset !== false;
    const mediaActionTextMode = String(styleOptions.mediaActionTextMode || 'short');

    const emptyMessageText = String(styleOptions.emptyMessageText || '（空消息）');
    const timeFallbackText = String(styleOptions.timeFallbackText || '刚刚');
    const bubbleMaxWidthPct = Math.max(48, Math.min(96, Number(styleOptions.bubbleMaxWidthPct || 80)));
    const bubbleInlineStyle = `max-width:${bubbleMaxWidthPct}%;`;

    const baseMessageHtml = `
        <div class="phone-special-message-item ${isSelf ? 'self' : 'other'}">
            ${showAvatar
                ? `<div class="phone-special-name-avatar" style="background-color:${escapeHtmlAttr(senderColor)};">${escapeHtml(getAvatarText(senderLabel))}</div>`
                : ''}
            <div class="phone-special-message-bubble-wrap">
                <div class="phone-special-message-bubble" style="${escapeHtmlAttr(bubbleInlineStyle)}">${escapeHtml(content || emptyMessageText)}</div>
                ${showMessageTime ? `<div class="phone-special-message-time">${escapeHtml(formatTimeLike(time) || timeFallbackText)}</div>` : ''}
            </div>
        </div>
    `;

    const mediaItems = [];
    if (imageDesc) {
        mediaItems.push({
            label: '图片内容',
            text: imageDesc,
            actionText: mediaActionTextMode === 'detailed' ? '点击查看图片详情' : '点击查看图片',
        });
    }
    if (videoDesc) {
        mediaItems.push({
            label: '视频内容',
            text: videoDesc,
            actionText: mediaActionTextMode === 'detailed' ? '点击查看视频详情' : '点击查看视频',
        });
    }

    const mediaHtml = mediaItems.map(item => `
        <div class="phone-special-message-item ${isSelf ? 'self' : 'other'} media-row">
            ${isSelf || !showAvatar ? '' : '<div class="phone-special-message-media-placeholder"></div>'}
            <div class="phone-special-message-bubble phone-special-media-item" style="${escapeHtmlAttr(bubbleInlineStyle)}" data-media-label="${escapeHtmlAttr(item.label)}" data-description="${escapeHtmlAttr(item.text)}">
                ${escapeHtml(item.actionText)}
            </div>
        </div>
    `).join('');

    if (isSelf) {
        return `${baseMessageHtml}${mediaHtml}`;
    }

    const replyOptionMode = String(styleOptions.replyOptionMode || 'auto');

    const replyOptions = [
        readSpecialField(row, 'playerReply1', ''),
        readSpecialField(row, 'playerReply2', ''),
        readSpecialField(row, 'playerReply3', ''),
    ];
    const opponentReplies = [
        readSpecialField(row, 'counterReply1', ''),
        readSpecialField(row, 'counterReply2', ''),
        readSpecialField(row, 'counterReply3', ''),
    ];

    const choiceId = `msg_${sheetKey}_${conversationId}_${messageIndex}`;
    const chosenIndex = getSavedChoice(choiceId);
    const hasOption = replyOptions.some(Boolean);
    const canShowOptions = replyOptionMode !== 'hidden' && (hasOption || replyOptionMode === 'always');

    if (!canShowOptions) {
        return `${baseMessageHtml}${mediaHtml}`;
    }

    if (Number.isInteger(chosenIndex) && chosenIndex >= 0 && chosenIndex <= 2) {
        const chosenOptionText = replyOptions[chosenIndex] || '';
        const chosenOpponentText = opponentReplies[chosenIndex] || '';

        const selfReplyHtml = chosenOptionText
            ? `
                <div class="phone-special-message-item self">
                    ${showAvatar ? '<div class="phone-special-name-avatar" style="background-color:#4A90E2;">我</div>' : ''}
                    <div class="phone-special-message-bubble-wrap">
                        <div class="phone-special-message-bubble" style="${escapeHtmlAttr(bubbleInlineStyle)}">${escapeHtml(chosenOptionText)}</div>
                        ${showMessageTime ? `<div class="phone-special-message-time">${escapeHtml(formatTimeLike(new Date().toISOString()) || timeFallbackText)}</div>` : ''}
                    </div>
                </div>
            `
            : '';

        const opponentReplyHtml = chosenOpponentText
            ? `
                <div class="phone-special-message-item other">
                    ${showAvatar ? `<div class="phone-special-name-avatar" style="background-color:${escapeHtmlAttr(generateColor(senderLabel))};">${escapeHtml(getAvatarText(senderLabel))}</div>` : ''}
                    <div class="phone-special-message-bubble-wrap">
                        <div class="phone-special-message-bubble" style="${escapeHtmlAttr(bubbleInlineStyle)}">${escapeHtml(chosenOpponentText)}</div>
                        ${showMessageTime ? `<div class="phone-special-message-time">${escapeHtml(formatTimeLike(new Date().toISOString()) || timeFallbackText)}</div>` : ''}
                    </div>
                </div>
            `
            : '';

        const resetReplyHtml = showReplyReset
            ? `
                <div class="phone-special-reply-actions">
                    <button type="button" class="phone-special-reply-reset-btn" data-choice-id="${escapeHtmlAttr(choiceId)}">重新回复</button>
                </div>
            `
            : '';

        return `${baseMessageHtml}${mediaHtml}${selfReplyHtml}${opponentReplyHtml}${resetReplyHtml}`;
    }

    const optionsHtml = `
        <div class="phone-special-reply-options-container">
            ${replyOptions.map((opt, index) => {
                if (!opt) return '';
                return `<div class="phone-special-reply-option-item" data-choice-id="${escapeHtmlAttr(choiceId)}" data-choice-index="${index}">${escapeHtml(opt)}</div>`;
            }).join('')}
        </div>
    `;

    return `${baseMessageHtml}${mediaHtml}${optionsHtml}`;
}

function renderFeedTable(container, context) {
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
    };

    const closeMediaPreview = () => {
        state.mediaPreview = null;
        renderKeepScroll();
    };

    const render = () => {
        const stylePayload = createSpecialTemplateStylePayload(templateMatch, type, 'list');
        const feedOrder = String(stylePayload.styleOptions.feedOrder || 'desc');
        const rowsForRender = feedOrder === 'asc' ? rows.slice() : rows.slice().reverse();
        const emptyFeedText = String(stylePayload.styleOptions.emptyFeedText || '暂无内容');

        container.innerHTML = `
            <div class="phone-app-page phone-special-app ${type === 'forum' ? 'phone-special-forum' : 'phone-special-moments'} ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
                ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(tableName)}</span>
                </div>
                <div class="phone-app-body phone-table-body">
                    <div class="phone-special-moments-list">
                        ${rowsForRender.length === 0 ? `<div class="phone-empty-msg">${escapeHtml(emptyFeedText)}</div>` : rowsForRender.map((row, index) => renderFeedItem({
                            row,
                            rowIndex: index,
                            sheetKey,
                            type,
                            readSpecialField,
                            styleOptions: stylePayload.styleOptions,
                        })).join('')}
                    </div>
                </div>
                ${state.mediaPreview ? renderInPhoneMediaPreview(state.mediaPreview.title, state.mediaPreview.content) : ''}
            </div>
        `;

        bindWheelBridge(container);

        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        container.querySelectorAll('.phone-special-reply-option-item').forEach(optionEl => {
            optionEl.addEventListener('click', () => {
                const choiceId = String(optionEl.dataset.choiceId || '');
                const choiceIndex = Number(optionEl.dataset.choiceIndex);
                if (!choiceId || Number.isNaN(choiceIndex)) return;
                setSavedChoice(choiceId, choiceIndex);
                renderKeepScroll();
            });
        });

        container.querySelectorAll('.phone-special-reply-reset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const choiceId = String(btn.dataset.choiceId || '');
                if (!choiceId) return;
                clearSavedChoice(choiceId);
                renderKeepScroll();
            });
        });

        container.querySelectorAll('.phone-special-media-item').forEach(mediaEl => {
            mediaEl.addEventListener('click', () => {
                const desc = normalizeMediaDesc(mediaEl.dataset.description);
                if (!desc) return;
                const title = String(mediaEl.dataset.mediaLabel || '媒体内容').trim() || '媒体内容';
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

    const renderKeepScroll = () => {
        const body = container.querySelector('.phone-app-body');
        const prevTop = body ? Math.max(0, Number(body.scrollTop) || 0) : 0;

        render();
        // 使用双重 requestAnimationFrame 确保 DOM 布局完成
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const nextBody = container.querySelector('.phone-app-body');
                if (!nextBody) return;
                const maxTop = Math.max(0, (nextBody.scrollHeight || 0) - (nextBody.clientHeight || 0));
                nextBody.scrollTop = Math.min(prevTop, maxTop);
            });
        });
    };

    render();
}

function renderFeedItem({ row, rowIndex, sheetKey, type, readSpecialField, styleOptions = {} }) {
    const poster = type === 'forum'
        ? (readSpecialField(row, 'poster', '') || '匿名网友')
        : (readSpecialField(row, 'poster', '') || '未知用户');

    const protagonistName = type === 'forum'
        ? (readSpecialField(row, 'protagonistName', '') || '我')
        : '我';

    const title = readSpecialField(row, 'title', '') || '无标题';
    const content = readSpecialField(row, 'postContent', '') || '';
    const postTime = readSpecialField(row, 'postTime', '');

    const likes = Number.parseInt(readSpecialField(row, 'likes', '0') || '0', 10);
    const shares = Number.parseInt(readSpecialField(row, 'shares', '0') || '0', 10);
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

    const statsHtml = statsMode === 'hidden'
        ? ''
        : (statsMode === 'compact'
            ? `<div class="phone-special-moment-stats"><span>互动 ${Number.isNaN(likes) ? 0 : likes}/${Number.isNaN(commentCount) ? 0 : commentCount}/${Number.isNaN(shares) ? 0 : shares}</span></div>`
            : `<div class="phone-special-moment-stats">
                <span>点赞 ${Number.isNaN(likes) ? 0 : likes}</span>
                <span>评论 ${Number.isNaN(commentCount) ? 0 : commentCount}</span>
                <span>转发 ${Number.isNaN(shares) ? 0 : shares}</span>
            </div>`);

    return `
        <div class="phone-special-moment-item">
            ${type === 'forum'
                ? `
                    <div class="phone-special-moment-title forum">${escapeHtml(title)}</div>
                    <div class="phone-special-moment-meta forum">${escapeHtml(forumMetaPrefix)} ${escapeHtml(poster)} 发布</div>
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
                `
            }
            <div class="phone-special-moment-content">${escapeHtml(content || emptyContentText)}</div>
            ${mediaHtml}
            ${statsHtml}
            <div class="phone-special-comments-section">
                ${comments.length > 0
                    ? comments.map(c => `<div class="phone-special-comment"><div class="phone-special-comment-author-row"><span class="phone-special-comment-author">${escapeHtml(c.author)}</span></div><div class="phone-special-comment-text">${escapeHtml(c.text)}</div></div>`).join('')
                    : `<div class="phone-special-comment">${escapeHtml(commentEmptyText)}</div>`
                }
            </div>
            ${optionsHtml}
            ${resetReplyHtml}
        </div>
    `;
}

function buildConversations(rows, readSpecialField, styleOptions = {}) {
    const conversations = {};

    rows.forEach((row, rowIndex) => {
        const id = String(readSpecialField(row, 'threadId', `default_thread_${rowIndex + 1}`) || `default_thread_${rowIndex + 1}`)
            .trim() || `default_thread_${rowIndex + 1}`;

        const sender = normalizeSenderName(readSpecialField(row, 'sender', ''));
        const content = readSpecialField(row, 'content', '') || '...';
        const time = readSpecialField(row, 'sentAt', '');
        const threadTitle = String(readSpecialField(row, 'threadTitle', '') || '').trim();
        const threadSubtitle = String(readSpecialField(row, 'threadSubtitle', '') || '').trim();

        if (!conversations[id]) {
            conversations[id] = {
                id,
                threadTitle,
                threadSubtitle,
                lastMessage: content,
                lastTime: time,
                latestSender: sender || '',
                senders: new Set(),
            };
        }

        if (!conversations[id].threadTitle && threadTitle) {
            conversations[id].threadTitle = threadTitle;
        }

        if (!conversations[id].threadSubtitle && threadSubtitle) {
            conversations[id].threadSubtitle = threadSubtitle;
        }

        if (sender) {
            conversations[id].senders.add(sender);
        }

        const currentTs = toTimestamp(time);
        const storedTs = toTimestamp(conversations[id]?.lastTime);

        if (currentTs >= storedTs) {
            conversations[id].lastMessage = content;
            conversations[id].lastTime = time;
            conversations[id].latestSender = sender || conversations[id].latestSender || '';
        }
    });

    const feedOrder = String(styleOptions.feedOrder || 'desc');

    const sorted = Object.values(conversations)
        .map(conv => {
            const senderList = Array.from(conv.senders || []).filter(Boolean);
            let titleSender = conv.latestSender || conv.id;
            if (!titleSender) {
                if (senderList.length === 1) {
                    titleSender = senderList[0];
                } else if (senderList.length > 1) {
                    titleSender = '群聊';
                } else {
                    titleSender = conv.id;
                }
            }

            return {
                id: conv.id,
                threadTitle: conv.threadTitle,
                threadSubtitle: conv.threadSubtitle,
                lastMessage: conv.lastMessage,
                lastTime: conv.lastTime,
                latestSender: conv.latestSender || '',
                titleSender,
            };
        })
        .sort((a, b) => toTimestamp(b.lastTime) - toTimestamp(a.lastTime));

    if (feedOrder === 'asc') {
        sorted.reverse();
    }

    return sorted;
}

function resolveConversationDisplayName(conversation, titleMode = 'auto') {
    const conv = conversation || {};
    const mode = String(titleMode || 'auto');

    if (mode === 'thread' || mode === 'titleField') {
        return conv.threadTitle || conv.latestSender || conv.titleSender || conv.id || '会话';
    }

    if (mode === 'sender') {
        return conv.latestSender || conv.titleSender || conv.threadTitle || conv.id || '会话';
    }

    return conv.latestSender || conv.threadTitle || conv.titleSender || conv.id || '会话';
}

function detectSpecialTableType(tableName) {
    const name = String(tableName || '').trim();
    return SPECIAL_TABLE_TYPES[name] || null;
}

function normalizeFieldBindingCandidatesForViewer(rawCandidates) {
    const source = Array.isArray(rawCandidates)
        ? rawCandidates
        : (rawCandidates === undefined || rawCandidates === null ? [] : [rawCandidates]);

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        const text = String(item ?? '').trim().slice(0, 80);
        if (!text) return;
        if (/[<>]/.test(text)) return;
        if (text.toLowerCase().includes('javascript:')) return;
        if (seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

function normalizeSpecialFieldBindingsForViewer(rawFieldBindings, type) {
    const defaults = DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE[type]
        || DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE.message
        || {};

    const src = rawFieldBindings && typeof rawFieldBindings === 'object' && !Array.isArray(rawFieldBindings)
        ? rawFieldBindings
        : {};

    const merged = {};
    const keys = new Set([...Object.keys(defaults), ...Object.keys(src)]);

    keys.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : defaults[fieldKey];

        const normalized = normalizeFieldBindingCandidatesForViewer(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

function normalizeViewerEnumOption(value, allowedValues, fallback) {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    return Array.isArray(allowedValues) && allowedValues.includes(text) ? text : fallback;
}

function normalizeViewerBooleanOption(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return fallback;

    if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
    return fallback;
}

function normalizeSpecialStyleOptionsForViewer(rawStyleOptions, type) {
    const defaults = DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE[type]
        || DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE.message
        || {};

    const src = rawStyleOptions && typeof rawStyleOptions === 'object' && !Array.isArray(rawStyleOptions)
        ? rawStyleOptions
        : {};

    const clampViewerNumber = (value, min, max, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    };

    const normalizeText = (value, maxLength = 80) => String(value ?? '').trim().slice(0, maxLength);

    const merged = {};

    Object.keys(defaults).forEach((optionKey) => {
        const fallbackValue = defaults[optionKey];
        const rawValue = Object.prototype.hasOwnProperty.call(src, optionKey)
            ? src[optionKey]
            : fallbackValue;

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES, optionKey)) {
            const allowed = SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES[optionKey] || [];
            merged[optionKey] = normalizeViewerEnumOption(rawValue, allowed, String(fallbackValue || ''));
            return;
        }

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_NUMERIC_RULES, optionKey)) {
            const rule = SPECIAL_STYLE_OPTION_NUMERIC_RULES[optionKey] || {};
            const min = Number.isFinite(Number(rule.min)) ? Number(rule.min) : 0;
            const max = Number.isFinite(Number(rule.max)) ? Number(rule.max) : 999;
            const fallback = Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : min;
            merged[optionKey] = clampViewerNumber(rawValue, min, max, fallback);
            return;
        }

        if (SPECIAL_STYLE_OPTION_BOOLEAN_KEYS.has(optionKey)) {
            merged[optionKey] = normalizeViewerBooleanOption(rawValue, !!fallbackValue);
            return;
        }

        const maxLength = Number.isFinite(Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey]))
            ? Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey])
            : 80;

        merged[optionKey] = normalizeText(rawValue, maxLength)
            || normalizeText(fallbackValue, maxLength);
    });

    return merged;
}

function createSpecialFieldReader({ templateMatch, type, headerMap, sheetKey, tableName }) {
    const resolvedTemplate = resolveTemplateWithDraftForViewer(templateMatch?.template);
    const rawFieldBindings = resolvedTemplate?.render?.fieldBindings;
    const rawStyleOptions = resolvedTemplate?.render?.styleOptions;

    const fieldBindings = normalizeSpecialFieldBindingsForViewer(rawFieldBindings, type);
    const styleOptions = normalizeSpecialStyleOptionsForViewer(rawStyleOptions, type);

    const safeSheetKey = String(sheetKey || '').trim();
    const safeTableName = String(tableName || '').trim();

    const readField = (row, fieldKey, fallback = '') => {
        const candidates = Array.isArray(fieldBindings[fieldKey]) ? fieldBindings[fieldKey] : [];

        for (const candidate of candidates) {
            const token = String(candidate || '').trim();
            if (!token) continue;

            if (token === '@now') {
                return new Date().toISOString();
            }

            if (token === '@sheetKey') {
                return safeSheetKey;
            }

            if (token === '@tableName') {
                return safeTableName;
            }

            if (token.startsWith('@const:')) {
                const constValue = token.slice('@const:'.length).trim();
                if (constValue) return constValue;
                continue;
            }

            const value = getCellByHeaders(row, headerMap, [token]);
            if (value !== '') {
                return value;
            }
        }

        return String(fallback ?? '');
    };

    readField.getStyleOption = (optionKey, fallback = '') => {
        if (Object.prototype.hasOwnProperty.call(styleOptions, optionKey)) {
            return styleOptions[optionKey];
        }
        return fallback;
    };

    readField.styleOptions = { ...styleOptions };

    return readField;
}

function buildHeaderIndexMap(headers) {
    const map = new Map();
    headers.forEach((h, idx) => {
        const key = String(h || '').trim();
        if (!key) return;
        if (!map.has(key)) map.set(key, idx);
    });
    return map;
}

function getCellByHeaders(row, headerMap, headerNames = []) {
    if (!Array.isArray(row)) return '';
    for (const headerName of headerNames) {
        const idx = headerMap.get(headerName);
        if (idx === undefined) continue;
        const value = row[idx];
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text !== '') return text;
    }
    return '';
}

function parseCommentPairs(rawText) {
    const input = String(rawText || '').trim();
    if (!input) return [];

    const normalized = input
        .replace(/([”’"'])\s*([^:：;；,，\n]{1,24})\s*[:：]/g, '$1;$2:')
        .replace(/；/g, ';');

    return normalized
        .split(';')
        .map(seg => String(seg || '').trim())
        .filter(Boolean)
        .map(seg => {
            const splitIndex = seg.search(/[:：]/);
            if (splitIndex < 0) {
                return {
                    author: '匿名',
                    text: seg,
                };
            }

            const author = String(seg.slice(0, splitIndex) || '匿名').trim() || '匿名';
            const text = String(seg.slice(splitIndex + 1) || '').trim();
            return { author, text };
        });
}

function normalizeMediaDesc(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const lower = text.toLowerCase();
    if (lower === 'none' || lower === 'null' || lower === 'undefined') return '';
    return text;
}

function normalizeSenderName(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    if (text === '主角') return '我';
    return text;
}

function renderInPhoneMediaPreview(title, content) {
    return `
        <div class="phone-special-media-preview-mask">
            <div class="phone-special-media-preview-modal">
                <div class="phone-special-media-preview-title">${escapeHtml(title || '媒体内容')}</div>
                <div class="phone-special-media-preview-content">${escapeHtml(content || '（无内容）')}</div>
                <button type="button" class="phone-special-media-preview-close">关闭</button>
            </div>
        </div>
    `;
}

function getSavedChoice(choiceId) {
    try {
        ensureChoiceStoreMigrated();
        const sid = String(choiceId || '').trim();
        if (!sid) return undefined;

        const sessionValue = choiceStore.get(choiceStoreSessionNs, sid);
        if (Number.isInteger(sessionValue)) return sessionValue;

        const persistentValue = choiceStore.get(choiceStorePersistentNs, sid);
        return Number.isInteger(persistentValue) ? persistentValue : undefined;
    } catch {
        return undefined;
    }
}

function setSavedChoice(choiceId, index) {
    try {
        ensureChoiceStoreMigrated();
        const sid = String(choiceId || '').trim();
        if (!sid || !Number.isInteger(index)) return;

        choiceStore.set(choiceStoreSessionNs, sid, index, {
            ttl: 1000 * 60 * 60 * 24 * 3,
        });
        choiceStore.set(choiceStorePersistentNs, sid, index, {
            ttl: 1000 * 60 * 60 * 24 * 30,
        });
        choiceStore.maintenance();
    } catch {
        // ignore
    }
}

function clearSavedChoice(choiceId) {
    try {
        ensureChoiceStoreMigrated();
        const sid = String(choiceId || '').trim();
        if (!sid) return;
        choiceStore.remove(choiceStoreSessionNs, sid);
        choiceStore.remove(choiceStorePersistentNs, sid);
    } catch {
        // ignore
    }
}

function getRowEntryTitle(row) {
    const secondCol = row?.[1];
    if (secondCol !== undefined && secondCol !== null && String(secondCol).trim() !== '') {
        return String(secondCol);
    }
    return '未命名';
}

function countNonEmptyInRow(row) {
    let count = 0;
    if (!Array.isArray(row)) return count;
    for (const value of row) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            count++;
        }
    }
    return count;
}

function getAvatarText(name) {
    const raw = String(name || '').trim();
    if (!raw) return '？';
    return raw.charAt(0);
}

function toTimestamp(input) {
    const t = new Date(input || '').getTime();
    return Number.isFinite(t) ? t : 0;
}

function formatTimeLike(input) {
    const d = new Date(input || '');
    if (!Number.isFinite(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function generateColor(str) {
    const input = String(str || '');
    if (!input) return '#888888';
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = input.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xff;
        color += (`00${value.toString(16)}`).slice(-2);
    }
    return color;
}
