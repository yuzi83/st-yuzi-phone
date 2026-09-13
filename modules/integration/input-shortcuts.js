import { createInputShortcutsRuntime } from '../input-shortcuts/runtime.js';

/** 扩展级生命周期桥；手机页面隐藏不停止，禁用／销毁必须停止。 */
export function createInputShortcutsHost({ document, getPhoneSettings, subscribePhoneSettingsUpdates }) {
    const runtime = createInputShortcutsRuntime({ document });
    let unsubscribe = null;
    function sync() {
        const settings = getPhoneSettings();
        runtime.configure({ ...settings.inputShortcuts, enabled: settings.enabled !== false && settings.inputShortcuts?.enabled === true });
    }
    function stop() {
        runtime.dispose();
        unsubscribe?.();
        unsubscribe = null;
    }
    return {
        start() {
            if (unsubscribe) { sync(); return; }
            try {
                unsubscribe = subscribePhoneSettingsUpdates(({ key } = {}) => {
                    if (!key || key === 'inputShortcuts' || key === 'enabled') sync();
                });
                sync();
            } catch (error) {
                stop();
                throw error;
            }
        },
        stop,
    };
}
