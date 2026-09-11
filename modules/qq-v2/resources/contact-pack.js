const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_RESOURCE_BYTES / 3) * 4;
const PRIVATE_CONTACT_STATUSES = new Set(['active', 'contact']);

export const QQ_CONTACT_PACK_FORMAT = 'yuzi-phone-qq-contact-pack';
export const QQ_CONTACT_PACK_SCHEMA_VERSION = 1;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asLiteralText(value, maxLength = 0) {
    const text = String(value ?? '');
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireRepository(repository) {
    const required = [
        'listConversations',
        'getPerson',
        'getMediaAsset',
        'importPrivateContacts',
    ];
    if (required.some((name) => typeof repository?.[name] !== 'function')) {
        throw new TypeError('QQ 联系人资料包需要有效的 repository');
    }
    return repository;
}

function requireTextField(value, label, maxLength, { required = false } = {}) {
    if (typeof value !== 'string') throw new Error(`${label}必须是字符串`);
    if (value.length > maxLength) throw new Error(`${label}过长`);
    if (required && !value.trim()) throw new Error(`${label}不能为空`);
    return value;
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

function parsePack(input) {
    const pack = typeof input === 'string' ? JSON.parse(input) : input;
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('联系人资料包必须是 JSON 对象');
    if (pack.format !== QQ_CONTACT_PACK_FORMAT) {
        throw new Error(`联系人资料包 format 必须是 ${QQ_CONTACT_PACK_FORMAT}`);
    }
    if (Number(pack.schemaVersion) !== QQ_CONTACT_PACK_SCHEMA_VERSION) {
        throw new Error(`联系人资料包 schemaVersion 必须是 ${QQ_CONTACT_PACK_SCHEMA_VERSION}`);
    }
    if (!Array.isArray(pack.contacts)) throw new Error('联系人资料包 contacts 必须是数组');
    return pack.contacts;
}

function importImage(raw, label) {
    if (raw === null) return null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label}必须是图片对象或 null`);
    const source = asObject(raw);
    const mimeType = requireImageMimeType(source.mimeType, label);
    return {
        blob: dataUrlToBlob(requireDataUrl(source.dataUrl, mimeType, label), mimeType),
        mimeType,
    };
}

function normalizeImportedContacts(input) {
    return parsePack(input).map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error(`contacts[${index}]必须是对象`);
        }
        const source = asObject(raw);
        return {
            formalName: requireTextField(source.name, `contacts[${index}].name`, 120, { required: true }),
            signature: requireTextField(source.signature, `contacts[${index}].signature`, 1000),
            gender: requireTextField(source.gender, `contacts[${index}].gender`, 120),
            birthday: requireTextField(source.birthday, `contacts[${index}].birthday`, 120),
            avatar: importImage(source.avatar, `contacts[${index}].avatar`),
            profileBackground: importImage(source.profileBackground, `contacts[${index}].profileBackground`),
            chatBackground: importImage(source.chatBackground, `contacts[${index}].chatBackground`),
        };
    });
}

async function exportImage(repository, scopeId, assetId, expectedKind, label) {
    const id = asText(assetId, 256);
    if (!id) return null;
    const asset = await repository.getMediaAsset(scopeId, id);
    if (asset?.kind !== expectedKind || !(asset.blob instanceof Blob)) {
        throw new Error(`${label}图片不可读取`);
    }
    const mimeType = requireImageMimeType(asset.mimeType || asset.blob.type, label);
    return {
        mimeType,
        dataUrl: await blobToDataUrl(asset.blob, mimeType),
    };
}

async function exportContact(repository, scopeId, conversation) {
    const person = await repository.getPerson(scopeId, conversation.personId);
    if (!person) throw new Error('联系人资料不存在');
    return {
        name: asLiteralText(person.formalName, 120),
        signature: asLiteralText(person.signature, 1000),
        gender: asLiteralText(person.gender, 120),
        birthday: asLiteralText(person.birthday, 120),
        avatar: await exportImage(repository, scopeId, person.avatarAssetId, 'avatar', '头像'),
        profileBackground: await exportImage(
            repository,
            scopeId,
            person.profileBackgroundAssetId,
            'profile-background',
            '资料背景',
        ),
        chatBackground: await exportImage(
            repository,
            scopeId,
            conversation.backgroundAssetId,
            'background',
            '聊天背景',
        ),
    };
}

export function createQQContactPackService(options = {}) {
    const repository = requireRepository(options.repository);

    return Object.freeze({
        async exportPack({ scopeId } = {}) {
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId) throw new Error('QQ 作用域不可用');
            const conversations = await repository.listConversations(normalizedScopeId);
            const contacts = await Promise.all(conversations
                .filter((conversation) => (
                    !conversation?.assistantCharacterId && conversation?.kind === 'private'
                    && PRIVATE_CONTACT_STATUSES.has(asText(conversation.status, 32))
                ))
                .map((conversation) => exportContact(repository, normalizedScopeId, conversation)));
            return {
                format: QQ_CONTACT_PACK_FORMAT,
                schemaVersion: QQ_CONTACT_PACK_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                contacts,
            };
        },
        previewPack(input) {
            return Object.freeze({ contacts: normalizeImportedContacts(input).length });
        },
        async importPack({ scopeId, source, operationOptions = {} } = {}) {
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId) throw new Error('QQ 作用域不可用');
            const contacts = normalizeImportedContacts(source);
            const imported = await repository.importPrivateContacts(
                normalizedScopeId,
                contacts,
                operationOptions,
            );
            return Object.freeze({ contacts: imported.length });
        },
    });
}
