export {
    getTableData,
    getTableDataAsync,
    saveTableData,
    processTableData,
    getSheetKeys,
    updateTableCell,
    updateTableRow,
    insertTableRow,
    deleteTableRowViaApi,
} from './data-api/table-repository.js';

export {
    getTableLockState,
    remapTableLockStateAfterRowDelete,
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

export { debugCheckAPI } from './data-api/debug-tools.js';
