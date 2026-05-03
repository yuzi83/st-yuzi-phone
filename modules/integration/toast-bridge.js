import { Logger, setNotificationCallback } from '../error-handler.js';

export function showNotification(message, type = 'info') {
    const safeMessage = String(message ?? '');

    try {
        if (typeof toastr !== 'undefined') {
            switch (type) {
                case 'success':
                    toastr.success(safeMessage);
                    break;
                case 'error':
                    toastr.error(safeMessage);
                    break;
                case 'warning':
                    toastr.warning(safeMessage);
                    break;
                default:
                    toastr.info(safeMessage);
            }
            return;
        }

        Logger.info(`[ToastFallback][${String(type || 'info').toUpperCase()}] ${safeMessage}`);
    } catch (error) {
        Logger.error('[玉子手机] 显示通知失败:', error);
    }
}

setNotificationCallback(showNotification);
