import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import { normalizeMatchText } from './matcher.js';
import { createTableSnapshot } from './snapshot.js';

function text(value) {
    return String(value ?? '').trim();
}

function identityText(value) {
    return String(value ?? '').normalize('NFKC').trim();
}

function canvasByName(declaration, name) {
    const canvasName = text(name);
    return (Array.isArray(declaration?.imageGeneration?.canvases)
        ? declaration.imageGeneration.canvases
        : []).find(canvas => text(canvas?.canvas) === canvasName) || null;
}

function rowsForSnapshot(snapshot) {
    const headers = Array.isArray(snapshot?.rawHeaders) ? snapshot.rawHeaders.map(text) : [];
    return (Array.isArray(snapshot?.rows) ? snapshot.rows : []).map(row => Object.freeze(
        Object.fromEntries(headers.map((header, index) => [header, row?.[index]])),
    ));
}

function tableForCanvas(rawData, canvas) {
    const expectedName = normalizeMatchText(canvas?.tableName);
    const expectedFields = new Set((canvas?.stableIdentityFields || [])
        .concat(canvas?.promptFields || [])
        .map(normalizeMatchText));
    const matches = buildTableNavigationCatalog(rawData).map(entry => ({
        sheetKey: entry.sheetKey,
        snapshot: createTableSnapshot(rawData, entry.sheetKey),
    })).filter(({ snapshot }) => (
        snapshot
        && normalizeMatchText(snapshot.tableName) === expectedName
        && [...expectedFields].every(field => snapshot.headers.map(normalizeMatchText).includes(field))
    ));
    return matches.length === 1 ? matches[0] : null;
}

function identityValues(rowValues, fields) {
    if (!rowValues || typeof rowValues !== 'object' || Array.isArray(rowValues)) return null;
    const values = fields.map(field => identityText(rowValues[field]));
    return values.some(value => !value) ? null : values;
}

function hasUniqueCurrentIdentity(rowValues, candidateRows, fields) {
    const current = identityValues(rowValues, fields);
    if (!current) return false;
    return candidateRows.filter(row => {
        const candidate = identityValues(row, fields);
        return candidate?.every((value, index) => value === current[index]);
    }).length === 1;
}

function physicalCanvas(canvas, sheetKey) {
    return Object.freeze({
        id: text(canvas?.canvas),
        tableName: text(sheetKey),
        stableIdentityFields: Object.freeze([...(canvas?.stableIdentityFields || [])]),
        promptFields: Object.freeze([...(canvas?.promptFields || [])]),
        ...(canvas?.promptSuffix !== undefined ? { promptSuffix: text(canvas.promptSuffix) } : {}),
    });
}

function result(ok, status, extra = {}) {
    return Object.freeze({ ok, status, ...extra });
}

const NOOP = () => {};

/**
 * Maps an author-declared canvas and a displayed row to the shared table-image
 * service. This layer intentionally never reads arbitrary fields: it accepts
 * only a declared canvas, one current row object and the matching real table.
 */
