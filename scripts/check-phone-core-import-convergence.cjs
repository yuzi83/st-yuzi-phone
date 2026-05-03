const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 注：阶段二 step_9/step_10/step_12 已把 phone-settings.js / phone-home.js / phone-core.js façade 全部删除。
// 入口现分别位于：
//   - modules/settings-app/render.js（renderSettings）
//   - modules/phone-home/render.js（renderHomeScreen）
//   - modules/phone-core/lifecycle.js / data-api.js / routing.js / 等子模块（不再有汇总 façade）
const FILES = {
    phoneFusionRender: 'modules/phone-fusion/render.js',
    sharedUi: 'modules/table-viewer/shared-ui.js',
    tableViewerState: 'modules/table-viewer/state.js',
    phoneHomeRender: 'modules/phone-home/render.js',
    settingsAppRender: 'modules/settings-app/render.js',
    backgroundService: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUploadService: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    layoutSettings: 'modules/settings-app/services/appearance-settings/layout-settings.js',
    visibilitySettings: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    manualUpdate: 'modules/settings-app/services/manual-update.js',
    tableViewerRender: 'modules/table-viewer/render.js',
    genericViewer: 'modules/table-viewer/generic-viewer.js',
    genericRuntime: 'modules/table-viewer/generic-runtime.js',
    viewerRuntime: 'modules/table-viewer/runtime.js',
    specialMessageViewer: 'modules/table-viewer/special/message-viewer.js',
    specialMessageViewerActions: 'modules/table-viewer/special/message-viewer-actions.js',
    specialMessageViewerHelpers: 'modules/table-viewer/special/message-viewer-helpers.js',
    beautifyShared: 'modules/phone-beautify-templates/shared.js',
    beautifyRepository: 'modules/phone-beautify-templates/repository.js',
};

