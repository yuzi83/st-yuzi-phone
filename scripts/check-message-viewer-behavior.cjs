const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

class FakeHTMLElement {
    constructor(name = 'element') {
        this.name = name;
        this.nodes = new Map();
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientHeight = 0;
        this.isConnected = true;
    }

    setQuery(selector, node) {
        this.nodes.set(selector, node);
        return node;
    }

    querySelector(selector) {
        return this.nodes.get(selector) || null;
    }

    querySelectorAll() {
        return [];
    }
}

function installDomGlobals() {
    global.HTMLElement = FakeHTMLElement;
    global.requestAnimationFrame = (callback) => {
        if (typeof callback === 'function') {
            callback();
        }
        return 1;
    };
    global.cancelAnimationFrame = () => {};
    global.CustomEvent = class CustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    };
    global.window = global.window || {
        dispatchEvent() {},
        addEventListener() {},
        removeEventListener() {},
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

function createContainer() {
    const container = new FakeHTMLElement('container');
    const body = new FakeHTMLElement('body');
    body.scrollHeight = 480;
    body.clientHeight = 160;
    body.scrollTop = 0;
    container.setQuery('.phone-app-body', body);
    return { container, body };
}

function createHarness(createMessageViewerActions, options = {}) {
    const logs = {
        patchCount: 0,
        rerenderCount: 0,
        syncRowsCount: 0,
        mutationCalls: [],
        insertCalls: [],
        updateCalls: [],
        aiCalls: [],
        refreshCalls: 0,
        scrollCalls: 0,
    };

    const { container, body } = createContainer();
    const readSpecialField = createReadSpecialField();
    const insertQueue = Array.isArray(options.insertResults) ? [...options.insertResults] : [];

    const state = {
        sending: false,
        draftByConversation: {},
        rowsData: [],
        selectedPromptTemplateName: '默认提示词',
        selectedTarget: '测试对象',
        errorText: '',
        statusText: '',
        conversationId: '',
        ...(options.state || {}),
    };

    const actionDeps = {
        getPhoneChatSettings: () => ({
            useStoryContext: false,
            storyContextTurns: 3,
            apiPresetName: 'preset-under-test',
        }),
        getPhoneChatPromptTemplateContent: () => 'PROMPT_TEMPLATE',
        getPhoneStoryContext: async () => 'STORY_CONTEXT',
        getPhoneChatWorldbookContext: async () => ({ text: 'WORLDBOOK_CONTEXT' }),
        getConversationRows: (rows, conversationId) => (Array.isArray(rows) ? rows : []).filter((row) => String(row.threadId || '') === String(conversationId || '')),
        findConversationPartnerName: () => options.partnerName || '测试角色',
        getCurrentCharacterDisplayName: (fallback = '对方') => String(fallback || '对方'),
        buildPhoneChatSystemMessages: ({ promptTemplate, worldbookText, storyContext }) => ([
            {
                role: 'system',
                content: [promptTemplate, worldbookText, storyContext].filter(Boolean).join(' | '),
            },
        ]),
        buildPhoneChatConversationMessages: (threadRows) => (Array.isArray(threadRows) ? threadRows : []).map((row) => ({
            role: String(row.senderRole || '').toLowerCase() === 'user' ? 'user' : 'assistant',
            content: String(row.content || ''),
        })),
        createPhoneMessageRequestId: () => options.requestId || 'req_test_1',
        materializeRowFromPayload: (_headers, payload) => ({ ...payload }),
        scrollMessageDetailToBottom: (el) => {
            logs.scrollCalls += 1;
            const targetBody = el.querySelector('.phone-app-body');
            if (targetBody) {
                targetBody.scrollTop = targetBody.scrollHeight;
            }
        },
        insertPhoneMessageRecord: async (sheetKey, payload) => {
            logs.insertCalls.push({ sheetKey, payload });
            const queued = insertQueue.length > 0 ? insertQueue.shift() : null;
            if (queued) {
                return {
                    ...queued,
                    payload: Object.prototype.hasOwnProperty.call(queued, 'payload') ? queued.payload : payload,
                };
            }
            return {
                ok: true,
                rowIndex: logs.insertCalls.length,
                payload,
            };
        },
        updatePhoneMessageRecord: async (sheetKey, rowIndex, patch) => {
            logs.updateCalls.push({ sheetKey, rowIndex, patch });
            return { ok: true };
        },
        callPhoneChatAI: async (messages, requestOptions) => {
            logs.aiCalls.push({ messages, requestOptions });
            if (options.aiError) {
                throw options.aiError;
            }
            return options.aiResult || { ok: true, text: 'AI 回复内容' };
        },
        refreshPhoneMessageProjection: async () => {
            logs.refreshCalls += 1;
            return options.refreshResult !== undefined ? options.refreshResult : true;
        },
        getRetryTarget: options.getRetryTarget || ((threadRows, fieldReader) => {
            for (let index = threadRows.length - 1; index >= 0; index -= 1) {
                const row = threadRows[index];
                const status = String(fieldReader(row, 'messageStatus', '') || '');
                const requestId = String(fieldReader(row, 'requestId', '') || '');
                const senderRole = String(fieldReader(row, 'senderRole', '') || '').toLowerCase();
                if (senderRole === 'user' && requestId && /待重试|失败/.test(status)) {
                    return { requestId, messageStatus: status };
                }
            }
            return null;
        }),
        findRowIndexByRequestId: options.findRowIndexByRequestId || ((rows, requestId, fieldReader, config = {}) => {
            const key = config.key || 'requestId';
            const userOnly = Boolean(config.userOnly);
            for (let index = rows.length - 1; index >= 0; index -= 1) {
                const row = rows[index];
                if (String(fieldReader(row, key, '') || '') !== String(requestId || '')) continue;
                if (userOnly && String(fieldReader(row, 'senderRole', '') || '').toLowerCase() !== 'user') continue;
                return index + 1;
            }
            return null;
        }),
        ...(options.actionDeps || {}),
    };

    const actions = createMessageViewerActions({
        state,
        sheetKey: options.sheetKey || 'sheet_message_test',
        headers: ['threadId', 'threadTitle', 'sender', 'senderRole', 'chatTarget', 'content', 'messageStatus', 'requestId', 'replyToMessageId', 'imageDesc', 'videoDesc'],
        container,
        readSpecialField,
        patchComposeUi: () => {
            logs.patchCount += 1;
        },
        renderKeepScroll: () => {
            logs.rerenderCount += 1;
        },
        syncRowsFromSheet: () => {
            logs.syncRowsCount += 1;
            return true;
        },
        markLocalTableMutation: (delay) => {
            logs.mutationCalls.push(delay === undefined ? null : delay);
        },
        createDraftConversationId: () => options.generatedConversationId || 'generated_thread',
        actionDeps,
    });

    return {
        state,
        logs,
        actions,
        container,
        body,
    };
}

async function testRejectsEmptyDraft(createMessageViewerActions) {
    const harness = createHarness(createMessageViewerActions, {
        state: {
            draftByConversation: {
                conv_empty: '   ',
            },
        },
    });

    await harness.actions.handleSendMessage({ conversationId: 'conv_empty', threadTitle: '空草稿会话' });

    assert.equal(harness.state.errorText, '请输入消息内容');
    assert.equal(harness.state.statusText, '');
    assert.equal(harness.logs.patchCount, 1);
    assert.equal(harness.logs.insertCalls.length, 0);
    assert.equal(harness.logs.aiCalls.length, 0);
}

async function testSendSuccess(createMessageViewerActions) {
    const harness = createHarness(createMessageViewerActions, {
        state: {
            draftByConversation: {
                conv_success: '你好，世界',
            },
        },
    });

    await harness.actions.handleSendMessage({ conversationId: 'conv_success', threadTitle: '成功会话' });

    assert.equal(harness.state.sending, false);
    assert.equal(harness.state.errorText, '');
    assert.equal(harness.state.statusText, '发送成功');
    assert.equal(harness.state.draftByConversation.conv_success, '');
    assert.equal(harness.logs.insertCalls.length, 2);
    assert.equal(harness.logs.refreshCalls, 1);
    assert.ok(harness.logs.mutationCalls.includes(1800));
    assert.ok(harness.logs.updateCalls.some((item) => item.rowIndex === 1 && item.patch.messageStatus === '已完成'));
    assert.ok(harness.logs.updateCalls.some((item) => item.rowIndex === 2 && item.patch.content === 'AI 回复内容' && item.patch.messageStatus === '已完成'));
    assert.equal(harness.logs.aiCalls.length, 1);
    assert.equal(harness.body.scrollTop, harness.body.scrollHeight);
}

async function testSendFailureRollback(createMessageViewerActions) {
    const harness = createHarness(createMessageViewerActions, {
        state: {
            draftByConversation: {
                conv_fail: '请回我',
            },
        },
        aiResult: {
            ok: false,
            message: 'AI坏了',
        },
    });

    await harness.actions.handleSendMessage({ conversationId: 'conv_fail', threadTitle: '失败会话' });

    assert.equal(harness.state.sending, false);
    assert.equal(harness.state.errorText, 'AI坏了');
    assert.equal(harness.state.statusText, '用户消息已保存，可稍后重试');
    assert.equal(harness.logs.refreshCalls, 0);
    assert.ok(harness.logs.updateCalls.some((item) => item.rowIndex === 1 && item.patch.messageStatus === '待重试'));
    assert.ok(harness.logs.updateCalls.some((item) => item.rowIndex === 2 && item.patch.content === '（回复失败，可稍后重试）' && item.patch.messageStatus === '失败'));
    assert.equal(harness.logs.syncRowsCount, 1);
}

async function testRetryWithoutTarget(createMessageViewerActions) {
    const harness = createHarness(createMessageViewerActions, {
        state: {
            rowsData: [],
        },
        getRetryTarget: () => null,
    });

    await harness.actions.handleRetryMessage({ conversationId: 'conv_retry_missing', threadTitle: '重试缺失会话' });

    assert.equal(harness.state.errorText, '当前没有可重试的消息');
    assert.equal(harness.state.statusText, '');
    assert.equal(harness.logs.patchCount, 1);
    assert.equal(harness.logs.aiCalls.length, 0);
    assert.equal(harness.logs.updateCalls.length, 0);
}

async function main() {
    installDomGlobals();
    const { createMessageViewerActions } = await import(toModuleUrl('modules/table-viewer/special/message-viewer-actions.js'));

    await testRejectsEmptyDraft(createMessageViewerActions);
    await testSendSuccess(createMessageViewerActions);
    await testSendFailureRollback(createMessageViewerActions);
    await testRetryWithoutTarget(createMessageViewerActions);

    console.log('[message-viewer-behavior-check] 检查通过');
    console.log('- OK | 空草稿发送被拒绝');
    console.log('- OK | 发送成功后状态、写回与投影刷新成立');
    console.log('- OK | AI 失败后用户消息保留且助手占位回退');
    console.log('- OK | retry 缺失目标时命中兜底分支');
}

main().catch((error) => {
    console.error('[message-viewer-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
