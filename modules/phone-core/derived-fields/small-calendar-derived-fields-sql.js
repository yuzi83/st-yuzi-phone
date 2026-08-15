export const SMALL_CALENDAR_DERIVED_FIELDS_TABLE = 'small_calendar_days';
export const SMALL_CALENDAR_DERIVED_FIELDS_TABLES = Object.freeze([
    'xiaorilibiao',
    SMALL_CALENDAR_DERIVED_FIELDS_TABLE,
]);

export const SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS = Object.freeze([
    'row_id',
    'date_text',
    'weekday_text',
    'month_days',
]);

const SMALL_CALENDAR_DERIVED_FIELDS_TABLE_NAMES = new Set(SMALL_CALENDAR_DERIVED_FIELDS_TABLES);

export function normalizeSmallCalendarDerivedFieldsTable(tableName = SMALL_CALENDAR_DERIVED_FIELDS_TABLE) {
    const normalizedTableName = String(tableName ?? '').trim();
    if (SMALL_CALENDAR_DERIVED_FIELDS_TABLE_NAMES.has(normalizedTableName)) return normalizedTableName;
    throw new TypeError(`Unsupported small calendar derived fields table: ${normalizedTableName || '(empty)'}`);
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

export function buildSmallCalendarDerivedFieldsSignatureSql(tableName = SMALL_CALENDAR_DERIVED_FIELDS_TABLE) {
    const calendarTableName = normalizeSmallCalendarDerivedFieldsTable(tableName);
    return `WITH
calendar_inputs AS (
    SELECT
        row_id,
        COALESCE(TRIM(date_text), '') AS date_text,
        COALESCE(TRIM(weekday_text), '') AS weekday_text,
        COALESCE(CAST(month_days AS TEXT), '') AS month_days,
        CASE WHEN ${VALID_DATE_CONDITION} THEN 1 ELSE 0 END AS is_valid_date
    FROM ${calendarTableName}
),
computed_calendar_fields AS (
    SELECT
        row_id,
        ${WEEKDAY_CASE_SQL} AS new_weekday_text,
        ${MONTH_DAYS_SQL} AS new_month_days
    FROM ${calendarTableName}
    WHERE ${VALID_DATE_CONDITION}
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
),
pending_updates AS (
    SELECT calendar_inputs.row_id
    FROM calendar_inputs
    INNER JOIN computed_calendar_fields
        ON computed_calendar_fields.row_id = calendar_inputs.row_id
    WHERE COALESCE(calendar_inputs.weekday_text, '') <> COALESCE(computed_calendar_fields.new_weekday_text, '')
        OR COALESCE(calendar_inputs.month_days, '') <> COALESCE(CAST(computed_calendar_fields.new_month_days AS TEXT), '')
)
SELECT
    COALESCE((SELECT group_concat(source_part, char(30)) FROM ordered_sources), '') AS source_signature,
    COALESCE((SELECT group_concat(signature_part, char(30)) FROM ordered_inputs), '') AS input_signature,
    COALESCE((SELECT COUNT(*) FROM invalid_inputs), 0) AS invalid_count,
    COALESCE((SELECT group_concat(CAST(row_id AS TEXT), ',') FROM invalid_inputs), '') AS invalid_row_ids,
    COALESCE((SELECT COUNT(*) FROM pending_updates), 0) AS pending_update_count`;
}

export function buildSmallCalendarDerivedFieldsUpdateSql(tableName = SMALL_CALENDAR_DERIVED_FIELDS_TABLE) {
    const calendarTableName = normalizeSmallCalendarDerivedFieldsTable(tableName);
    return `WITH
computed_calendar_fields AS (
    SELECT
        row_id AS target_row_id,
        ${WEEKDAY_CASE_SQL} AS new_weekday_text,
        ${MONTH_DAYS_SQL} AS new_month_days
    FROM ${calendarTableName}
    WHERE ${VALID_DATE_CONDITION}
)
UPDATE ${calendarTableName}
SET
    weekday_text = computed_calendar_fields.new_weekday_text,
    month_days = computed_calendar_fields.new_month_days
FROM computed_calendar_fields
WHERE row_id = computed_calendar_fields.target_row_id
AND (COALESCE(weekday_text, '') <> COALESCE(computed_calendar_fields.new_weekday_text, '')
    OR COALESCE(CAST(month_days AS TEXT), '') <> COALESCE(CAST(computed_calendar_fields.new_month_days AS TEXT), ''))`;
}
