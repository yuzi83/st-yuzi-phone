// modules/error-handler.js
/**
 * Yuzi Phone - 统一错误处理系统
 * @version 1.0.0
 * @description 提供统一的错误处理、日志记录和用户通知
 */

import { showNotification } from './integration.js';

/**
 * 错误代码定义
 */
export const ErrorCodes = {
    // 存储相关错误 (E001-E010)
    STORAGE_QUOTA_EXCEEDED: 'E001',
    STORAGE_READ_FAILED: 'E002',
    STORAGE_WRITE_FAILED: 'E003',
    STORAGE_KEY_NOT_FOUND: 'E004',
    
    // 表格相关错误 (E011-E020)
    TABLE_NOT_FOUND: 'E011',
    TABLE_PARSE_FAILED: 'E012',
    TABLE_SAVE_FAILED: 'E013',
    TABLE_INVALID_DATA: 'E014',
    
    // API 相关错误 (E021-E030)
    API_NOT_AVAILABLE: 'E021',
    API_CALL_FAILED: 'E022',
    API_TIMEOUT: 'E023',
    API_INVALID_RESPONSE: 'E024',
    
    // 设置相关错误 (E031-E040)
    INVALID_SETTINGS: 'E031',
    SETTINGS_MIGRATION_FAILED: 'E032',
    SETTINGS_VALIDATION_FAILED: 'E033',
    
    // 渲染相关错误 (E041-E050)
    RENDER_FAILED: 'E041',
    DOM_ELEMENT_NOT_FOUND: 'E042',
    TEMPLATE_PARSE_FAILED: 'E043',
    
    // 事件相关错误 (E051-E060)
    EVENT_LISTENER_FAILED: 'E051',
    EVENT_TRIGGER_FAILED: 'E052',
    
    // 通用错误 (E099)
    UNKNOWN_ERROR: 'E099',
};

/**
 * 错误类型定义
 */
export const ErrorTypes = {
    STORAGE: 'storage',
    TABLE: 'table',
    API: 'api',
    SETTINGS: 'settings',
    RENDER: 'render',
    EVENT: 'event',
    UNKNOWN: 'unknown',
};

/**
 * Yuzi Phone 自定义错误类
 */
export class YuziPhoneError extends Error {
    /**
     * 创建 Yuzi Phone 错误
     * @param {string} message - 错误消息
     * @param {string} code - 错误代码
     * @param {Object} details - 错误详情
     */
    constructor(message, code = ErrorCodes.UNKNOWN_ERROR, details = {}) {
        super(message);
        this.name = 'YuziPhoneError';
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
        
        // 确定错误类型
        this.type = this._determineErrorType(code);
        
        // 保持正确的堆栈跟踪
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, YuziPhoneError);
        }
    }

    /**
     * 根据错误代码确定错误类型
     * @param {string} code - 错误代码
     * @returns {string} 错误类型
     */
    _determineErrorType(code) {
        if (code.startsWith('E00') || code.startsWith('E01')) {
            return ErrorTypes.STORAGE;
        }
        if (code.startsWith('E1') || code.startsWith('E02')) {
            return ErrorTypes.TABLE;
        }
        if (code.startsWith('E2') || code.startsWith('E03')) {
            return ErrorTypes.API;
        }
        if (code.startsWith('E3') || code.startsWith('E04')) {
            return ErrorTypes.SETTINGS;
        }
        if (code.startsWith('E4') || code.startsWith('E05')) {
            return ErrorTypes.RENDER;
        }
        if (code.startsWith('E5')) {
            return ErrorTypes.EVENT;
        }
        return ErrorTypes.UNKNOWN;
    }

    /**
     * 转换为 JSON
     * @returns {Object} JSON 对象
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            type: this.type,
            details: this.details,
            timestamp: this.timestamp,
            stack: this.stack,
        };
    }
}

/**
 * 错误处理器配置
 */
const errorHandlerConfig = {
    enableLogging: true,
    enableNotification: true,
    enableReporting: false,
    logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
};

