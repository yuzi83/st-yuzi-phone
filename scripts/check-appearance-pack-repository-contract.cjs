const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    repository: 'modules/settings-app/services/appearance-settings/appearance-pack-repository.js',
    facade: 'modules/settings-app/services/appearance-settings.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
    types: 'types.d.ts',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function appearsBefore(content, first, second) {
    const firstIndex = content.indexOf(first);
    const secondIndex = content.indexOf(second);
    return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function section(content, startMarker, endMarker) {
    const start = content.indexOf(startMarker);
    if (start < 0) return '';
    const end = content.indexOf(endMarker, start + startMarker.length);
    if (end < 0) return content.slice(start);
    return content.slice(start, end);
}

function check(results, file, description, ok) {
    results.push({ file, description, ok });
}

function main() {
    const results = [];
    check(results, FILES.repository, '外观包 IndexedDB repository 文件存在', exists(FILES.repository));
    if (!exists(FILES.repository)) {
        console.error('[appearance-pack-repository-contract-check] 检查失败：repository 文件不存在');
        process.exitCode = 1;
        return;
    }

    const repository = read(FILES.repository);
    const facade = read(FILES.facade);
    const appearancePage = read(FILES.appearancePage);
    const types = read(FILES.types);
    const listSection = section(repository, 'export async function listAppearancePacks()', 'export async function getAppearancePack(id)');
    const saveSection = section(repository, 'export async function saveAppearancePack(packInput, options = {})', 'export async function deleteAppearancePack(id)');
    const facadeDeleteSection = section(facade, 'export async function deleteAppearancePackFromRepository(id)', 'export function exportAppearanceResourcePack(options = {})');


    check(results, FILES.repository, 'repository 使用独立 IndexedDB 名称和 object store', has(repository, "export const DB_NAME = 'yuzi-phone-appearance-packs';")
        && has(repository, "export const STORE_PACKS = 'appearancePacks';")
        && has(repository, 'export const DB_VERSION = 1;')
        && has(repository, 'indexedDB.open(DB_NAME, DB_VERSION)')
        && has(repository, "db.createObjectStore(STORE_PACKS, { keyPath: 'id' })"));
    check(results, FILES.repository, 'repository 定义数量、单包和总容量硬限制', has(repository, 'export const MAX_PACK_COUNT = 20;')
        && has(repository, 'export const MAX_SINGLE_PACK_BYTES = 20 * 1024 * 1024;')
        && has(repository, 'export const MAX_TOTAL_PACK_BYTES = 100 * 1024 * 1024;'));
    check(results, FILES.repository, 'repository 暴露列表、读取、保存、删除和统计 API', has(repository, 'export async function listAppearancePacks()')
        && has(repository, 'export async function getAppearancePack(id)')
        && has(repository, 'export async function saveAppearancePack(packInput, options = {})')
        && has(repository, 'export async function deleteAppearancePack(id)')
        && has(repository, 'export async function getAppearancePackRepositoryStats()'));
    check(results, FILES.repository, 'listAppearancePacks 只返回 metadata，不把完整 pack 复制给 UI', has(repository, 'function createEntryMeta(entry)')
        && has(listSection, '.map(createEntryMeta)')
        && has(listSection, 'packs,')
        && !has(listSection, 'pack:')
        && !has(listSection, 'entry.pack'));
    check(results, FILES.repository, 'saveAppearancePack 校验格式并执行容量限制', has(saveSection, 'validateAppearanceResourcePack(packInput)')
        && has(saveSection, 'stats.count >= MAX_PACK_COUNT')
        && has(saveSection, 'entry.totalBytes > MAX_SINGLE_PACK_BYTES')
        && has(saveSection, 'stats.totalBytes - replacedBytes + entry.totalBytes > MAX_TOTAL_PACK_BYTES'));
    check(results, FILES.repository, 'saveAppearancePack 串行化 read/check/write，避免并发导入突破容量限制', has(repository, 'let saveQueue = Promise.resolve();')
        && has(repository, 'function enqueueRepositoryWrite(operation)')
        && has(saveSection, 'return enqueueRepositoryWrite(async () => {'));

    check(results, FILES.repository, 'repository 结构化分类 IndexedDB quota/access 错误', has(repository, 'function classifyIdbError(error)')
        && has(repository, "return 'quota';")
        && has(repository, "return 'access';")
        && has(repository, "return 'unknown';")
        && has(repository, "errorType: classifyIdbError(error)"));
    check(results, FILES.repository, 'repository 不复用可再生缓存或整库导入接口且不写 settings', !has(repository, 'importTableAsJson')
        && !has(repository, 'dangerouslyImportFullSnapshotViaApi')
        && !has(repository, 'savePhoneSetting(')
        && !has(repository, 'savePhoneSettingsPatch('));
    check(results, FILES.repository, 'saveAppearancePack 保存成功返回未自动应用语义', has(saveSection, '美化包已保存到仓库，当前外观未自动应用'));
    check(results, FILES.repository, 'saveAppearancePack 保存成功不返回完整 pack 大对象', !has(saveSection, 'pack: entry.pack')
        && !has(saveSection, 'pack: null'));

    check(results, FILES.facade, 'facade 暴露仓库导入、列表、应用、删除业务语义', has(facade, 'export async function listAppearancePacks()')
        && has(facade, 'export async function importAppearancePackToRepository(fileText, meta = {})')
        && has(facade, 'export async function applyAppearancePackFromRepository(id)')
        && has(facade, 'export async function deleteAppearancePackFromRepository(id)'));
    check(results, FILES.facade, 'facade 应用仓库包时写入 activePackId', has(facade, 'applyAppearanceResourcePackImpl(entryResult.pack, { activePackId: entryResult.meta?.id || id })'));
    check(results, FILES.facade, 'facade 删除仓库包先原子保存激活标记与来源图标清理，失败时不删除仓库包', has(facadeDeleteSection, 'buildPackIconOriginCleanup(settings, targetPackId)')
        && has(facadeDeleteSection, 'const settingsBackup = {')
        && has(facadeDeleteSection, 'appIcons: iconCleanup.appIcons')
        && has(facadeDeleteSection, 'appIconOrigins: iconCleanup.appIconOrigins')
        && has(facadeDeleteSection, "if (activeCleared) patch.appearanceActivePackId = '';")
        && appearsBefore(facadeDeleteSection, 'const saved = savePhoneSettingsPatch(patch);', 'const deleteResult = await deleteAppearancePackImpl(targetPackId);')
        && has(facadeDeleteSection, 'if (!saved || !flushPhoneSettingsSave() || !await waitForPhoneSettingsSave())')
        && has(facadeDeleteSection, '仓库包未删除')
        && has(facadeDeleteSection, 'savePhoneSettingsPatch(settingsBackup)')
        && !has(facadeDeleteSection, 'backgroundImage')
        && !has(facadeDeleteSection, 'appIcons: {}'));

    check(results, FILES.appearancePage, '页面通过 facade 注入能力操作仓库，不裸用 IndexedDB', has(appearancePage, 'appearancePageService.listAppearancePacks()')
        && has(appearancePage, 'appearancePageService.importAppearancePackToRepository')
        && has(appearancePage, 'appearancePageService.applyAppearancePackFromRepository')
        && has(appearancePage, 'appearancePageService.deleteAppearancePackFromRepository')
        && !has(appearancePage, 'indexedDB'));
    check(results, FILES.appearancePage, '页面导入入库不再调用旧导入即应用入口', !has(appearancePage, 'appearancePageService.importAppearanceResourcePackFromData(content)')
        && has(appearancePage, "sourceFileName: file.name || ''"));
    check(results, FILES.appearancePage, '页面仓库列表渲染转义动态文本并标记 active 包', has(appearancePage, 'escapeHtml(')
        && has(appearancePage, 'escapeHtmlAttr(')
        && has(appearancePage, 'settings?.appearanceActivePackId')
        && has(appearancePage, 'phone-appearance-pack-select')
        && has(appearancePage, 'phone-settings-select')
        && has(appearancePage, 'cachedRepositoryListResult')
        && has(appearancePage, 'showConfirmDialog')
        && has(appearancePage, 'data-action="apply-appearance-pack"')
        && has(appearancePage, 'data-action="delete-appearance-pack"')
        && !has(appearancePage, 'window.confirm'));
    check(results, FILES.appearancePage, '页面仓库下拉只在 option 显示包名并用 summary 展示详情', has(appearancePage, 'const label = `${title}${activeSuffix}`;')
        && has(appearancePage, 'phone-appearance-pack-repository-summary')
        && has(appearancePage, 'getRepositoryPackMetaText(selectedPack)')
        && has(appearancePage, 'formatRepositoryTime(selectedPack?.updatedAt)')
        && !has(appearancePage, 'const label = `${title}｜${getRepositoryPackMetaText(pack)}${activeSuffix}`;'));
    check(results, FILES.appearancePage, '页面仓库下拉切换后同步按钮目标并禁用 active 包应用', has(appearancePage, "event.target?.closest?.('#phone-appearance-pack-select')")
        && has(appearancePage, 'selectEl.value,')
        && has(appearancePage, 'data-pack-id="${escapeHtmlAttr(selectedPackIdValue)}"')
        && has(appearancePage, "${selectedIsActive ? 'disabled' : ''}"));
    check(results, FILES.appearancePage, '页面仓库缓存用于防闪烁并在导入删除结构变化时失效', has(appearancePage, 'if (cachedRepositoryListResult) {')
        && has(appearancePage, 'cachedRepositoryListResult = result;')
        && has(appearancePage, 'cachedRepositoryListResult = null;')
        && has(appearancePage, 'Repository structure changes must invalidate it before refreshRepositoryList()'));
    check(results, FILES.appearancePage, '页面异步仓库操作后检查生命周期', has(appearancePage, 'if (isDisposed()) return;')
        && has(appearancePage, 'await refreshRepositoryList();'));

    check(results, FILES.types, 'types 声明仓库 metadata、stats 与页面高层服务 API', has(types, 'interface AppearancePackMeta')
        && has(types, 'interface AppearancePackRepositoryStats')
        && has(types, 'interface AppearancePackListResult')
        && has(types, 'appearanceActivePackId: string;')
        && has(types, 'listAppearancePacks: () => Promise<AppearancePackListResult>;')
        && has(types, 'importAppearancePackToRepository: (fileText: string, meta?: Record<string, any>) => Promise<AppearanceResourcePackResult>;')
        && has(types, 'applyAppearancePackFromRepository: (id: string) => Promise<AppearanceResourcePackResult | AppearancePackGetResult>;')
        && has(types, 'deleteAppearancePackFromRepository: (id: string) => Promise<AppearancePackDeleteResult>;'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[appearance-pack-repository-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[appearance-pack-repository-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
