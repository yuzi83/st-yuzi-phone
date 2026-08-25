const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testPlaceholdersHaveOneStableMeaningAndKeepUnknownText() {
    const {
        materializeQQV2PromptBlocks,
        QQ_V2_PROMPT_PLACEHOLDERS,
    } = await importModule('modules/qq-v2/prompt/materializer.js');
    const { QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS } = await importModule('modules/qq-v2/prompt/placeholders.js');
    assert.deepEqual(
        QQ_V2_PROMPT_PLACEHOLDERS,
        QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS.map(({ token }) => token),
        '运行时替换与设置页说明必须共享同一份占位符目录',
    );
    assert.equal(
        QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS.find(({ token }) => token === '{{私聊人物}}')?.description,
        '人物名字。',
    );
    assert.equal(
        QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS.find(({ token }) => token === '{{私聊主动人物}}')?.description,
        '联系人所有人名字。',
    );
    const blocks = [{
        role: 'system',
        content: '{{私聊人物}}|{{私聊主动人物}}|{{群聊成员}}|{{私聊主动记录}}|{{群聊记录}}|{{正文上下文}}|{{世界书内容}}|{{故事时间}}|{{可用表情}}|{{天气}}',
    }];
    const result = materializeQQV2PromptBlocks(blocks, {
        privatePerson: '林知夏',
        privateProactivePeople: 'P1：林知夏\nP2：顾言',
        groupMembers: '',
        privateProactiveHistory: '全部私聊分区历史',
        groupHistory: '群聊历史',
        storyContext: '正文',
        worldbookContent: '世界书',
        storyTime: '2042-05-01 10:00',
        availableStickers: 'S1｜开心',
    });
    assert.deepEqual(result, [{
        role: 'system',
        content: '林知夏|P1：林知夏\nP2：顾言|无|全部私聊分区历史|群聊历史|正文|世界书|2042-05-01 10:00|S1｜开心|{{天气}}',
    }]);
    assert.equal(QQ_V2_PROMPT_PLACEHOLDERS.includes('{{私聊记录}}'), false);
}

async function testManualHistoryHasOneCurrentUserMessageAndProactiveDoesNotAppendRoles() {
    const { buildManualQQV2Request, buildProactiveQQV2Request } = await importModule('modules/qq-v2/prompt/materializer.js');
    const preset = { blocks: [{ role: 'system', content: '规则 {{私聊人物}}' }] };
    const history = [
        { senderType: 'self', content: '早一点' },
        { senderType: 'person', content: '收到' },
        { senderType: 'self', content: '最新一句' },
    ];
    const manual = buildManualQQV2Request({
        preset,
        variables: { privatePerson: '林知夏' },
        history,
    });
    assert.deepEqual(manual.map((message) => [message.role, message.content]), [
        ['system', '规则 林知夏'],
        ['user', '早一点'],
        ['assistant', '收到'],
        ['user', '最新一句'],
    ]);
    assert.equal(manual.filter((message) => message.content === '最新一句').length, 1);

    const proactive = buildProactiveQQV2Request({
        preset: { blocks: [{ role: 'user', content: '{{私聊主动记录}}' }] },
        variables: { privateProactiveHistory: '<private id="P1">历史</private>' },
        history,
    });
    assert.deepEqual(proactive, [{ role: 'user', content: '<private id="P1">历史</private>' }]);
}

