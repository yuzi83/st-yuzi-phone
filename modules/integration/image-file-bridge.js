import { getFreshSillyTavernContext } from './context-bridge.js';

const DATA_URL_PATTERN = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/iu;
const OWNED_IMAGE_FOLDER = 'yuzi-phone-generated';
const OWNED_IMAGE_PATH_PREFIX = `user/images/${OWNED_IMAGE_FOLDER}/`;

function normalizeFormat(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^image\//u, '');

    if (!normalized || normalized === 'image') return '';
    if (normalized === 'jpg' || normalized === 'jfif') return 'jpeg';
    return normalized;
}

function normalizeBase64Payload(value) {
    const normalized = String(value || '').replace(/\s+/gu, '');
    if (!normalized || !/^[a-z0-9+/]*={0,2}$/iu.test(normalized)) {
        return '';
    }
    if (normalized.length % 4 === 1) {
        return '';
    }
    return normalized;
}

function decodeBase64Payload(base64) {
    if (typeof globalThis.atob !== 'function') return null;
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    try {
        const binary = globalThis.atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    } catch {
        return null;
    }
}

function encodeBase64Payload(bytes) {
    if (typeof globalThis.btoa !== 'function') return '';
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return globalThis.btoa(binary);
}

function hasBytes(bytes, offset, expected) {
    if (bytes.length < offset + expected.length) return false;
    return expected.every((value, index) => bytes[offset + index] === value);
}

function detectImageFormat(bytes) {
    if (hasBytes(bytes, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
        return 'png';
    }
    if (hasBytes(bytes, 0, [0xFF, 0xD8, 0xFF])) {
        return 'jpeg';
    }
    if (hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46])
        && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
        return 'webp';
    }
    if (hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38])
        && (hasBytes(bytes, 4, [0x37, 0x61]) || hasBytes(bytes, 4, [0x39, 0x61]))) {
        return 'gif';
    }
    if (hasBytes(bytes, 0, [0x42, 0x4D])) {
        return 'bmp';
    }
    return '';
}

function parseImageData(imageData, format) {
    if (typeof imageData !== 'string' || !imageData.trim()) {
        return null;
    }

    const trimmed = imageData.trim();
    const dataUrlMatch = DATA_URL_PATTERN.exec(trimmed);
    if (dataUrlMatch) {
        const base64 = normalizeBase64Payload(dataUrlMatch[2]);
        if (!base64) return null;
        const bytes = decodeBase64Payload(base64);
        const detectedFormat = bytes ? detectImageFormat(bytes) : '';
        const declaredFormat = normalizeFormat(dataUrlMatch[1]);
        if (!detectedFormat || (declaredFormat && declaredFormat !== detectedFormat)) return null;
        return {
            base64,
            format: detectedFormat,
        };
    }
    if (/^data:/iu.test(trimmed)) {
        return null;
    }

    const base64 = normalizeBase64Payload(trimmed);
    if (!base64) return null;
    const bytes = decodeBase64Payload(base64);
    const detectedFormat = bytes ? detectImageFormat(bytes) : '';
    const declaredFormat = normalizeFormat(format);
    if (!detectedFormat || (declaredFormat && declaredFormat !== detectedFormat)) return null;

    return {
        base64,
        format: detectedFormat,
    };
}

function parseRemoteImageUrl(imageData) {
    if (typeof imageData !== 'string') return null;
    const trimmed = imageData.trim();
    if (!/^https?:\/\//iu.test(trimmed)) return null;

    try {
        const url = new URL(trimmed);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            return {
                ok: false,
                status: 'invalid-image-data',
                error: { code: 'invalid-remote-image-url' },
            };
        }
        return {
            ok: true,
            url: url.href,
        };
    } catch {
        return {
            ok: false,
            status: 'invalid-image-data',
            error: { code: 'invalid-remote-image-url' },
        };
    }
}

function createRemoteImageFailure(sourceUrl, status, error) {
    return {
        ok: false,
        status,
        sourceUrl,
        error,
    };
}

async function downloadRemoteImage(sourceUrl, fetchImpl) {
    if (typeof fetchImpl !== 'function') {
        return createRemoteImageFailure(sourceUrl, 'unavailable', {
            code: 'remote-image-fetch-unavailable',
        });
    }

    let response;
    try {
        response = await fetchImpl(sourceUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
        });
    } catch {
        return createRemoteImageFailure(sourceUrl, 'remote-fetch-failed', {
            code: 'remote-image-fetch-failed',
            reason: 'cors-or-network',
        });
    }

    if (!response?.ok) {
        return createRemoteImageFailure(sourceUrl, 'remote-fetch-failed', {
            code: 'remote-image-http-error',
            httpStatus: Number(response?.status) || 0,
        });
    }

    if (typeof response.url === 'string' && response.url) {
        const finalUrl = parseRemoteImageUrl(response.url);
        if (!finalUrl?.ok) {
            return createRemoteImageFailure(sourceUrl, 'invalid-remote-image', {
                code: 'invalid-remote-image-url',
            });
        }
    }

    let contentType = '';
    try {
        contentType = typeof response.headers?.get === 'function'
            ? String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
            : '';
    } catch {
        contentType = '';
    }
    if (!contentType.startsWith('image/')) {
        return createRemoteImageFailure(sourceUrl, 'invalid-remote-image', {
            code: 'invalid-image-content-type',
            contentType,
        });
    }

    let bytes;
    try {
        if (typeof response.arrayBuffer !== 'function') throw new Error('Missing arrayBuffer');
        bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
        return createRemoteImageFailure(sourceUrl, 'remote-fetch-failed', {
            code: 'remote-image-read-failed',
            reason: 'cors-or-network',
        });
    }

    const detectedFormat = detectImageFormat(bytes);
    const declaredFormat = normalizeFormat(contentType);
    if (!detectedFormat || (declaredFormat && declaredFormat !== detectedFormat)) {
        return createRemoteImageFailure(sourceUrl, 'invalid-remote-image', {
            code: 'invalid-image-data',
        });
    }

    const base64 = encodeBase64Payload(bytes);
    if (!base64) {
        return createRemoteImageFailure(sourceUrl, 'invalid-remote-image', {
            code: 'invalid-image-data',
        });
    }

    return {
        ok: true,
        base64,
        format: detectedFormat,
    };
}

