const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

async function main() {
    const { formatQQV2MessageSemantic } = await import('../modules/qq-v2/domain/message-semantics.js');

    assert.equal(formatQQV2MessageSemantic({ type: 'voice', content: '今晚见' }), '语音：今晚见');
    assert.equal(formatQQV2MessageSemantic({ type: 'image', content: '海边的照片' }), '图片：海边的照片');
    assert.equal(formatQQV2MessageSemantic({ type: 'video', content: '烟花' }), '视频：烟花');
    assert.equal(formatQQV2MessageSemantic({ type: 'sticker', content: '开心挥手' }), '表情：开心挥手');
    assert.equal(formatQQV2MessageSemantic({
        type: 'transfer',
        transfer: {
            amount: '88',
            currency: '金币',
            recipientId: 'person-1',
            note: '晚饭',
            status: 'pending',
        },
    }, { resolvePersonName: (personId) => personId === 'person-1' ? '玉子' : '' }),
    '转账，金额：88 金币，收款人：玉子，状态：待收款，备注：晚饭');

    const runtime = read('modules/qq-v2/application/production-runtime.js');
    const materializer = read('modules/qq-v2/prompt/materializer.js');
    const projection = read('modules/qq-v2/worldbook/projection-service.js');
    const resources = read('modules/qq-v2/resources/service.js');

    assert.match(runtime,
        /function formatWorldbookHistory\([\s\S]*formatQQV2MessageSemantic\(message/,
        'worldbook activation must use the canonical typed-message semantics');
    assert.ok((runtime.match(/formatWorldbookHistory\(/g) || []).length >= 3,
        'manual and proactive worldbook activation must share one typed-history boundary');
    assert.match(materializer, /type="\$\{escapeXml\(qqV2MessageType\(message\)\)\}"[\s\S]*formatQQV2MessageSemantic\(message/,
        'proactive prompt sections must expose both the message type and readable semantics');
    assert.match(projection, /senderName\(message[\s\S]*formatQQV2MessageSemantic\(message/,
        'worldbook projection must use the same readable semantics');
    assert.match(projection, /data\.conversation\?\.kind === 'group'[\s\S]*message\.quoteMessageId/,
        'quote projection must remain reserved for future group chat only');
    assert.match(runtime, /recipientId:\s*asText\(message\.transfer\?\.recipientId[\s\S]*conversation\?\.personId/,
        'manual transfers must persist the current private-chat recipient');
    assert.match(resources, /当前默认预设不得输出 quote 属性/,
        'the built-in private prompt must explicitly forbid quote output');

    console.log('[qq-v2-message-semantics-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-message-semantics-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
