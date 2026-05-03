const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    config: 'modules/phone-theater/config.js',
    data: 'modules/phone-theater/data.js',
    deleteService: 'modules/phone-theater/delete-service.js',
    render: 'modules/phone-theater/render.js',
    templates: 'modules/phone-theater/templates.js',
    interactions: 'modules/phone-theater/interactions.js',
    coreTableIndex: 'modules/phone-theater/core/table-index.js',
    coreDeleteKey: 'modules/phone-theater/core/delete-key.js',
    coreRenderKit: 'modules/phone-theater/core/render-kit.js',
    scenesIndex: 'modules/phone-theater/scenes/index.js',
    squareScene: 'modules/phone-theater/scenes/square.js',
    forumScene: 'modules/phone-theater/scenes/forum.js',
    liveScene: 'modules/phone-theater/scenes/live.js',
    homeViewModel: 'modules/phone-home/view-model.js',
    routeRenderer: 'modules/phone-core/route-renderer.js',
    notifications: 'modules/phone-core/notifications.js',
    visibilitySettings: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    iconUploadService: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    theaterLifecycleCheck: 'scripts/check-theater-lifecycle.cjs',
    theaterCss: 'styles/06-phone-theater.css',
    theaterCssIndex: 'styles/phone-theater/index.css',
    theaterCoreCss: 'styles/phone-theater/00-core.css',
    squareCss: 'styles/phone-theater/square.css',
    forumCss: 'styles/phone-theater/forum.css',
    liveCss: 'styles/phone-theater/live.css',
    homeCss: 'styles/phone-base/02-page-home.css',
    rootCss: 'style.css',
    specDoc: 'docs/reference/theater-scene-extension-spec.md',
};

const CORE_NO_SCENE_BRANCH_FILES = [
    'data',
    'deleteService',
    'render',
    'templates',
    'interactions',
];

const SCENES = [
    {
        key: 'squareScene',
        cssKey: 'squareCss',
        id: 'square',
        exportName: 'squareScene',
        appKey: '__theater_square',
        tables: ['广场主贴表', '广场精选评论表', '广场普通评论分栏表'],
        roles: ['posts', 'featuredComments', 'commentBands'],
        deleteRoles: ['post'],
        requiredClasses: [
            'phone-theater-square-feed',
            'phone-theater-square-post',
            'phone-theater-square-card-head',
            'phone-theater-square-featured',
            'phone-theater-square-comments',
            'phone-theater-square-noise',
            'phone-theater-square-footer',
        ],
        requiredDeletionFields: ['帖子ID', '帖子唯一标识', '关联帖子ID'],
        requiredIdentityAliases: ['帖子ID', '帖子唯一标识'],
    },
    {
        key: 'forumScene',
        cssKey: 'forumCss',
        id: 'forum',
        exportName: 'forumScene',
        appKey: '__theater_forum',
        tables: ['论坛主贴表', '论坛精选回应表', '论坛小组侧栏表'],
        roles: ['threads', 'featuredReplies', 'sidebar'],
        deleteRoles: ['thread', 'sidebar'],
        requiredClasses: [
            'phone-theater-forum-home',
            'phone-theater-forum-channel-bar',
            'phone-theater-forum-hot-panel',
            'phone-theater-forum-note-card',
            'phone-theater-forum-cover',
            'phone-theater-forum-floor-reply',
            'phone-theater-forum-floor-index',
        ],
        requiredDeletionFields: ['帖子标题', '关联帖子标题', '分区/版面名', '栏目类型', '栏目标题'],
    },
    {
        key: 'liveScene',
        cssKey: 'liveCss',
        id: 'live',
        exportName: 'liveScene',
        appKey: '__theater_live',
        tables: ['直播间主表', '直播间弹幕分栏表'],
        roles: ['rooms', 'barrageBands'],
        deleteRoles: ['room'],
        requiredClasses: [
            'phone-theater-live-page',
            'phone-theater-live-room',
            'phone-theater-live-stage',
            'phone-theater-barrage-overlay',
            'phone-theater-barrage-pool',
            'phone-theater-barrage-toggle',
        ],
        requiredDeletionFields: ['直播间名', '所属直播间名'],
    },
];

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function has(content, snippet) {
    return String(content || '').includes(snippet);
}

function pushCheck(results, fileKey, description, ok) {
    results.push({
        file: FILES[fileKey],
        description,
        ok: !!ok,
    });
}

