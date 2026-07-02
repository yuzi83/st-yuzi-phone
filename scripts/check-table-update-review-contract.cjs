const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    constants: 'modules/table-update-review/constants.js',
    routeRenderer: 'modules/phone-core/route-renderer.js',
    preload: 'modules/phone-core/preload.js',
    homeViewModel: 'modules/phone-home/view-model.js',
    visibilitySettings: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    iconSlots: 'modules/settings-app/services/appearance-settings/icon-slots.js',
    reviewIndex: 'modules/table-update-review/index.js',
    templates: 'modules/table-update-review/templates.js',
    interactions: 'modules/table-update-review/interactions.js',
    service: 'modules/table-update-review/service.js',
    floorWindow: 'modules/table-update-review/floor-window.js',
    session: 'modules/table-update-review/session.js',
    contextFingerprint: 'modules/table-update-review/context-fingerprint.js',
    snapshot: 'modules/table-update-review/snapshot.js',
    navigationIntent: 'modules/table-update-review/navigation-intent.js',
    viewerRuntime: 'modules/table-viewer/generic-runtime.js',
    reviewIntentResolver: 'modules/table-viewer/review-intent-resolver.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function appearsBefore(content, firstSnippet, secondSnippet) {
    const firstIndex = content.indexOf(firstSnippet);
    const secondIndex = content.indexOf(secondSnippet);
    return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );
    const results = [];

    check(results, 'constants', '审核 App 常量固定 app id', has(contents.constants, "TABLE_UPDATE_REVIEW_APP_ID = 'table-update-review'"));
    check(results, 'constants', '审核 App 常量固定 route', has(contents.constants, "TABLE_UPDATE_REVIEW_ROUTE = 'table-update-review'"));
    check(results, 'constants', '审核 App 常量固定显示名称和文字图标', has(contents.constants, "TABLE_UPDATE_REVIEW_APP_NAME = '审核'") && has(contents.constants, "TABLE_UPDATE_REVIEW_APP_ICON_TEXT = '审'"));
    check(results, 'constants', '审核跳转继续使用 table-generic 路由前缀', has(contents.constants, "TABLE_GENERIC_ROUTE_PREFIX = 'table-generic:'"));
    check(results, 'constants', '审核页字段摘要不再保留数量截断常量', !has(contents.constants, 'TABLE_UPDATE_REVIEW_MAX_VISIBLE_FIELDS'));

    check(results, 'routeRenderer', 'route-renderer 在 app: 分支前处理审核 route', appearsBefore(contents.routeRenderer, "route === 'table-update-review'", "route.startsWith('app:')"));
    check(results, 'routeRenderer', 'route-renderer 动态导入审核页入口', has(contents.routeRenderer, "await import('../table-update-review/index.js')"));
    check(results, 'routeRenderer', 'route-renderer 调用 renderTableUpdateReview 并传入 renderToken', has(contents.routeRenderer, 'renderTableUpdateReview(page, { renderToken });'));

    check(results, 'preload', 'preload 预热审核页入口模块', has(contents.preload, "'../table-update-review/index.js'"));
    check(results, 'preload', 'preload 审核入口路径与 route-renderer 动态 import 一致', has(contents.preload, "'../table-update-review/index.js'") && has(contents.routeRenderer, "await import('../table-update-review/index.js')"));


    check(results, 'homeViewModel', '首页 view-model 导入审核 App 常量', has(contents.homeViewModel, "from '../table-update-review/constants.js'")
        && has(contents.homeViewModel, 'TABLE_UPDATE_REVIEW_APP_ID')
        && has(contents.homeViewModel, 'TABLE_UPDATE_REVIEW_APP_NAME')
        && has(contents.homeViewModel, 'TABLE_UPDATE_REVIEW_ROUTE')
        && has(contents.homeViewModel, 'TABLE_UPDATE_REVIEW_APP_ICON_TEXT'));
    check(results, 'homeViewModel', '首页审核 App 受 hiddenTableApps 控制', has(contents.homeViewModel, 'if (!hiddenTableApps[TABLE_UPDATE_REVIEW_APP_ID])'));
    check(results, 'homeViewModel', '首页审核 App 支持自定义图标', has(contents.homeViewModel, 'phoneSettings?.appIcons?.[TABLE_UPDATE_REVIEW_APP_ID]'));
    check(results, 'homeViewModel', '首页审核 App 标记为系统 App 并使用审核 route', has(contents.homeViewModel, 'isSystemApp: true')
        && has(contents.homeViewModel, 'route: TABLE_UPDATE_REVIEW_ROUTE'));

    check(results, 'visibilitySettings', '隐藏图标设置导入审核 App 常量', has(contents.visibilitySettings, "from '../../../table-update-review/constants.js'"));
    check(results, 'visibilitySettings', '隐藏图标设置包含审核 App', has(contents.visibilitySettings, '{ key: TABLE_UPDATE_REVIEW_APP_ID, name: TABLE_UPDATE_REVIEW_APP_NAME }'));
    check(results, 'iconSlots', '外观图标槽导入审核 App 常量', has(contents.iconSlots, "from '../../../table-update-review/constants.js'"));
    check(results, 'iconSlots', '外观图标槽包含审核系统 App', has(contents.iconSlots, "{ key: TABLE_UPDATE_REVIEW_APP_ID, name: TABLE_UPDATE_REVIEW_APP_NAME, type: 'system' }"));

    check(results, 'reviewIndex', '审核页入口导出 renderTableUpdateReview', has(contents.reviewIndex, 'export function renderTableUpdateReview(container, options = {})'));
    check(results, 'reviewIndex', '审核页入口启动审核服务并订阅状态', has(contents.reviewIndex, 'startTableUpdateReviewService();')
        && has(contents.reviewIndex, 'subscribeReviewState((state) => renderContent(state))'));
    check(results, 'reviewIndex', '审核页入口绑定交互并传入 renderToken 活性检查', has(contents.reviewIndex, 'bindTableUpdateReviewInteractions(container, { isActive })')
        && has(contents.reviewIndex, 'getPhoneCoreState().routeRenderToken === renderToken'));
    check(results, 'reviewIndex', '审核页入口在 dispose 时释放 runtime', has(contents.reviewIndex, 'runtime.dispose();')
        && has(contents.reviewIndex, 'observePageDisconnectionAfterMount(container, runtime, dispose)'));


    check(results, 'templates', '审核页模板导出页面和内容构建函数', has(contents.templates, 'export function buildTableUpdateReviewContentHtml(')
        && has(contents.templates, 'export function buildTableUpdateReviewPageHtml('));
    for (const selector of [
        'tur-page',
        'tur-nav',
        'tur-content',
        'tur-summary',
        'tur-table-list',
        'tur-table-card',
        'tur-change-item',
        'tur-change-main',
        'tur-empty',
        'tur-field-name',
        'tur-field-before',
        'tur-field-after',
        'is-single-value',
    ]) {
        check(results, 'templates', `审核页模板包含结构类 ${selector}`, has(contents.templates, selector));
    }
    check(results, 'templates', '审核页模板移除刷新按钮与刷新 action', !has(contents.templates, 'tur-refresh-btn')
        && !has(contents.templates, 'data-action="refresh-review"'));
    check(results, 'templates', '审核页模板使用 details/summary 折叠表分组', has(contents.templates, '<details')
        && has(contents.templates, '<summary'));
    check(results, 'templates', '审核页模板仅可导航项输出变更项导航 data 字段', has(contents.templates, 'data-action="open-review-change"')
        && has(contents.templates, 'data-sheet-key=')
        && has(contents.templates, 'data-row-id=')
        && has(contents.templates, 'data-row-index=')
        && has(contents.templates, 'data-change-type='));
    check(results, 'templates', '审核页删除项渲染为不可点击 article 且无 open-review-change action', has(contents.templates, '<article class="tur-change-item is-delete"')
        && has(contents.templates, "if (change.type === 'delete')")
        && !has(contents.templates, 'data-action="open-review-change" data-change-type="delete"'));
    check(results, 'templates', '审核页视觉隐藏 row_id/id/行号 身份字段且展示全部过滤后字段', has(contents.templates, 'function isReviewIdentityField')
        && has(contents.templates, "normalized === 'row_id'")
        && has(contents.templates, "normalized === 'id'")
        && has(contents.templates, "normalized === '行号'")
        && has(contents.templates, 'const displayFields = getVisibleReviewFields(fields);')
        && has(contents.templates, 'return displayFields.map((field) => {')
        && !has(contents.templates, 'tur-field-more')
        && !has(contents.templates, 'restCount'));
    check(results, 'templates', '审核页字段摘要按 change.type 区分单值和双值展示', has(contents.templates, "function buildFieldSummaryHtml(fields = [], changeType = 'update')")
        && has(contents.templates, "if (changeType === 'insert')")
        && has(contents.templates, "if (changeType === 'delete')")
        && has(contents.templates, 'tur-field-block is-insert is-single-value')
        && has(contents.templates, 'tur-field-block is-delete is-single-value')
        && has(contents.templates, 'tur-field-block is-update')
        && has(contents.templates, '<span class="tur-field-arrow">→</span>')
        && has(contents.templates, 'buildFieldSummaryHtml(change.fields, change.type)'));
    check(results, 'templates', '审核页摘要显示 AI 回复序号而非真实楼层号', has(contents.templates, 'function formatAiReplyFloorText')
        && has(contents.templates, 'Math.floor(realFloorId / 2) + 1') && has(contents.templates, 'AI 回复第'));

    check(results, 'interactions', '审核页交互绑定 nav-back 且不再处理 refresh-review', has(contents.interactions, "action === 'nav-back'")
        && has(contents.interactions, 'navigateBack();')
        && !has(contents.interactions, "action === 'refresh-review'")
        && !has(contents.interactions, 'onRefresh();'));
    check(results, 'interactions', '审核页点击新增/修改项写入一次性导航 intent 并拒绝删除项', has(contents.interactions, "action === 'open-review-change'")
        && has(contents.interactions, "if (changeType === 'delete') return;")
        && has(contents.interactions, 'setPendingTableReviewNavigationIntent({')
        && has(contents.interactions, 'sheetKey,')
        && has(contents.interactions, 'rowId: String(actionEl.dataset.rowId ||')
        && has(contents.interactions, 'rowIndex: Number(actionEl.dataset.rowIndex)'));
    check(results, 'interactions', '审核页点击变更项导航到 table-generic 路由', has(contents.interactions, 'navigateTo(`${TABLE_GENERIC_ROUTE_PREFIX}${sheetKey}`);'));

    check(results, 'service', '审核服务使用 subscribeTableUpdate 订阅表格更新', has(contents.service, "import { subscribeTableUpdate } from '../phone-core/callbacks.js';")
        && has(contents.service, 'const unsubscribe = subscribeTableUpdate((event) => {'));
    check(results, 'service', '审核服务不得使用全局 registerTableUpdateListener', !has(contents.service, 'registerTableUpdateListener'));
    check(results, 'service', '审核服务订阅 generation/message/chat 事件并交给 session 编排', has(contents.service, 'onGenerationStarted')
        && has(contents.service, 'onMessageReceived')
        && has(contents.service, 'onCharacterMessageRendered')
        && has(contents.service, 'onMessageSent')
        && has(contents.service, 'onChatChanged')
        && has(contents.service, 'createTableUpdateReviewSession'));
    check(results, 'service', '审核服务使用 runtime 管理 debounce 和 cleanup', has(contents.service, "createRuntimeScope('table-update-review-service')")
        && has(contents.service, 'runtime.setTimeout(')
        && has(contents.service, 'runtime.clearTimeout(debounceTimer)')
        && has(contents.service, 'runtime.registerCleanup('));
    check(results, 'service', '审核服务不再推进 baselineSnapshot 为 nextSnapshot', !has(contents.service, 'baselineSnapshot = nextSnapshot')
        && !has(contents.service, 'publishBaseline(readCurrentTableSnapshot())'));
    check(results, 'service', '审核服务基于固定 baselineSnapshot 与 latestSnapshot 计算净变化', has(contents.service, 'diffSnapshots(sessionState.baselineSnapshot, sessionState.latestSnapshot')
        || has(contents.session, 'diffSnapshots(sessionState.baselineSnapshot, sessionState.latestSnapshot'));
    check(results, 'service', '审核服务 stop 会释放 runtime 并重置状态', has(contents.service, 'export function stopTableUpdateReviewService()')
        && has(contents.service, 'runtime.dispose();')
        && has(contents.service, "resetReviewState('审核服务已停止')"));

    check(results, 'floorWindow', '楼层窗口 MESSAGE_SENT 只关闭接收窗口，不创建用户审核楼', has(contents.floorWindow, 'closeReceivingWindow')
        && has(contents.floorWindow, "onMessageSent(() => closeReceivingWindow('message-sent'))")
        && !has(contents.floorWindow, "markBoundary('user-boundary')"));
    check(results, 'floorWindow', '楼层窗口 CHAT_CHANGED 重置窗口', has(contents.floorWindow, "onChatChanged(() => resetWindow('chat-changed'))"));

    check(results, 'session', '审核 session 暴露 v2 会话 API', has(contents.session, 'export function createTableUpdateReviewSession(')
        && has(contents.session, 'beginPreSnapshot')
        && has(contents.session, 'openAiFloor')
        && has(contents.session, 'closeReceivingWindow')
        && has(contents.session, 'applyTableUpdate')
        && has(contents.session, 'resetReviewSession')
        && has(contents.session, 'getReviewSessionStatus'));
    check(results, 'contextFingerprint', '上下文指纹包含 schemaSignature 且不包含单元格内容', has(contents.contextFingerprint, 'buildTableSchemaSignature')
        && has(contents.contextFingerprint, 'buildReviewContextFingerprint')
        && has(contents.contextFingerprint, 'schemaSignature')
        && !has(contents.contextFingerprint, '.cells'));
    check(results, 'snapshot', '审核行标题 fallback 会跳过 row_id/id/行号 身份字段', has(contents.snapshot, 'const REVIEW_IDENTITY_HEADERS')
        && has(contents.snapshot, "'row_id'")
        && has(contents.snapshot, "'id'")
        && has(contents.snapshot, "'行号'")
        && has(contents.snapshot, 'function isReviewIdentityHeader(header)')
        && has(contents.snapshot, 'if (isReviewIdentityHeader(headers[index])) continue;')
        && appearsBefore(contents.snapshot, 'if (isReviewIdentityHeader(headers[index])) continue;', 'return \'未命名\';'));
    check(results, 'templates', '审核变更项保留 data-row-id 供定位但不再显示 ID 小字', has(contents.templates, 'data-row-id="${escapeHtmlAttr(change.rowId || \'\')}"')
        && has(contents.templates, 'const rowLabel = `第 ${formatCount(change.rowIndex) + 1} 行`;')
        && !has(contents.templates, 'ID ${change.rowId}'));

    check(results, 'navigationIntent', '审核导航 intent 暴露 set/peek/clear/consume API', has(contents.navigationIntent, 'export function setPendingTableReviewNavigationIntent(')
        && has(contents.navigationIntent, 'export function peekPendingTableReviewNavigationIntent()')
        && has(contents.navigationIntent, 'export function clearPendingTableReviewNavigationIntent()')
        && has(contents.navigationIntent, 'export function consumePendingTableReviewNavigationIntent(sheetKey)'));
    check(results, 'navigationIntent', '审核导航 intent 校验 sheetKey 并规范 rowIndex', has(contents.navigationIntent, "const sheetKey = String(intent.sheetKey || '').trim();")
        && has(contents.navigationIntent, 'if (!sheetKey) return null;')
        && has(contents.navigationIntent, 'Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : -1'));
    check(results, 'navigationIntent', '审核导航 intent 保留 changeType 并可防御 delete', has(contents.navigationIntent, 'changeType:')
        && has(contents.navigationIntent, "String(intent.changeType || '').trim()"));
    check(results, 'navigationIntent', '审核导航 intent 消费时必须匹配 sheetKey 并清理 pendingIntent', has(contents.navigationIntent, "if (!pendingIntent || pendingIntent.sheetKey !== key) return null;")
        && has(contents.navigationIntent, 'pendingIntent = null;')
        && has(contents.navigationIntent, 'return { ...intent };'));

    check(results, 'reviewIntentResolver', 'viewer resolver 按 delete none、rowId 优先、rowIndex fallback 定位详情行', has(contents.reviewIntentResolver, 'export function resolveReviewIntentTargetRowIndex')
        && has(contents.reviewIntentResolver, "changeType === 'delete'")
        && has(contents.reviewIntentResolver, "matchedBy: 'rowId'")
        && has(contents.reviewIntentResolver, "matchedBy: 'rowIndex'")
        && has(contents.reviewIntentResolver, "if (targetRowId) {")
        && has(contents.reviewIntentResolver, "return buildResolvedResult(-1, 'none');\n    }\n\n    const fallbackRowIndex")
        && appearsBefore(contents.reviewIntentResolver, "return buildResolvedResult(-1, 'none');\n    }\n\n    const fallbackRowIndex", "matchedBy: 'rowIndex'"));
    check(results, 'viewerRuntime', 'generic runtime 消费审核 intent 后进入详情页而不是自动开启本楼过滤', has(contents.viewerRuntime, 'resolveReviewIntentTargetRowIndex')
        && has(contents.viewerRuntime, 'state.enterDetailMode(rowIndex)')
        && !has(contents.viewerRuntime, "state.set('onlyShowReviewUpdates', true);"));
    check(results, 'viewerRuntime', '审核 intent 命中详情后不被 forceListMode 回退成列表页', has(contents.viewerRuntime, 'let enteredReviewDetail = false;')
        && has(contents.viewerRuntime, 'enteredReviewDetail = true;')
        && has(contents.viewerRuntime, "&& !enteredReviewDetail)"));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[table-update-review-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[table-update-review-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
