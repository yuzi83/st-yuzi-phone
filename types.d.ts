/**
 * 玉子手机扩展 - TypeScript 类型定义
 * @version 2.1.0
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
export type BeautifyTemplateType = 'generic_table_template';
export type BeautifySourceMode = 'builtin' | 'user';
export type PhoneBeautifyGenericRendererKey = 'generic_table';
export type PhoneBeautifyRendererKey = PhoneBeautifyGenericRendererKey;
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
    code?: PhoneBeautifyTemplateWriteCode;
    mode?: BeautifySourceMode;
    message: string;
}

export interface PhoneBeautifyTemplateActivationResult {
    success: boolean;
    code?: PhoneBeautifyTemplateWriteCode;
    message: string;
    templateId?: string;
    rendererKey?: PhoneBeautifyRendererKey;
}

export type PhoneBeautifyTemplateWriteCode = 'BEAUTIFY_USER_TEMPLATE_WRITE_DISABLED';
export type PhoneBeautifyTemplateResetCode = 'BEAUTIFY_RESTORE_DEFAULTS_OK' | 'BEAUTIFY_RESTORE_DEFAULTS_WRITE_FAILED' | 'BEAUTIFY_RESTORE_DEFAULTS_VERIFY_FAILED' | 'BEAUTIFY_RESTORE_DEFAULTS_UNEXPECTED_ERROR';

export interface PhoneBeautifyTemplateResetResult {
    success: boolean;
    code: PhoneBeautifyTemplateResetCode;
    message: string;
    verification?: { ok: boolean; checks: Record<string, boolean> };
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
    code?: PhoneBeautifyTemplateWriteCode;
    imported: number;
    replaced: number;
    skipped: number;
    errors: string[];
    warnings: string[];
    message: string;
}

export interface PhoneBeautifyTemplateSaveResult {
    success: boolean;
    code?: PhoneBeautifyTemplateWriteCode;
    warnings: string[];
    errors: string[];
    replaced?: boolean;
    template: PhoneBeautifyTemplate | null;
    message: string;
}

export interface PhoneBeautifyTemplateBindingResult {
    success: boolean;
    code?: PhoneBeautifyTemplateWriteCode;
    message: string;
}

export interface PhoneBeautifyTemplateMatchResult {
    sheetKey: string;
    tableName: string;
    template: PhoneBeautifyTemplate;
    score: number;
    threshold?: number;
    reason: string;
    sourceMode?: BeautifySourceMode | 'active_template';
    sourceModePreferred?: BeautifySourceMode;
    sourceModeFallbackApplied?: boolean;
}

export interface AppearanceResourceImageItem {
    id: string;
    name: string;
    slotKey?: string;
    mime: string;
    dataUrl: string;
    hash: string;
    bytes: number;
    width: number;
    height: number;
    source: string;
}

export interface AppearanceResourcePoolSettings {
    wallpapers: AppearanceResourceImageItem[];
    icons: AppearanceResourceImageItem[];
}

export interface AppearanceFontItem {
    id: string;
    name: string;
    family: string;
    mime: string;
    format: string;
    dataUrl: string;
    hash: string;
    bytes: number;
    source: string;
    createdAt: number;
}

export interface AppearanceFontLibrarySettings {
    activeFontId: string;
    userFonts: AppearanceFontItem[];
}

export interface AppearanceFontOption extends Partial<AppearanceFontItem> {
    id: string;
    name: string;
    family: string;
    builtin: boolean;
    cssFamily?: string;
    previewText?: string;
}

export interface AppearanceFontLibraryViewModel {
    activeFontId: string;
    activeFont: AppearanceFontOption;
    options: AppearanceFontOption[];
    userFonts: AppearanceFontItem[];
    limits: {
        maxFonts: number;
        singleFontBytes: number;
        totalFontBytes: number;
    };
    stats: {
        userFontCount: number;
        totalBytes: number;
    };
}

export interface AppearanceFontOperationResult {
    success: boolean;
    message?: string;
    font?: AppearanceFontItem;
    activeFont?: AppearanceFontOption;
    duplicateId?: string;
}

export interface AppearanceResourcePackResult {
    success: boolean;
    pack?: Record<string, any> | null;
    meta?: AppearancePackMeta | null;
    stats?: AppearancePackRepositoryStats;
    imported?: number;
    assignedIcons?: number;
    poolIcons?: number;
    discardedIcons?: number;
    unmatchedIcons?: number;
    warnings?: string[];
    errors?: string[];
    message?: string;
}

export interface AppearancePackMeta {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    sourceFileName?: string;
    format: string;
    schemaVersion: number;
    wallpaperCount: number;
    iconCount: number;
    totalBytes: number;
    previewWallpaperDataUrl?: string;
}

export interface AppearancePackRepositoryStats {
    count: number;
    totalBytes: number;
    maxPackCount: number;
    maxSinglePackBytes: number;
    maxTotalPackBytes: number;
}

export interface AppearancePackListResult {
    success: boolean;
    message?: string;
    packs: AppearancePackMeta[];
    stats: AppearancePackRepositoryStats;
    errorType?: string;
    errorMessage?: string;
}

export interface AppearancePackGetResult extends AppearanceResourcePackResult {
    meta?: AppearancePackMeta | null;
}

export interface AppearancePackDeleteResult {
    success: boolean;
    message?: string;
    deletedId?: string;
    stats?: AppearancePackRepositoryStats;
    activeCleared?: boolean;
    errorType?: string;
    errorMessage?: string;
}

export interface AppearanceResourcePoolOperationResult {
    success: boolean;
    removedCount: number;
    removedPoolIcons?: number;
    removedOrphanAppIcons?: number;
    skippedOrphanCleanup?: boolean;
    message?: string;
}

export type WorldbookReadingSelection = Record<string, Record<string, false>>;
export type WorldbookReadingBlockedKeywords = string[];

export type ImageGenerationPromptMessageRole = 'system' | 'user' | 'assistant';

export interface ImageGenerationPresetEntry {
    id: string;
    name: string;
    role: ImageGenerationPromptMessageRole;
    content: string;
    enabled: boolean;
    triggerMode: string;
    triggerWords: string;
    andTriggerWords: string;
}

export interface ImageGenerationPresetEntrySource {
    id?: string;
    name?: string;
    role: ImageGenerationPromptMessageRole;
    content: string;
    enabled?: boolean;
    triggerMode?: string;
    triggerWords?: string;
    andTriggerWords?: string;
}

export interface ImageGenerationPreset {
    id: string;
    name: string;
    entries: ImageGenerationPresetEntry[];
}

export interface SettingsImageGenerationPreset {
    presetId: string;
    name: string;
    entries: readonly ImageGenerationPresetEntry[];
}

export interface ImageGenerationPresetSource {
    [presetName: string]: {
        entries: ImageGenerationPresetEntrySource[];
    };
}

export interface ImageGenerationColumnRef {
    columnIndex: number;
    headerSnapshot: string;
}

export interface ImageGenerationRoleMapping {
    mappingId: string;
    sheetKey: string;
    tableNameSnapshot: string;
    nameColumn: ImageGenerationColumnRef | null;
    promptColumns: ImageGenerationColumnRef[];
}

export interface ImageGenerationSettings {
    enabled: boolean;
    timeoutMs: number;
    roleMappings: ImageGenerationRoleMapping[];
    promptTranslationEnabled: boolean;
    promptTranslationApiPresetId: string;
    promptTranslationPresetId: string;
}

export interface ImagePromptTranslationMessage {
    role: ImageGenerationPromptMessageRole;
    content: string;
}

export interface ImagePromptTranslationInput {
    prompt?: string;
    apiPresetId: string;
    messages: readonly ImagePromptTranslationMessage[];
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface SettingsImagePromptTranslationInput {
    prompt: string;
    apiPresetId?: string;
    imageGenerationPresetId?: string;
    promptTranslationPresetId?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface ImagePromptTranslationError {
    code: string;
    message: string;
}

export type ImagePromptTranslationStatus =
    | 'skipped'
    | 'translated'
    | 'timeout'
    | 'cancelled'
    | 'failed';

export interface ImagePromptTranslationResult {
    ok: boolean;
    status: ImagePromptTranslationStatus;
    reason?: string;
    content?: string;
    error?: ImagePromptTranslationError;
}

export interface ImagePromptTranslationService {
    translate: (input: ImagePromptTranslationInput) => Promise<ImagePromptTranslationResult>;
}

export interface TableContentReplacementRule {
    id: string;
    source: string;
    target: string;
}

export interface TableContentReplacementMapping {
    mappingId: string;
    sheetKey: string;
    tableNameSnapshot: string;
    enabled: boolean;
    rules: TableContentReplacementRule[];
}

export interface TableContentReplacementSettings {
    global: {
        enabled: boolean;
        rules: TableContentReplacementRule[];
    };
    tableRules: TableContentReplacementMapping[];
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
    appIconOrigins: Record<string, string>;
    appearanceResourcePool: AppearanceResourcePoolSettings;
    appearanceActivePackId: string;
    appearanceFontLibrary: AppearanceFontLibrarySettings;
    homeAppLabelColorMode: 'white' | 'black';
    phoneReadableTextScalePercent: number;
    hideTableCountBadge: boolean;
    hiddenTableApps: Record<string, boolean>;
    beautifyTemplateSourceModeGeneric: BeautifySourceMode;
    beautifyActiveTemplateIdGeneric: string;
    dockIconSize: number;
    phoneToggleStyleSize: number;
    phoneToggleStyleShape: 'circle' | 'rounded';
    phoneToggleCoverImage: string | null;
    worldbookReadingSelection: WorldbookReadingSelection;
    worldbookReadingBlockedKeywords: WorldbookReadingBlockedKeywords;
    imageGeneration: ImageGenerationSettings;
    tableContentReplacement: TableContentReplacementSettings;
}

/**
 * 设置验证规则
 */