function unique(values) {
    return new Set(values).size === values.length;
}

function indexOfOrInfinity(content, snippet) {
    const index = content.indexOf(snippet);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
}

function hasAny(content, snippets) {
    return snippets.some(snippet => has(content, snippet));
}

function checkSceneModule(results, contents, scene) {
    const content = contents[scene.key] || '';
    const cssContent = contents[scene.cssKey] || '';

    pushCheck(results, scene.key, `${scene.id} scene 导出 ${scene.exportName}`, has(content, `export const ${scene.exportName} = Object.freeze`));
    pushCheck(results, scene.key, `${scene.id} scene 声明 id`, has(content, `id: '${scene.id}'`));
    pushCheck(results, scene.key, `${scene.id} scene 声明 appKey`, has(content, `appKey: '${scene.appKey}'`));
    pushCheck(results, scene.key, `${scene.id} scene 声明 primaryTableRole`, has(content, 'primaryTableRole:'));
    pushCheck(results, scene.key, `${scene.id} scene 声明 fieldSchema`, has(content, 'fieldSchema: Object.freeze'));
    pushCheck(results, scene.key, `${scene.id} scene 声明 contract`, has(content, 'contract: Object.freeze'));
    pushCheck(results, scene.key, `${scene.id} scene 实现 buildViewModel`, has(content, 'function buildViewModel(') && has(content, 'buildViewModel,'));
    pushCheck(results, scene.key, `${scene.id} scene 实现 collectDeletableKeys`, has(content, 'function collectDeletableKeys(') && has(content, 'collectDeletableKeys,'));
    pushCheck(results, scene.key, `${scene.id} scene 实现 deleteEntities`, has(content, 'function deleteEntities(') && has(content, 'deleteEntities,'));
    pushCheck(results, scene.key, `${scene.id} scene 实现 renderContent`, has(content, 'function renderContent(') && has(content, 'renderContent,'));
    pushCheck(results, scene.key, `${scene.id} scene 表名齐全`, scene.tables.every(tableName => has(content, tableName)));
    pushCheck(results, scene.key, `${scene.id} scene role 齐全`, scene.roles.every(role => has(content, `${role}:`)));
    pushCheck(results, scene.key, `${scene.id} scene 使用 typed delete key`, scene.deleteRoles.every(role => has(content, `buildTheaterDeleteKey('${role}'`)));
    pushCheck(results, scene.key, `${scene.id} scene 删除字段齐全`, scene.requiredDeletionFields.every(field => has(content, field)));
    if (Array.isArray(scene.requiredIdentityAliases) && scene.requiredIdentityAliases.length > 0) {
        pushCheck(results, scene.key, `${scene.id} scene 声明身份字段别名`, has(content, 'identityAliases') && scene.requiredIdentityAliases.every(field => has(content, field)));
        pushCheck(results, 'deleteService', `${scene.id} delete-service 支持身份字段别名`, has(contents.deleteService, 'function getIdentityAliases') && has(contents.deleteService, 'resolveIdentityByAliases') && has(contents.deleteService, 'identityAliases'));
    }
    pushCheck(results, scene.key, `${scene.id} scene 不使用裸自然键 deleteKey`, !hasAny(content, ['deleteKey: postId', 'deleteKey: title', 'deleteKey: roomName', 'deleteKey: `sidebar:']));
    pushCheck(results, scene.key, `${scene.id} scene 不使用裸 sidebar 前缀判断`, !has(content, "startsWith('sidebar:')"));
    pushCheck(results, scene.key, `${scene.id} scene 关键 class 齐全`, scene.requiredClasses.every(className => has(content, className)));
    pushCheck(results, scene.cssKey, `${scene.id} CSS 作用域正确`, has(cssContent, `[data-theater-scene="${scene.id}"]`));
    pushCheck(results, scene.cssKey, `${scene.id} CSS 关键 class 齐全`, scene.requiredClasses.every(className => has(cssContent, className)));
}

