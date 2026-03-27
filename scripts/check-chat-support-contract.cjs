const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/phone-core/chat-support.js',
    templateStore: 'modules/phone-core/chat-support/template-store.js',
    settingsContext: 'modules/phone-core/chat-support/settings-context.js',
    messageProjection: 'modules/phone-core/chat-support/message-projection.js',
    aiRuntime: 'modules/phone-core/chat-support/ai-runtime.js',
    messageViewerActions: 'modules/table-viewer/special/message-viewer-actions.js',
    phoneCoreFacade: 'modules/phone-core.js',
    messageViewer: 'modules/table-viewer/special/message-viewer.js',
    aiInstructionPage: 'modules/settings-app/pages/ai-instruction-presets.js',
    apiPromptConfig: 'modules/settings-app/pages/api-prompt-config.js',
    promptEditor: 'modules/settings-app/pages/prompt-editor.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'facade', '继续 re-export getPhoneAiInstructionPresets()', has(contents.facade, 'getPhoneAiInstructionPresets,'));
    check(results, 'facade', '继续 re-export savePhoneAiInstructionPreset()', has(contents.facade, 'savePhoneAiInstructionPreset,'));
    check(results, 'facade', '继续 re-export materializePhoneAiInstructionPresetMessages()', has(contents.facade, 'materializePhoneAiInstructionPresetMessages,'));
    check(results, 'facade', '继续 re-export getPhoneChatSettings()', has(contents.facade, 'getPhoneChatSettings,'));
    check(results, 'facade', '继续 re-export insertPhoneMessageRecord()', has(contents.facade, 'insertPhoneMessageRecord,'));
    check(results, 'facade', '继续 re-export callPhoneChatAI()', has(contents.facade, "export { callPhoneChatAI } from './chat-support/ai-runtime.js';"));

    check(results, 'templateStore', 'legacy template-store 仍保留 getPromptTemplates() 以支持迁移', has(contents.templateStore, 'export function getPromptTemplates('));
    check(results, 'templateStore', 'legacy template-store 仍保留 savePromptTemplate() 以支持迁移', has(contents.templateStore, 'export function savePromptTemplate('));
    check(results, 'templateStore', 'legacy template-store 仍保留 deletePromptTemplate() 以支持迁移', has(contents.templateStore, 'export function deletePromptTemplate('));
    check(results, 'templateStore', 'legacy template-store 仍保留 getPromptTemplate() 以支持迁移', has(contents.templateStore, 'export function getPromptTemplate('));

    check(results, 'settingsContext', '存在 getPhoneChatSettings()', has(contents.settingsContext, 'export function getPhoneChatSettings('));
    check(results, 'settingsContext', '存在 getPhoneChatWorldbookContext()', has(contents.settingsContext, 'export async function getPhoneChatWorldbookContext('));
    check(results, 'settingsContext', '存在 getPhoneStoryContext()', has(contents.settingsContext, 'export async function getPhoneStoryContext('));

    check(results, 'messageProjection', '存在 getSheetDataByKey()', has(contents.messageProjection, 'export function getSheetDataByKey('));
    check(results, 'messageProjection', '存在 buildPhoneMessagePayload()', has(contents.messageProjection, 'export function buildPhoneMessagePayload('));
    check(results, 'messageProjection', '存在 insertPhoneMessageRecord()', has(contents.messageProjection, 'export async function insertPhoneMessageRecord('));
    check(results, 'messageProjection', '存在 deletePhoneSheetRows()', has(contents.messageProjection, 'export async function deletePhoneSheetRows('));
    check(results, 'messageProjection', '存在 dispatchPhoneTableUpdated()', has(contents.messageProjection, 'export function dispatchPhoneTableUpdated('));

    check(results, 'aiRuntime', '存在 callPhoneChatAI()', has(contents.aiRuntime, 'export async function callPhoneChatAI('));
    check(results, 'messageViewerActions', '存在 createMessageViewerActions()', has(contents.messageViewerActions, 'export function createMessageViewerActions('));

    check(results, 'phoneCoreFacade', '继续从 chat-support façade 汇总导出', has(contents.phoneCoreFacade, "} from './phone-core/chat-support.js';"));
    check(results, 'messageViewer', '继续通过 createMessageViewerActions() 组装发送/重试动作', has(contents.messageViewer, 'createMessageViewerActions('));
    check(results, 'messageViewerActions', 'message-viewer-actions 保留 defaultMessageViewerActionDeps 作为默认动作依赖容器', has(contents.messageViewerActions, 'const defaultMessageViewerActionDeps = {'));
    check(results, 'messageViewerActions', 'message-viewer-actions 默认依赖仍接入 insertPhoneMessageRecord', has(contents.messageViewerActions, 'insertPhoneMessageRecord,'));
    check(results, 'messageViewerActions', 'message-viewer-actions 默认依赖仍接入 updatePhoneMessageRecord', has(contents.messageViewerActions, 'updatePhoneMessageRecord,'));
    check(results, 'messageViewerActions', 'message-viewer-actions 默认依赖仍接入 callPhoneChatAI', has(contents.messageViewerActions, 'callPhoneChatAI,'));
    check(results, 'messageViewerActions', 'message-viewer-actions 支持 actionDeps 覆盖以承载行为级护栏', has(contents.messageViewerActions, 'actionDeps,'));
    check(results, 'aiInstructionPage', '独立预设页使用 getPhoneAiInstructionPresets()', has(contents.aiInstructionPage, 'getPhoneAiInstructionPresets,'));
    check(results, 'aiInstructionPage', '独立预设页使用 deletePhoneAiInstructionPreset()', has(contents.aiInstructionPage, 'deletePhoneAiInstructionPreset,'));
    check(results, 'apiPromptConfig', '上下文页不再直接使用 getPhoneAiInstructionPresets()', !has(contents.apiPromptConfig, 'getPhoneAiInstructionPresets,'));
    check(results, 'apiPromptConfig', '上下文页不再直接使用 deletePhoneAiInstructionPreset()', !has(contents.apiPromptConfig, 'deletePhoneAiInstructionPreset,'));
    check(results, 'promptEditor', '改为使用 getPhoneAiInstructionPreset()', has(contents.promptEditor, 'getPhoneAiInstructionPreset,'));
    check(results, 'promptEditor', '改为使用 savePhoneAiInstructionPreset()', has(contents.promptEditor, 'savePhoneAiInstructionPreset,'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[chat-support-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[chat-support-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