export interface ValidationRule {
    type: 'number' | 'string' | 'boolean' | 'object' | 'array';
    min?: number;
    max?: number;
    maxLength?: number;
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
    savePhoneSettingsPatch(patch: Partial<PhoneSettings>): boolean;
    migrateLegacyPhoneSettings(): void;
    flushPhoneSettingsSave(): boolean;
    resetPhoneSettingsToDefault(): boolean;
    isMobileDevice(): boolean;
    getDefaultPhoneTogglePosition(): { x: number; y: number };
    constrainPosition(x: number, y: number, width: number, height: number): { x: number; y: number };
}

export type SettingsPageMode =
    | 'home'
    | 'appearance'
    | 'api_presets'
    | 'beautify'
    | 'button_style'
    | 'worldbook_reading'
    | 'image_generation'
    | 'ai_instruction_presets'
    | 'table_content_replacement';

export interface SettingsAppState {
    mode: SettingsPageMode;
    homeScrollTop?: number;
    apiPresetsScrollTop: number;
    appearanceScrollTop: number;
    beautifyScrollTop: number;
    buttonStyleScrollTop: number;
    aiInstructionPresetsScrollTop: number;
    imageGenerationScrollTop: number;
    tableContentReplacementScrollTop: number;
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
    rerenderAppearanceKeepScroll: () => void;
    rerenderApiPresetsKeepScroll: () => void;
    rerenderBeautifyKeepScroll: () => void;
    rerenderAiInstructionPresetsKeepScroll: () => void;
    rerenderWorldbookReadingKeepScroll: () => void;
    rerenderImageGenerationKeepScroll: () => void;
    rerenderTableContentReplacementKeepScroll: () => void;
}

