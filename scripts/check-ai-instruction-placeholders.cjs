const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function testSegmentsWithEmptyPlaceholderAreSkipped() {
    const store = await import(toModuleUrl('modules/phone-core/chat-support/ai-instruction-store.js'));

    const preset = store.createDefaultPhoneAiInstructionPreset({
        name: 'Placeholder Contract Preset',
        promptGroup: [
            {
                id: 'with-empty-worldbook',
                name: '缺少世界书时跳过',
                role: 'system',
                content: '世界书：{{worldbookText}}',
                mainSlot: 'A',
            },
            {
                id: 'with-target',
                name: '目标角色存在时保留',
                role: 'user',
                content: '目标：{{targetCharacterName}}',
                mainSlot: 'B',
            },
            {
                id: 'ordinary',
                name: '普通片段',
                role: 'assistant',
                content: '固定内容',
            },
        ],
    });

    const messages = store.materializePhoneAiInstructionPresetMessages(preset, {
        targetCharacterName: '角色甲',
        worldbookText: '',
    });

    assert.deepEqual(
        messages.map((message) => message.content),
        ['目标：角色甲', '固定内容'],
    );
    assert.ok(!messages.some((message) => message.content.includes('世界书')));
}

async function testWhitespacePlaceholderValueIsTreatedAsEmpty() {
    const store = await import(toModuleUrl('modules/phone-core/chat-support/ai-instruction-store.js'));

    const preset = store.createDefaultPhoneAiInstructionPreset({
        name: 'Whitespace Placeholder Preset',
        promptGroup: [
            {
                id: 'blank-story-context',
                name: '空白前情',
                role: 'system',
                content: '前情：{{storyContext}}',
                mainSlot: 'A',
            },
            {
                id: 'ordinary',
                name: '普通片段',
                role: 'assistant',
                content: '仍然保留',
            },
        ],
    });

    const messages = store.materializePhoneAiInstructionPresetMessages(preset, {
        storyContext: '   ',
    });

    assert.deepEqual(
        messages.map((message) => message.content),
        ['仍然保留'],
    );
}

async function testAllReferencedPlaceholdersMustHaveValues() {
    const store = await import(toModuleUrl('modules/phone-core/chat-support/ai-instruction-store.js'));

    const preset = store.createDefaultPhoneAiInstructionPreset({
        name: 'Multi Placeholder Preset',
        promptGroup: [
            {
                id: 'multi-placeholder',
                name: '多个占位符',
                role: 'system',
                content: '角色：{{targetCharacterName}}\n会话：{{conversationTitle}}',
                mainSlot: 'A',
            },
            {
                id: 'ordinary',
                name: '普通片段',
                role: 'assistant',
                content: '兜底片段',
            },
        ],
    });

    const skippedMessages = store.materializePhoneAiInstructionPresetMessages(preset, {
        targetCharacterName: '角色甲',
        conversationTitle: '',
    });

    assert.deepEqual(
        skippedMessages.map((message) => message.content),
        ['兜底片段'],
    );

    const keptMessages = store.materializePhoneAiInstructionPresetMessages(preset, {
        targetCharacterName: '角色甲',
        conversationTitle: '会话一',
    });

    assert.deepEqual(
        keptMessages.map((message) => message.content),
        ['角色：角色甲\n会话：会话一', '兜底片段'],
    );
}

async function main() {
    const tests = [
        ['引用空占位符的片段会整段跳过', testSegmentsWithEmptyPlaceholderAreSkipped],
        ['空白字符串占位符值按空值处理', testWhitespacePlaceholderValueIsTreatedAsEmpty],
        ['同一片段内所有占位符都必须有非空值', testAllReferencedPlaceholdersMustHaveValues],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[ai-instruction-placeholders-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[ai-instruction-placeholders-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
