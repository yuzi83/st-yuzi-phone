import { computeAppearanceFontHash as computeResourceFingerprint } from './schema.js';

// 外观资源是持久数据，不使用有 TTL / LRU 的图片缓存。
const DB_NAME = 'yuzi-phone-appearance-assets';
const STORE = 'assets';
const REF_PREFIX = 'yuzi-appearance:';
export const APPEARANCE_ASSET_FIELDS = [
    'backgroundImage', 'appIcons', 'phoneToggleCoverImage',
    'appearanceFontLibrary', 'appearanceResourcePool',
];
let dbPromise;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        let blocked = false;
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            blocked = true;
            reject(new Error('外观资源数据库被其他页面阻塞，请关闭旧页面后重试'));
        };
        request.onsuccess = () => {
            const db = request.result;
            if (blocked) { db.close(); return; }
            db.onversionchange = () => { db.close(); dbPromise = undefined; };
            resolve(db);
        };
    }).catch(error => { dbPromise = undefined; throw error; });
    return dbPromise;
}

async function transact(mode, operate) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('外观资源保存失败'));
        try {
            operate(tx.objectStore(STORE), value => { result = value; });
        } catch (error) {
            tx.abort();
            reject(error);
        }
    });
}

function readAsset(id) {
    return transact('readonly', (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => done(request.result);
    });
}

function writeAssets(entries) {
    if (!entries.length) return Promise.resolve();
    return transact('readwrite', store => {
        for (const [id, asset] of entries) store.add(asset, id);
    });
}

async function mapValues(value, transform) {
    if (typeof value === 'string') return transform(value);
    if (Array.isArray(value)) return Promise.all(value.map(item => mapValues(item, transform)));
    if (value && typeof value === 'object') {
        return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [
            key, await mapValues(item, transform),
        ])));
    }
    return value;
}

function makeAsset(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, comma + 1);
    if (comma < 0 || !/;base64,$/i.test(header)) throw new Error('外观资源不是有效的 Base64 文件');
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return { header, blob: new Blob([bytes], { type: header.slice(5).split(';')[0] }) };
}

function restoreDataUrl(asset) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const encoded = String(reader.result);
            resolve(asset.header + encoded.slice(encoded.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error || new Error('外观资源读取失败'));
        reader.readAsDataURL(asset.blob);
    });
}

// UI、裁剪和旧美化包仍使用 Data URL；只有内存保留它，宿主设置只得到短引用。
export function createAppearanceAssetCodec({ read = readAsset, write = writeAssets } = {}) {
    let known = new Map();

    async function hydrate(settings) {
        const runtime = { ...settings };
        const missing = new Map();
        const loaded = new Map();
        for (const field of APPEARANCE_ASSET_FIELDS) {
            if (!(field in settings)) continue;
            runtime[field] = await mapValues(settings[field], async value => {
                if (!value.startsWith(REF_PREFIX)) return value;
                if (!loaded.has(value)) {
                    loaded.set(value, read(value.slice(REF_PREFIX.length)).then(async asset => {
                        if (!asset?.blob) return null;
                        const dataUrl = await restoreDataUrl(asset);
                        known.set(dataUrl, value);
                        return dataUrl;
                    }).catch(() => null));
                }
                const dataUrl = await loaded.get(value);
                if (dataUrl === null) {
                    // 换浏览器 / 清理站点数据后显示默认值，但普通设置保存不能抹掉原引用。
                    missing.set(field, settings[field]);
                    return '';
                }
                return dataUrl;
            });
        }
        return { settings: runtime, missing };
    }

    async function serialize(settings, preserved = new Map(), retry = true) {
        const stored = { ...settings };
        const pending = new Map();
        const used = new Map();
        const entries = [];
        const reserved = new Map();
        async function findOrCreate(value) {
            // 复用已有内容指纹；命中后核对完整数据，哈希碰撞不能串图。
            const fingerprint = computeResourceFingerprint(value);
            for (let suffix = 0; ; suffix += 1) {
                const id = suffix ? `${fingerprint}:${suffix}` : fingerprint;
                const existing = await read(id);
                if (reserved.has(id)) continue;
                if (existing) {
                    if (await restoreDataUrl(existing) === value) return REF_PREFIX + id;
                    continue;
                }
                reserved.set(id, value);
                entries.push([id, makeAsset(value)]);
                return REF_PREFIX + id;
            }
        }
        for (const field of APPEARANCE_ASSET_FIELDS) {
            if (!(field in settings)) continue;
            if (preserved.has(field)) { stored[field] = preserved.get(field); continue; }
            stored[field] = await mapValues(settings[field], async value => {
                if (!value.startsWith('data:')) return value;
                if (!known.has(value) && !pending.has(value)) pending.set(value, findOrCreate(value));
                const ref = known.get(value) || await pending.get(value);
                used.set(value, ref);
                return ref;
            });
        }
        // 必须等事务完成；request success 不代表事务已经提交。
        try {
            await write(entries);
        } catch (error) {
            // 两个标签页同时存入相同内容时，重新读取另一页已提交的资源。
            if (retry && error?.name === 'ConstraintError') return serialize(settings, preserved, false);
            throw error;
        }
        known = used;
        // ponytail: 暂不跨页面回收未引用资源，避免破坏其他标签页和旧设置备份的引用。
        return stored;
    }

    return { hydrate, serialize };
}
