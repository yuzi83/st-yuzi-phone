import { getSheetKeys } from '../phone-core/data-api.js';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeName(value) {
    return normalizeText(value)
        .normalize('NFKC')
        .replace(/\s+/gu, ' ')
        .toLocaleLowerCase();
}

function buildTable(rawData, sheetKey, orderIndex) {
    const sheet = rawData[sheetKey];
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    const headerRow = Array.isArray(content[0]) ? content[0] : null;
    const headers = headerRow
        ? headerRow.map((header, columnIndex) => {
            const rawName = normalizeText(header);
            return {
                columnIndex,
                rawName,
                displayName: rawName || `列${columnIndex + 1}`,
            };
        })
        : [];

    return {
        sheetKey,
        tableName: normalizeText(sheet?.name) || sheetKey,
        orderIndex,
        status: headerRow ? 'available' : 'missing_header_row',
        headers,
        rowCount: headerRow ? content.slice(1).length : 0,
    };
}

function normalizeSavedColumn(column) {
    const columnIndex = Number.isInteger(column?.columnIndex) && column.columnIndex >= 0
        ? column.columnIndex
        : -1;
    return {
        columnIndex,
        headerSnapshot: normalizeText(column?.headerSnapshot),
    };
}

function buildMissingColumn(column) {
    const normalized = normalizeSavedColumn(column);
    return {
        ...normalized,
        currentHeader: '',
        status: 'missing',
    };
}

function resolveSavedColumn(table, savedColumn) {
    const normalized = normalizeSavedColumn(savedColumn);
    const directHeader = table.headers[normalized.columnIndex];
    if (
        directHeader
        && (
            !normalized.headerSnapshot
            || directHeader.rawName === normalized.headerSnapshot
        )
    ) {
        return {
            columnIndex: directHeader.columnIndex,
            headerSnapshot: normalized.headerSnapshot || directHeader.rawName,
            currentHeader: directHeader.rawName,
            status: 'available',
        };
    }

    return buildMissingColumn(normalized);
}

function resolveMapping(savedMapping, tableBySheetKey) {
    const mappingId = normalizeText(savedMapping?.mappingId || savedMapping?.id);
    const sheetKey = normalizeText(savedMapping?.sheetKey);
    const tableNameSnapshot = normalizeText(savedMapping?.tableNameSnapshot);
    const savedPromptColumns = Array.isArray(savedMapping?.promptColumns)
        ? savedMapping.promptColumns
        : [];
    const table = tableBySheetKey.get(sheetKey);

    if (!table) {
        return {
            mappingId,
            sheetKey,
            tableName: tableNameSnapshot || sheetKey,
            tableNameSnapshot,
            nameColumn: buildMissingColumn(savedMapping?.nameColumn),
            promptColumns: savedPromptColumns.map(buildMissingColumn),
            status: 'missing_sheet',
            missingFields: [{ kind: 'sheet', sheetKey }],
        };
    }

    const nameColumn = resolveSavedColumn(table, savedMapping?.nameColumn);
    const promptColumns = savedPromptColumns.map(column => resolveSavedColumn(table, column));
    const missingPromptColumns = promptColumns
        .filter(column => column.status !== 'available')
        .map(column => ({
            kind: 'prompt_column',
            columnIndex: column.columnIndex,
            headerSnapshot: column.headerSnapshot,
        }));
    const missingFields = nameColumn.status === 'available'
        ? missingPromptColumns
        : [{
            kind: 'name_column',
            columnIndex: nameColumn.columnIndex,
            headerSnapshot: nameColumn.headerSnapshot,
        }, ...missingPromptColumns];
    let status = 'available';
    if (table.status === 'missing_header_row') status = 'missing_header_row';
    else if (nameColumn.status !== 'available') status = 'missing_name_column';
    else if (missingPromptColumns.length > 0) status = 'partially_missing_prompt_columns';

    return {
        mappingId,
        sheetKey,
        tableName: table.tableName,
        tableNameSnapshot,
        nameColumn,
        promptColumns,
        status,
        missingFields,
    };
}

export function buildCharacterMappingModel(rawData, savedMappings = []) {
    const safeRawData = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData
        : {};
    const tables = getSheetKeys(safeRawData)
        .map((sheetKey, orderIndex) => buildTable(safeRawData, sheetKey, orderIndex));
    const tableBySheetKey = new Map(tables.map(table => [table.sheetKey, table]));

    return {
        tables,
        resolvedMappings: Array.isArray(savedMappings)
            ? savedMappings.map(mapping => resolveMapping(mapping, tableBySheetKey))
            : [],
    };
}

