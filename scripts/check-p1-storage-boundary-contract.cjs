const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'modules');

const ALLOWED_STORAGE_FILES = new Set([
    'modules/storage-manager/core.js',
    'modules/storage-manager/manager.js',
    'modules/phone-core/chat-support/ai-instruction-store.js',
]);

const REQUIRED_SETTING_FILES = {
    settingsFacade: 'modules/settings.js',
    settingsPersistence: 'modules/settings/persistence.js',
    templateStore: 'modules/phone-beautify-templates/store.js',
    templateRepository: 'modules/phone-beautify-templates/repository.js',
    worldbookSelection: 'modules/settings-app/services/worldbook-selection.js',
    aiInstructionStore: 'modules/phone-core/chat-support/ai-instruction-store.js',
};

const REQUIRED_CACHE_FILES = {
    cacheManager: 'modules/cache-manager.js',
    backgroundService: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUploadService: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
};

const REQUIRED_STORAGE_MANAGER_FILES = {
    core: 'modules/storage-manager/core.js',
    manager: 'modules/storage-manager/manager.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function listJsFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function toRelative(filePath) {
    return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function collectStorageReferences() {
    return listJsFiles(MODULES_DIR)
        .map((filePath) => {
            const relativePath = toRelative(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const matches = [...content.matchAll(/\b(?:localStorage|sessionStorage)\b/g)];
            return { relativePath, matches };
        })
        .filter(item => item.matches.length > 0);
}

function extractSection(content, startMarker, endMarker) {
    const start = content.indexOf(startMarker);
    if (start < 0) return '';

    const end = content.indexOf(endMarker, start + startMarker.length);
    if (end < 0) return '';

    return content.slice(start, end);
}

function check(results, file, description, ok, details = '') {
    results.push({ file, description, ok, details });
}

function main() {
    const results = [];

    const storageReferences = collectStorageReferences();
    for (const item of storageReferences) {
        check(
            results,
            item.relativePath,
            '裸 localStorage/sessionStorage 只能出现在 storage-manager 或明确 legacy migration 读路径',
            ALLOWED_STORAGE_FILES.has(item.relativePath),
            `${item.matches.length} references`
        );
    }

    const core = read(REQUIRED_STORAGE_MANAGER_FILES.core);
    const manager = read(REQUIRED_STORAGE_MANAGER_FILES.manager);
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 定义统一 STORE_PREFIX', has(core, "export const STORE_PREFIX = 'yzp:v2';"));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 通过 INDEX_KEY 管理索引事实源', has(core, 'export const INDEX_KEY = `${STORE_PREFIX}:index`;'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 写入前估算 payload size', has(core, 'export function estimateSize(value)'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 保存索引失败时识别 QUOTA_EXCEEDED', has(core, 'StorageErrorType.QUOTA_EXCEEDED'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 配额失败后执行 pruneExpired()', has(core, 'pruneExpired(index);'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 配额失败后执行 evictByLRU()', has(core, 'evictByLRU(index, { maxEntries: 300, maxBytes: 256 * 1024 });'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.core, 'storage-manager core 读取 raw 时更新 lastAccessAt', has(core, 'meta.lastAccessAt = nowTs();'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.manager, 'storage-manager manager set() 使用 loadIndex()', has(manager, 'const index = loadIndex();'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.manager, 'storage-manager manager set() 统一通过 writeRaw()', has(manager, 'writeRaw(storageKey, payload, index);'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.manager, 'storage-manager manager 索引失败时回滚 payload', has(manager, 'const rollbackWrittenPayload = () => {'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.manager, 'storage-manager manager get() 过期数据会删除 payload 与索引', has(manager, 'expiresAt > 0 && expiresAt <= nowTs()'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.manager, 'storage-manager manager 暴露 clearNamespace()', has(manager, 'clearNamespace,'));
    check(results, REQUIRED_STORAGE_MANAGER_FILES.manager, 'storage-manager manager 不直接暴露 localStorage 对象', !has(manager, 'localStorage,'));

    const settingsFacade = read(REQUIRED_SETTING_FILES.settingsFacade);
    const settingsPersistence = read(REQUIRED_SETTING_FILES.settingsPersistence);
    const savePhoneSettingBody = extractSection(
        settingsPersistence,
        'function savePhoneSetting(',
        'function savePhoneSettingsPatch(',
    );
    const savePhoneSettingsPatchBody = extractSection(
        settingsPersistence,
        'function savePhoneSettingsPatch(',
        'function resetPhoneSettingsToDefault(',
    );
    const templateStore = read(REQUIRED_SETTING_FILES.templateStore);
    const templateRepository = read(REQUIRED_SETTING_FILES.templateRepository);
    const worldbookSelection = read(REQUIRED_SETTING_FILES.worldbookSelection);
    const aiInstructionStore = read(REQUIRED_SETTING_FILES.aiInstructionStore);
    check(results, REQUIRED_SETTING_FILES.settingsFacade, 'settings facade 统一导出 savePhoneSetting()', has(settingsFacade, 'export const savePhoneSetting = persistenceTools.savePhoneSetting;'));
    check(results, REQUIRED_SETTING_FILES.settingsFacade, 'settings facade 统一导出 savePhoneSettingsPatch()', has(settingsFacade, 'export const savePhoneSettingsPatch = persistenceTools.savePhoneSettingsPatch;'));
    check(results, REQUIRED_SETTING_FILES.settingsPersistence, 'settings persistence 保存单项前走 validateSetting()', has(savePhoneSettingBody, 'validateSetting(key, value);'));
    check(results, REQUIRED_SETTING_FILES.settingsPersistence, 'settings persistence 保存单项只写入归一化值', has(savePhoneSettingBody, 'settings[key] = result.value;'));
    check(results, REQUIRED_SETTING_FILES.settingsPersistence, 'settings persistence 保存 patch 逐项走 validateSetting()', has(savePhoneSettingsPatchBody, 'const result = validateSetting(key, value);'));
    check(results, REQUIRED_SETTING_FILES.settingsPersistence, 'settings persistence 保存 patch 只写入归一化值', has(savePhoneSettingsPatchBody, 'settings[key] = result.value;'));
    check(results, REQUIRED_SETTING_FILES.settingsPersistence, 'settings persistence 保存 patch 保留 invalid 通知', has(savePhoneSettingsPatchBody, "showNotification?.('部分设置已按默认规则修正', 'warning');"));
    check(results, REQUIRED_SETTING_FILES.templateStore, 'beautify template store 通过 settings 保存模板仓库', has(templateStore, 'savePhoneSetting(PHONE_BEAUTIFY_STORE_KEY, normalized);'));
    check(results, REQUIRED_SETTING_FILES.templateRepository, 'beautify template repository 保存后失效缓存', has(templateRepository, 'invalidatePhoneBeautifyTemplateCache();'));
    check(results, REQUIRED_SETTING_FILES.worldbookSelection, 'worldbook selection 使用 settings 事实源保存', has(worldbookSelection, "savePhoneSetting('worldbookSelection', nextSelection);"));
    check(results, REQUIRED_SETTING_FILES.aiInstructionStore, 'AI instruction store 使用 settings patch 持久化', has(aiInstructionStore, 'savePhoneSettingsPatch({ phoneAiInstruction: nextSettings });'));
    check(results, REQUIRED_SETTING_FILES.aiInstructionStore, 'AI instruction legacy localStorage 只读迁移使用 getItem()', has(aiInstructionStore, 'localStorage.getItem(LEGACY_PROMPT_TEMPLATES_KEY);'));
    check(results, REQUIRED_SETTING_FILES.aiInstructionStore, 'AI instruction legacy migration 不写 legacy localStorage', !/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(aiInstructionStore));

    const cacheManager = read(REQUIRED_CACHE_FILES.cacheManager);
    const backgroundService = read(REQUIRED_CACHE_FILES.backgroundService);
    const iconUploadService = read(REQUIRED_CACHE_FILES.iconUploadService);
    check(results, REQUIRED_CACHE_FILES.cacheManager, 'cache-manager 使用 IndexedDB 而非 localStorage', has(cacheManager, 'indexedDB.open(DB_NAME, DB_VERSION)') && !has(cacheManager, 'localStorage'));
    check(results, REQUIRED_CACHE_FILES.cacheManager, 'cache-manager 定义 templates/images/settings 三类可再生缓存 store', has(cacheManager, 'templates: STORE_TEMPLATES') && has(cacheManager, 'images: STORE_IMAGES') && has(cacheManager, 'settings: STORE_SETTINGS'));
    check(results, REQUIRED_CACHE_FILES.backgroundService, '背景图片原始设置走 settings', has(backgroundService, "savePhoneSetting('backgroundImage', dataUrl);"));
    check(results, REQUIRED_CACHE_FILES.backgroundService, '背景图片大对象预览走 cache-manager', has(backgroundService, 'cacheSet(CACHE_STORES.images, cachedKey, dataUrl'));
    check(results, REQUIRED_CACHE_FILES.iconUploadService, '应用图标原始设置走 settings', has(iconUploadService, "savePhoneSetting('appIcons', nextIcons);"));
    check(results, REQUIRED_CACHE_FILES.iconUploadService, '应用图标大对象预览走 cache-manager', has(iconUploadService, 'cacheSet(CACHE_STORES.images, cacheKey, dataUrl'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[p1-storage-boundary-contract-check] 检查失败：');
        for (const item of failed) {
            const suffix = item.details ? ` (${item.details})` : '';
            console.error(`- ${item.file}: ${item.description}${suffix}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[p1-storage-boundary-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
