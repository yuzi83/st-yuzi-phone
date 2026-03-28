import { Logger } from '../../error-handler.js';
import { createStorageManager, getSessionStorageNamespace } from '../../storage-manager.js';

const STORAGE_KEYS = {
    specialChoices: 'yzp_special_choices_v1',
    specialChoicesLegacy: 'tamako_phone_special_choices_v1',
};

const choiceStore = createStorageManager({
    maxEntries: 900,
    maxBytes: 1024 * 1024,
    defaultTTL: 1000 * 60 * 60 * 24 * 30,
});

const choiceStoreSessionNs = getSessionStorageNamespace('specialChoices');
const choiceStorePersistentNs = 'specialChoices:global';
let choiceStoreMigrated = false;

export function ensureChoiceStoreMigrated() {
    if (choiceStoreMigrated) return;
    choiceStoreMigrated = true;

    const MIGRATION_BACKUP_PREFIX = 'yuzi_phone_migration_backup:';
    const MIGRATION_LOG_PREFIX = '[玉子手机][存储迁移]';

    try {
        const modern = localStorage.getItem(STORAGE_KEYS.specialChoices);
        const legacy = localStorage.getItem(STORAGE_KEYS.specialChoicesLegacy);
        const source = modern || legacy;

        if (!source) {
            Logger.debug(`${MIGRATION_LOG_PREFIX} 无需迁移，未找到旧数据`);
            return;
        }

        const backupKey = `${MIGRATION_BACKUP_PREFIX}${Date.now()}`;
        try {
            localStorage.setItem(backupKey, source);
            Logger.debug(`${MIGRATION_LOG_PREFIX} 已创建备份: ${backupKey}`);
        } catch (backupError) {
            Logger.warn(`${MIGRATION_LOG_PREFIX} 创建备份失败:`, backupError);
        }

        let map;
        try {
            map = JSON.parse(source);
        } catch (parseError) {
            Logger.error(`${MIGRATION_LOG_PREFIX} JSON 解析失败:`, parseError);
            return;
        }

        if (!map || typeof map !== 'object') {
            Logger.warn(`${MIGRATION_LOG_PREFIX} 数据格式无效`);
            return;
        }

        let migratedCount = 0;
        let failedCount = 0;

        Object.entries(map).forEach(([choiceId, idx]) => {
            if (!choiceId || !Number.isInteger(idx)) {
                failedCount++;
                return;
            }

            try {
                choiceStore.set(choiceStorePersistentNs, choiceId, idx, {
                    ttl: 1000 * 60 * 60 * 24 * 30,
                });
                migratedCount++;
            } catch (setError) {
                Logger.warn(`${MIGRATION_LOG_PREFIX} 写入数据失败 (key=${choiceId}):`, setError);
                failedCount++;
            }
        });

        Logger.info(`${MIGRATION_LOG_PREFIX} 迁移完成: 成功 ${migratedCount} 条, 失败 ${failedCount} 条`);

        if (migratedCount > 0) {
            try {
                localStorage.removeItem(STORAGE_KEYS.specialChoices);
                localStorage.removeItem(STORAGE_KEYS.specialChoicesLegacy);
                Logger.debug(`${MIGRATION_LOG_PREFIX} 已清理旧数据`);
            } catch (removeError) {
                Logger.warn(`${MIGRATION_LOG_PREFIX} 清理旧数据失败:`, removeError);
            }

            try {
                choiceStore.maintenance();
            } catch (maintError) {
                Logger.warn(`${MIGRATION_LOG_PREFIX} 存储维护失败:`, maintError);
            }
        }

        setTimeout(() => {
            try {
                localStorage.removeItem(backupKey);
                Logger.debug(`${MIGRATION_LOG_PREFIX} 已清理备份: ${backupKey}`);
            } catch {}
        }, 1000 * 60 * 60 * 24);
    } catch (error) {
        Logger.error(`${MIGRATION_LOG_PREFIX} 迁移过程发生错误:`, error);
        choiceStoreMigrated = false;
    }
}

export function getSavedChoice(choiceId) {
    try {
        ensureChoiceStoreMigrated();
        const sid = String(choiceId || '').trim();
        if (!sid) return undefined;

        const sessionValue = choiceStore.get(choiceStoreSessionNs, sid);
        if (Number.isInteger(sessionValue)) return sessionValue;

        const persistentValue = choiceStore.get(choiceStorePersistentNs, sid);
        return Number.isInteger(persistentValue) ? persistentValue : undefined;
    } catch {
        return undefined;
    }
}

export function setSavedChoice(choiceId, index) {
    try {
        ensureChoiceStoreMigrated();
        const sid = String(choiceId || '').trim();
        if (!sid || !Number.isInteger(index)) return;

        choiceStore.set(choiceStoreSessionNs, sid, index, {
            ttl: 1000 * 60 * 60 * 24 * 3,
        });
        choiceStore.set(choiceStorePersistentNs, sid, index, {
            ttl: 1000 * 60 * 60 * 24 * 30,
        });
        choiceStore.maintenance();
    } catch {
        // ignore
    }
}

export function clearSavedChoice(choiceId) {
    try {
        ensureChoiceStoreMigrated();
        const sid = String(choiceId || '').trim();
        if (!sid) return;
        choiceStore.remove(choiceStoreSessionNs, sid);
        choiceStore.remove(choiceStorePersistentNs, sid);
    } catch {
        // ignore
    }
}