function splitExplicitNames(explicitNames) {
    const source = Array.isArray(explicitNames) ? explicitNames : [explicitNames];
    const names = source
        .flatMap(value => String(value ?? '').split(/[;；]/u))
        .map(normalizeText)
        .filter(Boolean);
    const seen = new Set();
    return names.filter((name) => {
        const key = normalizeName(name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getTableRows(rawData, sheetKey) {
    const content = Array.isArray(rawData?.[sheetKey]?.content)
        ? rawData[sheetKey].content
        : [];
    if (!Array.isArray(content[0])) return [];
    return content.slice(1).map(row => Array.isArray(row) ? [...row] : []);
}

function normalizePromptPart(value) {
    if (
        value === null
        || value === undefined
        || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    ) {
        return '';
    }
    return normalizeText(value);
}

function findCharacter(rawData, resolvedMappings, requestedName, source = 'explicit') {
    const requestedKey = normalizeName(requestedName);
    for (const mapping of resolvedMappings) {
        if (
            mapping.status === 'missing_sheet'
            || mapping.status === 'missing_header_row'
            || mapping.status === 'missing_name_column'
            || mapping.nameColumn?.status !== 'available'
        ) {
            continue;
        }
        const rows = getTableRows(rawData, mapping.sheetKey);
        const rowIndex = rows.findIndex(
            row => normalizeName(row[mapping.nameColumn.columnIndex]) === requestedKey,
        );
        if (rowIndex < 0) continue;

        const seenPromptColumnIndexes = new Set();
        const promptParts = mapping.promptColumns
            .filter((column) => {
                if (
                    column.status !== 'available'
                    || seenPromptColumnIndexes.has(column.columnIndex)
                ) {
                    return false;
                }
                seenPromptColumnIndexes.add(column.columnIndex);
                return true;
            })
            .sort((left, right) => left.columnIndex - right.columnIndex)
            .map(column => normalizePromptPart(rows[rowIndex][column.columnIndex]))
            .filter(Boolean);
        return {
            name: requestedName,
            source,
            matched: true,
            mappingId: mapping.mappingId,
            sheetKey: mapping.sheetKey,
            rowIndex,
            promptParts,
        };
    }

    return {
        name: requestedName,
        source,
        matched: false,
        mappingId: '',
        sheetKey: '',
        rowIndex: -1,
        promptParts: [],
    };
}

function collectKnownNames(rawData, resolvedMappings) {
    const knownNames = [];
    const seen = new Set();
    resolvedMappings.forEach((mapping) => {
        if (
            mapping.status === 'missing_sheet'
            || mapping.status === 'missing_header_row'
            || mapping.status === 'missing_name_column'
            || mapping.nameColumn?.status !== 'available'
        ) {
            return;
        }
        getTableRows(rawData, mapping.sheetKey).forEach((row) => {
            const name = normalizeText(row[mapping.nameColumn.columnIndex]);
            const key = normalizeName(name);
            if (!key || seen.has(key)) return;
            seen.add(key);
            knownNames.push({ name, key });
        });
    });
    return knownNames;
}

function scanDescriptionNames(description, knownNames, excludedKeys) {
    const normalizedDescription = normalizeName(description);
    if (!normalizedDescription) return [];
    const matches = [];

    knownNames.forEach(({ name, key }) => {
        let fromIndex = 0;
        while (fromIndex <= normalizedDescription.length - key.length) {
            const index = normalizedDescription.indexOf(key, fromIndex);
            if (index < 0) break;
            matches.push({
                name,
                key,
                index,
                end: index + key.length,
            });
            fromIndex = index + Math.max(1, key.length);
        }
    });

    matches.sort((left, right) => {
        if (left.index !== right.index) return left.index - right.index;
        return right.key.length - left.key.length;
    });

    const selected = [];
    const selectedKeys = new Set(excludedKeys);
    const selectedSpans = [];
    matches.forEach((match) => {
        const overlaps = selectedSpans.some(
            span => match.index < span.end && match.end > span.index,
        );
        if (overlaps) return;
        selectedSpans.push({ index: match.index, end: match.end });
        if (selectedKeys.has(match.key)) return;
        selected.push(match.name);
        selectedKeys.add(match.key);
    });
    return selected;
}

export function composeCharacterImagePrompt({
    rawData,
    mappings,
    explicitNames,
    description,
    scanDescription = true,
} = {}) {
    const safeRawData = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData
        : {};
    const model = buildCharacterMappingModel(safeRawData, mappings);
    const explicitCharacters = splitExplicitNames(explicitNames)
        .map(name => findCharacter(safeRawData, model.resolvedMappings, name));
    const explicitKeys = new Set(explicitCharacters.map(character => normalizeName(character.name)));
    const scannedNames = scanDescription
        ? scanDescriptionNames(
            description,
            collectKnownNames(safeRawData, model.resolvedMappings),
            explicitKeys,
        )
        : [];
    const characters = [
        ...explicitCharacters,
        ...scannedNames.map(
            name => findCharacter(safeRawData, model.resolvedMappings, name, 'description'),
        ),
    ];
    const promptParts = characters.flatMap(character => [character.name, ...character.promptParts]);
    const safeDescription = normalizeText(description);
    if (safeDescription) promptParts.push(safeDescription);

    return {
        prompt: promptParts.join('，'),
        characters,
        unmatchedNames: characters
            .filter(character => !character.matched)
            .map(character => character.name),
        mappingDiagnostics: model.resolvedMappings
            .filter(mapping => mapping.status !== 'available')
            .map(mapping => ({
                mappingId: mapping.mappingId,
                sheetKey: mapping.sheetKey,
                status: mapping.status,
                missingFields: mapping.missingFields.map(field => ({ ...field })),
            })),
    };
}
