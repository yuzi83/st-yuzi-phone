import { getPhoneSettings, savePhoneSetting } from '../../../settings.js';
import { createDebouncedTask } from '../../../runtime-manager.js';
import { clampNumber } from '../../../utils.js';
import { showToast } from '../../ui/toast.js';

export function setupIconLayoutSettings(container) {
    const map = [
        { id: '#phone-app-grid-columns', key: 'appGridColumns', min: 3, max: 6, fallback: 4 },
        { id: '#phone-app-icon-size', key: 'appIconSize', min: 40, max: 88, fallback: 60 },
        { id: '#phone-app-icon-radius', key: 'appIconRadius', min: 6, max: 26, fallback: 14 },
        { id: '#phone-app-grid-gap', key: 'appGridGap', min: 8, max: 24, fallback: 12 },
        { id: '#phone-dock-icon-size', key: 'dockIconSize', min: 32, max: 72, fallback: 48 },
    ];

    map.forEach((item) => {
        const input = container.querySelector(item.id);
        if (!input) return;

        const debouncedSave = createDebouncedTask((raw) => {
            const value = clampNumber(raw, item.min, item.max, item.fallback);
            savePhoneSetting(item.key, value);
        }, 220);

        input.addEventListener('input', () => {
            debouncedSave(input.value);
        });

        input.addEventListener('change', () => {
            debouncedSave.flush?.();
            const value = clampNumber(input.value, item.min, item.max, item.fallback);
            input.value = String(value);
            savePhoneSetting(item.key, value);
            showToast(container, '图标布局已更新');
        });
    });
}

export function getLayoutValue(key, fallback) {
    const n = Number(getPhoneSettings()?.[key]);
    return Number.isFinite(n) ? String(Math.round(n)) : String(fallback);
}
