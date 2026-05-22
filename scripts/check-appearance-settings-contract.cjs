const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/appearance-settings.js',
    background: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUpload: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    iconSlots: 'modules/settings-app/services/appearance-settings/icon-slots.js',
    resourcePack: 'modules/settings-app/services/appearance-settings/resource-pack-service.js',
    fontLibrary: 'modules/settings-app/services/appearance-settings/font-library-service.js',
    visibility: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    layout: 'modules/settings-app/services/appearance-settings/layout-settings.js',
    homeLabelColor: 'modules/settings-app/services/appearance-settings/home-label-color-settings.js',
    settingsRender: 'modules/settings-app/render.js',
    pageRenderers: 'modules/settings-app/page-renderers.js',
    contextBuilders: 'modules/settings-app/page-renderers/page-context-builders.js',
    appearanceBuilder: 'modules/settings-app/layout/page-builders/appearance-builders.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
    schema: 'modules/settings/schema.js',
    types: 'types.d.ts',
    homeRender: 'modules/phone-home/render.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function exists(relativePath) {
    try {
        fs.accessSync(path.join(ROOT, relativePath));
        return true;
    } catch {
        return false;
    }
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    const exactMatchIndex = contents.resourcePack.indexOf("'name-exact'");
    const scoreMatchIndex = contents.resourcePack.indexOf("'name-score'");
    const sequentialFillIndex = contents.resourcePack.indexOf("'sequential-fill'");

    check(results, 'facade', '继续暴露 setupBgUpload()', has(contents.facade, 'export function setupBgUpload('));
    check(results, 'facade', '继续暴露 renderIconUploadList()', has(contents.facade, 'export function renderIconUploadList('));
    check(results, 'facade', '继续暴露 setupAppearanceToggles()', has(contents.facade, 'export function setupAppearanceToggles('));
    check(results, 'facade', '继续暴露 renderHiddenTableAppsList()', has(contents.facade, 'export function renderHiddenTableAppsList('));
    check(results, 'facade', '继续暴露 setupIconLayoutSettings()', has(contents.facade, 'export function setupIconLayoutSettings('));
    check(results, 'facade', '继续暴露 getLayoutValue()', has(contents.facade, 'export function getLayoutValue('));
    check(results, 'facade', '暴露外观资源包导入服务', has(contents.facade, 'export function importAppearanceResourcePackFromData('));
    check(results, 'facade', '暴露外观资源包导出服务', has(contents.facade, 'export function exportAppearanceResourcePack('));
    check(results, 'facade', '保留旧资源清理兼容 alias', has(contents.facade, 'export function clearAppearanceResourcePoolIcons('));
    check(results, 'facade', '暴露字体库视图和操作服务', has(contents.facade, 'export function getAppearanceFontLibraryViewModel(')
        && has(contents.facade, 'export function importAppearanceFontFile(')
        && has(contents.facade, 'export function selectAppearanceFont(')
        && has(contents.facade, 'export function deleteAppearanceFont(')
        && has(contents.facade, 'export function applyAppearanceFontLibrary('));
    check(results, 'facade', '暴露首页 App 名称颜色服务', has(contents.facade, 'export function getHomeAppLabelColorModeValue(')
        && has(contents.facade, 'export function setupHomeAppLabelColorSettings('));

    check(results, 'background', '存在 setupBgUpload()', has(contents.background, 'export function setupBgUpload('));
    check(results, 'iconUpload', '存在 createIconUploadService()', has(contents.iconUpload, 'export function createIconUploadService('));
    check(results, 'iconUpload', '图标上传复用共享图标位枚举', has(contents.iconUpload, "import { collectAppearanceIconSlots } from './icon-slots.js';")
        && has(contents.iconUpload, 'const allItems = collectAppearanceIconSlots(rawData);'));
    check(results, 'iconUpload', '自定义图标总占用来自 appIcons 而不是资源池', has(contents.iconUpload, 'const currentIcons = phoneSettings.appIcons || {};')
        && has(contents.iconUpload, 'const currentIconsBytes = estimateIconsStorageBytes(currentIcons);'));
    check(results, 'iconUpload', '自定义图标 UI 展示当前 appIcons 全量清理入口', has(contents.iconUpload, 'const allCurrentIconEntries = Object.entries(currentIcons);')
        && has(contents.iconUpload, '当前设置图标清理')
        && has(contents.iconUpload, 'phone-icon-cleanup-row')
        && has(contents.iconUpload, 'phone-icon-delete-current-btn')
        && has(contents.iconUpload, '隐藏旧图标 / 无当前图标位'));
    check(results, 'iconUpload', '自定义图标删除使用复制对象避免直接突变设置引用', has(contents.iconUpload, 'const icons = { ...(getPhoneSettings().appIcons || {}) };')
        && has(contents.iconUpload, 'delete icons[key];')
        && !has(contents.iconUpload, 'const icons = getPhoneSettings().appIcons || {};\n                    delete icons[key];'));
    check(results, 'iconSlots', '存在共享图标位枚举函数', has(contents.iconSlots, 'export function collectAppearanceIconSlots('));
    check(results, 'resourcePack', '存在外观资源包格式常量', has(contents.resourcePack, "APPEARANCE_PACK_FORMAT = 'yuzi-phone-appearance-pack'"));
    check(results, 'resourcePack', '存在外观资源包导入导出函数', has(contents.resourcePack, 'export function importAppearanceResourcePackFromData(')
        && has(contents.resourcePack, 'export function exportAppearanceResourcePack('));
    check(results, 'resourcePack', '旧资源清理兼容函数会清空 legacy appearanceResourcePool', has(contents.resourcePack, 'export function clearAppearanceResourcePoolIcons()')
        && has(contents.resourcePack, 'removedPoolIcons')
        && has(contents.resourcePack, 'createEmptyAppearanceResourcePool()'));
    check(results, 'resourcePack', 'normalizeImageResource 保留 slotKey 字段兼容旧包但导入分配不使用它', has(contents.resourcePack, 'slotKey: safeString(raw.slotKey, 160)'));
    check(results, 'resourcePack', '导出只包含当前背景与当前 appIcons，不拼接 legacy 资源池', !has(contents.resourcePack, 'wallpapers.push(...pool.wallpapers)')
        && !has(contents.resourcePack, 'icons.push(...pool.icons)')
        && has(contents.resourcePack, 'slotKey: key')
        && has(contents.resourcePack, 'iconPool: []')
        && has(contents.resourcePack, "iconAssignStrategy: 'slot-key-overwrite'")
        && has(contents.resourcePack, 'discardExtraIcons: true')
        && has(contents.resourcePack, 'clearMissingIconSlots: true'));
    check(results, 'resourcePack', '导入使用替换式 appIcons 并丢弃多余图标', has(contents.resourcePack, 'function buildReplacingIconAssignment(')
        && has(contents.resourcePack, 'appIcons: assignment.nextIcons')
        && has(contents.resourcePack, 'appearanceResourcePool: createEmptyAppearanceResourcePool()')
        && has(contents.resourcePack, 'discardedIcons: assignment.discarded.length')
        && has(contents.resourcePack, 'poolIcons: 0')
        && !has(contents.resourcePack, 'shuffleStable')
        && !has(contents.resourcePack, 'buildIconAssignment')
        && !has(contents.resourcePack, 'mergeResourcePool'));
    check(results, 'resourcePack', '导入图标匹配支持全局 exact、名称打分、顺序补位', has(contents.resourcePack, 'function normalizeIconMatchName(')
        && has(contents.resourcePack, 'function normalizeIconScoreName(')
        && has(contents.resourcePack, 'function tokenizeIconName(')
        && has(contents.resourcePack, 'function countCommonCharacters(')
        && has(contents.resourcePack, 'function scoreIconNameMatch(')
        && has(contents.resourcePack, 'function buildSlotNameIndex(')
        && has(contents.resourcePack, 'const slotNameIndex = buildSlotNameIndex(slots);')
        && has(contents.resourcePack, 'usedIconIndexes')
        && has(contents.resourcePack, 'scoreMatchedIcons')
        && has(contents.resourcePack, 'sequentialFilledIcons')
        && has(contents.resourcePack, 'const iconName = normalizeIconMatchName(icon?.name);')
        && has(contents.resourcePack, "assignIconToSlot(icon, iconIndex, nameSlot, 'name-exact', 100)")
        && has(contents.resourcePack, "assignIconToSlot(candidate.icon, candidate.iconIndex, candidate.slot, 'name-score', candidate.score)")
        && has(contents.resourcePack, "assignIconToSlot(icon, iconIndex, slot, 'sequential-fill', 0)")
        && has(contents.resourcePack, 'unmatchedNameIcons'));
    check(results, 'resourcePack', '导入图标匹配顺序为 exact → score → sequential-fill',
        exactMatchIndex >= 0 && scoreMatchIndex >= 0 && sequentialFillIndex >= 0
        && exactMatchIndex < scoreMatchIndex && scoreMatchIndex < sequentialFillIndex);
    check(results, 'resourcePack', '导入不再使用 slotKey 参与图标分配', !has(contents.resourcePack, "assignIconToSlot(icon, slotMap.get(slotKey), 'slotKey')")
        && !has(contents.resourcePack, 'unmatchedSlotKeyIcons.length')
        && !has(contents.resourcePack, 'slotKey 不存在，已按顺序分配或丢弃'));
    check(results, 'resourcePack', '导入 unmatchedIcons 统计最终 discarded 图标', has(contents.resourcePack, 'unmatchedIcons: assignment.discarded.length')
        && has(contents.resourcePack, '有 ${assignment.scoreMatchedIcons.length} 个图标通过名称相似度匹配')
        && has(contents.resourcePack, '有 ${assignment.sequentialFilledIcons.length} 个图标未找到名称相似项，已按剩余图标位顺序补位'));
    check(results, 'resourcePack', '资源池图标清理会扫描并删除隐藏旧 appIcons', has(contents.resourcePack, "import { getTableData } from '../../../phone-core/data-api.js';")
        && has(contents.resourcePack, 'function collectActiveIconKeys()')
        && has(contents.resourcePack, 'collectAppearanceIconSlots(rawData)')
        && has(contents.resourcePack, 'function splitAppIconsByActiveSlots(appIcons, activeKeys)')
        && has(contents.resourcePack, 'orphanIcons')
        && has(contents.resourcePack, 'patch.appIcons = activeIcons')
        && has(contents.resourcePack, 'removedOrphanAppIcons'));
    check(results, 'resourcePack', '导入服务包含保存失败回滚', has(contents.resourcePack, 'savePhoneSettingsPatch(backup)'));
    check(results, 'fontLibrary', '存在字体库导入、选择、删除和应用函数', has(contents.fontLibrary, 'export async function importAppearanceFontFile(')
        && has(contents.fontLibrary, 'export function selectAppearanceFont(')
        && has(contents.fontLibrary, 'export function deleteAppearanceFont(')
        && has(contents.fontLibrary, 'export function applyAppearanceFontLibrary('));
    check(results, 'fontLibrary', '字体库服务内置 4 种 UI 字体并移除书面/手写旧入口', has(contents.fontLibrary, "id: 'builtin.system-ui'")
        && has(contents.fontLibrary, "id: 'builtin.modern-sans'")
        && has(contents.fontLibrary, "id: 'builtin.chill-round'")
        && has(contents.fontLibrary, "id: 'builtin.basic-sans'")
        && has(contents.fontLibrary, "name: '系统清晰'")
        && has(contents.fontLibrary, "name: '现代黑体'")
        && has(contents.fontLibrary, "name: '寒蝉圆体'")
        && has(contents.fontLibrary, "name: '基础无衬线'")
        && !has(contents.fontLibrary, "id: 'builtin.system'")
        && !has(contents.fontLibrary, "id: 'builtin.rounded'")
        && !has(contents.fontLibrary, "id: 'builtin.serif'")
        && !has(contents.fontLibrary, "id: 'builtin.handwriting'")
        && !has(contents.fontLibrary, "name: '宋体阅读'")
        && !has(contents.fontLibrary, "name: '手写便签'")
        && !has(contents.fontLibrary, "id: 'builtin.pixel'")
        && !has(contents.fontLibrary, "id: 'builtin.mono'")
        && !has(contents.fontLibrary, "name: '像素复古'")
        && !has(contents.fontLibrary, "name: '等宽终端'"));
    check(results, 'fontLibrary', 'settings schema 只接受 4 个新内置字体 id', has(contents.schema, "'builtin.system-ui'")
        && has(contents.schema, "'builtin.modern-sans'")
        && has(contents.schema, "'builtin.chill-round'")
        && has(contents.schema, "'builtin.basic-sans'")
        && !has(contents.schema, "'builtin.system'")
        && !has(contents.schema, "'builtin.rounded'")
        && !has(contents.schema, "'builtin.serif'")
        && !has(contents.schema, "'builtin.handwriting'")
        && !has(contents.schema, "'builtin.pixel'")
        && !has(contents.schema, "'builtin.mono'"));
    check(results, 'fontLibrary', '字体库服务包含动态 font-face 注入和容器变量应用', has(contents.fontLibrary, 'FONT_STYLE_ELEMENT_ID')
        && has(contents.fontLibrary, '@font-face')
        && has(contents.fontLibrary, '--yuzi-phone-font-family')
        && has(contents.fontLibrary, 'savePhoneSetting(\'appearanceFontLibrary\', normalized)'));
    check(results, 'fontLibrary', '字体库服务用小手机作用域高优先级规则抵抗 SillyTavern 主题覆盖', has(contents.fontLibrary, 'function buildScopedFontOverrideCss(')
        && has(contents.fontLibrary, '[data-yuzi-phone-font-id]')
        && has(contents.fontLibrary, '!important')
        && has(contents.fontLibrary, ':not(.fa-solid)')
        && has(contents.fontLibrary, ':not(.fa-brands)')
        && has(contents.fontLibrary, ':not(code)')
        && has(contents.fontLibrary, ':not(textarea)'));
    check(results, 'fontLibrary', '内置寒蝉圆体引用正式字体资源并保留许可证文件', has(contents.fontLibrary, 'YuziPhoneChillRoundF')
        && has(contents.fontLibrary, 'buildBuiltinFontFaceCss(activeFont)')
        && has(contents.fontLibrary, 'assets/fonts/chill-round-f/ChillRoundFRegular.otf')
        && has(contents.fontLibrary, 'assets/fonts/chill-round-f/ChillRoundFBold.otf')
        && exists('assets/fonts/chill-round-f/ChillRoundFRegular.otf')
        && exists('assets/fonts/chill-round-f/ChillRoundFBold.otf')
        && exists('assets/fonts/chill-round-f/LICENSE.txt'));
    check(results, 'visibility', '存在 setupAppearanceToggles()', has(contents.visibility, 'export function setupAppearanceToggles('));
    check(results, 'visibility', '存在 renderHiddenTableAppsList()', has(contents.visibility, 'export function renderHiddenTableAppsList('));
    check(results, 'layout', '存在 setupIconLayoutSettings()', has(contents.layout, 'export function setupIconLayoutSettings('));
    check(results, 'layout', '存在 getLayoutValue()', has(contents.layout, 'export function getLayoutValue('));
    check(results, 'homeLabelColor', '存在首页 App 名称颜色读取与绑定服务', has(contents.homeLabelColor, 'export function getHomeAppLabelColorModeValue()')
        && has(contents.homeLabelColor, 'export function setupHomeAppLabelColorSettings(container)')
        && has(contents.homeLabelColor, "const HOME_APP_LABEL_COLOR_SETTING_KEY = 'homeAppLabelColorMode';")
        && has(contents.homeLabelColor, "new Set(['white', 'black'])"));

    check(results, 'settingsRender', 'settings render 从 appearance-settings façade 导入服务', has(contents.settingsRender, "from './services/appearance-settings.js';"));
    check(results, 'settingsRender', 'settings render 将 appearance 服务注入 grouped deps', has(contents.settingsRender, 'appearance: {')
        && has(contents.settingsRender, 'setupBgUpload,')
        && has(contents.settingsRender, 'setupIconLayoutSettings,')
        && has(contents.settingsRender, 'setupAppearanceToggles,')
        && has(contents.settingsRender, 'renderHiddenTableAppsList,')
        && has(contents.settingsRender, 'renderIconUploadList,')
        && has(contents.settingsRender, 'importAppearanceResourcePackFromData,')
        && has(contents.settingsRender, 'exportAppearanceResourcePack,')
        && has(contents.settingsRender, 'clearAppearanceResourcePoolIcons,')
        && has(contents.settingsRender, 'getAppearanceFontLibraryViewModel,')
        && has(contents.settingsRender, 'importAppearanceFontFile,')
        && has(contents.settingsRender, 'selectAppearanceFont,')
        && has(contents.settingsRender, 'deleteAppearanceFont,')
        && has(contents.settingsRender, 'applyAppearanceFontLibrary,')
        && has(contents.settingsRender, 'getReadableTextScalePercentValue,')
        && has(contents.settingsRender, 'applyReadableTextScale,')
        && has(contents.settingsRender, 'setupReadableTextScaleSettings,')
        && has(contents.settingsRender, 'getHomeAppLabelColorModeValue,') && has(contents.settingsRender, 'setupHomeAppLabelColorSettings,'));
    check(results, 'settingsRender', 'settings render 创建并注入外观页滚动保留 rerender', has(contents.settingsRender, "createRerenderWithScroll('appearanceScrollTop', render)")
        && has(contents.settingsRender, 'rerenderAppearanceKeepScroll,'));
    check(results, 'pageRenderers', 'page renderer 校验 appearance 滚动保留依赖', has(contents.pageRenderers, "'rerenderAppearanceKeepScroll',"));
    check(results, 'pageRenderers', 'page renderer 校验 appearance 服务依赖', has(contents.pageRenderers, "assertFunctionDeps('appearance', deps.appearance,")
        && has(contents.pageRenderers, "'setupBgUpload',")
        && has(contents.pageRenderers, "'renderIconUploadList',")
        && has(contents.pageRenderers, "'importAppearanceResourcePackFromData',")
        && has(contents.pageRenderers, "'exportAppearanceResourcePack',")
        && has(contents.pageRenderers, "'clearAppearanceResourcePoolIcons',")
        && has(contents.pageRenderers, "'getAppearanceFontLibraryViewModel',")
        && has(contents.pageRenderers, "'importAppearanceFontFile',")
        && has(contents.pageRenderers, "'selectAppearanceFont',")
        && has(contents.pageRenderers, "'deleteAppearanceFont',")
        && has(contents.pageRenderers, "'applyAppearanceFontLibrary',")
        && has(contents.pageRenderers, "'getReadableTextScalePercentValue',")
        && has(contents.pageRenderers, "'applyReadableTextScale',")
        && has(contents.pageRenderers, "'setupReadableTextScaleSettings',")
        && has(contents.pageRenderers, "'getHomeAppLabelColorModeValue',") && has(contents.pageRenderers, "'setupHomeAppLabelColorSettings',"));
    check(results, 'contextBuilders', 'appearance context 通过 appearancePageService 注入页面', has(contents.contextBuilders, 'function buildAppearancePageService(services)')
        && has(contents.contextBuilders, 'appearancePageService,')
        && has(contents.contextBuilders, 'setupBgUpload: services.appearance.setupBgUpload')
        && has(contents.contextBuilders, 'importAppearanceResourcePackFromData: services.appearance.importAppearanceResourcePackFromData')
        && has(contents.contextBuilders, 'exportAppearanceResourcePack: services.appearance.exportAppearanceResourcePack')
        && has(contents.contextBuilders, 'clearAppearanceResourcePoolIcons: services.appearance.clearAppearanceResourcePoolIcons')
        && has(contents.contextBuilders, 'getAppearanceFontLibraryViewModel: services.appearance.getAppearanceFontLibraryViewModel')
        && has(contents.contextBuilders, 'importAppearanceFontFile: services.appearance.importAppearanceFontFile')
        && has(contents.contextBuilders, 'selectAppearanceFont: services.appearance.selectAppearanceFont')
        && has(contents.contextBuilders, 'deleteAppearanceFont: services.appearance.deleteAppearanceFont')
        && has(contents.contextBuilders, 'getReadableTextScalePercentValue: services.appearance.getReadableTextScalePercentValue')
        && has(contents.contextBuilders, 'applyReadableTextScale: services.appearance.applyReadableTextScale')
        && has(contents.contextBuilders, 'setupReadableTextScaleSettings: services.appearance.setupReadableTextScaleSettings')
        && has(contents.contextBuilders, 'getHomeAppLabelColorModeValue: services.appearance.getHomeAppLabelColorModeValue')
        && has(contents.contextBuilders, 'setupHomeAppLabelColorSettings: services.appearance.setupHomeAppLabelColorSettings')
        && has(contents.contextBuilders, 'applyAppearanceFontLibrary: services.appearance.applyAppearanceFontLibrary')
        && has(contents.contextBuilders, 'rerenderAppearanceKeepScroll: services.scroll.rerenderAppearanceKeepScroll')
        && has(contents.contextBuilders, 'showToast: services.feedback.showToast'));

    check(results, 'appearanceBuilder', '外观页 HTML 包含资源包导入导出入口', has(contents.appearanceBuilder, '外观资源包')
        && has(contents.appearanceBuilder, 'id="phone-import-appearance-pack"')
        && has(contents.appearanceBuilder, 'id="phone-export-appearance-pack"')
        && has(contents.appearanceBuilder, 'id="phone-appearance-pack-file"')
        && has(contents.appearanceBuilder, '多余图标直接丢弃'));
    check(results, 'appearanceBuilder', '外观页不再暴露资源池图标清理按钮或旧资源池文案', has(contents.appearanceBuilder, '自定义图标')
        && !has(contents.appearanceBuilder, 'id="phone-clear-icon-resource-pool"')
        && !has(contents.appearanceBuilder, '清空资源池图标')
        && !has(contents.appearanceBuilder, '多余图标进入资源池')
        && !has(contents.appearanceBuilder, '备用资源池'));
    check(results, 'appearanceBuilder', '外观页 HTML 包含字体库入口', has(contents.appearanceBuilder, '字体库')
        && has(contents.appearanceBuilder, 'id="phone-font-select"')
        && has(contents.appearanceBuilder, 'id="phone-import-font-btn"')
        && has(contents.appearanceBuilder, 'id="phone-delete-font-btn"')
        && has(contents.appearanceBuilder, 'id="phone-font-file"')
        && has(contents.appearanceBuilder, 'id="phone-font-preview"'));
    check(results, 'appearanceBuilder', '外观页 HTML 包含首页 App 名称颜色设置', has(contents.appearanceBuilder, '首页 App 名称颜色')
        && has(contents.appearanceBuilder, 'id="phone-home-app-label-color-mode"')
        && has(contents.appearanceBuilder, '白色文字（适合深色背景）')
        && has(contents.appearanceBuilder, '黑色文字（适合浅色背景）'));

    check(results, 'appearancePage', '外观页从 appearancePageService 读取 setupBgUpload()', has(contents.appearancePage, 'const setupBgUpload = appearancePageService.setupBgUpload;'));
    check(results, 'appearancePage', '外观页从 appearancePageService 读取 renderIconUploadList()', has(contents.appearancePage, 'const renderIconUploadList = appearancePageService.renderIconUploadList;'));
    check(results, 'appearancePage', '外观页通过 pageRuntime 托管背景上传 cleanup', has(contents.appearancePage, 'runtime.registerCleanup(setupBgUpload(container, { runtime }));'));
    check(results, 'appearancePage', '外观页通过 pageRuntime 托管图标上传 cleanup', has(contents.appearancePage, "runtime.registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list'), { runtime }));"));
    check(results, 'appearancePage', '外观页保留 registerCleanup fallback', has(contents.appearancePage, "registerCleanup(setupBgUpload(container));")
        && has(contents.appearancePage, "registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list')));"));
    check(results, 'appearancePage', '外观页继续渲染隐藏表格与布局设置入口', has(contents.appearancePage, "renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps'))")
        && has(contents.appearancePage, 'setupIconLayoutSettings(container)'));
    check(results, 'appearancePage', '外观页绑定资源包导入导出并托管 cleanup', has(contents.appearancePage, 'function bindAppearanceResourcePackActions(')
        && has(contents.appearancePage, "container.querySelector('#phone-import-appearance-pack')")
        && has(contents.appearancePage, "container.querySelector('#phone-export-appearance-pack')")
        && has(contents.appearancePage, 'appearancePageService.importAppearanceResourcePackFromData(content)')
        && has(contents.appearancePage, 'appearancePageService.exportAppearanceResourcePack({')
        && has(contents.appearancePage, 'downloadTextFile(')
        && has(contents.appearancePage, 'runtime.registerCleanup(bindAppearanceResourcePackActions(ctx, runtime));'));
    check(results, 'appearancePage', '外观页不再绑定资源池清理按钮', !has(contents.appearancePage, "container.querySelector('#phone-clear-icon-resource-pool')")
        && !has(contents.appearancePage, 'appearancePageService.clearAppearanceResourcePoolIcons()'));
    check(results, 'appearancePage', '资源包导入重渲染保留外观页滚动位置并处理异步生命周期', has(contents.appearancePage, 'function bindAppearanceResourcePackActions(')
        && has(contents.appearancePage, 'ctx.rerenderAppearanceKeepScroll')
        && has(contents.appearancePage, 'rerenderKeepScroll();')
        && has(contents.appearancePage, 'runtime.isDisposed')
        && has(contents.appearancePage, 'if (isDisposed()) return;')
        && !has(contents.appearancePage, 'if (result.success) {\n                    render();\n                }'));
    check(results, 'appearancePage', '外观页绑定字体库导入选择删除并托管 cleanup', has(contents.appearancePage, 'function bindAppearanceFontLibraryActions(')
        && has(contents.appearancePage, "container.querySelector('#phone-font-select')")
        && has(contents.appearancePage, "container.querySelector('#phone-import-font-btn')")
        && has(contents.appearancePage, "container.querySelector('#phone-delete-font-btn')")
        && has(contents.appearancePage, 'appearancePageService.selectAppearanceFont(selectEl.value)')
        && has(contents.appearancePage, 'appearancePageService.importAppearanceFontFile(file)')
        && has(contents.appearancePage, 'appearancePageService.deleteAppearanceFont(fontId)')
        && has(contents.appearancePage, 'runtime.registerCleanup(bindAppearanceFontLibraryActions(ctx, runtime));'));
    check(results, 'appearancePage', '字体库操作重渲染保留外观页滚动位置并处理异步生命周期', has(contents.appearancePage, 'ctx.rerenderAppearanceKeepScroll')
        && has(contents.appearancePage, 'rerenderKeepScroll();')
        && has(contents.appearancePage, 'runtime.isDisposed')
        && !has(contents.appearancePage, 'render();\n        }));\n    }\n\n    if (importBtn && fileInput)'));
    check(results, 'appearancePage', '外观页读取并绑定首页 App 名称颜色设置', has(contents.appearancePage, 'const getHomeAppLabelColorModeValue = appearancePageService.getHomeAppLabelColorModeValue;')
        && has(contents.appearancePage, 'const setupHomeAppLabelColorSettings = appearancePageService.setupHomeAppLabelColorSettings;')
        && has(contents.appearancePage, 'homeAppLabelColorMode: getHomeAppLabelColorModeValue(),')
        && has(contents.appearancePage, 'runtime.registerCleanup(setupHomeAppLabelColorSettings(container));')
        && has(contents.appearancePage, 'registerCleanup(setupHomeAppLabelColorSettings(container));'));
    check(results, 'types', 'types.d.ts 声明外观资源池与资源包服务', has(contents.types, 'interface AppearanceResourcePoolSettings')
        && has(contents.types, 'appearanceResourcePool: AppearanceResourcePoolSettings;')
        && has(contents.types, 'interface AppearanceResourcePoolOperationResult')
        && has(contents.types, 'removedPoolIcons?: number;')
        && has(contents.types, 'removedOrphanAppIcons?: number;')
        && has(contents.types, 'skippedOrphanCleanup?: boolean;')
        && has(contents.types, 'importAppearanceResourcePackFromData: (input: string | object')
        && has(contents.types, 'exportAppearanceResourcePack: (options?: Record<string, any>)')
        && has(contents.types, 'clearAppearanceResourcePoolIcons: () => AppearanceResourcePoolOperationResult')
        && has(contents.types, 'slotKey?: string;')
        && has(contents.types, 'discardedIcons?: number;')
        && has(contents.types, 'unmatchedIcons?: number;'));
    check(results, 'types', 'types.d.ts 声明字体库设置、视图模型与服务', has(contents.types, 'interface AppearanceFontLibrarySettings')
        && has(contents.types, 'appearanceFontLibrary: AppearanceFontLibrarySettings;')
        && has(contents.types, 'getAppearanceFontLibraryViewModel: () => AppearanceFontLibraryViewModel')
        && has(contents.types, 'importAppearanceFontFile: (file: File) => Promise<AppearanceFontOperationResult>')
        && has(contents.types, 'selectAppearanceFont: (fontId: string) => AppearanceFontOperationResult')
        && has(contents.types, 'deleteAppearanceFont: (fontId: string) => AppearanceFontOperationResult')
        && has(contents.types, 'applyAppearanceFontLibrary: (root?: Element | null) => boolean'));
    check(results, 'types', 'types.d.ts 声明外观页滚动保留 rerender 依赖', has(contents.types, 'rerenderAppearanceKeepScroll: () => void;')
        && has(contents.types, 'interface SettingsAppearancePageContext'));
    check(results, 'types', 'types.d.ts 声明首页 App 名称颜色与外观页颜色服务', has(contents.types, "homeAppLabelColorMode: 'white' | 'black';")
        && has(contents.types, "getHomeAppLabelColorModeValue: () => 'white' | 'black';")
        && has(contents.types, 'setupHomeAppLabelColorSettings: (container: HTMLElement) => (() => void) | void;')
        && has(contents.types, 'getReadableTextScalePercentValue: () => number;')
        && has(contents.types, 'applyReadableTextScale: (root?: Element | null, percent?: number) => void;')
        && has(contents.types, 'setupReadableTextScaleSettings: (container: HTMLElement) => (() => void) | void;'));
    check(results, 'types', 'types.d.ts 声明 savePhoneSettingsPatch() 返回保存结果布尔值', has(contents.types, 'savePhoneSettingsPatch(patch: Partial<PhoneSettings>): boolean;'));
    check(results, 'schema', 'settings schema 声明首页 App 名称颜色默认值与枚举校验', has(contents.schema, "homeAppLabelColorMode: 'white'") && has(contents.schema, "homeAppLabelColorMode: { type: 'string', enum: ['white', 'black'] }"));
    check(results, 'homeRender', 'Home 渲染通过受控枚举映射首页标签颜色', has(contents.homeRender, 'function resolveHomeAppLabelColorTokens(mode)') && has(contents.homeRender, 'phoneSettings.homeAppLabelColorMode'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[appearance-settings-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[appearance-settings-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
