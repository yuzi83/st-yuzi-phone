export const CHRONICLE_TODAY_RELATION_ANCHOR_TABLES = Object.freeze([
    'global_state',
    'current_status',
]);
export const CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS = Object.freeze(['row_id', 'cur_time']);

const CHRONICLE_TODAY_RELATION_ANCHOR_TABLE_NAMES = new Set(CHRONICLE_TODAY_RELATION_ANCHOR_TABLES);

function formatSqlStringLiteral(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function formatChronicleTodayRelationAnchorCandidateValuesSql() {
    return CHRONICLE_TODAY_RELATION_ANCHOR_TABLES
        .map((tableName, index) => `(${formatSqlStringLiteral(tableName)}, ${index})`)
        .join(', ');
}

function buildRequiredColumnChecksSql() {
    return CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS
        .map((columnName) => (
            `AND EXISTS (SELECT 1 FROM pragma_table_info(candidate_anchor_tables.name) WHERE name = ${formatSqlStringLiteral(columnName)})`
        ))
        .join('\n    ');
}

export function buildChronicleTodayRelationAnchorTableSql() {
    return `WITH
candidate_anchor_tables(name, priority) AS (
    VALUES ${formatChronicleTodayRelationAnchorCandidateValuesSql()}
),
available_anchor_tables AS (
    SELECT candidate_anchor_tables.name, candidate_anchor_tables.priority
    FROM candidate_anchor_tables
    WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = candidate_anchor_tables.name)
    ${buildRequiredColumnChecksSql()}
)
SELECT name AS anchor_table
FROM available_anchor_tables
ORDER BY priority
LIMIT 1`;
}

const CHINESE_SMALL_INTEGER_LABELS = [
    '零', '一', '二', '三', '四', '五', '六', '七', '八', '九',
    '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九',
    '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九',
    '三十', '三十一', '三十二', '三十三', '三十四', '三十五', '三十六', '三十七', '三十八', '三十九',
    '四十', '四十一', '四十二', '四十三', '四十四', '四十五', '四十六', '四十七', '四十八', '四十九',
    '五十', '五十一', '五十二', '五十三', '五十四', '五十五', '五十六', '五十七', '五十八', '五十九',
    '六十', '六十一', '六十二', '六十三', '六十四', '六十五', '六十六', '六十七', '六十八', '六十九',
    '七十', '七十一', '七十二', '七十三', '七十四', '七十五', '七十六', '七十七', '七十八', '七十九',
    '八十', '八十一', '八十二', '八十三', '八十四', '八十五', '八十六', '八十七', '八十八', '八十九',
    '九十', '九十一', '九十二', '九十三', '九十四', '九十五', '九十六', '九十七', '九十八', '九十九',
];

function toChineseSmallInteger(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) return String(value);
    return CHINESE_SMALL_INTEGER_LABELS[number] || String(number);
}

export function normalizeChronicleTodayRelationAnchorTable(anchorTable = 'global_state') {
    const tableName = String(anchorTable ?? '').trim();
    if (CHRONICLE_TODAY_RELATION_ANCHOR_TABLE_NAMES.has(tableName)) return tableName;
    throw new TypeError(`Unsupported chronicle today_relation anchor table: ${tableName || '(empty)'}`);
}

function formatWholeUnitCount(count, unit) {
    if (unit === '个月') {
        if (count === 1) return '一个月';
        if (count === 2) return '两个月';
        return `${toChineseSmallInteger(count)}个月`;
    }
    if (unit === '年') {
        return `${count === 2 ? '两' : toChineseSmallInteger(count)}年`;
    }
    return `${toChineseSmallInteger(count)}${unit}`;
}

function formatHalfStep(count, unit, direction) {
    if (count === 0) return `半${unit}${direction}`;
    if (unit === '个月') {
        if (count === 1) return `一个半月${direction}`;
        if (count === 2) return `两个半月${direction}`;
        return `${toChineseSmallInteger(count)}个半月${direction}`;
    }
    return `${formatWholeUnitCount(count, unit)}半${direction}`;
}

function normalizeHalfUnitCount(totalDays, halfUnitDays) {
    const halfSteps = totalDays / halfUnitDays;
    const wholeUnits = Math.floor(halfSteps / 2);
    const hasHalf = halfSteps % 2 === 1;
    return { wholeUnits, hasHalf };
}