function checkNoCoreSceneBranches(results, contents) {
    const forbiddenSnippets = [
        "sceneId === 'square'",
        "sceneId === 'forum'",
        "sceneId === 'live'",
        'collectSquareDeletion',
        'collectForumDeletion',
        'collectLiveDeletion',
        'buildSquareViewModel',
        'buildForumViewModel',
        'buildLiveViewModel',
        'renderSquareContent',
        'renderForumContent',
        'renderLiveContent',
    ];

    CORE_NO_SCENE_BRANCH_FILES.forEach((fileKey) => {
        const content = contents[fileKey] || '';
        pushCheck(results, fileKey, '核心文件不再包含 sceneId 三场景分支或旧硬编码函数', !hasAny(content, forbiddenSnippets));
    });

    pushCheck(results, 'interactions', '核心 interactions 不再包含直播专属 selector', !hasAny(contents.interactions, ['phone-theater-barrage-toggle', 'is-barrage-paused', '暂停弹幕', '继续弹幕']));
}

function main() {
    const results = [];

    Object.entries(FILES).forEach(([fileKey, relativePath]) => {
        pushCheck(results, fileKey, `${relativePath} 存在`, exists(relativePath));
    });

    const contents = Object.fromEntries(
        Object.entries(FILES)
            .filter(([, relativePath]) => exists(relativePath))
            .map(([key, relativePath]) => [key, read(relativePath)])
    );

    pushCheck(results, 'config', 'config 作为 registry facade 导出 scene API', has(contents.config, "from './scenes/index.js'") && has(contents.config, 'THEATER_SCENES as THEATER_SCENE_DEFINITIONS'));

    pushCheck(results, 'scenesIndex', 'registry 导入三个内置 scene', SCENES.every(scene => has(contents.scenesIndex, `import { ${scene.exportName} }`)));
    pushCheck(results, 'scenesIndex', 'registry 原始场景列表包含三个内置 scene', SCENES.every(scene => has(contents.scenesIndex, scene.exportName)));
    pushCheck(results, 'scenesIndex', 'registry 导出 route prefix 与 helper', has(contents.scenesIndex, 'export const THEATER_ROUTE_PREFIX') && has(contents.scenesIndex, 'export function buildTheaterRoute') && has(contents.scenesIndex, 'export function isTheaterRoute'));
    pushCheck(results, 'scenesIndex', 'registry 导出 THEATER_SCENES / THEATER_SCENE_IDS / THEATER_APP_KEYS', has(contents.scenesIndex, 'export const THEATER_SCENES') && has(contents.scenesIndex, 'export const THEATER_SCENE_IDS') && has(contents.scenesIndex, 'export const THEATER_APP_KEYS'));
    pushCheck(results, 'scenesIndex', 'registry 导出 scene 反查 helper', has(contents.scenesIndex, 'getTheaterSceneDefinitionByTableName') && has(contents.scenesIndex, 'getTheaterSceneDefinitionByAppKey') && has(contents.scenesIndex, 'getTheaterSceneDefinitionByRoute'));
    pushCheck(results, 'scenesIndex', 'registry 检查 id/appKey/route/tableName 唯一', has(contents.scenesIndex, "assertUnique(ids") && has(contents.scenesIndex, "assertUnique(appKeys") && has(contents.scenesIndex, "assertUnique(routes") && has(contents.scenesIndex, "assertUnique(tableNames"));

    const sceneIds = SCENES.map(scene => scene.id);
    const sceneAppKeys = SCENES.map(scene => scene.appKey);
    const sceneTableNames = SCENES.flatMap(scene => scene.tables);
    pushCheck(results, 'scenesIndex', '契约配置中的内置 scene id 唯一', unique(sceneIds));
    pushCheck(results, 'scenesIndex', '契约配置中的内置 appKey 唯一', unique(sceneAppKeys));
    pushCheck(results, 'scenesIndex', '契约配置中的内置 tableName 唯一', unique(sceneTableNames));

    SCENES.forEach(scene => checkSceneModule(results, contents, scene));

    pushCheck(results, 'data', '数据层导出 getAvailableTheaterScenes()', has(contents.data, 'export function getAvailableTheaterScenes(rawData)'));
    pushCheck(results, 'data', '数据层导出 getGroupedTheaterSheetKeys()', has(contents.data, 'export function getGroupedTheaterSheetKeys(rawData)'));
    pushCheck(results, 'data', '数据层导出 resolveTheaterSceneBySheetKey()', has(contents.data, 'export function resolveTheaterSceneBySheetKey(rawData, sheetKey)'));
    pushCheck(results, 'data', '数据层导出 buildTheaterSceneViewModel()', has(contents.data, 'export function buildTheaterSceneViewModel(rawData, sceneId)'));
    pushCheck(results, 'data', '数据层转发 core helpers', has(contents.data, "from './core/table-index.js'") && has(contents.data, "from './core/delete-key.js'"));
    pushCheck(results, 'data', '数据层调用 scene.buildViewModel', has(contents.data, 'scene.buildViewModel(resolved, helpers)'));
    pushCheck(results, 'data', '数据层不再直接生成 typed deleteKey', !has(contents.data, 'buildTheaterDeleteKey(') || has(contents.data, 'buildTheaterDeleteKey,'));

    pushCheck(results, 'coreDeleteKey', 'delete-key core 导出 typed delete key helpers', has(contents.coreDeleteKey, 'export function buildTheaterDeleteKey') && has(contents.coreDeleteKey, 'export function parseTheaterDeleteKey') && has(contents.coreDeleteKey, 'export function buildDeleteTargets') && has(contents.coreDeleteKey, 'export function hasDeleteTarget'));
    pushCheck(results, 'coreDeleteKey', 'typed delete key 格式包含 role,rowIndex,identity', has(contents.coreDeleteKey, 'safeRole') && has(contents.coreDeleteKey, 'safeRowIndex') && has(contents.coreDeleteKey, 'encodeURIComponent'));
    pushCheck(results, 'coreDeleteKey', 'typed delete key 解析使用 role,rowIndex,identity', has(contents.coreDeleteKey, 'role: match[1]') && has(contents.coreDeleteKey, 'rowIndex') && has(contents.coreDeleteKey, 'identity'));
    pushCheck(results, 'coreDeleteKey', 'typed delete target 使用 rowIndex + identity 精确匹配', has(contents.coreDeleteKey, 'target.rowIndex === rowIndex') && has(contents.coreDeleteKey, 'normalizeText(target.identity) === safeIdentity'));

    pushCheck(results, 'coreRenderKit', 'render-kit 对 tag className 做 token 级净化', has(contents.coreRenderKit, 'function normalizeClassTokenList') && has(contents.coreRenderKit, 'replace(/[^a-zA-Z0-9_-]/g') && has(contents.coreRenderKit, 'safeClassName'));
    pushCheck(results, 'coreRenderKit', 'renderTag 不再直接拼接未净化 className', !has(contents.coreRenderKit, 'phone-theater-tag ${className}'));

    pushCheck(results, 'scenesIndex', 'normalizeTheaterSceneId 只移除 theater route 前缀', has(contents.scenesIndex, 'text.startsWith(THEATER_ROUTE_PREFIX)') && has(contents.scenesIndex, 'text.slice(THEATER_ROUTE_PREFIX.length).trim()') && !has(contents.scenesIndex, "replace(THEATER_ROUTE_PREFIX, '')"));

    pushCheck(results, 'deleteService', 'delete-service 导出 deleteTheaterEntities()', has(contents.deleteService, 'export async function deleteTheaterEntities(rawData, sceneId, selectedKeys = [])'));
    pushCheck(results, 'deleteService', 'delete-service 使用整表保存 saveTableData()', has(contents.deleteService, 'saveTableData(nextRawData)'));
    pushCheck(results, 'deleteService', 'delete-service 保存前重读最新 rawData', has(contents.deleteService, 'getTableData') && has(contents.deleteService, 'saveTableData') && has(contents.deleteService, 'const latestRawData = getTableData();') && has(contents.deleteService, 'cloneRawData(latestRawData)') && !has(contents.deleteService, 'const nextRawData = cloneRawData(rawData);'));
    pushCheck(results, 'deleteService', 'delete-service 保存前执行 selected key 并发校验', has(contents.deleteService, 'function validateSelectedTargets') && has(contents.deleteService, 'const validation = validateSelectedTargets(scene, tables, selectedSet);') && indexOfOrInfinity(contents.deleteService, 'const validation = validateSelectedTargets(scene, tables, selectedSet);') < indexOfOrInfinity(contents.deleteService, 'scene.deleteEntities(') && indexOfOrInfinity(contents.deleteService, 'scene.deleteEntities(') < indexOfOrInfinity(contents.deleteService, 'saveTableData(nextRawData)'));
    pushCheck(results, 'deleteService', 'delete-service 并发校验区分 deleteRole 与 tableRole', has(contents.deleteService, 'function buildDeleteRoleMappings') && has(contents.deleteService, 'getDeleteRoleCandidates(tableRole)') && has(contents.deleteService, 'mappings.get(target.role)') && has(contents.deleteService, 'const tableRole = mappedTableRoles[0];') && has(contents.deleteService, 'resolveTargetIdentity(scene, target.role, tableRole'));
    pushCheck(results, 'deleteService', 'delete-service 支持组合 identity 字段协议', has(contents.deleteService, "identitySpec.split('|')") && has(contents.deleteService, "getCellByHeader(table, row, header)") && has(contents.deleteService, ".join('|')"));
    pushCheck(results, 'deleteService', 'delete-service 删除后刷新投影并派发表更新', has(contents.deleteService, 'refreshPhoneTableProjection()') && has(contents.deleteService, 'dispatchPhoneTableUpdated(sheetKey)'));
    pushCheck(results, 'deleteService', 'delete-service 调用 scene.deleteEntities(context)', has(contents.deleteService, 'scene.deleteEntities(buildDeleteContext'));
    pushCheck(results, 'deleteService', 'delete-service 将 typed delete helpers 注入 context', has(contents.deleteService, 'buildDeleteTargets,') && has(contents.deleteService, 'hasDeleteTarget,'));
    pushCheck(results, 'deleteService', 'delete-service 不再使用裸 sidebar 前缀判断', !has(contents.deleteService, "startsWith('sidebar:')"));
    pushCheck(results, 'deleteService', 'delete-service 删除后同步 table.rows 与 rowCount', has(contents.deleteService, 'table.rows = keptRows') && has(contents.deleteService, 'table.rowCount = keptRows.length'));
    pushCheck(results, 'deleteService', 'delete-service 规范化 scene 删除数量', has(contents.deleteService, 'function normalizeRemovedCount') && has(contents.deleteService, 'const removedCount = normalizeRemovedCount(deletion.removed)') && has(contents.deleteService, 'deletedCount: removedCount'));

    pushCheck(results, 'render', 'theater render 导出 renderTheaterScene()', has(contents.render, 'export function renderTheaterScene(container, sceneId'));
    pushCheck(results, 'render', 'theater render 使用 scene.collectDeletableKeys', has(contents.render, 'viewModel?.scene?.collectDeletableKeys'));
    pushCheck(results, 'render', 'theater render 传递 scene/viewModel 给 interactions', has(contents.render, 'scene: viewModel.scene') && has(contents.render, 'viewModel,'));
    pushCheck(results, 'render', 'theater render 构建删除态 uiState', has(contents.render, 'buildUiState(state, viewModel)') && has(contents.render, 'selectedCount') && has(contents.render, 'totalCount'));
    pushCheck(results, 'render', 'theater render 建立生命周期上下文', has(contents.render, 'function createTheaterLifecycleContext') && has(contents.render, 'getPhoneCoreState().routeRenderToken !== renderToken') && has(contents.render, 'phoneRuntime.isDisposed()'));
    pushCheck(results, 'render', 'theater render 向 interactions 传递 lifecycle', has(contents.render, 'lifecycle,') && has(contents.interactions, 'lifecycle: options.lifecycle,'));

    pushCheck(results, 'templates', 'theater templates 导出 buildTheaterScenePageHtml(viewModel, uiState)', has(contents.templates, 'export function buildTheaterScenePageHtml(viewModel, uiState = {})'));
    pushCheck(results, 'templates', 'theater templates 导入 renderKit', has(contents.templates, "from './core/render-kit.js'"));
    pushCheck(results, 'templates', '页面根挂载 data-theater-scene 与 style scope', has(contents.templates, 'data-theater-scene=') && has(contents.templates, 'data-theater-style-scope='));
    pushCheck(results, 'templates', 'data-theater-scene 使用属性转义', has(contents.templates, 'data-theater-scene="${escapeHtmlAttr(sceneId)}"'));
    pushCheck(results, 'templates', 'theater nav 不渲染场景 subtitle 小字', !has(contents.templates, 'phone-theater-subtitle') && !has(contents.templates, 'const subtitle = viewModel?.subtitle'));
    pushCheck(results, 'templates', 'theater templates 调用 scene.renderContent', has(contents.templates, 'viewModel?.scene?.renderContent') && has(contents.templates, 'renderContent(viewModel, uiState, theaterRenderKit)'));
    pushCheck(results, 'templates', 'theater templates 包含删除管理栏 action', has(contents.templates, 'toggle-theater-delete-mode') && has(contents.templates, 'theater-select-all') && has(contents.templates, 'theater-clear-selection') && has(contents.templates, 'theater-confirm-delete'));
    pushCheck(results, 'templates', 'theater templates 不包含具体 scene DOM class', !hasAny(contents.templates, ['phone-theater-square-feed', 'phone-theater-forum-home', 'phone-theater-live-page']));

    pushCheck(results, 'interactions', 'interactions 导出 bindTheaterSceneInteractions()', has(contents.interactions, 'export function bindTheaterSceneInteractions(container, options = {})'));
    pushCheck(results, 'interactions', 'interactions 调用 scene.bindInteractions hook', has(contents.interactions, 'options?.scene?.bindInteractions') && has(contents.interactions, 'binder(container'));
    pushCheck(results, 'interactions', 'interactions 导入 deleteTheaterEntities()', has(contents.interactions, "from './delete-service.js'"));
    pushCheck(results, 'interactions', 'interactions 绑定删除管理 action', has(contents.interactions, 'toggle-theater-delete-mode') && has(contents.interactions, 'theater-select-all') && has(contents.interactions, 'theater-clear-selection') && has(contents.interactions, 'theater-toggle-select') && has(contents.interactions, 'theater-confirm-delete'));
    pushCheck(results, 'interactions', 'interactions 使用确认弹窗与 toast', has(contents.interactions, 'showConfirmDialog') && has(contents.interactions, 'showToast'));
    pushCheck(results, 'interactions', 'interactions 删除链路使用 lifecycle active guard', has(contents.interactions, 'function isTheaterInteractionActive') && has(contents.interactions, 'requestRenderIfActive(container, options)') && has(contents.interactions, 'showToastIfActive(container, options'));
    const theaterDeleteAwaitIndex = indexOfOrInfinity(contents.interactions, 'const result = await deleteTheaterEntities');
    const theaterDeleteAfterAwait = Number.isFinite(theaterDeleteAwaitIndex)
        ? contents.interactions.slice(theaterDeleteAwaitIndex)
        : '';
    pushCheck(results, 'interactions', 'interactions 删除 await 后先检查 active 再写 UI', indexOfOrInfinity(theaterDeleteAfterAwait, 'const result = await deleteTheaterEntities') < indexOfOrInfinity(theaterDeleteAfterAwait, 'if (!isTheaterInteractionActive(container, options)) return;') && indexOfOrInfinity(theaterDeleteAfterAwait, 'if (!isTheaterInteractionActive(container, options)) return;') < indexOfOrInfinity(theaterDeleteAfterAwait, 'state.deleting = false;'));
    pushCheck(results, 'interactions', 'interactions 容器 click 监听幂等绑定', has(contents.interactions, '__phoneTheaterClickHandler') && has(contents.interactions, 'removeEventListener') && has(contents.interactions, 'addEventListener'));
    pushCheck(results, 'theaterLifecycleCheck', 'theater 生命周期专项检查脚本存在并覆盖 route/render/interactions', has(contents.theaterLifecycleCheck, 'route token 显式传入 theater render') && has(contents.theaterLifecycleCheck, 'executeConfirmedDelete') && has(contents.theaterLifecycleCheck, 'isTheaterInteractionActive'));

    checkNoCoreSceneBranches(results, contents);

    pushCheck(results, 'liveScene', 'live scene 负责弹幕暂停交互', has(contents.liveScene, 'phone-theater-barrage-toggle') && has(contents.liveScene, 'is-barrage-paused') && has(contents.liveScene, 'addEventListener') && has(contents.liveScene, 'phoneTheaterBarrageBound'));

    pushCheck(results, 'rootCss', '入口 CSS 引入 06-phone-theater.css', has(contents.rootCss, "@import url('./styles/06-phone-theater.css')"));
    pushCheck(results, 'theaterCss', '06-phone-theater.css 仅作为兼容入口 import style registry', has(contents.theaterCss, "@import url('./phone-theater/index.css')") && !has(contents.theaterCss, '[data-theater-scene="square"]'));
    pushCheck(results, 'theaterCssIndex', 'style registry 按 core → square → forum → live 顺序 import', indexOfOrInfinity(contents.theaterCssIndex, "./00-core.css") < indexOfOrInfinity(contents.theaterCssIndex, "./square.css") && indexOfOrInfinity(contents.theaterCssIndex, "./square.css") < indexOfOrInfinity(contents.theaterCssIndex, "./forum.css") && indexOfOrInfinity(contents.theaterCssIndex, "./forum.css") < indexOfOrInfinity(contents.theaterCssIndex, "./live.css"));
    pushCheck(results, 'theaterCoreCss', 'core CSS 包含 theater 删除按钮与管理条样式', has(contents.theaterCoreCss, '.phone-theater-delete-toggle') && has(contents.theaterCoreCss, '.phone-theater-manage-bar') && has(contents.theaterCoreCss, '.phone-theater-manage-btn'));
    pushCheck(results, 'theaterCoreCss', 'core CSS 包含 theater 选择按钮与选中态样式', has(contents.theaterCoreCss, '.phone-theater-select-toggle') && has(contents.theaterCoreCss, '.is-delete-selected'));
    pushCheck(results, 'theaterCoreCss', 'core CSS 删除态定位使用通用 delete-key 协议', has(contents.theaterCoreCss, '[data-theater-delete-key]:not(.phone-theater-select-toggle)'));
    pushCheck(results, 'theaterCoreCss', 'core CSS 不引用内置 scene 容器 class', !hasAny(contents.theaterCoreCss, ['phone-theater-square-post', 'phone-theater-forum-hot-panel', 'phone-theater-forum-note-card', 'phone-theater-live-room']));
    pushCheck(results, 'squareCss', 'square CSS 覆盖 body 浅色背景与 nav 深色文字', has(contents.squareCss, '[data-theater-scene="square"] .phone-theater-body') && has(contents.squareCss, '[data-theater-scene="square"] .phone-theater-nav .phone-nav-title'));
    pushCheck(results, 'forumCss', 'forum CSS 覆盖 body 浅色背景与 nav 深色文字', has(contents.forumCss, '[data-theater-scene="forum"] .phone-theater-body') && has(contents.forumCss, '[data-theater-scene="forum"] .phone-theater-nav .phone-nav-title'));
    pushCheck(results, 'forumCss', 'forum CSS 4 色封面齐全', has(contents.forumCss, 'phone-theater-cover-mist') && has(contents.forumCss, 'phone-theater-cover-cream') && has(contents.forumCss, 'phone-theater-cover-sage') && has(contents.forumCss, 'phone-theater-cover-rose'));
    pushCheck(results, 'liveCss', 'live CSS 保持暗色 body 背景', has(contents.liveCss, '[data-theater-scene="live"] .phone-theater-body') && has(contents.liveCss, 'background: #0a0a12'));
    pushCheck(results, 'liveCss', 'live CSS 定义弹幕滚动 keyframes', has(contents.liveCss, '@keyframes phone-theater-barrage-scroll'));
    pushCheck(results, 'liveCss', 'live CSS 弹幕暂停态使用 animation-play-state: paused', has(contents.liveCss, 'is-barrage-paused') && has(contents.liveCss, 'animation-play-state: paused'));
    pushCheck(results, 'liveCss', 'live CSS 包含 prefers-reduced-motion 降级', has(contents.liveCss, 'prefers-reduced-motion: reduce'));
    pushCheck(results, 'liveCss', 'live CSS 弹幕 pill 限制超长文本', has(contents.liveCss, 'max-width: min(72vw, 220px)') && has(contents.liveCss, 'overflow: hidden') && has(contents.liveCss, 'text-overflow: ellipsis'));
    pushCheck(results, 'liveCss', 'live CSS 弹幕区分 fan/other/hater 三态', has(contents.liveCss, '.phone-theater-barrage-pill.is-fan') && has(contents.liveCss, '.phone-theater-barrage-pill.is-other') && has(contents.liveCss, '.phone-theater-barrage-pill.is-hater'));
    pushCheck(results, 'homeCss', '桌面普通 App text icon 使用正方形尺寸', has(contents.homeCss, '.phone-app-icon-svg .phone-dock-text-icon') && has(contents.homeCss, 'width: 100%') && has(contents.homeCss, 'height: 100%'));

    pushCheck(results, 'homeViewModel', '首页 view-model 导入组合数据函数', has(contents.homeViewModel, "from '../phone-theater/data.js'"));
    pushCheck(results, 'homeViewModel', '首页 view-model 生成组合 app', has(contents.homeViewModel, 'getAvailableTheaterScenes(rawData).forEach'));
    pushCheck(results, 'homeViewModel', '首页 view-model 使用组合 appKey', has(contents.homeViewModel, 'key: scene.appKey'));
    pushCheck(results, 'homeViewModel', '首页 view-model 写入组合 route', has(contents.homeViewModel, 'route: scene.route'));
    pushCheck(results, 'homeViewModel', '首页 view-model 过滤已成组子表', has(contents.homeViewModel, 'groupedTheaterSheetKeys.has(key)'));

    pushCheck(results, 'routeRenderer', 'route-renderer 导入 theater route 工具', has(contents.routeRenderer, "from '../phone-theater/config.js'"));
    pushCheck(results, 'routeRenderer', 'route-renderer 识别 theater route', has(contents.routeRenderer, 'if (isTheaterRoute(route))'));
    pushCheck(results, 'routeRenderer', 'route-renderer 动态导入 theater render', has(contents.routeRenderer, "await import('../phone-theater/render.js')"));
    pushCheck(results, 'routeRenderer', 'route-renderer 调用 renderTheaterScene() 并传递 renderToken', has(contents.routeRenderer, 'renderTheaterScene(page, sceneId, { renderToken })'));

    pushCheck(results, 'notifications', '通知导入 resolveTheaterSceneBySheetKey()', has(contents.notifications, "from '../phone-theater/data.js'"));
    pushCheck(results, 'notifications', '通知使用组合 appKey 聚合未读', has(contents.notifications, 'const targetBadgeKey = theaterScene?.appKey || sheetKey'));
    pushCheck(results, 'notifications', '通知点击进入组合 route', has(contents.notifications, 'const targetRoute = theaterScene?.route || `app:${sheetKey}`'));
    pushCheck(results, 'notifications', '通知清理组合 badge key', has(contents.notifications, 'clearUnreadBadge(targetBadgeKey)'));

    pushCheck(results, 'visibilitySettings', '隐藏设置导入组合数据函数', has(contents.visibilitySettings, "from '../../../phone-theater/data.js'"));
    pushCheck(results, 'visibilitySettings', '隐藏设置生成组合项', has(contents.visibilitySettings, 'const theaterItems = getAvailableTheaterScenes(rawData).map'));
    pushCheck(results, 'visibilitySettings', '隐藏设置过滤已成组子表', has(contents.visibilitySettings, 'groupedTheaterSheetKeys.has(sheetKey)'));

    pushCheck(results, 'iconUploadService', '自定义图标导入 theater 分组函数', has(contents.iconUploadService, "from '../../../phone-theater/data.js'"));
    pushCheck(results, 'iconUploadService', '自定义图标生成 theater 虚拟项', has(contents.iconUploadService, 'const theaterItems = getAvailableTheaterScenes(rawData).map'));
    pushCheck(results, 'iconUploadService', '自定义图标过滤 theater 子表', has(contents.iconUploadService, 'groupedTheaterSheetKeys.has(sheetKey)'));

    pushCheck(results, 'specDoc', '扩展规范文档包含 scene module 契约', has(contents.specDoc, 'Scene module 必填契约') && has(contents.specDoc, 'buildViewModel') && has(contents.specDoc, 'deleteEntities'));
    pushCheck(results, 'specDoc', '扩展规范文档明确禁止裸 delete key', has(contents.specDoc, '禁止使用裸自然键') && has(contents.specDoc, 'role:rowIndex:encodedIdentity'));
    pushCheck(results, 'specDoc', '扩展规范文档说明样式入口', has(contents.specDoc, 'styles/phone-theater/index.css') && has(contents.specDoc, '00-core.css'));
    pushCheck(results, 'specDoc', '扩展规范文档禁止 core CSS 引用内置 scene class', has(contents.specDoc, '00-core.css') && has(contents.specDoc, '不允许引用内置 scene') && has(contents.specDoc, '[data-theater-delete-key]'));
    pushCheck(results, 'specDoc', '扩展规范文档说明验证命令', has(contents.specDoc, 'node scripts/check-theater-contract.cjs') && has(contents.specDoc, 'npm run lint --silent') && has(contents.specDoc, 'npm run build --silent'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[theater-contract-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[theater-contract-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