export function createContentPresetImageActions(options = {}) {
    const declaration = options.declaration || {};
    const source = Object.freeze({ ...(options.source || {}) });
    const getRawData = typeof options.getRawData === 'function' ? options.getRawData : () => ({});
    const getChatScope = typeof options.getChatScope === 'function' ? options.getChatScope : () => '';
    const isSourceActive = typeof options.isSourceActive === 'function' ? options.isSourceActive : async () => false;
    const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => false;
    const isImageGenerationEnabled = typeof options.isImageGenerationEnabled === 'function'
        ? options.isImageGenerationEnabled
        : async () => true;
    const isTableEnabled = typeof options.isTableEnabled === 'function' ? options.isTableEnabled : async () => false;
    const subscribeSettings = typeof options.subscribeSettings === 'function' ? options.subscribeSettings : () => NOOP;
    const service = options.imageGenerationService;
    if (!service || typeof service.generate !== 'function' || typeof service.read !== 'function') {
        throw new TypeError('内容预设生图动作需要 generate/read 服务');
    }

    async function resolve(canvasName, rowValues, { requireEnabled = true, requireIdentity = true } = {}) {
        if (!isCurrent()) return { ok: false, result: result(false, 'stale', { reason: 'instance-inactive' }) };
        if (!await isSourceActive({ source, declaration })) {
            return { ok: false, result: result(false, 'stale', { reason: 'source-inactive' }) };
        }
        const canvas = canvasByName(declaration, canvasName);
        if (!canvas) return { ok: false, result: result(false, 'invalid-input', { reason: 'canvas-not-found' }) };
        if (requireEnabled && !await isImageGenerationEnabled({ canvas, source })) {
            return { ok: false, result: result(false, 'disabled', { reason: 'image-generation-disabled' }) };
        }
        const rawData = getRawData() || {};
        const table = tableForCanvas(rawData, canvas);
        if (!table?.snapshot) return { ok: false, result: result(false, 'stale', { reason: 'table-unavailable' }) };
        const candidateRows = rowsForSnapshot(table.snapshot);
        if (requireIdentity && !hasUniqueCurrentIdentity(rowValues, candidateRows, canvas.stableIdentityFields || [])) {
            return { ok: false, result: result(false, 'invalid-target', { reason: 'identity-not-unique' }) };
        }
        if (requireEnabled && !await isTableEnabled({
            sheetKey: table.sheetKey,
            tableName: table.snapshot.tableName,
            canvas,
            source,
        })) {
            return { ok: false, result: result(false, 'disabled', { reason: 'table-disabled' }) };
        }
        const chatScope = text(getChatScope());
        if (!chatScope) return { ok: false, result: result(false, 'unavailable', { reason: 'chat-unavailable' }) };
        return {
            ok: true,
            canvas,
            physicalCanvas: physicalCanvas(canvas, table.sheetKey),
            chatScope,
            rowValues,
            candidateRows,
            sheetKey: table.sheetKey,
        };
    }

    async function isStillCurrent(context, target) {
        if (!isCurrent() || text(getChatScope()) !== text(target?.chatScope)) return false;
        if (!await isSourceActive({ source, declaration, context })) return false;
        const canvas = canvasByName(declaration, context?.canvasName);
        const table = canvas ? tableForCanvas(getRawData() || {}, canvas) : null;
        return !!table
            && table.sheetKey === text(target?.physicalTable)
            && hasUniqueCurrentIdentity(context?.rowValues, rowsForSnapshot(table.snapshot), canvas.stableIdentityFields || []);
    }

    async function generateImage(canvasName, rowValues) {
        const context = await resolve(canvasName, rowValues);
        if (!context.ok) return context.result;
        return service.generate({
            canvas: context.physicalCanvas,
            chatScope: context.chatScope,
            rowValues: context.rowValues,
            candidateRows: context.candidateRows,
            requestContext: Object.freeze({
                source,
                canvasName: text(canvasName),
                rowValues: context.rowValues,
                sheetKey: context.sheetKey,
                isStillCurrent: target => isStillCurrent({
                    canvasName: text(canvasName),
                    rowValues: context.rowValues,
                }, target),
            }),
        });
    }

    async function readImage(canvasName, rowValues) {
        const context = await resolve(canvasName, rowValues, { requireEnabled: false });
        if (!context.ok) return context.result;
        const record = await service.read({
            canvas: context.physicalCanvas,
            chatScope: context.chatScope,
            rowValues: context.rowValues,
        });
        const imagePath = text(record?.imagePath);
        return imagePath
            ? result(true, 'ready', { imagePath, record })
            : result(true, 'empty', { cleared: Boolean(record) });
    }

    async function mutateImage(method, canvasName, rowValues, image) {
        const context = await resolve(canvasName, rowValues, { requireEnabled: false });
        if (!context.ok) return context.result;
        if (typeof service[method] !== 'function') return result(false, 'unavailable', { reason: 'image-storage-unavailable' });
        if (method === 'save' && (!(image instanceof Blob) || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.type) || image.size === 0 || image.size > 8 * 1024 * 1024)) {
            return result(false, 'invalid-input', { reason: 'invalid-image' });
        }
        return service[method]({
            canvas: context.physicalCanvas, chatScope: context.chatScope, rowValues: context.rowValues, candidateRows: context.candidateRows, image,
            requestContext: Object.freeze({ isStillCurrent: target => isStillCurrent({ canvasName, rowValues }, target) }),
        });
    }

    async function getImageGenerationState(canvasName, rowValues) {
        const context = await resolve(canvasName, rowValues, {
            requireIdentity: rowValues !== undefined,
        });
        if (!context.ok) {
            return Object.freeze({
                available: false,
                ...context.result,
                canvasName: text(canvasName),
            });
        }
        return Object.freeze({
            available: true,
            status: 'ready',
            canvasName: text(canvasName),
            sheetKey: context.sheetKey,
        });
    }

    function subscribeImageGeneration(listener) {
        if (typeof listener !== 'function') return NOOP;
        let active = true;
        let unsubscribe = NOOP;
        try {
            const remove = subscribeSettings(detail => {
                if (active && isCurrent()) {
                    try { listener(detail || {}); } catch {}
                }
            });
            if (typeof remove === 'function') unsubscribe = remove;
        } catch {
            return NOOP;
        }
        return () => {
            if (!active) return;
            active = false;
            try { unsubscribe(); } catch {}
        };
    }

    return Object.freeze({
        generateImage,
        saveImage: (canvasName, rowValues, image) => mutateImage('save', canvasName, rowValues, image),
        deleteImage: (canvasName, rowValues) => mutateImage('delete', canvasName, rowValues),
        readImage,
        getImageGenerationState,
        subscribeImageGeneration,
    });
}