export function formatRelativeDayNumberForContract(absDays, direction) {
    if (absDays === 1) return direction === '前' ? '昨天' : '明天';
    if (absDays === 2) return direction === '前' ? '前天' : '后天';
    if (absDays >= 3 && absDays <= 6) return `${absDays}天${direction}`;
    if (absDays === 7) return `一周${direction}`;
    if (absDays >= 8 && absDays <= 14) return `${absDays}天${direction}`;
    if (absDays === 15) return `半个月${direction}`;
    if (absDays >= 16 && absDays <= 20) return `${absDays}天${direction}`;
    if (absDays === 21) return `三周${direction}`;
    if (absDays >= 22 && absDays <= 29) return `${absDays}天${direction}`;
    if (absDays >= 30 && absDays <= 179) {
        const bucketStart = Math.floor((absDays - 30) / 15) * 15 + 30;
        const { wholeUnits, hasHalf } = normalizeHalfUnitCount(bucketStart, 15);
        return hasHalf ? formatHalfStep(wholeUnits, '个月', direction) : `${formatWholeUnitCount(wholeUnits, '个月')}${direction}`;
    }
    if (absDays >= 180 && absDays <= 359) return `半年${direction}`;
    const bucketStart = Math.floor((absDays - 360) / 180) * 180 + 360;
    const { wholeUnits, hasHalf } = normalizeHalfUnitCount(bucketStart, 180);
    return hasHalf ? formatHalfStep(wholeUnits, '年', direction) : `${formatWholeUnitCount(wholeUnits, '年')}${direction}`;
}


function buildChineseSmallIntegerCaseSql(expression) {
    const clauses = CHINESE_SMALL_INTEGER_LABELS
        .map((label, index) => `WHEN ${index} THEN '${label}'`)
        .join(' ');
    return `(CASE ${expression} ${clauses} ELSE CAST(${expression} AS TEXT) END)`;
}

function buildWholeUnitCountSql(countExpression, unit) {
    const chinese = buildChineseSmallIntegerCaseSql(countExpression);
    if (unit === '个月') {
        return `(CASE WHEN ${countExpression} = 1 THEN '一个月' WHEN ${countExpression} = 2 THEN '两个月' ELSE ${chinese} || '个月' END)`;
    }
    if (unit === '年') {
        return `(CASE WHEN ${countExpression} = 2 THEN '两年' ELSE ${chinese} || '年' END)`;
    }
    return `(${chinese} || '${unit}')`;
}

function buildHalfStepSql(countExpression, unit) {
    if (unit === '个月') {
        const chinese = buildChineseSmallIntegerCaseSql(countExpression);
        return `(CASE WHEN ${countExpression} = 0 THEN '半个月' WHEN ${countExpression} = 1 THEN '一个半月' WHEN ${countExpression} = 2 THEN '两个半月' ELSE ${chinese} || '个半月' END)`;
    }
    return `(${buildWholeUnitCountSql(countExpression, unit)} || '半')`;
}

function buildRelativeRelationCaseSql(diffExpression = 'diff_days') {
    const abs = `ABS(${diffExpression})`;
    const direction = `(CASE WHEN ${diffExpression} > 0 THEN '前' ELSE '后' END)`;
    const monthBucket = `(CAST((((${abs} - 30) / 15) * 15 + 30) AS INTEGER))`;
    const monthWhole = `(CAST((${monthBucket} / 30) AS INTEGER))`;
    const monthHasHalf = `(CAST(((${monthBucket} / 15) % 2) AS INTEGER))`;
    const yearBucket = `(CAST((((${abs} - 360) / 180) * 180 + 360) AS INTEGER))`;
    const yearWhole = `(CAST((${yearBucket} / 360) AS INTEGER))`;
    const yearHasHalf = `(CAST(((${yearBucket} / 180) % 2) AS INTEGER))`;

    return `CASE
        WHEN ${diffExpression} = 0 THEN '今天'
        WHEN ${abs} = 1 THEN CASE WHEN ${diffExpression} > 0 THEN '昨天' ELSE '明天' END
        WHEN ${abs} = 2 THEN CASE WHEN ${diffExpression} > 0 THEN '前天' ELSE '后天' END
        WHEN ${abs} BETWEEN 3 AND 6 THEN CAST(${abs} AS TEXT) || '天' || ${direction}
        WHEN ${abs} = 7 THEN '一周' || ${direction}
        WHEN ${abs} BETWEEN 8 AND 14 THEN CAST(${abs} AS TEXT) || '天' || ${direction}
        WHEN ${abs} = 15 THEN '半个月' || ${direction}
        WHEN ${abs} BETWEEN 16 AND 20 THEN CAST(${abs} AS TEXT) || '天' || ${direction}
        WHEN ${abs} = 21 THEN '三周' || ${direction}
        WHEN ${abs} BETWEEN 22 AND 29 THEN CAST(${abs} AS TEXT) || '天' || ${direction}
        WHEN ${abs} BETWEEN 30 AND 179 THEN (CASE WHEN ${monthHasHalf} = 1 THEN ${buildHalfStepSql(monthWhole, '个月')} ELSE ${buildWholeUnitCountSql(monthWhole, '个月')} END) || ${direction}
        WHEN ${abs} BETWEEN 180 AND 359 THEN '半年' || ${direction}
        ELSE (CASE WHEN ${yearHasHalf} = 1 THEN ${buildHalfStepSql(yearWhole, '年')} ELSE ${buildWholeUnitCountSql(yearWhole, '年')} END) || ${direction}
    END`;
}

