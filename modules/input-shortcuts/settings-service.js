import { normalizeInputShortcutRule, normalizeInputShortcutsSettings, shortcutId } from './config.js';

/** 页面只提交明确保存的规则；每次从宿主读最新配置，不把编辑草稿写入设置。 */
export function createInputShortcutsSettingsService({ getPhoneSettings, savePhoneSetting }) {
    const readConfig = () => normalizeInputShortcutsSettings(getPhoneSettings()?.inputShortcuts);
    const failure = error => ({ ok: false, error });
    function save(config) {
        try {
            if (!savePhoneSetting('inputShortcuts', config)) return failure('保存失败，原配置已保留。');
            return { ok: true, config: readConfig() };
        } catch {
            return failure('保存失败，原配置已保留。');
        }
    }
    return {
        readConfig,
        saveRule(value) {
            const rule = normalizeInputShortcutRule(value);
            if (!rule) return failure('请录制按键并填写插入内容或左右符号。');
            const config = readConfig();
            if (config.rules.some(item => item.id !== rule.id && shortcutId(item.shortcut) === shortcutId(rule.shortcut))) {
                return failure('这个快捷键已经有规则，请修改原规则或重新录制。');
            }
            const index = config.rules.findIndex(item => item.id === rule.id);
            if (index < 0) config.rules.push(rule);
            else config.rules[index] = rule;
            return save(config);
        },
        setEnabled(enabled) { return save({ ...readConfig(), enabled: enabled === true }); },
        setRuleEnabled(id, enabled) {
            const config = readConfig();
            const rule = config.rules.find(item => item.id === id);
            if (!rule) return failure('规则不存在，请重新打开页面。');
            rule.enabled = enabled === true;
            return save(config);
        },
        removeRule(id) {
            const config = readConfig();
            config.rules = config.rules.filter(item => item.id !== id);
            return save(config);
        },
    };
}
