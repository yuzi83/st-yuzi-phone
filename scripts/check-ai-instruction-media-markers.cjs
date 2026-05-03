const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createReadSpecialField() {
    return (row, key, fallback = '') => {
        if (!row || typeof row !== 'object') return fallback;
        return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : fallback;
    };
}

function createInstructionPreset(mediaMarkers) {
    return {
        name: 'Media Marker Contract Preset',
        mediaMarkers,
        promptGroup: [
            {
                id: 'system-contract-segment',
                name: '系统提示',
                role: 'system',
                content: '固定系统提示',
                mainSlot: 'A',
            },
        ],
    };
}

async function loadHelpers() {
    return import(toModuleUrl('modules/table-viewer/special/message-viewer-helpers.js'));
}

async function testCustomMediaMarkersEnterPromptHistory() {
    const helpers = await loadHelpers();
    const messages = helpers.buildPhoneChatConversationMessages([
        {
            sender: '对方',
            senderRole: 'assistant',
            content: '看这个。',
            imageDesc: '一张雨夜街道照片',
            videoDesc: '一段霓虹灯闪烁的视频',
            messageStatus: 'sent',
        },
    ], createReadSpecialField(), {
        instructionPreset: createInstructionPreset({
            imagePrefix: '<IMG>',
            videoPrefix: '<VID>',
        }),
        maxHistoryMessages: 12,
    });

    assert.deepEqual(messages, [
        {
            role: 'assistant',
            content: '看这个。\n<IMG> 一张雨夜街道照片\n<VID> 一段霓虹灯闪烁的视频',
        },
    ]);
}

async function testEmptyMediaMarkersAreProtocolValues() {
    const helpers = await loadHelpers();
    const messages = helpers.buildPhoneChatConversationMessages([
        {
            sender: '我',
            senderRole: 'user',
            content: '',
            imageDesc: '无前缀图片描述',
            videoDesc: '无前缀视频描述',
            messageStatus: 'sent',
        },
    ], createReadSpecialField(), {
        instructionPreset: createInstructionPreset({
            imagePrefix: '',
            videoPrefix: '',
        }),
        maxHistoryMessages: 12,
    });

    assert.deepEqual(messages, [
        {
            role: 'user',
            content: '无前缀图片描述\n无前缀视频描述',
        },
    ]);
}

async function testMissingMediaMarkersFallbackToDefaults() {
    const helpers = await loadHelpers();
    const messages = helpers.buildPhoneChatConversationMessages([
        {
            sender: '对方',
            senderRole: 'assistant',
            content: '',
            imageDesc: '默认图片描述',
            videoDesc: '默认视频描述',
            messageStatus: 'sent',
        },
    ], createReadSpecialField(), {
        instructionPreset: createInstructionPreset(undefined),
        maxHistoryMessages: 12,
    });

    assert.deepEqual(messages, [
        {
            role: 'assistant',
            content: '[图片] 默认图片描述\n[视频] 默认视频描述',
        },
    ]);
}

async function testNoMediaDescriptionDoesNotEmitMarkers() {
    const helpers = await loadHelpers();
    const messages = helpers.buildPhoneChatConversationMessages([
        {
            sender: '我',
            senderRole: 'user',
            content: '只有正文',
            imageDesc: '',
            videoDesc: '',
            messageStatus: 'sent',
        },
    ], createReadSpecialField(), {
        instructionPreset: createInstructionPreset({
            imagePrefix: '<IMG>',
            videoPrefix: '<VID>',
        }),
        maxHistoryMessages: 12,
    });

    assert.deepEqual(messages, [
        {
            role: 'user',
            content: '只有正文',
        },
    ]);
}

async function main() {
    const tests = [
        ['自定义媒体前缀会进入历史 prompt', testCustomMediaMarkersEnterPromptHistory],
        ['空媒体前缀作为合法协议值保留', testEmptyMediaMarkersAreProtocolValues],
        ['缺失媒体前缀回退默认协议值', testMissingMediaMarkersFallbackToDefaults],
        ['无媒体描述时不会凭空输出标记', testNoMediaDescriptionDoesNotEmitMarkers],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[ai-instruction-media-markers-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[ai-instruction-media-markers-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
