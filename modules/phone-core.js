// modules/phone/phone-core.js
/**
 * 玉子的手机 - 核心框架 facade
 * 将数据库桥接、路由、滚动守卫、通知、生命周期与手机聊天能力拆分到 [`modules/phone-core/`](./phone-core/) 目录，
 * 保留原有导出面与调用路径兼容。
 */

export { getPhoneSettings, savePhoneSetting, savePhoneSettingsPatch } from './settings.js';

export {
    getTableData,
    getTableDataAsync,
    saveTableData,
    getTableLockState,
    setTableCellLock,
    setTableRowLock,
    isTableRowLocked,
    isTableCellLocked,
    toggleTableRowLock,
    toggleTableCellLock,
    toggleTableColLock,
    processTableData,
    getSheetKeys,
    triggerManualUpdate,
    openVisualizerWithStatus,
    openDatabaseSettingsWithStatus,
    getDbConfigApiAvailability,
    readDbUpdateConfigViaApi,
    writeDbUpdateConfigViaApi,
    readManualTableSelectionViaApi,
    writeManualTableSelectionViaApi,
    clearManualTableSelectionViaApi,
    debugCheckAPI,
    updateTableCell,
    updateTableRow,
    insertTableRow,
    deleteTableRowViaApi,
    getApiPresets,
    getTableApiPreset,
    setTableApiPreset,
    getPlotApiPreset,
    setPlotApiPreset,
    loadApiPreset,
} from './phone-core/data-api.js';

export {
    clearRouteHistory,
    getRouteHistory,
    getCurrentRoute,
    navigateTo,
    navigateBack,
    onRouteChange,
} from './phone-core/routing.js';

export {
    bindPhoneScrollGuards,
    hardenPhoneInteractionDefaults,
} from './phone-core/scroll-guards.js';

export {
    initPhoneUI,
    getPhoneContainer,
    onPhoneActivated,
    onPhoneDeactivated,
    destroyPhoneRuntime,
} from './phone-core/lifecycle.js';

export {
    getUnreadCount,
    clearUnreadBadge,
} from './phone-core/notifications.js';

export {
    registerTableUpdateListener,
    unregisterTableUpdateListener,
    registerTableFillStartListener,
    unregisterTableFillStartListener,
    setCurrentViewingSheet,
    getCurrentViewingSheet,
    initSmartRefreshListener,
    resetDataVersion,
} from './phone-core/callbacks.js';

export {
    getPromptTemplates,
    savePromptTemplate,
    deletePromptTemplate,
    getPromptTemplate,
    getPhoneChatSettings,
    getPhoneChatLastSelectedTarget,
    setPhoneChatLastSelectedTarget,
    getPhoneChatLastSelectedPromptTemplateName,
    setPhoneChatLastSelectedPromptTemplateName,
    getPhoneWorldbookSelectionSettings,
    getPhoneChatPromptTemplateContent,
    getCurrentCharacterDisplayName,
    getSheetDataByKey,
    buildPhoneMessagePayload,
    insertPhoneMessageRecord,
    updatePhoneMessageRecord,
    refreshPhoneTableProjection,
    refreshPhoneMessageProjection,
    dispatchPhoneTableUpdated,
    deletePhoneSheetRows,
    getPhoneStoryContext,
    getPhoneChatWorldbookContext,
    callPhoneChatAI,
} from './phone-core/chat-support.js';
