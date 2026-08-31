const IMAGE_LIBRARY_KEY = 'imageLibraryAssets';
const STICKERS_KEY = 'qq-v2.resources.stickers';
const IMAGE_LIBRARIES = Object.freeze({
    avatars: Object.freeze({ library: 'avatar', kind: 'avatar' }),
    profileBackgrounds: Object.freeze({ library: 'profile-background', kind: 'profile-background' }),
    chatBackgrounds: Object.freeze({ library: 'chat-background', kind: 'background' }),
});
const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_RESOURCE_BYTES / 3) * 4;

export const QQ_IMAGE_LIBRARY_PACK_FORMAT = 'yuzi-phone-qq-image-library-pack';
export const QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION = 1;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireStateStore(stateStore) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.transact !== 'function') {
        throw new TypeError('QQ 图片资料包需要有效的 state store');
    }
    return stateStore;
}

function requireUniqueId(value, label, usedIds) {
    const id = asText(value, 256);
    if (!id) throw new Error(`${label}缺少资源 ID`);
    if (usedIds.has(id)) throw new Error(`资源 ID 重复：${id}`);
    usedIds.add(id);
    return id;
}

function appendableId(value, usedIds) {
    const sourceId = asText(value, 256);
    let candidate = sourceId;
    for (let index = 1; usedIds.has(candidate); index += 1) {
        const suffix = `(${index})`;
        candidate = `${sourceId.slice(0, 256 - suffix.length)}${suffix}`;
    }
    usedIds.add(candidate);
    return candidate;
}

function requireImageMimeType(value, label) {
    const mimeType = asText(value, 128).toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/u.test(mimeType)) throw new Error(`${label}的图片类型无效`);
    return mimeType;
}

function requireDataUrl(value, mimeType, label) {
    const dataUrl = asText(value);
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) throw new Error(`${label}的图片数据无效`);
    return dataUrl;
}

function dataUrlToBlob(dataUrl, mimeType) {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (encoded.length > MAX_BASE64_LENGTH) throw new Error('单张图片不能超过 8MB');
    let binary;
    try {
        binary = atob(encoded);
    } catch {
        throw new Error('图片数据不是有效的 Base64');
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.byteLength > MAX_RESOURCE_BYTES) throw new Error('单张图片不能超过 8MB');
    return new Blob([bytes], { type: mimeType });
}

async function blobToDataUrl(blob, mimeType) {
    if (blob.size > MAX_RESOURCE_BYTES) throw new Error('单张图片不能超过 8MB');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
}

async function resolveBlob(record, readMedia) {
    if (record?.blob instanceof Blob) return record.blob;
    return readMedia(record?.mediaKey);
}

async function exportImageAsset(asset, usedIds, readMedia) {
    const blob = await resolveBlob(asset, readMedia);
    if (!(blob instanceof Blob)) throw new Error(`图片资源 ${asset?.assetId || ''} 缺少 Blob`);
    const label = `图片资源 ${asset.assetId || ''}`;
    const id = requireUniqueId(asset.assetId, label, usedIds);
    const mimeType = requireImageMimeType(asset.mimeType || blob.type, label);
    return {
        id,
        mimeType,
        createdAt: Math.max(0, Number(asset.createdAt) || 0),
        dataUrl: await blobToDataUrl(blob, mimeType),
    };
}

async function exportSticker(sticker, usedIds, readMedia) {
    const blob = await resolveBlob(sticker, readMedia);
    if (!(blob instanceof Blob)) throw new Error(`表情资源 ${sticker?.id || ''} 缺少 Blob`);
    const label = `表情资源 ${sticker.id || ''}`;
    const id = requireUniqueId(sticker.id, label, usedIds);
    const description = asText(sticker.description, 4000);
    if (!description) throw new Error(`${label}缺少表情含义`);
    const mimeType = requireImageMimeType(sticker.mimeType || blob.type, label);
    return {
        id,
        description,
        mimeType,
        order: Math.max(0, Number(sticker.order) || 0),
        dataUrl: await blobToDataUrl(blob, mimeType),
    };
}

function parsePack(input) {
    const pack = typeof input === 'string' ? JSON.parse(input) : input;
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('图片资料包必须是 JSON 对象');
    if (pack.format !== QQ_IMAGE_LIBRARY_PACK_FORMAT) {
        throw new Error(`图片资料包 format 必须是 ${QQ_IMAGE_LIBRARY_PACK_FORMAT}`);
    }
    if (Number(pack.schemaVersion) !== QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION) {
        throw new Error(`图片资料包 schemaVersion 必须是 ${QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION}`);
    }
    const libraries = pack.libraries;
    if (!libraries || typeof libraries !== 'object' || Array.isArray(libraries)) {
        throw new Error('图片资料包缺少 libraries');
    }
    for (const key of [...Object.keys(IMAGE_LIBRARIES), 'stickers']) {
        if (!Array.isArray(libraries[key])) throw new Error(`图片资料包 libraries.${key} 必须是数组`);
    }
    return libraries;
}