/**
 * 日志级别优先级
 */
const LogLevelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * 日志系统
 */
export const Logger = {
    /**
     * 调试日志
     * @param {...any} args - 日志参数
     */
    debug(...args) {
        if (shouldLog('debug')) {
            console.log('[玉子手机][DEBUG]', ...args);
        }
    },

    /**
     * 信息日志
     * @param {...any} args - 日志参数
     */
    info(...args) {
        if (shouldLog('info')) {
            console.info('[玉子手机][INFO]', ...args);
        }
    },

    /**
     * 警告日志
     * @param {...any} args - 日志参数
     */
    warn(...args) {
        if (shouldLog('warn')) {
            console.warn('[玉子手机][WARN]', ...args);
        }
    },

    /**
     * 错误日志
     * @param {...any} args - 日志参数
     */
    error(...args) {
        if (shouldLog('error')) {
            console.error('[玉子手机][ERROR]', ...args);
        }
    },

    /**
     * 分组日志开始
     * @param {string} label - 分组标签
     */
    group(label) {
        if (shouldLog('debug')) {
            console.group(`[玉子手机] ${label}`);
        }
    },

    /**
     * 分组日志结束
     */
    groupEnd() {
        if (shouldLog('debug')) {
            console.groupEnd();
        }
    },

    /**
     * 时间标记开始
     * @param {string} label - 时间标记标签
     */
    time(label) {
        if (shouldLog('debug')) {
            console.time(`[玉子手机] ${label}`);
        }
    },

    /**
     * 时间标记结束
     * @param {string} label - 时间标记标签
     */
    timeEnd(label) {
        if (shouldLog('debug')) {
            console.timeEnd(`[玉子手机] ${label}`);
        }
    },
};

/**
 * 判断是否应该记录日志
 * @param {string} level - 日志级别
 * @returns {boolean} 是否应该记录
 */
function shouldLog(level) {
    if (!errorHandlerConfig.enableLogging) return false;
    const currentPriority = LogLevelPriority[errorHandlerConfig.logLevel] || 1;
    const messagePriority = LogLevelPriority[level] || 0;
    return messagePriority >= currentPriority;
}

/**
 * 统一错误处理器
 * @param {Error} error - 错误对象
 * @param {string} userMessage - 用户友好的错误消息
 * @param {Object} options - 选项
 * @param {boolean} options.showNotification - 是否显示通知
 * @param {boolean} options.logError - 是否记录错误
 * @param {boolean} options.throwError - 是否重新抛出错误
 */
export function handleError(error, userMessage = '操作失败', options = {}) {
    const {
        showNotification: shouldShowNotification = true,
        logError: shouldLogError = true,
        throwError: shouldThrow = false,
    } = options;

    // 记录错误
    if (shouldLogError) {
        if (error instanceof YuziPhoneError) {
            Logger.error(`[${error.code}] ${error.message}`, {
                type: error.type,
                details: error.details,
                stack: error.stack,
            });
        } else {
            Logger.error(error.message, error);
        }
    }

    // 显示用户通知
    if (shouldShowNotification && errorHandlerConfig.enableNotification) {
        let notificationMessage = userMessage;
        
        if (error instanceof YuziPhoneError) {
            notificationMessage = `${userMessage} (错误码: ${error.code})`;
        }
        
        showNotification(notificationMessage, 'error');
    }

    // 可选：上报错误
    if (errorHandlerConfig.enableReporting) {
        reportError(error);
    }

    // 可选：重新抛出错误
    if (shouldThrow) {
        throw error;
    }
}

/**
 * 创建错误处理包装器
 * @param {Function} func - 要包装的函数
 * @param {string} userMessage - 用户友好的错误消息
 * @param {Object} options - 选项
 * @returns {Function} 包装后的函数
 * 
 * @example
 * const safeSave = withErrorHandler(saveData, '保存数据失败');
 * await safeSave();
 */
export function withErrorHandler(func, userMessage = '操作失败', options = {}) {
    return async function (...args) {
        try {
            return await func.apply(this, args);
        } catch (error) {
            handleError(error, userMessage, options);
            return null;
        }
    };
}

