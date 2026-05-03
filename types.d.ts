/**
 * 玉子手机扩展 - TypeScript 类型定义
 * @version 2.0.0
 * @description 提供完整的类型定义，增强代码类型安全
 */

// ===== 事件类型定义 =====

/**
 * SillyTavern 事件类型
 */
export type SillyTavernEventType =
    | 'message_sent'
    | 'message_received'
    | 'user_message_rendered'
    | 'character_message_rendered'
    | 'message_updated'
    | 'message_deleted'
    | 'message_swiped'
    | 'generation_started'
    | 'generation_stopped'
    | 'generation_ended'
    | 'GENERATION_AFTER_COMMANDS'
    | 'chat_id_changed'
    | 'chat_created'
    | 'app_ready'
    | 'settings_loaded_after'
    | 'character_page_loaded';

/**
 * 事件监听器选项
 */
export interface EventListenerOptions {
    once?: boolean;
    priority?: 'first' | 'last' | 'normal';
}

/**
 * 事件源接口
 */
export interface EventSource {
    on(event: string, listener: Function): void;
    once(event: string, listener: Function): void;
    makeFirst(event: string, listener: Function): void;
    makeLast(event: string, listener: Function): void;
    removeListener(event: string, listener: Function): void;
    off?(event: string, listener: Function): void;
    emit(event: string, ...data: any[]): void | Promise<void>;
    emitAndWait?(event: string, ...data: any[]): void | Promise<void>;
}

// ===== TavernHelper API 类型定义 =====

/**
 * 聊天消息
 */
export interface ChatMessage {
    message_id: number;
    name: string;
    role: 'system' | 'assistant' | 'user';
    is_hidden: boolean;
    message: string;
    data: Record<string, any>;
    extra: Record<string, any>;
}

/**
 * 聊天消息（包含滑动选项）
 */
export interface ChatMessageSwiped extends ChatMessage {
    swipe_id: number;
    swipes: string[];
    swipes_data: Record<string, any>[];
    swipes_info: Record<string, any>[];
}

/**
 * 获取聊天消息选项
 */
export interface GetChatMessagesOption {
    role?: 'all' | 'system' | 'assistant' | 'user';
    hide_state?: 'all' | 'hidden' | 'unhidden';
    include_swipes?: boolean;
}

/**
 * 变量选项
 */
export interface VariableOption {
    type?: 'message' | 'chat' | 'character' | 'script' | 'global';
    message_id?: number | 'latest';
    script_id?: string;
}

/**
 * TavernHelper 返回的最小角色数据子集
 */
export interface TavernCharacterDataLike {
    name?: string;
    avatar?: string;
    data?: Record<string, any>;
    [key: string]: any;
}

/**
 * 当前项目真实依赖的 TavernHelper 最小子集接口
 */
export interface TavernHelper {
    // 聊天消息
    getChatMessages(range: string | number, options?: GetChatMessagesOption): ChatMessage[] | ChatMessageSwiped[];
    getLastMessageId(): number;

    // 变量操作
    getVariables(options?: VariableOption): Record<string, any>;
    insertOrAssignVariables(variables: Record<string, any>, options?: VariableOption): Promise<Record<string, any> | void>;

    // 宏替换
    substitudeMacros(text: string): string;

    // 角色操作
    getCharData(name: string, allowAvatar?: boolean): TavernCharacterDataLike | null;

    // 世界书能力：在当前项目中通过 helper / global 双路径探测，因此声明为可选
    getWorldbookNames?(): Promise<string[]> | string[];
    getWorldbook?(worldbookName: string): Promise<Record<string, any>[]> | Record<string, any>[];
}

export interface SlashCommandParserLike {
    commands?: Record<string, any>;
}

/**
 * 当前项目实际依赖到的 SillyTavern 上下文最小子集
 */
export interface SillyTavernContextLike {
    eventSource?: EventSource;
    eventTypes?: Record<string, string>;
    event_types?: Record<string, string>;
    extensionSettings?: Record<string, any>;
    saveSettingsDebounced?: (...args: any[]) => void;
    saveSettings?: (...args: any[]) => void | Promise<void>;
    registerSlashCommand?: HostSlashCommandRegistrar;
    SlashCommandParser?: SlashCommandParserLike;
    [key: string]: any;
}

// ===== 设置类型定义 =====

/**
 * 手机设置
 */
