const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

class FakeLocalStorage {
    constructor() {
        this.store = new Map();
    }

    get length() {
        return this.store.size;
    }

    key(index) {
        return Array.from(this.store.keys())[index] || null;
    }

    getItem(key) {
        const safeKey = String(key);
        return this.store.has(safeKey) ? this.store.get(safeKey) : null;
    }

    setItem(key, value) {
        this.store.set(String(key), String(value));
    }

    removeItem(key) {
        this.store.delete(String(key));
    }

    clear() {
        this.store.clear();
    }
}

function escapeForHtml(text) {
    return String(text || '')
        .replace(/&/g, '\x26amp;')
        .replace(/</g, '\x26lt;')
        .replace(/>/g, '\x26gt;')
        .replace(/"/g, '\x26quot;')
        .replace(/'/g, '\x26#39;');
}

function installGlobals() {
    global.localStorage = new FakeLocalStorage();
    global.window = {
        __yuziPhoneRuntimeSessionId: 'feed_behavior_session',
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
    };
    global.document = {
        createElement() {
            const node = {
                _textContent: '',
                innerHTML: '',
                set textContent(value) {
                    this._textContent = String(value || '');
                    this.innerHTML = escapeForHtml(this._textContent);
                },
                get textContent() {
                    return this._textContent;
                },
            };
            return node;
        },
    };
}

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createReadSpecialField() {
    return (row, key, fallback = '') => {
        if (row && Object.prototype.hasOwnProperty.call(row, key)) {
            return row[key];
        }
        return fallback;
    };
}

function resetStorage() {
    global.localStorage.clear();
}

function createBaseRow() {
    return {
        poster: 'Alice',
        protagonistName: '主角',
        title: '测试帖子',
        postContent: '正文内容',
        postTime: '2026-03-26T08:00:00.000Z',
        topicTag: '校园',
        location: '教室',
        likes: '7',
        shares: '3',
        viewCount: '11',
        commentCount: '',
        commentContent: '路人:原始评论',
        playerReply1: '回复A',
        playerReply2: '回复B',
        playerReply3: '回复C',
        publisherReply1: '作者回应A',
        publisherReply2: '作者回应B',
        publisherReply3: '作者回应C',
        imageDesc: '一张测试图片',
        videoDesc: '一段测试视频',
    };
}

function testRowsOrder(getRowsForRender) {
    const rows = [
        { id: 'row-1' },
        { id: 'row-2' },
        { id: 'row-3' },
    ];

    const desc = getRowsForRender(rows);
    assert.deepEqual(desc.map((item) => item.rowIndex), [2, 1, 0]);
    assert.equal(desc[0].row, rows[2]);
    assert.equal(desc[2].row, rows[0]);

    const asc = getRowsForRender(rows, { feedOrder: 'asc' });
    assert.deepEqual(asc.map((item) => item.rowIndex), [0, 1, 2]);
    assert.equal(asc[0].row, rows[0]);
    assert.equal(asc[2].row, rows[2]);
}

function testChosenReplyRendering(renderFeedItem, setSavedChoice, getSavedChoice) {
    resetStorage();
    const readSpecialField = createReadSpecialField();
    const row = createBaseRow();
    const choiceId = 'moments_sheet_feed_Alice_0';

    setSavedChoice(choiceId, 1);
    assert.equal(getSavedChoice(choiceId), 1);

    const html = renderFeedItem({
        row,
        sourceRowIndex: 0,
        rowIndex: 0,
        sheetKey: 'sheet_feed',
        type: 'moments',
        readSpecialField,
        styleOptions: {
            showReplyReset: true,
        },
        structureOptions: {
            commentList: {
                showCount: true,
            },
        },
    });

    assert.ok(html.includes('phone-special-reply-reset-btn'));
    assert.ok(!html.includes('phone-special-reply-option-item'));
    assert.ok(html.includes('原始评论'));
    assert.ok(html.includes('回复B'));
    assert.ok(html.includes('作者回应B'));
    assert.ok(html.includes('评论 3'));
}

function testMediaAndManageModeRendering(renderFeedItem, clearSavedChoice) {
    resetStorage();
    const readSpecialField = createReadSpecialField();
    const row = createBaseRow();
    const choiceId = 'forum_sheet_feed_Alice_0';
    clearSavedChoice(choiceId);

    const html = renderFeedItem({
        row: {
            ...row,
            commentContent: '',
            commentCount: '',
        },
        sourceRowIndex: 4,
        rowIndex: 0,
        sheetKey: 'sheet_feed',
        type: 'forum',
        readSpecialField,
        styleOptions: {
            mediaActionTextMode: 'short',
            statsMode: 'compact',
            showPosterAvatar: false,
            commentEmptyText: '这里还没有评论',
        },
        structureOptions: {
            postMeta: {
                showTopicTag: true,
                showLocation: true,
                showViewCount: true,
            },
            commentList: {
                showCount: true,
            },
        },
        deleteManageMode: true,
        selected: true,
    });

    assert.ok(html.includes('查看图片'));
    assert.ok(html.includes('查看视频'));
    assert.ok(html.includes('phone-special-feed-manage-row is-selected'));
    assert.ok(html.includes('aria-pressed="true"'));
    assert.ok(html.includes('互动 7/0/3/11'));
    assert.ok(html.includes('这里还没有评论'));
    assert.ok(html.includes('话题 校园'));
    assert.ok(html.includes('位置 教室'));
    assert.ok(html.includes('phone-special-reply-option-item'));
    assert.ok(!html.includes('phone-special-name-avatar'));
}

async function main() {
    installGlobals();

    const helpersModule = await import(toModuleUrl('modules/table-viewer/special/feed-viewer-helpers.js'));
    const choiceStoreModule = await import(toModuleUrl('modules/table-viewer/special/choice-store.js'));

    const {
        getRowsForRender,
        renderFeedItem,
    } = helpersModule;

    const {
        setSavedChoice,
        getSavedChoice,
        clearSavedChoice,
    } = choiceStoreModule;

    testRowsOrder(getRowsForRender);
    testChosenReplyRendering(renderFeedItem, setSavedChoice, getSavedChoice);
    testMediaAndManageModeRendering(renderFeedItem, clearSavedChoice);

    console.log('[feed-viewer-behavior-check] 检查通过');
    console.log('- OK | getRowsForRender() 保持升序 / 降序稳定');
    console.log('- OK | renderFeedItem() 在 choice-store 命中时正确拼接评论并切换按钮');
    console.log('- OK | renderFeedItem() 正确输出媒体、统计与删除管理态结构');
}

main().catch((error) => {
    console.error('[feed-viewer-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
