export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth <= 768
        || ('ontouchstart' in window);
}

export function getDefaultPhoneTogglePosition(width = 110, height = 60) {
    const mobile = isMobileDevice();
    const safeWidth = Math.max(1, Number(width) || 110);
    const safeHeight = Math.max(1, Number(height) || 60);

    return mobile
        ? {
            x: Math.max(10, window.innerWidth - safeWidth - 12),
            y: Math.max(10, Math.round((window.innerHeight - safeHeight) / 2)),
        }
        : {
            x: Math.max(10, window.innerWidth - safeWidth - 40),
            y: 60,
        };
}

export function constrainPosition(x, y, width, height) {
    return {
        x: Math.max(0, Math.min(x, Math.max(0, window.innerWidth - width))),
        y: Math.max(0, Math.min(y, Math.max(0, window.innerHeight - height))),
    };
}