function importImageAsset(raw, key, index, usedIds) {
    const label = `${key}[${index}]`;
    const source = asObject(raw);
    const mimeType = requireImageMimeType(source.mimeType, label);
    const blob = dataUrlToBlob(requireDataUrl(source.dataUrl, mimeType, label), mimeType);
    const definition = IMAGE_LIBRARIES[key];
    return {
        assetId: requireUniqueId(source.id, label, usedIds),
        scopeId: '',
        conversationId: '',
        kind: definition.kind,
        library: definition.library,
        blob,
        mimeType,
        createdAt: Math.max(0, Number(source.createdAt) || 0),
    };
}

function importSticker(raw, index, usedIds) {
    const label = `stickers[${index}]`;
    const source = asObject(raw);
    const mimeType = requireImageMimeType(source.mimeType, label);
    const blob = dataUrlToBlob(requireDataUrl(source.dataUrl, mimeType, label), mimeType);
    const description = asText(source.description, 4000);
    if (!description) throw new Error(`${label}缺少表情含义`);
    return {
        id: requireUniqueId(source.id, label, usedIds),
        description,
        mimeType,
        size: blob.size,
        order: index,
        blob,
    };
}

function normalizeImportedLibraries(input) {
    const libraries = parsePack(input);
    const usedImageIds = new Set();
    const images = {};
    for (const key of Object.keys(IMAGE_LIBRARIES)) {
        libraries[key].forEach((raw, index) => {
            const asset = importImageAsset(raw, key, index, usedImageIds);
            images[asset.assetId] = asset;
        });
    }
    const usedStickerIds = new Set();
    const stickers = libraries.stickers.map((raw, index) => importSticker(raw, index, usedStickerIds));
    return { images, stickers };
}

export function createQQImageLibraryPackService(options = {}) {
    const stateStore = requireStateStore(options.stateStore);
    const readMedia = typeof stateStore.readMedia === 'function'
        ? (key) => stateStore.readMedia(key)
        : async () => null;

    return Object.freeze({
        async exportPack() {
            const state = await stateStore.read();
            const assets = Object.values(asObject(state.sharedResources?.[IMAGE_LIBRARY_KEY]));
            const stickers = Array.isArray(state.sharedResources?.[STICKERS_KEY]?.stickers)
                ? state.sharedResources[STICKERS_KEY].stickers
                : [];
            const libraries = {};
            const usedImageIds = new Set();
            for (const [key, definition] of Object.entries(IMAGE_LIBRARIES)) {
                libraries[key] = await Promise.all(assets
                    .filter((asset) => asset?.library === definition.library)
                    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
                    .map((asset) => exportImageAsset(asset, usedImageIds, readMedia)));
            }
            const usedStickerIds = new Set();
            libraries.stickers = await Promise.all([...stickers]
                .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
                .map((sticker) => exportSticker(sticker, usedStickerIds, readMedia)));
            return {
                format: QQ_IMAGE_LIBRARY_PACK_FORMAT,
                schemaVersion: QQ_IMAGE_LIBRARY_PACK_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                libraries,
            };
        },
        async importPack(input) {
            const imported = normalizeImportedLibraries(input);
            await stateStore.transact((state) => {
                if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
                    state.sharedResources = {};
                }
                const images = asObject(state.sharedResources[IMAGE_LIBRARY_KEY]);
                const usedImageIds = new Set(Object.keys(images));
                Object.values(imported.images).forEach((asset) => {
                    const assetId = appendableId(asset.assetId, usedImageIds);
                    images[assetId] = { ...asset, assetId };
                });
                state.sharedResources[IMAGE_LIBRARY_KEY] = images;

                const stickerState = asObject(state.sharedResources[STICKERS_KEY]);
                const stickers = Array.isArray(stickerState.stickers) ? stickerState.stickers : [];
                const usedStickerIds = new Set(stickers.map((sticker) => asText(sticker?.id, 256)).filter(Boolean));
                const nextStickerOrder = stickers.reduce(
                    (highest, sticker) => Math.max(highest, Number(sticker?.order) || 0),
                    -1,
                ) + 1;
                const appendedStickers = imported.stickers.map((sticker, index) => ({
                    ...sticker,
                    id: appendableId(sticker.id, usedStickerIds),
                    order: nextStickerOrder + index,
                }));
                state.sharedResources[STICKERS_KEY] = {
                    ...stickerState,
                    stickers: [...stickers, ...appendedStickers],
                };
            });
            return {
                avatars: Object.values(imported.images).filter((asset) => asset.library === 'avatar').length,
                profileBackgrounds: Object.values(imported.images).filter((asset) => asset.library === 'profile-background').length,
                chatBackgrounds: Object.values(imported.images).filter((asset) => asset.library === 'chat-background').length,
                stickers: imported.stickers.length,
            };
        },
    });
}