export interface SettingsPageRendererFeedbackDeps {
    showToast: SettingsToastHandler;
}

export interface SettingsAppearancePageService {
    getLayoutValue: (key: string, fallback: number) => string;
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    setupBgUpload: (container: HTMLElement, options?: Record<string, any>) => (() => void) | void;
    setupIconLayoutSettings: (container: HTMLElement) => (() => void) | void;
    setupAppearanceToggles: (container: HTMLElement) => (() => void) | void;
    renderHiddenTableAppsList: (listEl: Element | null) => (() => void) | void;
    renderIconUploadList: (listEl: Element | null, options?: Record<string, any>) => (() => void) | void;
    importAppearanceResourcePackFromData: (input: string | object, options?: Record<string, any>) => AppearanceResourcePackResult;
    validateAppearanceResourcePack: (input: string | object) => AppearanceResourcePackResult;
    applyAppearanceResourcePack: (packInput: string | object, options?: Record<string, any>) => AppearanceResourcePackResult;
    listAppearancePacks: () => Promise<AppearancePackListResult>;
    getAppearancePackRepositoryStats: () => Promise<{ success: boolean; message?: string; stats: AppearancePackRepositoryStats; errorType?: string; errorMessage?: string }>;
    importAppearancePackToRepository: (fileText: string, meta?: Record<string, any>) => Promise<AppearanceResourcePackResult>;
    applyAppearancePackFromRepository: (id: string) => Promise<AppearanceResourcePackResult | AppearancePackGetResult>;
    deleteAppearancePackFromRepository: (id: string) => Promise<AppearancePackDeleteResult>;
    exportAppearanceResourcePack: (options?: Record<string, any>) => AppearanceResourcePackResult;
    clearAppearanceResourcePoolIcons: () => AppearanceResourcePoolOperationResult;
    getAppearanceFontLibraryViewModel: () => AppearanceFontLibraryViewModel;
    importAppearanceFontFile: (file: File) => Promise<AppearanceFontOperationResult>;
    importAppearanceFontCssUrl: (input: { name?: string; cssUrl?: string; family?: string }) => AppearanceFontOperationResult;
    selectAppearanceFont: (fontId: string) => AppearanceFontOperationResult;
    deleteAppearanceFont: (fontId: string) => AppearanceFontOperationResult;
    applyAppearanceFontLibrary: (root?: Element | null) => boolean;
    getReadableTextScalePercentValue: () => number;
    applyReadableTextScale: (root?: Element | null, percent?: number) => void;
    setupReadableTextScaleSettings: (container: HTMLElement) => (() => void) | void;
    getHomeAppLabelColorModeValue: () => 'white' | 'black';
    setupHomeAppLabelColorSettings: (container: HTMLElement) => (() => void) | void;
    getPhoneThemeModeValue: () => 'light' | 'dark';
    applyPhoneThemeMode: (mode?: string) => boolean;
    setupPhoneThemeModeSettings: (container: HTMLElement) => (() => void) | void;
}

