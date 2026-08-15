const STRUCTURAL_QUERY_FAILURE_CODES = new Set([
    'alias_conflict',
    'column_not_resolved',
]);

export async function resolveFirstAvailableTableCandidate({ deps, tableNames, columns, runtime = {} }) {
    const failures = [];

    for (const tableName of tableNames) {
        const availability = await deps.getTableAvailability?.(tableName);
        if (runtime.shouldPause?.()) return { status: 'fill-active' };
        if (availability?.status === 'absent') continue;
        if (availability?.status === 'unavailable') return { status: 'runtime-not-ready' };

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