/**
 * 同步函数错误处理包装器
 * @param {Function} func - 要包装的函数
 * @param {string} userMessage - 用户友好的错误消息
 * @param {Object} options - 选项
 * @returns {Function} 包装后的函数
 */
export function withSyncErrorHandler(func, userMessage = '操作失败', options = {}) {
    return function (...args) {
        try {
            return func.apply(this, args);
        } catch (error) {
            handleError(error, userMessage, options);
            return null;
        }
    };
}

/**
 * 上报错误（预留接口）
 * @param {Error} error - 错误对象
 */
function reportError(error) {
    // 预留错误上报接口
    // 可以在这里集成错误追踪服务，如 Sentry
    Logger.debug('错误上报（预留）:', error);
}

/**
 * 配置错误处理器
 * @param {Object} config - 配置选项
 */
export function configureErrorHandler(config = {}) {
    Object.assign(errorHandlerConfig, config);
}

/**
 * 创建特定类型的错误
 */
export const createError = {
    /**
     * 创建存储错误
     * @param {string} message - 错误消息
     * @param {Object} details - 错误详情
     * @returns {YuziPhoneError} 错误对象
     */
    storage: (message, details = {}) => {
        const code = details.code || ErrorCodes.STORAGE_WRITE_FAILED;
        return new YuziPhoneError(message, code, details);
    },

    /**
     * 创建表格错误
     * @param {string} message - 错误消息
     * @param {Object} details - 错误详情
     * @returns {YuziPhoneError} 错误对象
     */
    table: (message, details = {}) => {
        const code = details.code || ErrorCodes.TABLE_NOT_FOUND;
        return new YuziPhoneError(message, code, details);
    },

    /**
     * 创建 API 错误
     * @param {string} message - 错误消息
     * @param {Object} details - 错误详情
     * @returns {YuziPhoneError} 错误对象
     */
    api: (message, details = {}) => {
        const code = details.code || ErrorCodes.API_NOT_AVAILABLE;
        return new YuziPhoneError(message, code, details);
    },

    /**
     * 创建设置错误
     * @param {string} message - 错误消息
     * @param {Object} details - 错误详情
     * @returns {YuziPhoneError} 错误对象
     */
    settings: (message, details = {}) => {
        const code = details.code || ErrorCodes.INVALID_SETTINGS;
        return new YuziPhoneError(message, code, details);
    },

    /**
     * 创建渲染错误
     * @param {string} message - 错误消息
     * @param {Object} details - 错误详情
     * @returns {YuziPhoneError} 错误对象
     */
    render: (message, details = {}) => {
        const code = details.code || ErrorCodes.RENDER_FAILED;
        return new YuziPhoneError(message, code, details);
    },
};

/**
 * 断言函数 - 用于开发时检查条件
 * @param {boolean} condition - 条件
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 */
export function assert(condition, message, code = ErrorCodes.UNKNOWN_ERROR) {
    if (!condition) {
        throw new YuziPhoneError(message, code);
    }
}

/**
 * 尝试执行函数，失败时返回默认值
 * @param {Function} func - 要执行的函数
 * @param {any} defaultValue - 默认值
 * @param {string} errorMessage - 错误消息
 * @returns {any} 函数返回值或默认值
 */
export function tryOrDefault(func, defaultValue, errorMessage = '操作失败') {
    try {
        return func();
    } catch (error) {
        Logger.warn(errorMessage, error);
        return defaultValue;
    }
}

/**
 * 异步尝试执行函数，失败时返回默认值
 * @param {Function} func - 要执行的异步函数
 * @param {any} defaultValue - 默认值
 * @param {string} errorMessage - 错误消息
 * @returns {Promise<any>} 函数返回值或默认值
 */
export async function tryOrDefaultAsync(func, defaultValue, errorMessage = '操作失败') {
    try {
        return await func();
    } catch (error) {
        Logger.warn(errorMessage, error);
        return defaultValue;
    }
}