export type BeautifyTemplateType = 'special_app_template' | 'generic_table_template';
export type BeautifySourceMode = 'builtin' | 'user';
export type PhoneBeautifySpecialRendererKey = 'special_message';
export type PhoneBeautifyGenericRendererKey = 'generic_table';
export type PhoneBeautifyRendererKey = PhoneBeautifySpecialRendererKey | PhoneBeautifyGenericRendererKey;
export type PhoneBeautifySpecialType = 'message';
export type PhoneBeautifyTemplateSource = 'builtin' | 'user';
export type PhoneBeautifyTemplateBindings = Record<string, string>;
export type PhoneBeautifyTemplateExportMode = 'runtime' | 'annotated';

export interface PhoneBeautifyTemplateMeta {
    author: string;
    description: string;
    tags: string[];
    updatedAt: number;
}

export interface PhoneBeautifyTemplateMatcher {
    tableNameExact?: string[];
    tableNameIncludes?: string[];
    requiredHeaders?: string[];
    optionalHeaders?: string[];
    minScore?: number;
}

export interface PhoneBeautifyTemplateRenderConfig {
    rendererKey: PhoneBeautifyRendererKey;
    fieldBindings: Record<string, string[]>;
    styleTokens: Record<string, string>;
    styleOptions: Record<string, unknown>;
    layoutOptions: Record<string, unknown>;
    structureOptions: Record<string, unknown>;
    typographyOptions: Record<string, unknown>;
    motionOptions: Record<string, unknown>;
    stateOptions: Record<string, unknown>;
    fieldDecorators: Record<string, unknown>;
    customCss: string;
    advanced: {
        customCssEnabled?: boolean;
        customCss?: string;
        [key: string]: unknown;
    };
}

export interface PhoneBeautifyTemplate {
    id: string;
    name: string;
    templateType: BeautifyTemplateType;
    source: PhoneBeautifyTemplateSource;
    readOnly: boolean;
    exportable: boolean;
    enabled: boolean;
    matcher: PhoneBeautifyTemplateMatcher;
    render: PhoneBeautifyTemplateRenderConfig;
    meta: PhoneBeautifyTemplateMeta;
}

export interface PhoneBeautifyTemplateStore {
    schemaVersion: string;
    updatedAt: number;
    templates: PhoneBeautifyTemplate[];
    bindings: PhoneBeautifyTemplateBindings;
}

export interface PhoneBeautifyTemplateSourceModeRuntime {
    preferredMode: BeautifySourceMode;
    effectiveMode: BeautifySourceMode | 'active_template';
    fallbackApplied: boolean;
    hasUserTemplates: boolean;
    templates: PhoneBeautifyTemplate[];
}

export interface PhoneBeautifyTemplateValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    template: PhoneBeautifyTemplate | null;
}

export interface PhoneBeautifyTemplateQueryOptions {
    includeDisabled?: boolean;
    includeBuiltin?: boolean;
    includeUser?: boolean;
    enabledOnly?: boolean;
}

export interface PhoneBeautifyTemplateSourceModeRuntimeOptions {
    enabledOnly?: boolean;
}

export interface PhoneBeautifyTemplateExportOptions {
    templateType?: BeautifyTemplateType;
    builtinOnly?: boolean;
    userOnly?: boolean;
    templateIds?: string[];
    exportMode?: PhoneBeautifyTemplateExportMode;
    packName?: string;
}

export interface PhoneBeautifyTemplateImportOptions {
    overwrite?: boolean;
    templateTypeFilter?: BeautifyTemplateType;
}

export interface PhoneBeautifyTemplateSourceModeResult {
    success: boolean;
    mode?: BeautifySourceMode;
    message: string;
}

export interface PhoneBeautifyTemplateActivationResult {
    success: boolean;
    message: string;
    templateId?: string;
    rendererKey?: PhoneBeautifyRendererKey;
}

export interface PhoneBeautifyTemplatePackMeta {
    name?: string;
    exportedAt?: string;
    exporter?: string;
    exportMode?: PhoneBeautifyTemplateExportMode;
    schemaCompatMin?: string;
    schemaCompatMax?: string;
    [key: string]: unknown;
}

export interface PhoneBeautifyTemplateImportPack {
    format: string;
    schemaVersion: string;
    packMeta: PhoneBeautifyTemplatePackMeta;
    templates: PhoneBeautifyTemplate[];
}

export interface PhoneBeautifyTemplateExportResult {
    success: boolean;
    count: number;
    pack: PhoneBeautifyTemplateImportPack;
}

export interface PhoneBeautifyTemplateImportResult {
    success: boolean;
    imported: number;
    replaced: number;
    skipped: number;
    errors: string[];
    warnings: string[];
    message: string;
}