export interface SettingsAppearancePageContext extends SettingsPageRendererCommonDeps {
    showToast: SettingsToastHandler;
    rerenderAppearanceKeepScroll: () => void;
    appearancePageService: SettingsAppearancePageService;
}

export interface SettingsAppearancePageRendererDeps extends SettingsAppearancePageService {}

export interface SettingsQQV2PresetService {
    readSharedResources: () => Promise<Record<string, any>>;
    saveApiPreset: (input: Record<string, any>) => Promise<Record<string, any>>;
    deleteApiPreset: (input: Record<string, any>) => Promise<Record<string, any>>;
    loadModels: (input: Record<string, any>) => Promise<Record<string, any>>;
    savePromptPreset: (input: Record<string, any>) => Promise<Record<string, any>>;
    deletePromptPreset: (input: Record<string, any>) => Promise<Record<string, any>>;
    restoreBuiltInPromptPreset: (input: Record<string, any>) => Promise<Record<string, any>>;
    restoreAllBuiltInPromptPresets: () => Promise<Record<string, any>>;
    importPromptPresets: (input: Record<string, any>) => Promise<Record<string, any>>;
    exportPromptPreset: (input: Record<string, any>) => Promise<Record<string, any>>;
    exportAllPromptPresets: () => Promise<Record<string, any>>;
    importImageGenerationPresets: (input: {
        source: ImageGenerationPresetSource;
    }) => Promise<{
        ok: boolean;
        status: string;
        imageGenerationPresets?: readonly SettingsImageGenerationPreset[];
        error?: Record<string, any>;
    }>;
    exportImageGenerationPreset: (input: {
        imageGenerationPresetId?: string;
        presetId?: string;
    }) => Promise<{
        ok: boolean;
        status: string;
        source?: ImageGenerationPresetSource;
        error?: Record<string, any>;
    }>;
    deleteImageGenerationPreset: (input: {
        imageGenerationPresetId?: string;
        presetId?: string;
    }) => Promise<{
        ok: boolean;
        status: string;
        deleted?: boolean;
        error?: Record<string, any>;
    }>;
    translateImagePrompt: (input: SettingsImagePromptTranslationInput) => Promise<ImagePromptTranslationResult>;
}

export interface SettingsButtonStylePageService {
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    savePhoneSetting: SettingsModule['savePhoneSetting'];
    showToast: SettingsToastHandler;
}