async function testStickerCatalogUsesShortReferencesAndRemovesImageCode() {
    const {
        buildQQV2StickerCatalog,
        mapQQV2StickerActionReferences,
    } = await importModule('modules/qq-v2/prompt/sticker-catalog.js');
    const longImageCode = 'A'.repeat(120);
    const catalog = buildQQV2StickerCatalog([
        { id: 'sticker-uuid-a', description: '<img src="data:image/png;base64,AAAA"> 开心挥手' },
        { id: 'sticker-uuid-b', description: `blob:https://example.test/id ${longImageCode} 难过` },
    ]);

    assert.equal(catalog.text, 'S1｜开心挥手\nS2｜难过');
    assert.deepEqual(catalog.references, { S1: 'sticker-uuid-a', S2: 'sticker-uuid-b' });
    assert.doesNotMatch(catalog.text, /data:|blob:|<img|sticker-uuid|A{80}/u);
    assert.deepEqual(mapQQV2StickerActionReferences([{
        type: 'message',
        messageType: 'sticker',
        stickerId: 'S2',
    }], catalog.references), [{
        type: 'message',
        messageType: 'sticker',
        stickerId: 'sticker-uuid-b',
    }]);
}

async function testPromptHelpersKeepSuccessfulStoryRepliesAndEscapeProactiveSections() {
    const {
        buildQQV2StoryContext,
        buildQQV2ProactiveSections,
    } = await importModule('modules/qq-v2/prompt/materializer.js');

    const storyContext = buildQQV2StoryContext([
        { role: 'user', content: '**第一句**' },
        { role: 'assistant', content: '第一段回复' },
        { role: 'system', content: '不应出现' },
        { role: 'user', content: '第二句' },
        { role: 'assistant', content: '第二段回复' },
        { role: 'assistant', content: '失败回复', isSuccessful: false },
        { role: 'user', content: '第三句' },
        { role: 'assistant', content: '第三段回复' },
    ], 2);
    assert.equal(storyContext, '第二段回复\n\n第三段回复');

    const filteredStoryContext = buildQQV2StoryContext([
        {
            role: 'assistant',
            content: '<status>表格</status>\n<content>第一段<table>子表</table></content>',
        },
        { role: 'assistant', content: '<CONTENT data="正文">第二段</CONTENT>' },
        { role: 'assistant', content: '未包裹的旧正文' },
    ], 0, { extractTag: '<content>', excludeTags: ['status', '<table>'] });
    assert.equal(filteredStoryContext, '第一段\n\n第二段\n\n未包裹的旧正文');

    const sections = buildQQV2ProactiveSections({
        kind: 'private',
        conversations: [{
            referenceId: 'P1',
            title: '林<知夏',
            personId: 'person-1',
            messages: [
                { senderType: 'self', content: '你好 & 再见' },
                { senderType: 'person', type: 'voice', content: '今晚见' },
                { senderType: 'self', type: 'image', content: '海边的照片' },
                { senderType: 'person', type: 'video', content: '烟花' },
                { senderType: 'self', type: 'sticker', content: '开心挥手' },
                {
                    senderType: 'self',
                    type: 'transfer',
                    transfer: {
                        amount: '88',
                        currency: '金币',
                        recipientId: 'person-1',
                        status: 'pending',
                        note: '晚饭',
                    },
                },
            ],
        }],
    });
    assert.equal(
        sections,
        '<private id="P1" name="林&lt;知夏"><message id="P1-M1" sender="user" type="text">你好 &amp; 再见</message><message id="P1-M2" sender="npc" type="voice">语音：今晚见</message><message id="P1-M3" sender="user" type="image">图片：海边的照片</message><message id="P1-M4" sender="npc" type="video">视频：烟花</message><message id="P1-M5" sender="user" type="sticker">表情：开心挥手</message><message id="P1-M6" sender="user" type="transfer">转账，金额：88 金币，收款人：林&lt;知夏，状态：待收款，备注：晚饭</message></private>',
    );
}

async function main() {
    await testPlaceholdersHaveOneStableMeaningAndKeepUnknownText();
    await testManualHistoryHasOneCurrentUserMessageAndProactiveDoesNotAppendRoles();
    await testStickerCatalogUsesShortReferencesAndRemovesImageCode();
    await testPromptHelpersKeepSuccessfulStoryRepliesAndEscapeProactiveSections();
    console.log('[qq-v2-prompt-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-prompt-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
