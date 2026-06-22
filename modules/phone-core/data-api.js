export {
    getTableData,
    getTableDataAsync,
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
    triggerManualUpdate,
    openVisualizerWithStatus,
    openDatabaseUiWithStatus,
    openDatabaseSettingsWithStatus,
} from './data-api/panel-actions.js';

export {
    getDbConfigApiAvailability,
    readDbUpdateConfigViaApi,
    writeDbUpdateConfigViaApi,
    readManualTableSelectionViaApi,
    writeManualTableSelectionViaApi,
    clearManualTableSelectionViaApi,
} from './data-api/config-repository.js';

export {
    getApiPresets,
    getTableApiPreset,
    setTableApiPreset,
    getPlotApiPreset,
    setPlotApiPreset,
    loadApiPreset,
} from './data-api/preset-repository.js';

export {
    exportDatabaseSnapshotViaApi,
    importTemplateFromDataViaApi,
    refreshDatabaseProjectionViaApi,
} from './data-api/import-export-repository.js';

export { debugCheckAPI } from './data-api/debug-tools.js';
