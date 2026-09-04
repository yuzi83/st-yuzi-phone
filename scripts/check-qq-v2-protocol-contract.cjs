const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function node(tagName, attributes = {}, textContent = '', children = []) {
    return {
        nodeType: 1,
        tagName,
        nodeName: tagName,
        textContent,
        children,
        childNodes: children.length ? children : textContent ? [{ nodeType: 3, textContent }] : [],
        attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
        },
        hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attributes, name);
        },
    };
}

function documentWith(root) {
    return {
        documentElement: root,
        childNodes: [root],
        getElementsByTagName(name) {
            return name === 'parsererror' ? [] : [];
        },
    };
}

async function testStrictXmlAndWhitelistedActions() {
    const { parseQQV2Response, QQV2ProtocolError } = await importModule('modules/qq-v2/protocol/xml.js');
    const root = node('qq', {}, '', [
        node('message', { conversation: 'P1', sender: 'alice', type: 'text', quote: 'M1' }, '你好'),
        node('read', { conversation: 'P1' }),
        node('transfer', { conversation: 'P1', message: 'M2', actor: 'alice', action: 'accept' }),
    ]);
    const actions = parseQQV2Response('<qq><message/><read/></qq>', {
        parseDocument: () => documentWith(root),
    });
    assert.deepEqual(actions, [
        { type: 'message', conversation: 'P1', sender: 'alice', messageType: 'text', content: '你好', quote: 'M1', mentions: [], mentionAll: false },
        { type: 'read', conversation: 'P1' },
        { type: 'transfer', conversation: 'P1', message: 'M2', actor: 'alice', action: 'accept' },
    ]);

    const wrappedActions = parseQQV2Response('<thought>analysis</thought>\n<qq><none /></qq>', {
        parseDocument: (xml) => {
            assert.equal(xml, '<qq><none /></qq>');
            return documentWith(node('qq', {}, '', [node('none')]));
        },
    });
    assert.deepEqual(wrappedActions, [{ type: 'none' }]);
    parseQQV2Response('<qq><bad/></qq>\nlatest response:\n<qq/>', {
        parseDocument: (xml) => {
            assert.equal(xml, '<qq/>');
            return documentWith(node('qq'));
        },
    });
    assert.throws(() => parseQQV2Response('no qq response', { parseDocument: () => documentWith(node('qq')) }), QQV2ProtocolError);
    assert.throws(() => parseQQV2Response('<qq><bad/></qq>', {
        parseDocument: () => documentWith(node('qq', {}, '', [node('bad')])),
    }), QQV2ProtocolError);
    assert.throws(() => parseQQV2Response('<qq><message url="https://x"/></qq>', {
        parseDocument: () => documentWith(node('qq', {}, '', [node('message', { conversation: 'P1', sender: 'alice', type: 'text', url: 'https://x' }, 'x')])),
    }), QQV2ProtocolError);
}

async function testTransferActionRequiresAVisiblePendingTransfer() {
    const { validateQQV2ActionBatch, QQV2ProtocolError } = await importModule('modules/qq-v2/protocol/xml.js');
    const action = { type: 'transfer', conversation: 'P1', message: 'M2', actor: 'alice', action: 'reject' };
    assert.doesNotThrow(() => validateQQV2ActionBatch([action], {
        scenario: 'private-reply',
        conversations: new Map([['P1', { kind: 'private' }]]),
        visibleMessageRefs: new Set(['M2']),
    }));
    assert.throws(() => validateQQV2ActionBatch([action], {
        scenario: 'private-reply',
        conversations: new Map([['P1', { kind: 'private' }]]),
        visibleMessageRefs: new Set(),
    }), QQV2ProtocolError);
}

async function testScenarioAndReferenceValidation() {
    const { validateQQV2ActionBatch, QQV2ProtocolError } = await importModule('modules/qq-v2/protocol/xml.js');
    const action = { type: 'message', conversation: 'P1', sender: 'alice', messageType: 'sticker', content: '笑', stickerId: 'sticker-1', mentions: [], mentionAll: false };
    assert.doesNotThrow(() => validateQQV2ActionBatch([action], {
        scenario: 'private-reply',
        conversations: new Map([['P1', { kind: 'private' }]]),
        stickers: new Set(['sticker-1']),
        visibleMessageRefs: new Set(),
    }));
    assert.throws(() => validateQQV2ActionBatch([action], {
        scenario: 'private-reply',
        conversations: new Map([['P1', { kind: 'private' }]]),
        stickers: new Set(),
        visibleMessageRefs: new Set(),
    }), QQV2ProtocolError);
    assert.throws(() => validateQQV2ActionBatch([{ type: 'none' }], {
        scenario: 'private-reply',
        conversations: new Map([['P1', { kind: 'private' }]]),
        stickers: new Set(),
        visibleMessageRefs: new Set(),
    }), QQV2ProtocolError);
}

async function testGroupAddByNameParsesTemporaryPersonReference() {
    const { parseQQV2Response } = await importModule('modules/qq-v2/protocol/xml.js');
    const root = node('qq', {}, '', [
        node('group', {
            conversation: 'G1',
            action: 'add',
            actor: 'N1',
            id: 'N3',
            name: '沈星河',
        }),
    ]);

    const actions = parseQQV2Response('<qq><group /></qq>', {
        parseDocument: () => documentWith(root),
    });

    assert.deepEqual(actions, [{
        type: 'group',
        conversation: 'G1',
        action: 'add',
        actor: 'N1',
        target: '',
        value: '',
        duration: '',
        id: 'N3',
        name: '沈星河',
    }]);
}

async function testGroupLeaveParsesWithoutTarget() {
    const { parseQQV2Response } = await importModule('modules/qq-v2/protocol/xml.js');
    const root = node('qq', {}, '', [
        node('group', {
            conversation: 'G1',
            action: 'leave',
            actor: 'N1',
        }),
    ]);

    const actions = parseQQV2Response('<qq><group /></qq>', {
        parseDocument: () => documentWith(root),
    });

    assert.deepEqual(actions, [{
        type: 'group',
        conversation: 'G1',
        action: 'leave',
        actor: 'N1',
        target: '',
        value: '',
        duration: '',
    }]);
}

async function testMuteDurationNormalizesMissingChineseWhitespace() {
    const { parseQQV2Response } = await importModule('modules/qq-v2/protocol/xml.js');
    const root = node('qq', {}, '', [
        node('group', {
            conversation: 'G1',
            action: 'mute',
            actor: 'N1',
            target: 'N2',
            duration: '10分钟',
        }),
    ]);

    const actions = parseQQV2Response('<qq><group /></qq>', {
        parseDocument: () => documentWith(root),
    });

    assert.equal(actions[0].duration, '10 分钟');
}

async function testManualGroupReplyRejectsAnEmptyActionBatch() {
    const { validateQQV2ActionBatch, QQV2ProtocolError } = await importModule('modules/qq-v2/protocol/xml.js');

    assert.throws(() => validateQQV2ActionBatch([], {
        scenario: 'group-reply',
        conversations: new Map([['G1', { kind: 'group' }]]),
    }), QQV2ProtocolError);
}

async function main() {
    await testStrictXmlAndWhitelistedActions();
    await testScenarioAndReferenceValidation();
    await testTransferActionRequiresAVisiblePendingTransfer();
    await testGroupAddByNameParsesTemporaryPersonReference();
    await testGroupLeaveParsesWithoutTarget();
    await testMuteDurationNormalizesMissingChineseWhitespace();
    await testManualGroupReplyRejectsAnEmptyActionBatch();
    console.log('[qq-v2-protocol-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-protocol-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
