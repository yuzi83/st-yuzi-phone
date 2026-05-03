import { resolveTemplateWithDraftForViewer } from '../template-runtime.js';
import {
    normalizeSpecialFieldBindingsForViewer,
    normalizeSpecialStyleOptionsForViewer,
} from './field-reader-normalizers.js';

export function createSpecialFieldReader({ templateMatch, type, headerMap, sheetKey, tableName }) {
    const resolvedTemplate = resolveTemplateWithDraftForViewer(templateMatch?.template);
    const rawFieldBindings = resolvedTemplate?.render?.fieldBindings;
    const rawStyleOptions = resolvedTemplate?.render?.styleOptions;

    const fieldBindings = normalizeSpecialFieldBindingsForViewer(rawFieldBindings, type);
    const styleOptions = normalizeSpecialStyleOptionsForViewer(rawStyleOptions, type);

    const safeSheetKey = String(sheetKey || '').trim();
    const safeTableName = String(tableName || '').trim();

    const readField = (row, fieldKey, fallback = '') => {
        const candidates = Array.isArray(fieldBindings[fieldKey]) ? fieldBindings[fieldKey] : [];

        for (const candidate of candidates) {
            const token = String(candidate || '').trim();
            if (!token) continue;

            if (token === '@now') {
                return new Date().toISOString();
            }

            if (token === '@sheetKey') {
                return safeSheetKey;
            }

            if (token === '@tableName') {
                return safeTableName;
            }

            if (token.startsWith('@const:')) {
                const constValue = token.slice('@const:'.length).trim();
                if (constValue) return constValue;
                continue;
            }

            const value = getCellByHeaders(row, headerMap, [token]);
            if (value !== '') {
                return value;
            }
        }

        return String(fallback ?? '');
    };

    readField.getStyleOption = (optionKey, fallback = '') => {
        if (Object.prototype.hasOwnProperty.call(styleOptions, optionKey)) {
            return styleOptions[optionKey];
        }
        return fallback;
    };

    readField.styleOptions = { ...styleOptions };

    return readField;
}

export function buildHeaderIndexMap(headers) {
    const map = new Map();
    headers.forEach((h, idx) => {
        const key = String(h || '').trim();
        if (!key) return;
        if (!map.has(key)) map.set(key, idx);
    });
    return map;
}

export function getCellByHeaders(row, headerMap, headerNames = []) {
    if (!Array.isArray(row)) return '';
    for (const headerName of headerNames) {
        const idx = headerMap.get(headerName);
        if (idx === undefined) continue;
        const value = row[idx];
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text !== '') return text;
    }
    return '';
}