export interface PhoneBeautifyTemplateSaveResult {
    success: boolean;
    warnings: string[];
    errors: string[];
    replaced?: boolean;
    template: PhoneBeautifyTemplate | null;
    message: string;
}

export interface PhoneBeautifyTemplateBindingResult {
    success: boolean;
    message: string;
}

export interface PhoneBeautifyTemplateMatchResult {
    sheetKey: string;
    tableName: string;
    template: PhoneBeautifyTemplate;
    score: number;
    threshold?: number;
    reason: string;
    specialType?: PhoneBeautifySpecialType;
    sourceMode?: BeautifySourceMode | 'active_template';
    sourceModePreferred?: BeautifySourceMode;
    sourceModeFallbackApplied?: boolean;
}

export interface PhoneSettings {
    enabled: boolean;
    phoneToggleX: number | null;
    phoneToggleY: number | null;
    phoneContainerX: number | null;
    phoneContainerY: number | null;
    phoneContainerWidth: number;
    phoneContainerHeight: number;
    backgroundImage: string | null;
    appIcons: Record<string, string>;
    hideTableCountBadge: boolean;
    hiddenTableApps: Record<string, boolean>;
    beautifyTemplateSourceModeSpecial: BeautifySourceMode;
    beautifyTemplateSourceModeGeneric: BeautifySourceMode;
    beautifyActiveTemplateIdsSpecial: Partial<Record<PhoneBeautifySpecialRendererKey, string>>;
    beautifyActiveTemplateIdGeneric: string;
    dockIconSize: number;
    phoneToggleStyleSize: number;
    phoneToggleStyleShape: 'circle' | 'rounded';
    phoneToggleCoverImage: string | null;
    phoneChat: {
        useStoryContext: boolean;
        storyContextTurns: number;
        apiPresetName: string;
        maxHistoryMessages: number;
        maxReplyTokens: number;
        requestTimeoutMs: number;
        worldbookMaxEntries: number;
        worldbookMaxChars: number;
    };
    phoneAiInstruction: {
        currentPresetName: string;
        lastOpenedPresetName: string;
        migratedLegacyTemplates: boolean;
        presets: any[];
    };
    worldbookSelection: {
        sourceMode: 'off' | 'manual' | 'character_bound';
        selectedWorldbook: string;
        entries: Record<string, Record<string, boolean>>;
    };
}

/**
 * 设置验证规则
 */
export interface ValidationRule {
    type: 'number' | 'string' | 'boolean' | 'object';
    min?: number;
    max?: number;
    enum?: string[];
    nullable?: boolean;
}

// ===== 性能工具类型定义 =====

/**
 * 空闲回调deadline对象
 */
export interface IdleDeadline {
    didTimeout: boolean;
    timeRemaining: () => number;
}

/**
 * 空闲回调选项
 */
export interface IdleCallbackOptions {
    timeout?: number;
}

/**
 * IntersectionObserver 选项
 */
export interface VisibilityObserverOptions {
    root?: Element | null;
    rootMargin?: string;
    threshold?: number | number[];
}

/**
 * 性能计时器
 */
export interface PerformanceTimer {
    start(): void;
    end(): void;
    measure(): number;
}

/**
 * FPS 监控器
 */
export interface FPSMonitor {
    start(): void;
    stop(): void;
    getAverageFPS(): number;
}

/**
 * 内存使用信息
 */
export interface MemoryUsage {
    usedJSHeapSize: string;
    totalJSHeapSize: string;
    jsHeapSizeLimit: string;
}

// ===== 错误处理类型定义 =====

/**
 * 错误代码
 */
export type YuziPhoneErrorCode =
    | 'INIT_FAILED'
    | 'EVENT_SYSTEM_UNAVAILABLE'
    | 'TAVERN_HELPER_UNAVAILABLE'
    | 'SETTINGS_LOAD_FAILED'
    | 'SETTINGS_SAVE_FAILED'
    | 'DOM_NOT_FOUND'
    | 'INVALID_PARAMETER'
    | 'OPERATION_TIMEOUT'
    | 'RESOURCE_CLEANUP_FAILED';

/**
 * 错误信息
 */
export interface YuziPhoneErrorInfo {
    code: YuziPhoneErrorCode;
    message: string;
    timestamp: number;
    context?: Record<string, any>;
}

// ===== Slash 命令类型定义 =====

/**
 * Slash 命令处理器
 */
export type SlashCommandHandler = (args: string) => void | Promise<void>;

