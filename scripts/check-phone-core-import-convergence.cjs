const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    phoneCoreFacade: 'modules/phone-core.js',
    phoneFusion: 'modules/phone-fusion.js',
    sharedUi: 'modules/table-viewer/shared-ui.js',
    tableViewerState: 'modules/table-viewer/state.js',
    phoneHome: 'modules/phone-home.js',
    phoneSettings: 'modules/phone-settings.js',
    backgroundService: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUploadService: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    layoutSettings: 'modules/settings-app/services/appearance-settings/layout-settings.js',
    visibilitySettings: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    manualUpdate: 'modules/settings-app/services/manual-update.js',
    phoneTableViewer: 'modules/phone-table-viewer.js',
    genericViewer: 'modules/table-viewer/generic-viewer.js',
    genericRuntime: 'modules/table-viewer/generic-runtime.js',
    viewerRuntime: 'modules/table-viewer/runtime.js',
    specialFeedViewer: 'modules/table-viewer/special/feed-viewer.js',
    specialMessageViewer: 'modules/table-viewer/special/message-viewer.js',
    specialMessageViewerActions: 'modules/table-viewer/special/message-viewer-actions.js',
    specialMessageViewerHelpers: 'modules/table-viewer/special/message-viewer-helpers.js',
    beautifyShared: 'modules/phone-beautify-templates/shared.js',
    beautifyRepository: 'modules/phone-beautify-templates/repository.js',
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

    check(results, 'phoneCoreFacade', 'phone-core façade 继续保留 routing re-export', has(contents.phoneCoreFacade, 'navigateTo,'));
    check(results, 'phoneCoreFacade', 'phone-core façade 继续保留 AI 指令预设 re-export', has(contents.phoneCoreFacade, 'getPhoneAiInstructionPresets,'));

    check(results, 'phoneFusion', 'phone-fusion 改为直接从 routing 导入 navigateBack()', has(contents.phoneFusion, "from './phone-core/routing.js';"));
    check(results, 'phoneFusion', 'phone-fusion 不再直接从 phone-core façade 导入', !has(contents.phoneFusion, "from './phone-core.js';"));

    check(results, 'sharedUi', 'shared-ui 改为直接从 scroll-guards 导入 bindPhoneScrollGuards()', has(contents.sharedUi, "from '../phone-core/scroll-guards.js';"));
    check(results, 'sharedUi', 'shared-ui 不再直接从 phone-core façade 导入', !has(contents.sharedUi, "from '../phone-core.js';"));

    check(results, 'tableViewerState', 'table-viewer state 改为直接从 data-api 导入 getTableLockState()', has(contents.tableViewerState, "from '../phone-core/data-api.js';"));
    check(results, 'tableViewerState', 'table-viewer state 不再直接从 phone-core façade 导入', !has(contents.tableViewerState, "from '../phone-core.js';"));

    check(results, 'phoneHome', 'phone-home 改为直接从 data-api 导入表格与面板能力', has(contents.phoneHome, "from './phone-core/data-api.js';"));
    check(results, 'phoneHome', 'phone-home 改为直接从 routing 导入 navigateTo()', has(contents.phoneHome, "from './phone-core/routing.js';"));
    check(results, 'phoneHome', 'phone-home 改为直接从 settings 导入 getPhoneSettings()', has(contents.phoneHome, "from './settings.js';"));
    check(results, 'phoneHome', 'phone-home 不再直接从 phone-core façade 导入', !has(contents.phoneHome, "from './phone-core.js';"));

    check(results, 'phoneSettings', 'phone-settings 改为直接从 data-api 导入数据库相关能力', has(contents.phoneSettings, "from './phone-core/data-api.js';"));
    check(results, 'phoneSettings', 'phone-settings 改为直接从 chat-support 导入 AI 指令预设能力', has(contents.phoneSettings, "from './phone-core/chat-support.js';"));
    check(results, 'phoneSettings', 'phone-settings 改为直接从 routing 导入 navigateBack()', has(contents.phoneSettings, "from './phone-core/routing.js';"));
    check(results, 'phoneSettings', 'phone-settings 改为直接从 scroll-guards 导入 bindPhoneScrollGuards()', has(contents.phoneSettings, "from './phone-core/scroll-guards.js';"));
    check(results, 'phoneSettings', 'phone-settings 改为直接从 settings 导入基础设置能力', has(contents.phoneSettings, "from './settings.js';"));
    check(results, 'phoneSettings', 'phone-settings 不再直接从 phone-core façade 导入', !has(contents.phoneSettings, "from './phone-core.js';"));

    check(results, 'backgroundService', 'background-service 改为直接从 settings 导入基础设置能力', has(contents.backgroundService, "from '../../../settings.js';"));
    check(results, 'backgroundService', 'background-service 不再直接从 phone-core façade 导入', !has(contents.backgroundService, "from '../../../phone-core.js';"));

    check(results, 'iconUploadService', 'icon-upload-service 改为直接从 data-api 导入表格能力', has(contents.iconUploadService, "from '../../../phone-core/data-api.js';"));
    check(results, 'iconUploadService', 'icon-upload-service 改为直接从 settings 导入基础设置能力', has(contents.iconUploadService, "from '../../../settings.js';"));
    check(results, 'iconUploadService', 'icon-upload-service 不再直接从 phone-core façade 导入', !has(contents.iconUploadService, "from '../../../phone-core.js';"));

    check(results, 'layoutSettings', 'layout-settings 改为直接从 settings 导入基础设置能力', has(contents.layoutSettings, "from '../../../settings.js';"));
    check(results, 'layoutSettings', 'layout-settings 不再直接从 phone-core façade 导入', !has(contents.layoutSettings, "from '../../../phone-core.js';"));

    check(results, 'visibilitySettings', 'visibility-settings 改为直接从 data-api 导入表格能力', has(contents.visibilitySettings, "from '../../../phone-core/data-api.js';"));
    check(results, 'visibilitySettings', 'visibility-settings 改为直接从 settings 导入基础设置能力', has(contents.visibilitySettings, "from '../../../settings.js';"));
    check(results, 'visibilitySettings', 'visibility-settings 不再直接从 phone-core façade 导入', !has(contents.visibilitySettings, "from '../../../phone-core.js';"));

    check(results, 'manualUpdate', 'manual-update 改为直接从 data-api 导入 triggerManualUpdate()', has(contents.manualUpdate, "from '../../phone-core/data-api.js';"));
    check(results, 'manualUpdate', 'manual-update 不再直接从 phone-core façade 导入', !has(contents.manualUpdate, "from '../../phone-core.js';"));

    check(results, 'phoneTableViewer', 'phone-table-viewer 改为直接从 routing 导入 navigateBack()', has(contents.phoneTableViewer, "from './phone-core/routing.js';"));
    check(results, 'phoneTableViewer', 'phone-table-viewer 继续不从 phone-core façade 取值', !has(contents.phoneTableViewer, "from './phone-core.js';"));
    check(results, 'phoneTableViewer', 'phone-table-viewer 改为通过 table-viewer context 收口表格数据准备', has(contents.phoneTableViewer, "from './table-viewer/context.js';"));
    check(results, 'phoneTableViewer', 'phone-table-viewer 改为通过 viewerRuntime.startViewerSession() 启动 viewing sheet 会话', has(contents.phoneTableViewer, 'viewerRuntime.startViewerSession();'));
    check(results, 'phoneTableViewer', 'phone-table-viewer 不再直接从 callbacks 导入 viewing sheet 状态', !has(contents.phoneTableViewer, "from './phone-core/callbacks.js';"));

    check(results, 'genericViewer', 'generic-viewer 改为通过 generic-runtime 收口运行时装配', has(contents.genericViewer, "from './generic-runtime.js';"));
    check(results, 'genericViewer', 'generic-viewer 不再直接从 phone-core façade 导入', !has(contents.genericViewer, "from '../phone-core.js';"));

    check(results, 'genericRuntime', 'generic-runtime 改为直接从 data-api 导入表格能力', has(contents.genericRuntime, "from '../phone-core/data-api.js';"));
    check(results, 'genericRuntime', 'generic-runtime 改为直接从 routing 导入 navigateBack()', has(contents.genericRuntime, "from '../phone-core/routing.js';"));
    check(results, 'genericRuntime', 'generic-runtime 改为直接从 chat-support 导入 sheet 运行时能力', has(contents.genericRuntime, "from '../phone-core/chat-support.js';"));
    check(results, 'genericRuntime', 'generic-runtime 不再直接从 phone-core façade 导入', !has(contents.genericRuntime, "from '../phone-core.js';"));

    check(results, 'viewerRuntime', 'viewer-runtime 改为直接从 callbacks 导入 setCurrentViewingSheet()', has(contents.viewerRuntime, "from '../phone-core/callbacks.js';"));
    check(results, 'viewerRuntime', 'viewer-runtime 不再直接从 phone-core façade 导入', !has(contents.viewerRuntime, "from '../phone-core.js';"));

    check(results, 'specialFeedViewer', 'special feed-viewer 改为直接从 chat-support 导入 sheet 运行时能力', has(contents.specialFeedViewer, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialFeedViewer', 'special feed-viewer 改为直接从 routing 导入 navigateBack()', has(contents.specialFeedViewer, "from '../../phone-core/routing.js';"));
    check(results, 'specialFeedViewer', 'special feed-viewer 不再直接从 phone-core façade 导入', !has(contents.specialFeedViewer, "from '../../phone-core.js';"));

    check(results, 'specialMessageViewer', 'special message-viewer 改为直接从 chat-support 导入聊天运行时能力', has(contents.specialMessageViewer, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialMessageViewer', 'special message-viewer 改为直接从 routing 导入 navigateBack()', has(contents.specialMessageViewer, "from '../../phone-core/routing.js';"));
    check(results, 'specialMessageViewer', 'special message-viewer 不再直接从 phone-core façade 导入', !has(contents.specialMessageViewer, "from '../../phone-core.js';"));

    check(results, 'specialMessageViewerActions', 'special message-viewer-actions 改为直接从 chat-support 导入动作依赖', has(contents.specialMessageViewerActions, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialMessageViewerActions', 'special message-viewer-actions 不再直接从 phone-core façade 导入', !has(contents.specialMessageViewerActions, "from '../../phone-core.js';"));

    check(results, 'specialMessageViewerHelpers', 'special message-viewer-helpers 改为直接从 chat-support 导入角色显示能力', has(contents.specialMessageViewerHelpers, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialMessageViewerHelpers', 'special message-viewer-helpers 不再直接从 phone-core façade 导入', !has(contents.specialMessageViewerHelpers, "from '../../phone-core.js';"));

    check(results, 'beautifyShared', 'beautify shared 改为直接从 settings 导入设置能力', has(contents.beautifyShared, "from '../settings.js';"));
    check(results, 'beautifyShared', 'beautify shared 不再直接从 phone-core façade 导入', !has(contents.beautifyShared, "from '../phone-core.js';"));

    check(results, 'beautifyRepository', 'beautify repository 改为直接从 settings 导入设置能力', has(contents.beautifyRepository, "from '../settings.js';"));
    check(results, 'beautifyRepository', 'beautify repository 不再直接从 phone-core façade 导入', !has(contents.beautifyRepository, "from '../phone-core.js';"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[phone-core-import-convergence-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[phone-core-import-convergence-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
