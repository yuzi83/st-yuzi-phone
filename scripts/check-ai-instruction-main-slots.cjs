const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function escapeHtmlForHarness(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function installDomEscapeHarness() {
    if (global.document && typeof global.document.createElement === 'function') {
        return;
    }

    global.document = {
        createElement() {
            let text = '';
            return {
                set textContent(value) {
                    text = String(value || '');
                },
                get innerHTML() {
                    return escapeHtmlForHarness(text);
                },
            };
        },
    };
}

installDomEscapeHarness();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function testSharedSlotProtocol() {
    const slots = await import(toModuleUrl('modules/phone-core/chat-support/ai-instruction-slots.js'));

    assert.equal(slots.PHONE_AI_INSTRUCTION_MAIN_SLOT_A, 'A');
    assert.equal(slots.PHONE_AI_INSTRUCTION_MAIN_SLOT_B, 'B');
    assert.deepEqual(slots.PHONE_AI_INSTRUCTION_MAIN_SLOT_OPTIONS.map((option) => option.value), ['', 'A', 'B']);
    assert.deepEqual(slots.PHONE_AI_INSTRUCTION_MAIN_SLOT_OPTIONS.map((option) => option.label), ['普通片段', '主槽位 A', '主槽位 B']);

    assert.equal(slots.normalizePhoneAiInstructionMainSlot(' a '), 'A');
    assert.equal(slots.normalizePhoneAiInstructionMainSlot('b'), 'B');
    assert.equal(slots.normalizePhoneAiInstructionMainSlot('C'), '');
    assert.equal(slots.normalizePhoneAiInstructionMainSlot(null), '');

    assert.equal(slots.normalizePhoneAiInstructionSegmentMainSlot('', { isMain: true }), 'A');
    assert.equal(slots.normalizePhoneAiInstructionSegmentMainSlot('', { isMain2: true }), 'B');
    assert.equal(slots.normalizePhoneAiInstructionSegmentMainSlot('B', { isMain: true }), 'B');
    assert.equal(slots.normalizePhoneAiInstructionSegmentMainSlot('', { mainSlot: ' a ', isMain2: true }), 'A');

    assert.equal(slots.resolvePhoneAiInstructionMainSlotOrder('A'), 0);
    assert.equal(slots.resolvePhoneAiInstructionMainSlotOrder('B'), 1);
    assert.equal(slots.resolvePhoneAiInstructionMainSlotOrder(''), 2);
    assert.equal(slots.resolvePhoneAiInstructionMainSlotOrder('C'), 2);
}

async function testStoreNormalizesSegmentsAndSortsMaterializedMessages() {
    const store = await import(toModuleUrl('modules/phone-core/chat-support/ai-instruction-store.js'));

    const emptySegment = store.createEmptyPhoneAiInstructionSegment({
        id: 'legacy-main',
        isMain: true,
    });
    assert.equal(emptySegment.mainSlot, 'A');

    const preset = store.createDefaultPhoneAiInstructionPreset({
        name: 'Slot Contract Preset',
        promptGroup: [
            {
                id: 'ordinary-first',
                name: '普通先写',
                role: 'user',
                content: 'ordinary',
                mainSlot: '',
            },
            {
                id: 'legacy-b',
                name: '旧 B',
                role: 'assistant',
                content: 'legacy-b',
                isMain2: true,
            },
            {
                id: 'lower-a',
                name: '小写 A',
                role: 'system',
                content: 'lower-a',
                mainSlot: ' a ',
            },
            {
                id: 'invalid-c',
                name: '无效 C',
                role: 'user',
                content: 'invalid-c',
                mainSlot: 'C',
            },
        ],
    });

    assert.deepEqual(preset.promptGroup.map((segment) => segment.mainSlot), ['', 'B', 'A', '']);

    const messages = store.materializePhoneAiInstructionPresetMessages(preset, {});
    assert.deepEqual(messages.map((message) => message.content), ['lower-a', 'legacy-b', 'ordinary', 'invalid-c']);
}

async function testDraftHelpersUseSharedSlotProtocol() {
    const draftHelpers = await import(toModuleUrl('modules/settings-app/pages/ai-instruction-presets/draft-helpers.js'));

    assert.equal(draftHelpers.normalizeMainSlot(' b ', { isMain: true }), 'B');
    assert.equal(draftHelpers.normalizeMainSlot('', { isMain: true }), 'A');
    assert.equal(draftHelpers.normalizeMainSlot('', { isMain2: true }), 'B');
    assert.equal(draftHelpers.normalizeMainSlot('C', { isMain: true }), 'A');

    const payload = draftHelpers.buildPresetPayload({
        aiInstructionDraftName: 'Slot Payload',
        aiInstructionDraftImagePrefix: '[图]',
        aiInstructionDraftVideoPrefix: '[视]',
        aiInstructionDraftPromptGroup: [
            {
                id: 'draft-a',
                name: '草稿 A',
                role: 'system',
                content: 'draft-a',
                mainSlot: ' a ',
            },
            {
                id: 'draft-legacy-b',
                name: '草稿旧 B',
                role: 'user',
                content: 'draft-b',
                isMain2: true,
            },
            {
                id: 'draft-invalid',
                name: '草稿无效',
                role: 'assistant',
                content: 'draft-invalid',
                mainSlot: 'C',
            },
        ],
    });

    assert.deepEqual(payload.promptGroup.map((segment) => segment.mainSlot), ['A', 'B', '']);
}

async function testTemplateBuilderUsesSharedOptions() {
    const builders = await import(toModuleUrl('modules/settings-app/pages/ai-instruction-presets/template-builders.js'));

    const html = builders.buildSegmentCardsHtml([
        {
            id: 'segment-a',
            name: '片段 A',
            role: 'system',
            content: 'content-a',
            mainSlot: 'A',
        },
    ]);

    assert.match(html, /<option value=""\s*>普通片段<\/option>/);
    assert.match(html, /<option value="A" selected>主槽位 A<\/option>/);
    assert.match(html, /<option value="B"\s*>主槽位 B<\/option>/);
}

async function main() {
    const tests = [
        ['共享主槽位协议归一化与排序常量稳定', testSharedSlotProtocol],
        ['store 归一化旧字段并按主槽位 materialize 排序', testStoreNormalizesSegmentsAndSortsMaterializedMessages],
        ['draft helpers 通过共享协议生成保存 payload', testDraftHelpersUseSharedSlotProtocol],
        ['template builder 通过共享 options 渲染主槽位下拉框', testTemplateBuilderUsesSharedOptions],
    ];

    for (const [, run] of tests) {
        await run();
    }

    console.log('[ai-instruction-main-slots-check] 检查通过');
    for (const [description] of tests) {
        console.log(`- OK | ${description}`);
    }
}

main().catch((error) => {
    console.error('[ai-instruction-main-slots-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
