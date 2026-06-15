export const SMALL_CALENDAR_DERIVED_FIELDS_TABLE = 'small_calendar_days';

export const SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS = Object.freeze([
    'row_id',
    'date_text',
    'weekday_text',
    'month_days',
]);

function formatSqlStringLiteral(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function buildRequiredColumnChecksSql() {
    return SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS
        .map((columnName) => (
            `AND EXISTS (SELECT 1 FROM pragma_table_info(${formatSqlStringLiteral(SMALL_CALENDAR_DERIVED_FIELDS_TABLE)}) WHERE name = ${formatSqlStringLiteral(columnName)})`
        ))
        .join('\n    ');
}

const VALID_DATE_CONDITION = `date_text IS NOT NULL
    AND TRIM(date_text) <> ''
    AND TRIM(date_text) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(TRIM(date_text)) IS NOT NULL
    AND date(TRIM(date_text)) = TRIM(date_text)`;

const WEEKDAY_CASE_SQL = `CASE strftime('%w', date(TRIM(date_text)))
        WHEN '0' THEN '星期日'
        WHEN '1' THEN '星期一'
        WHEN '2' THEN '星期二'
        WHEN '3' THEN '星期三'
        WHEN '4' THEN '星期四'
        WHEN '5' THEN '星期五'
        WHEN '6' THEN '星期六'
    END`;

const MONTH_DAYS_SQL = `CAST(strftime('%d', date(TRIM(date_text), 'start of month', '+1 month', '-1 day')) AS INTEGER)`;

export function buildSmallCalendarDerivedFieldsAvailabilitySql() {
    return `SELECT CASE
    WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${formatSqlStringLiteral(SMALL_CALENDAR_DERIVED_FIELDS_TABLE)})
    ${buildRequiredColumnChecksSql()}
    THEN 1
    ELSE 0
END AS is_available`;
}

export function buildSmallCalendarDerivedFieldsSignatureSql() {
    return `WITH
calendar_inputs AS (
    SELECT
        row_id,
        COALESCE(TRIM(date_text), '') AS date_text,
        COALESCE(TRIM(weekday_text), '') AS weekday_text,
        COALESCE(CAST(month_days AS TEXT), '') AS month_days,
        CASE WHEN ${VALID_DATE_CONDITION} THEN 1 ELSE 0 END AS is_valid_date
    FROM ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}
),
ordered_sources AS (
    SELECT CAST(row_id AS TEXT) || char(31) || date_text AS source_part
    FROM calendar_inputs
    ORDER BY row_id
),
ordered_inputs AS (
    SELECT CAST(row_id AS TEXT) || char(31) || date_text || char(31) || weekday_text || char(31) || month_days AS signature_part
    FROM calendar_inputs
    ORDER BY row_id
),
invalid_inputs AS (
    SELECT row_id
    FROM calendar_inputs
    WHERE date_text <> '' AND is_valid_date = 0
    ORDER BY row_id
)
SELECT
    COALESCE((SELECT group_concat(source_part, char(30)) FROM ordered_sources), '') AS source_signature,
    COALESCE((SELECT group_concat(signature_part, char(30)) FROM ordered_inputs), '') AS input_signature,
    COALESCE((SELECT COUNT(*) FROM invalid_inputs), 0) AS invalid_count,
    COALESCE((SELECT group_concat(CAST(row_id AS TEXT), ',') FROM invalid_inputs), '') AS invalid_row_ids`;
}

export function buildSmallCalendarDerivedFieldsUpdateSql() {
    return `WITH
computed_calendar_fields AS (
    SELECT
        row_id,
        ${WEEKDAY_CASE_SQL} AS new_weekday_text,
        ${MONTH_DAYS_SQL} AS new_month_days
    FROM ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}
    WHERE ${VALID_DATE_CONDITION}
)
UPDATE ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}
SET
    weekday_text = (
        SELECT new_weekday_text
        FROM computed_calendar_fields
        WHERE computed_calendar_fields.row_id = ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}.row_id
    ),
    month_days = (
        SELECT new_month_days
        FROM computed_calendar_fields
        WHERE computed_calendar_fields.row_id = ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}.row_id
    )
WHERE row_id IN (SELECT row_id FROM computed_calendar_fields)
AND (COALESCE(weekday_text, '') <> COALESCE((SELECT new_weekday_text FROM computed_calendar_fields WHERE computed_calendar_fields.row_id = ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}.row_id), '')
    OR COALESCE(CAST(month_days AS TEXT), '') <> COALESCE(CAST((SELECT new_month_days FROM computed_calendar_fields WHERE computed_calendar_fields.row_id = ${SMALL_CALENDAR_DERIVED_FIELDS_TABLE}.row_id) AS TEXT), ''))`;
}