const FACADE_RELATIVE_PATH = 'modules/phone-core.js';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
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

    // façade 已删除：物理校验
    results.push({
        file: FACADE_RELATIVE_PATH,
        description: 'phone-core façade 已删除',
        ok: !exists(FACADE_RELATIVE_PATH),
    });

    check(results, 'phoneFusionRender', 'phone-fusion render 改为直接从 routing 导入 navigateBack()', has(contents.phoneFusionRender, "from '../phone-core/routing.js';"));
    check(results, 'phoneFusionRender', 'phone-fusion render 不再从 phone-core façade 导入', !has(contents.phoneFusionRender, "from '../phone-core.js';"));

    check(results, 'sharedUi', 'shared-ui 改为直接从 scroll-guards 导入 bindPhoneScrollGuards()', has(contents.sharedUi, "from '../phone-core/scroll-guards.js';"));
    check(results, 'sharedUi', 'shared-ui 不再从 phone-core façade 导入', !has(contents.sharedUi, "from '../phone-core.js';"));

    check(results, 'tableViewerState', 'table-viewer state 改为直接从 data-api 导入 getTableLockState()', has(contents.tableViewerState, "from '../phone-core/data-api.js';"));
    check(results, 'tableViewerState', 'table-viewer state 不再从 phone-core façade 导入', !has(contents.tableViewerState, "from '../phone-core.js';"));

    check(results, 'phoneHomeRender', 'phone-home render 改为直接从 data-api 导入表格与面板能力', has(contents.phoneHomeRender, "from '../phone-core/data-api.js';"));
    check(results, 'phoneHomeRender', 'phone-home render 改为直接从 routing 导入 navigateTo()', has(contents.phoneHomeRender, "from '../phone-core/routing.js';"));
    check(results, 'phoneHomeRender', 'phone-home render 改为直接从 settings 导入 getPhoneSettings()', has(contents.phoneHomeRender, "from '../settings.js';"));
    check(results, 'phoneHomeRender', 'phone-home render 不再从 phone-core façade 导入', !has(contents.phoneHomeRender, "from '../phone-core.js';"));

    check(results, 'settingsAppRender', 'settings-app render 改为直接从 data-api 导入数据库相关能力', has(contents.settingsAppRender, "from '../phone-core/data-api.js';"));
    check(results, 'settingsAppRender', 'settings-app render 改为直接从 chat-support 导入 AI 指令预设能力', has(contents.settingsAppRender, "from '../phone-core/chat-support.js';"));
    check(results, 'settingsAppRender', 'settings-app render 改为直接从 routing 导入 navigateBack()', has(contents.settingsAppRender, "from '../phone-core/routing.js';"));
    check(results, 'settingsAppRender', 'settings-app render 改为直接从 scroll-guards 导入 bindPhoneScrollGuards()', has(contents.settingsAppRender, "from '../phone-core/scroll-guards.js';"));
    check(results, 'settingsAppRender', 'settings-app render 改为直接从 settings 导入基础设置能力', has(contents.settingsAppRender, "from '../settings.js';"));
    check(results, 'settingsAppRender', 'settings-app render 不再从 phone-core façade 导入', !has(contents.settingsAppRender, "from '../phone-core.js';"));

    check(results, 'backgroundService', 'background-service 改为直接从 settings 导入基础设置能力', has(contents.backgroundService, "from '../../../settings.js';"));
    check(results, 'backgroundService', 'background-service 不再从 phone-core façade 导入', !has(contents.backgroundService, "from '../../../phone-core.js';"));

    check(results, 'iconUploadService', 'icon-upload-service 改为直接从 data-api 导入表格能力', has(contents.iconUploadService, "from '../../../phone-core/data-api.js';"));
    check(results, 'iconUploadService', 'icon-upload-service 改为直接从 settings 导入基础设置能力', has(contents.iconUploadService, "from '../../../settings.js';"));
    check(results, 'iconUploadService', 'icon-upload-service 不再从 phone-core façade 导入', !has(contents.iconUploadService, "from '../../../phone-core.js';"));

    check(results, 'layoutSettings', 'layout-settings 改为直接从 settings 导入基础设置能力', has(contents.layoutSettings, "from '../../../settings.js';"));
    check(results, 'layoutSettings', 'layout-settings 不再从 phone-core façade 导入', !has(contents.layoutSettings, "from '../../../phone-core.js';"));

    check(results, 'visibilitySettings', 'visibility-settings 改为直接从 data-api 导入表格能力', has(contents.visibilitySettings, "from '../../../phone-core/data-api.js';"));
    check(results, 'visibilitySettings', 'visibility-settings 改为直接从 settings 导入基础设置能力', has(contents.visibilitySettings, "from '../../../settings.js';"));
    check(results, 'visibilitySettings', 'visibility-settings 不再从 phone-core façade 导入', !has(contents.visibilitySettings, "from '../../../phone-core.js';"));

    check(results, 'manualUpdate', 'manual-update 改为直接从 data-api 导入 triggerManualUpdate()', has(contents.manualUpdate, "from '../../phone-core/data-api.js';"));
    check(results, 'manualUpdate', 'manual-update 不再从 phone-core façade 导入', !has(contents.manualUpdate, "from '../../phone-core.js';"));

    check(results, 'tableViewerRender', 'table-viewer render 改为直接从 routing 导入 navigateBack()', has(contents.tableViewerRender, "from '../phone-core/routing.js';"));
    check(results, 'tableViewerRender', 'table-viewer render 不再从 phone-core façade 取值', !has(contents.tableViewerRender, "from '../phone-core.js';"));
    check(results, 'tableViewerRender', 'table-viewer render 改为通过 table-viewer context 收口表格数据准备', has(contents.tableViewerRender, "from './context.js';"));
    check(results, 'tableViewerRender', 'table-viewer render 改为通过 viewerRuntime.startViewerSession() 启动 viewing sheet 会话', has(contents.tableViewerRender, 'viewerRuntime.startViewerSession();'));
    check(results, 'tableViewerRender', 'table-viewer render 不再直接从 callbacks 导入 viewing sheet 状态', !has(contents.tableViewerRender, "from '../phone-core/callbacks.js';"));

    check(results, 'genericViewer', 'generic-viewer 改为通过 generic-runtime 收口运行时装配', has(contents.genericViewer, "from './generic-runtime.js';"));
    check(results, 'genericViewer', 'generic-viewer 不再从 phone-core façade 导入', !has(contents.genericViewer, "from '../phone-core.js';"));

    check(results, 'genericRuntime', 'generic-runtime 改为直接从 data-api 导入表格能力', has(contents.genericRuntime, "from '../phone-core/data-api.js';"));
    check(results, 'genericRuntime', 'generic-runtime 改为直接从 routing 导入 navigateBack()', has(contents.genericRuntime, "from '../phone-core/routing.js';"));
    check(results, 'genericRuntime', 'generic-runtime 改为直接从 chat-support 导入 sheet 运行时能力', has(contents.genericRuntime, "from '../phone-core/chat-support.js';"));
    check(results, 'genericRuntime', 'generic-runtime 不再从 phone-core façade 导入', !has(contents.genericRuntime, "from '../phone-core.js';"));

    check(results, 'viewerRuntime', 'viewer-runtime 改为直接从 callbacks 导入 setCurrentViewingSheet()', has(contents.viewerRuntime, "from '../phone-core/callbacks.js';"));
    check(results, 'viewerRuntime', 'viewer-runtime 不再从 phone-core façade 导入', !has(contents.viewerRuntime, "from '../phone-core.js';"));

    check(results, 'specialMessageViewer', 'special message-viewer 改为直接从 chat-support 导入聊天运行时能力', has(contents.specialMessageViewer, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialMessageViewer', 'special message-viewer 详情返回由 detail-controller 本地 handleNavBack() 收口，不再强制导入 routing', has(contents.specialMessageViewer, "from './message-viewer/detail-controller.js';") && !has(contents.specialMessageViewer, "from '../../phone-core/routing.js';"));
    check(results, 'specialMessageViewer', 'special message-viewer 不再从 phone-core façade 导入', !has(contents.specialMessageViewer, "from '../../phone-core.js';"));

    check(results, 'specialMessageViewerActions', 'special message-viewer-actions 改为直接从 chat-support 导入动作依赖', has(contents.specialMessageViewerActions, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialMessageViewerActions', 'special message-viewer-actions 不再从 phone-core façade 导入', !has(contents.specialMessageViewerActions, "from '../../phone-core.js';"));

    check(results, 'specialMessageViewerHelpers', 'special message-viewer-helpers 改为直接从 chat-support 导入角色显示能力', has(contents.specialMessageViewerHelpers, "from '../../phone-core/chat-support.js';"));
    check(results, 'specialMessageViewerHelpers', 'special message-viewer-helpers 不再从 phone-core façade 导入', !has(contents.specialMessageViewerHelpers, "from '../../phone-core.js';"));

    check(results, 'beautifyShared', 'beautify shared 作为兼容导出层不再直接持有 settings 读写能力', !has(contents.beautifyShared, "from '../settings.js';") && has(contents.beautifyShared, "from './store.js';"));
    check(results, 'beautifyShared', 'beautify shared 不再从 phone-core façade 导入', !has(contents.beautifyShared, "from '../phone-core.js';"));

    check(results, 'beautifyRepository', 'beautify repository 改为直接从 settings 导入设置能力', has(contents.beautifyRepository, "from '../settings.js';"));
    check(results, 'beautifyRepository', 'beautify repository 不再从 phone-core façade 导入', !has(contents.beautifyRepository, "from '../phone-core.js';"));

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