// Chronicle table contract requires time_span to be "YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM".
// The SQL path intentionally supports that strict ISO-leading format only: end date wins,
// and SQLite date(...) returning NULL falls back to the left segment. Broader legacy
// date-relation.js parsing (Chinese numerals / abstract dates) is outside this SQL batch
// derivation boundary; non-ISO rows are treated as invalid inputs, skipped, and reported
// by buildChronicleInvalidTimeSpanDebugSql().
const TARGET_DATE_EXPRESSION = `COALESCE(
    CASE
        WHEN INSTR(time_span, '~') > 0 THEN date(SUBSTR(TRIM(SUBSTR(time_span, INSTR(time_span, '~') + 1)), 1, 10))
        ELSE NULL
    END,
    date(SUBSTR(TRIM(time_span), 1, 10))
)`;

export function buildChronicleTodayRelationSignatureSql(anchorTable = 'global_state') {
    const anchorTableName = normalizeChronicleTodayRelationAnchorTable(anchorTable);
    return `WITH
current_anchor AS (
    SELECT TRIM(cur_time) AS cur_time, date(SUBSTR(TRIM(cur_time), 1, 10)) AS today_date
    FROM ${anchorTableName}
    ORDER BY row_id
    LIMIT 1
),
chronicle_inputs AS (
    SELECT row_id, COALESCE(TRIM(time_span), '') AS time_span, ${TARGET_DATE_EXPRESSION} AS target_date
    FROM chronicle
),
ordered_inputs AS (
    SELECT CAST(row_id AS TEXT) || char(31) || time_span AS signature_part
    FROM chronicle_inputs
    ORDER BY row_id
),
invalid_inputs AS (
    SELECT row_id
    FROM chronicle_inputs
    WHERE time_span <> '' AND target_date IS NULL
    ORDER BY row_id
)
SELECT
    COALESCE((SELECT cur_time FROM current_anchor), '') || char(29) || COALESCE((SELECT group_concat(signature_part, char(30)) FROM ordered_inputs), '') AS input_signature,
    COALESCE((SELECT COUNT(*) FROM invalid_inputs), 0) AS invalid_count,
    COALESCE((SELECT group_concat(CAST(row_id AS TEXT), ',') FROM invalid_inputs), '') AS invalid_row_ids`;
}

export function buildChronicleTodayRelationUpdateSql(anchorTable = 'global_state') {
    const anchorTableName = normalizeChronicleTodayRelationAnchorTable(anchorTable);
    return `WITH
current_anchor AS (
    SELECT date(SUBSTR(TRIM(cur_time), 1, 10)) AS today_date
    FROM ${anchorTableName}
    ORDER BY row_id
    LIMIT 1
),
parsed_chronicle AS (
    SELECT
        row_id,
        today_relation,
        ${TARGET_DATE_EXPRESSION} AS target_date,
        (SELECT today_date FROM current_anchor) AS today_date
    FROM chronicle
),
computed_relation AS (
    SELECT
        row_id,
        ${buildRelativeRelationCaseSql('CAST(julianday(today_date) - julianday(target_date) AS INTEGER)')} AS new_relation
    FROM parsed_chronicle
    WHERE today_date IS NOT NULL AND target_date IS NOT NULL
)
UPDATE chronicle
SET today_relation = (
    SELECT new_relation
    FROM computed_relation
    WHERE computed_relation.row_id = chronicle.row_id
)
WHERE row_id IN (
    SELECT row_id
    FROM computed_relation
    WHERE new_relation IS NOT NULL
)
AND COALESCE(today_relation, '') <> COALESCE((
    SELECT new_relation
    FROM computed_relation
    WHERE computed_relation.row_id = chronicle.row_id
), '')`;
}

export function buildChronicleInvalidTimeSpanDebugSql() {
    return `WITH
chronicle_inputs AS (
    SELECT row_id, COALESCE(TRIM(time_span), '') AS time_span, ${TARGET_DATE_EXPRESSION} AS target_date
    FROM chronicle
)
SELECT row_id, time_span
FROM chronicle_inputs
WHERE time_span <> '' AND target_date IS NULL
ORDER BY row_id`;
}
