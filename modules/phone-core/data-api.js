export {
    getTableData,
    getTableDataAsync,
    getTableAvailabilityViaApi,
    processTableData,
    getSheetKeys,
    updateTableCell,
    updateTableRow,
    insertTableRow,
    insertTableRowsBatch,
    deleteTableRowViaApi,
    deleteTableRowsBatch,
} from './data-api/table-repository.js';

export {
    querySqlViaApi,
    queryTableRowsViaApi,
    executeSqlMutationViaApi,
} from './data-api/sql-repository.js';

export {
    getTableLockState,
    remapTableLockStateAfterRowDelete,
    remapTableLockStateAfterRowsDelete,
    setTableCellLock,
    setTableRowLock,
    isTableRowLocked,
    isTableCellLocked,
    toggleTableRowLock,
    toggleTableCellLock,
    toggleTableColLock,
} from './data-api/lock-repository.js';

export {
    openVisualizerWithStatus,
    openDatabaseUiWithStatus,
    openDatabaseSettingsWithStatus,
} from './data-api/panel-actions.js';

export {
    exportDatabaseSnapshotViaApi,
    importTemplateFromDataViaApi,
    refreshDatabaseProjectionViaApi,
} from './data-api/import-export-repository.js';

export { debugCheckAPI } from './data-api/debug-tools.js';