export interface SettingsButtonStylePageRendererDeps {
    getPhoneSettings: SettingsModule['getPhoneSettings'];
    savePhoneSetting: SettingsModule['savePhoneSetting'];
}

export interface ContentPresetIssue {
    code: string;
    message: string;
    itemId?: string;
}

export interface ContentPresetBinding {
    sheetKey: string;
    presetId: string;
    itemId: string;
}

export interface ContentPresetItem {
    id: string;
    name: string;
    target: { tableName: string; fields: readonly string[] };
    entry: { html?: string; css?: string; mount: string };
    assets: readonly string[];
    issues: readonly ContentPresetIssue[];
    activatable: boolean;
}

export interface ContentPresetRecord {
    id: string;
    name: string;
    version: string;
    author: string;
    items: readonly ContentPresetItem[];
    issues: readonly ContentPresetIssue[];
    files: Readonly<Record<string, { path: string; mimeType: string; encoding: 'text' | 'base64'; content: string }>>;
    format: 'yuzi-beautify-preset';
    formatVersion: 2;
    apiVersion: 1;
    importedAt: string;
}

export interface ContentPresetWorkshopViewModel {
    status: 'loading' | 'ready' | 'unavailable' | 'error';
    error: unknown;
    revision: number;
    presets: readonly ContentPresetRecord[];
    tables: readonly any[];
}

export interface SettingsContentPresetWorkshopService {
    getSnapshot: () => any;
    subscribe: (listener: (snapshot: any) => void) => () => void;
    getViewModel: () => Promise<ContentPresetWorkshopViewModel>;
    prepareImport: (input: string | object) => Promise<{ record: ContentPresetRecord; replacesExisting: boolean }>;
    importPrepared: (prepared: { record: ContentPresetRecord; replacesExisting: boolean }, allowReplace?: boolean) => Promise<any>;
    exportPreset: (presetId: string) => Promise<{ filename: string; text: string; mimeType: string }>;
    deletePreset: (presetId: string) => Promise<any>;
    setActive: (sheetKey: string, presetId: string, itemId: string) => Promise<any>;
    clearActive: (sheetKey: string) => Promise<any>;
    clearAllActive: () => Promise<any>;
}

export interface SettingsWorldbookReadingCatalogEntry {
    ref: { bookName: string; uid: string };
    sourceRole: 'primary' | 'additional';
    enabled: boolean;
    selected: boolean;
    value: Record<string, any>;
}

export interface SettingsWorldbookReadingCatalog {
    load: (request?: Record<string, any>) => Promise<{
        books: readonly { name: string; sourceRole: 'primary' | 'additional' }[];
        entries: readonly SettingsWorldbookReadingCatalogEntry[];
        issues: readonly any[];
        blockedKeywords: readonly string[];
    }>;
    setSelected: (
        refs: readonly { bookName: string; uid: string }[],
        selected: boolean,
        request?: Record<string, any>,
    ) => Promise<void>;
    setBlockedKeywords: (
        keywords: readonly string[],
        request?: Record<string, any>,
    ) => Promise<void>;
    subscribe: (listener: () => void) => Promise<() => void>;
}

export interface SettingsImageGenerationTableHeader {
    columnIndex: number;
    rawName: string;
    displayName: string;
}

export interface SettingsImageGenerationTable {
    sheetKey: string;
    tableName: string;
    status: string;
    headers: readonly SettingsImageGenerationTableHeader[];
    rowCount?: number;
}

export interface SettingsImageGenerationTestInput {
    names?: string;
    description?: string;
    finalPrompt?: string;
    aiOutput?: string;
    imagePath?: string;
    statusText?: string;
    generating?: boolean;
}

export interface SettingsImageGenerationTestResult {
    ok: boolean;
    status: string;
    requestId?: string;
    path?: string;
    format?: string;
    prompt: string;
    change?: string;
    generatedAt?: number;
    characters?: readonly Record<string, any>[];
    unmatchedNames?: readonly string[];
    mappingDiagnostics?: readonly Record<string, any>[];
    error?: Record<string, any>;
    [key: string]: any;
}

