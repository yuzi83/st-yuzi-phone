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
    | 'character_loaded';

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
    off(event: string, listener: Function): void;
    once(event: string, listener: Function): void;
    makeFirst(event: string, listener: Function): void;
    makeLast(event: string, listener: Function): void;
    emit(event: string, data?: any): void;
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
 * TavernHelper API 接口
 */
export interface TavernHelper {
    // 聊天消息
    getChatMessages(range: string | number, options?: GetChatMessagesOption): ChatMessage[] | ChatMessageSwiped[];
    getLastMessageId(): number;

    // 变量操作
    getVariables(options?: VariableOption): Record<string, any>;
    insertOrAssignVariables(variables: Record<string, any>, options?: VariableOption): Promise<Record<string, any>>;

    // 宏替换
    substitudeMacros(text: string): string;

    // 角色操作
    getCharData(name: string, allowAvatar?: boolean): any;

    // 通知
    // toastr 由全局提供
}

// ===== 设置类型定义 =====

/**
 * 手机设置
 */
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
    beautifyTemplateSourceModeSpecial: string;
    beautifyTemplateSourceModeGeneric: string;
    beautifyActiveTemplateIdsSpecial: Record<string, string>;
    beautifyActiveTemplateIdGeneric: string;
    dockIconSize: number;
    phoneToggleStyleSize: number;
    phoneToggleStyleShape: 'circle' | 'rounded';
    phoneToggleCoverImage: string | null;
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
 * Slash 命令定义
 */
export interface SlashCommandDefinition {
    name: string;
    handler: SlashCommandHandler;
    aliases?: string[];
    description?: string;
    helpText?: string;
}

// ===== 虚拟滚动类型定义 =====

/**
 * 虚拟滚动选项
 */
export interface VirtualScrollOptions {
    itemHeight: number;
    bufferSize?: number;
    containerHeight?: number;
    onScroll?: (scrollTop: number) => void;
    onItemRender?: (item: any, element: HTMLElement) => void;
}

/**
 * 虚拟滚动项
 */
export interface VirtualScrollItem {
    id: string | number;
    [key: string]: any;
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
    getSillyTavernContext(): any;
    getChatMessages(range?: string | number, options?: GetChatMessagesOption): ChatMessage[] | ChatMessageSwiped[];
    getLastMessageId(): number;
    getVariables(options?: VariableOption): Record<string, any>;
    setVariables(variables: Record<string, any>, options?: VariableOption): Promise<void>;
    substituteMacros(text: string): string;
    getCharacterData(name?: string, allowAvatar?: boolean): any;
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
    isMobileDevice(): boolean;
    getDefaultPhoneTogglePosition(): { x: number; y: number };
    constrainPosition(x: number, y: number, width: number, height: number): { x: number; y: number };
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

/**
 * Slash 命令模块导出
 */
export interface SlashCommandsModule {
    registerSlashCommands(): boolean;
    unregisterSlashCommands(): void;
    registerCommandHandler(command: string, handler: SlashCommandHandler): void;
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

    // 虚拟滚动
    VirtualScroll: any;
    createVirtualScroll: any;
    renderVirtualList: any;

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

    // 销毁函数
    destroy(): void;
}

// 全局类型声明
declare global {
    interface Window {
        TavernHelper?: TavernHelper;
        SillyTavern?: {
            getContext(): any;
            eventSource?: EventSource;
            event_types?: Record<string, string>;
        };
        eventSource?: EventSource;
        event_types?: Record<string, string>;
        getContext?: () => any;
        registerSlashCommand?: (name: string, handler: SlashCommandHandler, aliases?: string[], helpText?: string, autoComplete?: boolean) => void;
        unregisterSlashCommand?: (name: string) => void;
        toastr?: {
            success(message: string, title?: string): void;
            error(message: string, title?: string): void;
            warning(message: string, title?: string): void;
            info(message: string, title?: string): void;
        };
        yuziPhoneCommands?: Record<string, SlashCommandHandler>;
    }

    const toastr: {
        success(message: string, title?: string): void;
        error(message: string, title?: string): void;
        warning(message: string, title?: string): void;
        info(message: string, title?: string): void;
    };

    const SillyTavern: {
        getContext(): any;
        eventSource?: EventSource;
        event_types?: Record<string, string>;
    };

    const eventSource: EventSource;
    const event_types: Record<string, string>;
    const getContext: () => any;
    const registerSlashCommand: (name: string, handler: SlashCommandHandler, aliases?: string[], helpText?: string, autoComplete?: boolean) => void;
    const unregisterSlashCommand: (name: string) => void;
}

export {};