/**
 * 当前项目实际探测到的 Slash 注册函数签名
 */
export type HostSlashCommandRegistrar = (
    name: string,
    handler: SlashCommandHandler,
    aliases?: string[],
    helpText?: string,
    autoComplete?: boolean,
) => void;

/**
 * 当前项目实际探测到的 Slash 注销函数签名
 */
export type HostSlashCommandUnregistrar = (name: string) => void;

/**
 * Slash 命令定义
 */
export interface SlashCommandDefinition {
    name: string;
    handler: SlashCommandHandler;
    aliases?: string[];
    description?: string;
    helpText?: string;
}

// ===== 模块导出类型定义 =====

/**
 * 集成模块导出
 */
export interface IntegrationModule {
    // 事件系统
    EventTypes: Record<string, SillyTavernEventType>;
    onEvent(eventType: string, listener: Function, options?: EventListenerOptions): Promise<() => void>;
    onceEvent(eventType: string, listener: Function): Promise<() => void>;
    triggerEvent(eventType: string, data?: any): Promise<void>;
    waitForEvent(eventType: string, timeout?: number): Promise<any>;

    // 便捷事件监听器
    onChatChanged(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onCharacterLoaded(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onMessageSent(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onMessageReceived(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onAppReady(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onUserMessageRendered(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onCharacterMessageRendered(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onMessageUpdated(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onMessageDeleted(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onMessageSwiped(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onGenerationStarted(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onGenerationEnded(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onGenerationStopped(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onGenerationAfterCommands(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onChatCreated(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    onSettingsLoaded(callback: Function, options?: EventListenerOptions): Promise<() => void>;

    // TavernHelper API
    getTavernHelper(): TavernHelper | null;
    getSillyTavernContext(): SillyTavernContextLike | null;
    getChatMessages(range?: string | number, options?: GetChatMessagesOption): ChatMessage[] | ChatMessageSwiped[];
    getLastMessageId(): number;
    getVariables(options?: VariableOption): Record<string, any>;
    setVariables(variables: Record<string, any>, options?: VariableOption): Promise<void>;
    substituteMacros(text: string): string;
    getCharacterData(name?: string, allowAvatar?: boolean): TavernCharacterDataLike | null;
    getWorldbookNames(): Promise<string[]>;
    getWorldbook(worldbookName: string): Promise<any[]>;
    onWorldInfoUpdated(callback: Function, options?: EventListenerOptions): Promise<() => void>;
    showNotification(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void;

    // 清理
    cleanupIntegration(): void;
}

/**
 * 设置模块导出
 */
export interface SettingsModule {
    extensionName: string;
    defaultSettings: PhoneSettings;
    getPhoneSettings(): PhoneSettings;
    savePhoneSetting(key: string, value: any): boolean;
    savePhoneSettingsPatch(patch: Partial<PhoneSettings>): void;
    migrateLegacyPhoneSettings(): void;
    flushPhoneSettingsSave(): void;
    resetPhoneSettingsToDefault(): boolean;
    isMobileDevice(): boolean;
    getDefaultPhoneTogglePosition(): { x: number; y: number };
    constrainPosition(x: number, y: number, width: number, height: number): { x: number; y: number };
}

export type SettingsPageMode =
    | 'home'
    | 'appearance'
    | 'database'
    | 'beautify'
    | 'button_style'
    | 'ai_instruction_presets'
    | 'api_prompt_config'
    | 'prompt_editor';

export interface SettingsAppState {
    mode: SettingsPageMode;
    homeScrollTop?: number;
    databaseScrollTop: number;
    appearanceScrollTop: number;
    beautifyScrollTop: number;
    buttonStyleScrollTop: number;
    apiPromptConfigScrollTop: number;
    promptEditorName: string;
    promptEditorContent: string;
    promptEditorIsNew: boolean;
    promptEditorOriginalName: string;
    promptEditorMediaMarkers: {
        imagePrefix: string;
        videoPrefix: string;
    } | null;
    aiInstructionSelectedPresetName?: string;
    aiInstructionDraftName?: string;
    aiInstructionDraftOriginalName?: string;
    aiInstructionDraftImagePrefix?: string;
    aiInstructionDraftVideoPrefix?: string;
    aiInstructionDraftPromptGroup?: any[];
    worldbookLoading: boolean;
    worldbookError: string | null;
    worldbookList: string[];
    currentWorldbook: string;
    worldbookSourceMode: 'off' | 'manual' | 'character_bound';
    boundWorldbookNames: string[];
    worldbookEntries: any[];
    worldbookSearchQuery: string;
}

export interface SettingsRuntimeStatus {
    ok: boolean;
    message?: string;
    [key: string]: any;
}

export interface NamedSettingsEntry {
    name: string;
    [key: string]: any;
}

export type SettingsToastHandler = (host: unknown, message: string, isError?: boolean) => void;

export interface SettingsPageRuntime {
    setTimeout?: (callback: () => void, delay?: number) => number | null;
    clearTimeout?: (timeoutId: number | null) => void;
    setInterval?: (callback: () => void, delay?: number) => number | null;
    clearInterval?: (intervalId: number | null) => void;
    requestAnimationFrame?: (callback: FrameRequestCallback) => number | null;
    cancelAnimationFrame?: (frameId: number | null) => void;
    addEventListener?: (target: EventTarget | null | undefined, type: string, listener: EventListenerOrEventListenerObject | (() => void), options?: AddEventListenerOptions | boolean) => (() => void);
    observeMutation?: (target: Node | null | undefined, callback: MutationCallback, options?: MutationObserverInit) => { observer: MutationObserver | null; disconnect: () => void } | null;
    observeDisconnection?: (target: Node | null | undefined, callback: (target: Node) => void, options?: { observerRoot?: ParentNode | null; childList?: boolean; subtree?: boolean }) => { observer: MutationObserver | null; disconnect: () => void } | null;
    registerCleanup?: (cleanup: () => void) => (() => void);
    isDisposed?: () => boolean;
}

export interface SettingsPageRuntimeHandle extends SettingsPageRuntime {
    dispose?: () => void;
}

export interface SettingsPageRendererCommonDeps {
    container: HTMLElement;
    state: SettingsAppState;
    render: () => void;
    registerCleanup?: (cleanup: () => void) => void;
    bindPageEvent?: (target: EventTarget | null | undefined, type: string, listener: EventListenerOrEventListenerObject | (() => void), options?: AddEventListenerOptions | boolean) => (() => void);
    pageRuntime?: SettingsPageRuntime;
}

export interface SettingsPageRendererNavigationDeps {
    navigateBack: () => void;
}

export interface SettingsPageRendererScrollDeps {
    captureScroll: (key: string) => void;
    restoreScroll: (key: string) => void;
    rerenderHomeKeepScroll: () => void;
    rerenderDatabaseKeepScroll: () => void;
    rerenderBeautifyKeepScroll: () => void;
    rerenderApiPromptConfigKeepScroll: () => void;
}

export interface SettingsPageRendererFeedbackDeps {
    showToast: SettingsToastHandler;
}

export interface SettingsDatabasePresetService {
    getDbConfigApiAvailability: () => SettingsRuntimeStatus;
    getDbPresets: () => NamedSettingsEntry[];
    getActiveDbPresetName: () => string;
    switchPresetByName: (presetName: string, toastHost?: unknown) => boolean;
}

export interface SettingsManualUpdateService {
    setupManualUpdateBtn: (container: HTMLElement, btnSelector?: string, statusSelector?: string | null) => void;
}

export interface SettingsHomePageRendererDeps extends SettingsManualUpdateService {}

export interface SettingsAppearancePageService {
    getLayoutValue: (key: string, fallback: number) => string;
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    setupBgUpload: (container: HTMLElement) => void;
    setupIconLayoutSettings: (container: HTMLElement) => void;
    setupAppearanceToggles: (container: HTMLElement) => void;
    renderHiddenTableAppsList: (listEl: Element | null) => void;
    renderIconUploadList: (listEl: Element | null) => void;
}

export interface SettingsAppearancePageRendererDeps extends SettingsAppearancePageService {}

export interface SettingsDatabaseConfigService extends SettingsDatabasePresetService {
    getTableData: () => Record<string, any> | null;
    getSheetKeys: (rawData?: Record<string, any> | null) => string[];
    readDbSnapshot: () => { ready: boolean; snapshot: Record<string, any>; apiAvailability?: SettingsRuntimeStatus; [key: string]: any };
    clearActivePresetBindingIfNeeded: () => boolean;
    normalizeDbManualSelection: (raw: any) => { hasManualSelection: boolean; selectedTables: string[] };
    normalizeDbUpdateConfig: (raw: any) => Record<string, any>;
    createDbPreset: (name: string, snapshot: any) => NamedSettingsEntry;
    saveDbPresets: (presets: NamedSettingsEntry[]) => void;
    setActiveDbPresetName: (name: string) => void;
    writeDbUpdateConfigViaApi: (payload: Record<string, any>) => SettingsRuntimeStatus;
    writeManualTableSelectionViaApi: (sheetKeys: string[]) => SettingsRuntimeStatus;
    clearManualTableSelectionViaApi: () => SettingsRuntimeStatus;
}

export interface SettingsDataConfigPageRendererDeps extends SettingsDatabaseConfigService {}

export interface SettingsButtonStylePageService {
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    savePhoneSetting: SettingsModule['savePhoneSetting'];
    showToast: SettingsToastHandler;
}

export interface SettingsButtonStylePageRendererDeps {
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    savePhoneSetting: SettingsModule['savePhoneSetting'];
}

export interface SettingsApiPromptService {
    getDbConfigApiAvailability: () => SettingsRuntimeStatus;
    getApiPresets: () => NamedSettingsEntry[];
    getTableApiPreset: () => string;
    setTableApiPreset: (presetName: string) => boolean;
    getPlotApiPreset: () => string;
    setPlotApiPreset: (presetName: string) => boolean;
}

export interface SettingsAiInstructionPresetService {
    getPhoneAiInstructionPresets: () => NamedSettingsEntry[];
    getPhoneAiInstructionPreset: (name: string) => any;
    getCurrentPhoneAiInstructionPresetName: () => string;
    setCurrentPhoneAiInstructionPresetName: (name: string) => any;
    deletePhoneAiInstructionPreset: (name: string) => any;
    importPhoneAiInstructionPresetsFromData: (data: any, options?: Record<string, any>) => any;
    exportPhoneAiInstructionPresetPack: (name?: string) => any;
    exportAllPhoneAiInstructionPresetsPack: () => any;
}

export interface SettingsPromptEditorService {
    getPhoneAiInstructionPreset: (name: string) => any;
    savePhoneAiInstructionPreset: (...args: any[]) => any;
}

export interface SettingsApiPromptPageRendererDeps extends SettingsApiPromptService, SettingsAiInstructionPresetService {}

export interface SettingsPromptEditorPageRendererDeps extends SettingsPromptEditorService {}

export interface SettingsPageRendererGroupedDeps {
    common?: SettingsPageRendererCommonDeps;
    navigation?: SettingsPageRendererNavigationDeps;
    scroll?: SettingsPageRendererScrollDeps;
    feedback?: SettingsPageRendererFeedbackDeps;
    home?: SettingsHomePageRendererDeps;
    appearance?: SettingsAppearancePageRendererDeps;
    dataConfig?: SettingsDataConfigPageRendererDeps;
    buttonStyle?: SettingsButtonStylePageRendererDeps;
    apiPrompt?: SettingsApiPromptPageRendererDeps;
    promptEditor?: SettingsPromptEditorPageRendererDeps;
}

export interface SettingsPageInstance {
    mount(): void;
    update?(): void;
    dispose?(): void;
}

export interface SettingsPageDefinition {
    createPage: () => SettingsPageInstance;
}

export type SettingsPageRegistry = Record<SettingsPageMode, SettingsPageDefinition>;

export interface SettingsPageRenderers {
    pages: SettingsPageRegistry;
    renderHomePage(): void;
    renderAppearancePage(): void;
    renderDatabasePage(): void;
    renderButtonStylePage(): void;
    renderAiInstructionPresetsPage(): void;
    renderApiPromptConfigPage(): void;
    renderPromptEditorPage(): void;
    renderBeautifyTemplatePage(): void;
}

/**
 * 工具模块导出
 */
export interface UtilsModule {
    // 基础工具
    clampNumber(value: number, min: number, max: number, fallback: number): number;
    escapeHtml(str: string): string;
    escapeHtmlAttr(value: string): string;
    safeText(value: any): string;
    safeTrim(value: any): string;

    // 性能工具
    debounce<T extends Function>(func: T, wait?: number, options?: { leading?: boolean; trailing?: boolean }): T & { cancel: () => void; flush: () => void };
    throttle<T extends Function>(func: T, wait?: number, options?: { leading?: boolean; trailing?: boolean }): T & { cancel: () => void; flush: () => void };
    requestIdleCallback(callback: (deadline: IdleDeadline) => void, options?: IdleCallbackOptions): number;
    cancelIdleCallback(id: number): void;
    createBatchHandler<T>(batchHandler: (items: T[]) => void, delay?: number): (item: T) => void;
    createSingletonPromise<T>(asyncFunc: () => Promise<T>): () => Promise<T>;
    deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T;
    generateUniqueId(prefix?: string): string;
    formatFileSize(bytes: number, decimals?: number): string;
    isMobileDevice(): boolean;
    isTouchDevice(): boolean;

    // IntersectionObserver 工具
    createVisibilityObserver(callback: (entry: IntersectionObserverEntry, observer: IntersectionObserver | null) => void, options?: VisibilityObserverOptions): { observe: (element: Element) => void; unobserve: (element: Element) => void; disconnect: () => void };
    createLazyLoader(loadCallback: (element: Element) => void, options?: VisibilityObserverOptions): { observe: (element: Element) => void; unobserve: (element: Element) => void; disconnect: () => void };
    createInfiniteScroll(loadMoreCallback: () => Promise<void>, options?: VisibilityObserverOptions): { observe: (element: Element) => void; unobserve: (element: Element) => void; disconnect: () => void };

    // 性能监控
    createPerformanceTimer(name: string): PerformanceTimer;
    createFPSMonitor(callback: (fps: number) => void, sampleSize?: number): FPSMonitor;
    getMemoryUsage(): MemoryUsage | null;
}

/**
 * 错误处理模块导出
 */
export interface ErrorHandlerModule {
    Logger: {
        debug(message: string, ...args: any[]): void;
        info(message: string, ...args: any[]): void;
        warn(message: string, ...args: any[]): void;
        error(message: string, ...args: any[]): void;
    };
    handleError(error: Error, context?: string): void;
    YuziPhoneError: new (message: string, code: YuziPhoneErrorCode, context?: Record<string, any>) => Error;
    ErrorCodes: Record<YuziPhoneErrorCode, YuziPhoneErrorCode>;
    configureErrorHandler(config: { enableLogging?: boolean; enableNotification?: boolean; logLevel?: 'debug' | 'info' | 'warn' | 'error' }): void;
}

export interface PhoneBeautifyTemplatesModule {
    getBeautifyTemplateSourceMode(templateType: BeautifyTemplateType): BeautifySourceMode;
    setBeautifyTemplateSourceMode(templateType: BeautifyTemplateType, sourceMode: BeautifySourceMode): PhoneBeautifyTemplateSourceModeResult;
    getActiveBeautifyTemplateIdByType(templateType: BeautifyTemplateType, options?: { withFallback?: boolean; persist?: boolean }): string;
    getActiveBeautifyTemplateIdsForSpecial(options?: { withFallback?: boolean; persist?: boolean }): Partial<Record<PhoneBeautifySpecialRendererKey, string>>;
    setActiveBeautifyTemplateIdByType(templateType: BeautifyTemplateType, templateId: string): PhoneBeautifyTemplateActivationResult;
    getBeautifyTemplateSourceModeRuntime(templateType: BeautifyTemplateType, options?: PhoneBeautifyTemplateSourceModeRuntimeOptions): PhoneBeautifyTemplateSourceModeRuntime;
    getBuiltinPhoneBeautifyTemplates(): PhoneBeautifyTemplate[];
    getPhoneBeautifyTemplateStore(): PhoneBeautifyTemplateStore;
    getAllPhoneBeautifyTemplates(options?: PhoneBeautifyTemplateQueryOptions): PhoneBeautifyTemplate[];
    getPhoneBeautifyTemplatesByType(templateType: BeautifyTemplateType, options?: PhoneBeautifyTemplateQueryOptions): PhoneBeautifyTemplate[];
    validatePhoneBeautifyTemplate(rawTemplate: any): PhoneBeautifyTemplateValidationResult;
    savePhoneBeautifyUserTemplate(rawTemplate: any, options?: { overwrite?: boolean }): PhoneBeautifyTemplateSaveResult;
    deletePhoneBeautifyUserTemplate(templateId: string): PhoneBeautifyTemplateBindingResult;
    exportPhoneBeautifyPack(options?: PhoneBeautifyTemplateExportOptions): PhoneBeautifyTemplateExportResult;
    importPhoneBeautifyPackFromData(input: string | object, options?: PhoneBeautifyTemplateImportOptions): PhoneBeautifyTemplateImportResult;
    detectSpecialTemplateForTable(payload?: { sheetKey?: string; tableName?: string; headers?: string[] }): PhoneBeautifyTemplateMatchResult | null;
    detectGenericTemplateForTable(payload?: { sheetKey?: string; tableName?: string; headers?: string[] }): PhoneBeautifyTemplateMatchResult | null;
    bindSheetToBeautifyTemplate(sheetKey: string, templateId: string): PhoneBeautifyTemplateBindingResult;
    clearSheetBeautifyBinding(sheetKey: string): PhoneBeautifyTemplateBindingResult;
}

/**
 * Slash 命令模块导出
 */
export interface SlashCommandsModule {
    registerSlashCommands(): boolean;
    unregisterSlashCommands(): void;
    registerCommandHandler(command: string, handler: (action?: string) => any): void;
    unregisterCommandHandler(command: string): void;
    isSlashCommandsRegistered(): boolean;
    getRegisteredCommands(): string[];
}

/**
 * 扩展主模块导出
 */
export interface YuziPhoneExtension {
    // 集成 API
    getChatMessages: IntegrationModule['getChatMessages'];
    getLastMessageId: IntegrationModule['getLastMessageId'];
    getVariables: IntegrationModule['getVariables'];
    setVariables: IntegrationModule['setVariables'];
    showNotification: IntegrationModule['showNotification'];

    // Slash 命令
    registerSlashCommands: SlashCommandsModule['registerSlashCommands'];
    unregisterSlashCommands: SlashCommandsModule['unregisterSlashCommands'];
    registerCommandHandler: SlashCommandsModule['registerCommandHandler'];
    isSlashCommandsRegistered: SlashCommandsModule['isSlashCommandsRegistered'];

    // 错误处理
    Logger: ErrorHandlerModule['Logger'];
    handleError: ErrorHandlerModule['handleError'];
    YuziPhoneError: ErrorHandlerModule['YuziPhoneError'];
    ErrorCodes: ErrorHandlerModule['ErrorCodes'];
    configureErrorHandler: ErrorHandlerModule['configureErrorHandler'];

    // 工具函数
    debounce: UtilsModule['debounce'];
    throttle: UtilsModule['throttle'];
    requestIdleCallback: UtilsModule['requestIdleCallback'];
    cancelIdleCallback: UtilsModule['cancelIdleCallback'];
    createBatchHandler: UtilsModule['createBatchHandler'];
    createSingletonPromise: UtilsModule['createSingletonPromise'];
    deepMerge: UtilsModule['deepMerge'];
    generateUniqueId: UtilsModule['generateUniqueId'];
    formatFileSize: UtilsModule['formatFileSize'];
    isMobileDevice: UtilsModule['isMobileDevice'];
    isTouchDevice: UtilsModule['isTouchDevice'];
    createVisibilityObserver: UtilsModule['createVisibilityObserver'];
    createLazyLoader: UtilsModule['createLazyLoader'];
    createInfiniteScroll: UtilsModule['createInfiniteScroll'];
    createPerformanceTimer: UtilsModule['createPerformanceTimer'];
    createFPSMonitor: UtilsModule['createFPSMonitor'];
    getMemoryUsage: UtilsModule['getMemoryUsage'];

    // 设置模块
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    savePhoneSetting: SettingsModule['savePhoneSetting'];
    savePhoneSettingsPatch: SettingsModule['savePhoneSettingsPatch'];
    flushPhoneSettingsSave: SettingsModule['flushPhoneSettingsSave'];
    resetPhoneSettingsToDefault: SettingsModule['resetPhoneSettingsToDefault'];

    // 销毁函数
    destroy(): void;
}

export interface SillyTavernGlobalLike {
    getContext(): SillyTavernContextLike;
    eventSource?: EventSource;
    eventTypes?: Record<string, string>;
    event_types?: Record<string, string>;
}

// 全局类型声明
declare global {
    interface Window {
        TavernHelper?: TavernHelper;
        SillyTavern?: SillyTavernGlobalLike;
        eventSource?: EventSource;
        eventTypes?: Record<string, string>;
        event_types?: Record<string, string>;
        getContext?: () => SillyTavernContextLike;
        toastr?: {
            success(message: string, title?: string): void;
            error(message: string, title?: string): void;
            warning(message: string, title?: string): void;
            info(message: string, title?: string): void;
        };
        yuziPhoneCommands?: Record<string, SlashCommandHandler>;
    }

    var toastr: {
        success(message: string, title?: string): void;
        error(message: string, title?: string): void;
        warning(message: string, title?: string): void;
        info(message: string, title?: string): void;
    } | undefined;

    var SillyTavern: SillyTavernGlobalLike | undefined;

    var eventSource: EventSource | undefined;
    var eventTypes: Record<string, string> | undefined;
    var event_types: Record<string, string> | undefined;
    var getContext: (() => SillyTavernContextLike) | undefined;
}

export {};