function getRequestHeaders(getContext) {
    try {
        const context = getContext();
        if (!context || typeof context.getRequestHeaders !== 'function') {
            return null;
        }
        return context.getRequestHeaders();
    } catch {
        return null;
    }
}

function isOwnedStoredImagePath(value) {
    if (typeof value !== 'string') return false;
    const path = value.trim();
    if (!path.startsWith(OWNED_IMAGE_PATH_PREFIX)) return false;
    const filename = path.slice(OWNED_IMAGE_PATH_PREFIX.length);
    if (!filename || filename === '.' || filename === '..') return false;
    if (filename.includes('/') || filename.includes('\\')) return false;
    return !/[\u0000-\u001F\u007F]/u.test(filename);
}

export function createImageFileBridge(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const getContext = options.getContext || getFreshSillyTavernContext;

    async function save(input = {}) {
        const requestedFolder = typeof input.folder === 'string' ? input.folder.trim() : '';
        if (requestedFolder && requestedFolder !== OWNED_IMAGE_FOLDER) {
            return {
                ok: false,
                status: 'invalid-destination',
                error: { code: 'invalid-image-folder' },
            };
        }

        const remoteSource = parseRemoteImageUrl(input.imageData);
        if (remoteSource && !remoteSource.ok) return remoteSource;

        const parsed = remoteSource
            ? await downloadRemoteImage(remoteSource.url, fetchImpl)
            : parseImageData(input.imageData, input.format);
        if (remoteSource && !parsed?.ok) return parsed;
        if (!parsed) {
            return {
                ok: false,
                status: 'invalid-image-data',
                error: { code: 'invalid-image-data' },
            };
        }

        const headers = getRequestHeaders(getContext);
        if (!headers || typeof fetchImpl !== 'function') {
            return {
                ok: false,
                status: 'unavailable',
                error: { code: 'image-storage-unavailable' },
            };
        }

        let response;
        try {
            response = await fetchImpl('/api/images/upload', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    image: parsed.base64,
                    format: parsed.format,
                    ch_name: OWNED_IMAGE_FOLDER,
                    filename: typeof input.filename === 'string' ? input.filename : '',
                }),
            });
        } catch {
            return {
                ok: false,
                status: 'failed',
                error: { code: 'image-upload-failed' },
            };
        }

        if (!response?.ok) {
            return {
                ok: false,
                status: 'failed',
                error: {
                    code: 'image-upload-failed',
                    httpStatus: Number(response?.status) || 0,
                },
            };
        }

        let payload;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!payload || !isOwnedStoredImagePath(payload.path)) {
            return {
                ok: false,
                status: 'invalid-response',
                error: {
                    code: typeof payload?.path === 'string' && payload.path
                        ? 'invalid-image-path'
                        : 'missing-image-path',
                },
            };
        }

        const storedPath = payload.path.trim();
        return {
            ok: true,
            status: 'stored',
            path: storedPath,
            format: parsed.format,
        };
    }

    async function deleteImage(input = {}) {
        const path = typeof input.path === 'string' ? input.path.trim() : '';
        if (!isOwnedStoredImagePath(path)) {
            return {
                ok: false,
                status: 'invalid-path',
                path,
                error: { code: 'invalid-image-path' },
            };
        }

        const headers = getRequestHeaders(getContext);
        if (!headers || typeof fetchImpl !== 'function') {
            return {
                ok: false,
                status: 'unavailable',
                path,
                error: { code: 'image-storage-unavailable' },
            };
        }

        let response;
        try {
            response = await fetchImpl('/api/images/delete', {
                method: 'POST',
                headers,
                body: JSON.stringify({ path }),
            });
        } catch {
            return {
                ok: false,
                status: 'failed',
                path,
                error: { code: 'image-delete-failed' },
            };
        }

        if (response?.status === 404) {
            return {
                ok: false,
                status: 'not-found',
                path,
                error: { code: 'image-not-found' },
            };
        }
        if (!response?.ok) {
            return {
                ok: false,
                status: 'failed',
                path,
                error: {
                    code: 'image-delete-failed',
                    httpStatus: Number(response?.status) || 0,
                },
            };
        }

        return {
            ok: true,
            status: 'deleted',
            path,
        };
    }

    return Object.freeze({
        save,
        delete: deleteImage,
    });
}
