const STRUCTURAL_QUERY_FAILURE_CODES = new Set([
    'alias_conflict',
    'column_not_resolved',
]);

function normalizeColumnAlias(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
}

function getSnapshotMissingColumns(availability, columns, columnAliases = {}) {
    if (!Array.isArray(availability?.columns) || !Array.isArray(columns)) return null;

    const availableColumns = new Set(availability.columns.map(normalizeColumnAlias).filter(Boolean));
    return columns.filter((column) => {
        const queryColumn = String(column ?? '').trim();
        if (!queryColumn) return false;
        const aliases = Array.isArray(columnAliases?.[queryColumn])
            ? [queryColumn, ...columnAliases[queryColumn]]
            : [queryColumn];
        return !aliases.some((alias) => availableColumns.has(normalizeColumnAlias(alias)));
    });
}

function buildSnapshotColumnFailure(tableName, missingColumns) {
    return {
        ok: false,
        code: 'column_not_resolved',
        message: tableName + ': 表格快照缺少必要字段 ' + missingColumns.join(', '),
        source: 'table_snapshot',
        missingColumns,
    };
}

export async function resolveFirstAvailableTableCandidate({
    deps,
    tableNames,
    columns,
    columnAliases = {},
    runtime = {},
}) {
    const failures = [];

    for (const tableName of tableNames) {
        const availability = await deps.getTableAvailability?.(tableName);
        if (runtime.shouldPause?.()) return { status: 'fill-active' };
        if (availability?.status === 'absent') continue;
        if (availability?.status === 'unavailable') return { status: 'runtime-not-ready' };

        const missingSnapshotColumns = getSnapshotMissingColumns(availability, columns, columnAliases);
        if (missingSnapshotColumns?.length > 0) {
            failures.push({
                tableName,
                result: buildSnapshotColumnFailure(tableName, missingSnapshotColumns),
            });
            continue;
        }

        const result = await deps.queryTableRows({
            tableName,
            columns,
            limit: 1,
        });
        if (runtime.shouldPause?.()) return { status: 'fill-active' };
        if (result?.ok) return { status: 'ready', tableName };
        if (result?.code === 'runtime_not_ready') return { status: 'runtime-not-ready' };
        if (result?.code === 'table_not_found') continue;
        if (STRUCTURAL_QUERY_FAILURE_CODES.has(result?.code)) {
            failures.push({ tableName, result });
            continue;
        }
        return { status: 'query-failed', result };
    }

    return failures.length ? { status: 'schema-blocked', failures } : { status: 'absent' };
}