export interface SettingsImageGenerationViewModel {
    config: ImageGenerationSettings;
    tables: readonly SettingsImageGenerationTable[];
    resolvedMappings?: readonly any[];
    sharedResources?: {
        status: string;
        error?: string;
        apiPresets: readonly Record<string, any>[];
        imageGenerationPresets: readonly SettingsImageGenerationPreset[];
    };
    testInput?: SettingsImageGenerationTestInput;
}

export interface SettingsImageGenerationService {
    loadViewModel: (request?: {
        config?: ImageGenerationSettings;
        includeSharedResources?: boolean;
        testInput?: Pick<SettingsImageGenerationTestInput, 'names' | 'description'>;
    }) => Promise<SettingsImageGenerationViewModel>;
    saveConfig: (config: ImageGenerationSettings) => Promise<{
        ok?: boolean;
        status?: string;
        config: ImageGenerationSettings;
        tables?: readonly SettingsImageGenerationTable[];
    }>;
    testGenerate: (request: {
        names?: string;
        explicitNames?: string;
        description?: string;
        prompt?: string;
        timeoutMs?: number;
        negativePrompt?: string;
        change?: string;
        folder?: string;
        filename?: string;
        config?: ImageGenerationSettings;
        signal?: AbortSignal;
    }) => Promise<SettingsImageGenerationTestResult>;
}

export interface SettingsTableContentReplacementPageContext extends SettingsPageRendererCommonDeps {
    navigateBack: () => void;
    showToast: SettingsToastHandler;
    rerenderTableContentReplacementKeepScroll: () => void;
    tableContentReplacementSettingsService: SettingsTableContentReplacementService;
}

export interface SettingsTableContentReplacementTable {
    sheetKey: string;
    tableName: string;
    status: string;
    headers: readonly string[];
    rowCount?: number;
}

export interface SettingsTableContentReplacementViewModel {
    status: 'loading' | 'ready' | 'error';
    error?: unknown;
    config: TableContentReplacementSettings;
    tables: readonly SettingsTableContentReplacementTable[];
    tableRules: readonly (TableContentReplacementMapping & {
        tableName?: string;
        status?: string;
        headers?: readonly string[];
        rowCount?: number;
    })[];
    errors?: Record<string, any>;
    busy?: boolean;
}

export interface SettingsTableContentReplacementService {
    loadViewModel: (request?: { config?: TableContentReplacementSettings }) => Promise<SettingsTableContentReplacementViewModel>;
    saveArea: (request: {
        kind: 'global' | 'table';
        mappingId?: string;
        config: TableContentReplacementSettings;
    }) => Promise<Record<string, any>>;
    deleteArea: (request: {
        mappingId: string;
        config: TableContentReplacementSettings;
    }) => Promise<Record<string, any>>;
    readConfig: () => TableContentReplacementSettings;
}

export interface SettingsPageRendererGroupedDeps {
    common?: SettingsPageRendererCommonDeps;
    navigation?: SettingsPageRendererNavigationDeps;
    scroll?: SettingsPageRendererScrollDeps;
    feedback?: SettingsPageRendererFeedbackDeps;
    appearance?: SettingsAppearancePageRendererDeps;
    qqV2Presets?: SettingsQQV2PresetService;
    buttonStyle?: SettingsButtonStylePageRendererDeps;
    contentPresetWorkshop?: SettingsContentPresetWorkshopService;
    worldbookReading?: SettingsWorldbookReadingCatalog;
    imageGeneration?: SettingsImageGenerationService;
    tableContentReplacement?: SettingsTableContentReplacementService;
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
    renderApiPresetsPage(): void;
    renderButtonStylePage(): void;
    renderBeautifyTemplatePage(): void;
    renderAiInstructionPresetsPage(): void;
    renderWorldbookReadingPage(): void;
    renderImageGenerationPage(): void;
    renderTableContentReplacementPage(): void;
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
    detectGenericTemplateForTable(payload?: { sheetKey?: string; tableName?: string; headers?: string[] }): PhoneBeautifyTemplateMatchResult | null;
    bindSheetToBeautifyTemplate(sheetKey: string, templateId: string): PhoneBeautifyTemplateBindingResult;
    clearSheetBeautifyBinding(sheetKey: string): PhoneBeautifyTemplateBindingResult;
    restorePhoneBeautifyTemplatesToBuiltinDefaults(): PhoneBeautifyTemplateResetResult;
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
