const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
    const {
        createNarrativeMessage,
        createTransferMessage,
        handleIncomingTransfer,
        submitNarrativeMessage,
        submitTransferMessage,
        transferStatusLabel,
        voiceDurationSeconds,
    } = await import('../modules/qq-v2/ui/narrative-tools.js');

    assert.equal(voiceDurationSeconds(''), 1);
    assert.equal(voiceDurationSeconds('abcdef'), 1);
    assert.equal(voiceDurationSeconds('x'.repeat(600)), 100, 'voice duration is derived from text without a 60 second ceiling');
    assert.deepEqual(createNarrativeMessage('voice', '  hello  '), { type: 'voice', content: 'hello' });
    assert.deepEqual(createNarrativeMessage('video', 'A long take'), { type: 'video', content: 'A long take' });

    const sent = [];
    const facade = {
        intent: {
            async sendMessage(input) {
                sent.push(input);
                return { ok: true, status: 'accepted' };
            },
            async handleIncomingTransfer(input) {
                sent.push({ transferAction: input });
                return { ok: true, status: 'accepted' };
            },
        },
    };
    assert.equal((await submitNarrativeMessage({ facade, conversationId: 'private-1', type: 'image', content: 'An old photo' })).ok, true);
    assert.deepEqual(sent.shift(), {
        conversationId: 'private-1',
        message: { type: 'image', content: 'An old photo' },
    }, 'narrative tools immediately use the single-message Facade contract');

    const transfer = createTransferMessage({ amount: 'three shells', currency: 'moon coins', note: 'for dinner' });
    assert.deepEqual(transfer, {
        type: 'transfer',
        content: 'for dinner',
        transfer: { amount: 'three shells', currency: 'moon coins', note: 'for dinner', status: 'pending' },
    }, 'transfer values remain free text with no balance or currency coercion');
    assert.equal((await submitTransferMessage({ facade, conversationId: 'private-1', amount: 'three shells', currency: 'moon coins', note: 'for dinner' })).ok, true);
    assert.deepEqual(sent.shift(), { conversationId: 'private-1', message: transfer }, 'transfer sends directly without a second confirmation queue');
    const directedTransfer = createTransferMessage({
        amount: '100',
        currency: '元',
        note: '群转账',
        recipientId: 'person-bob',
    });
    assert.deepEqual(directedTransfer.transfer, {
        amount: '100',
        currency: '元',
        note: '群转账',
        status: 'pending',
        recipientId: 'person-bob',
    });
    await submitTransferMessage({
        facade,
        conversationId: 'group-1',
        amount: '100',
        currency: '元',
        note: '群转账',
        recipientId: 'person-bob',
    });
    assert.deepEqual(sent.shift(), {
        conversationId: 'group-1',
        message: directedTransfer,
    }, 'group transfers preserve their explicit recipient through the Facade');

    assert.equal((await handleIncomingTransfer({ facade, conversationId: 'private-1', messageId: 'message-7', action: 'accept' })).ok, true);
    assert.deepEqual(sent.shift(), { transferAction: { conversationId: 'private-1', messageId: 'message-7', action: 'accept' } },
        'receiving a transfer updates the original transfer through the Facade without sending an AI message');
    assert.equal(transferStatusLabel({ senderType: 'self', transfer: { status: 'pending' } }), '待对方收款');
    assert.equal(transferStatusLabel({ senderType: 'person', transfer: { status: 'pending' } }), '待你收款');
    assert.equal(transferStatusLabel({
        senderType: 'person',
        transfer: { status: 'pending', recipientId: '__self__' },
    }), '待你收款');
    assert.equal(transferStatusLabel({
        senderType: 'person',
        transfer: { status: 'pending', recipientId: 'person-bob' },
    }), '待收款');
    assert.equal(transferStatusLabel({ senderType: 'person', transfer: { status: 'accepted' } }), '已收款');
    assert.equal(transferStatusLabel({ senderType: 'person', transfer: { status: 'returned' } }), '已退还');

    const appSource = await fs.readFile(path.join(__dirname, '..', 'modules', 'qq-v2', 'ui', 'app.js'), 'utf8');
    assert.match(appSource, /from '\.\/narrative-tools\.js'/, 'the QQ UI uses the narrow narrative Facade boundary');
    assert.doesNotMatch(appSource, /getUserMedia|MediaRecorder|navigator\.mediaDevices/, 'narrative tools cannot request real recording devices');
    assert.doesNotMatch(appSource, /pendingAttachments|composerSendPlan/, 'tool messages cannot be batched behind the text composer');
    console.log('[qq-narrative-tools-contract] passed');
})().catch((error) => {
    console.error('[qq-narrative-tools-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
