const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
    const {
        createMessageSelection,
        deleteSelectedMessages,
        selectedMessagesInjectionAction,
        shouldShowUnansweredIndicator,
        updateSelectedMessagesInjection,
    } = await import('../modules/qq-v2/ui/message-selection.js');

    const selection = createMessageSelection();
    assert.deepEqual(selection.select('conversation-1', 'message-1'), ['message-1']);
    assert.deepEqual(selection.select('conversation-1', 'message-1'), ['message-1'], 'direct selection is idempotent');
    assert.deepEqual(selection.toggle('conversation-1', 'message-2'), ['message-1', 'message-2']);
    assert.equal(selection.has('conversation-1', 'message-2'), true);
    assert.deepEqual(selection.toggle('conversation-1', 'message-1'), ['message-2']);

    selection.selectAll('conversation-1', [
        { messageId: 'message-2' },
        { messageId: 'message-3' },
        { messageId: '' },
    ]);
    assert.deepEqual(selection.get('conversation-1'), ['message-2', 'message-3']);

    const deleted = [];
    const facade = {
        intent: {
            async deleteMessages(input) {
                deleted.push(input);
                return { ok: true, status: 'accepted' };
            },
        },
    };
    const result = await deleteSelectedMessages({ facade, conversationId: 'conversation-1', selection });
    assert.equal(result.ok, true);
    assert.deepEqual(deleted, [{
        conversationId: 'conversation-1',
        messageIds: ['message-2', 'message-3'],
    }], 'batch deletion uses the QQ Facade with stable message IDs');
    assert.deepEqual(selection.get('conversation-1'), [], 'a successful delete clears only this conversation selection');

    selection.toggle('conversation-1', 'message-4');
    const rejected = await deleteSelectedMessages({
        facade: { intent: { async deleteMessages() { return { ok: false, status: 'failed' }; } } },
        conversationId: 'conversation-1',
        selection,
    });
    assert.equal(rejected.ok, false);
    assert.deepEqual(selection.get('conversation-1'), ['message-4'], 'a failed delete preserves the user selection');

    selection.selectAll('conversation-1', [
        { messageId: 'message-4' },
        { messageId: 'message-5' },
    ]);
    const messages = [
        { messageId: 'message-4', selectedForInjection: true },
        { messageId: 'message-5', selectedForInjection: false },
    ];
    assert.deepEqual(selectedMessagesInjectionAction({
        conversationId: 'conversation-1',
        selection,
        messages,
        globalEnabled: true,
        conversationEnabled: true,
    }), {
        messageIds: ['message-4', 'message-5'],
        selected: true,
        label: '加入注入条目',
        enabled: true,
    }, 'mixed selections are added as one batch');

    const injectionCalls = [];
    const injectionResult = await updateSelectedMessagesInjection({
        facade: {
            intent: {
                async setMessagesInjection(input) {
                    injectionCalls.push(input);
                    return { ok: true, status: 'accepted' };
                },
            },
        },
        conversationId: 'conversation-1',
        selection,
        messages,
        globalEnabled: true,
        conversationEnabled: true,
    });
    assert.equal(injectionResult.ok, true);
    assert.deepEqual(injectionCalls, [{
        conversationId: 'conversation-1',
        messageIds: ['message-4', 'message-5'],
        selected: true,
    }], 'manual injection uses one batch Facade action');

    const removeAction = selectedMessagesInjectionAction({
        conversationId: 'conversation-1',
        selection,
        messages: messages.map((message) => ({ ...message, selectedForInjection: true })),
        globalEnabled: true,
        conversationEnabled: true,
    });
    assert.equal(removeAction.selected, false);
    assert.equal(removeAction.label, '移出注入条目');
    assert.equal(selectedMessagesInjectionAction({
        conversationId: 'conversation-1',
        selection,
        messages,
        globalEnabled: false,
        conversationEnabled: true,
    }).enabled, false, 'the global switch disables manual injection');
    assert.equal(selectedMessagesInjectionAction({
        conversationId: 'conversation-1',
        selection,
        messages,
        globalEnabled: true,
        conversationEnabled: false,
    }).enabled, false, 'the conversation switch disables manual injection');

    const unreplied = [
        { messageId: 'message-1', senderType: 'self' },
        { messageId: 'message-2', senderType: 'self' },
    ];
    assert.equal(shouldShowUnansweredIndicator(unreplied, 0), false);
    assert.equal(shouldShowUnansweredIndicator(unreplied, 1), true);
    assert.equal(shouldShowUnansweredIndicator([...unreplied, { messageId: 'message-3', senderType: 'character' }], 1), false);

    const appSource = await fs.readFile(path.join(__dirname, '../modules/qq-v2/ui/app.js'), 'utf8');
    const selectionSource = await fs.readFile(path.join(__dirname, '../modules/qq-v2/ui/message-selection.js'), 'utf8');
    assert.match(appSource, /from '\.\/message-selection\.js'/, 'the QQ App uses a selection controller at the Facade seam');
    assert.match(appSource, /data-qq-select-message/, 'the message menu exposes multi-selection');
    assert.match(appSource, /data-qq-delete-selected/, 'the selection state provides a batch-delete command');
    assert.match(appSource, /messageSelection\.selectAll\(/, 'the selection state provides select-all');
    assert.match(appSource, /longPress:\s*\(\{ conversationId, message \}\) => enterMessageSelection/, 'long-press enters selection mode directly');
    assert.doesNotMatch(appSource, /setMessageInjection\(/, 'the private message menu must not expose single-message injection');
    assert.match(appSource, /data-qq-update-selected-injection/, 'selection mode exposes the batch injection command');
    assert.match(selectionSource, /facade\.intent\.setMessagesInjection\(/, 'manual worldbook injection crosses the Facade once per batch');
    assert.match(appSource, /selectableMessages[\s\S]*asText\(message\?\.messageId\)/, 'all persisted messages, including system messages, are selectable');
    assert.match(appSource, /yuzi-qq-system-message-row[\s\S]*bindSelectableMessage\(item, message, conversationId(?:, conversation)?\)/, 'system messages use the shared selection bindings');
    assert.match(appSource, /yuzi-qq-time-divider[\s\S]*stream\.append\(divider\)/, 'time dividers stay separate from selectable message nodes');
    assert.match(appSource, /createButton\('', `yuzi-qq-message-selection-action[\s\S]*'aria-label': label[\s\S]*button\.append\(createIcon\(iconName\)\)/, 'selection actions are icon-only and remain accessible');

    console.log('[qq-message-selection-contract] passed');
}

main().catch((error) => {
    console.error('[qq-message-selection-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
