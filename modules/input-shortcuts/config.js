/** 录制、匹配和持久化共用的键位契约；不设键位黑名单。 */
export function normalizeShortcut(value) {
    if (!value || typeof value.key !== 'string' || !value.key) return null;
    const key = value.key.toLowerCase();
    return { key, ctrl: key !== 'control' && value.ctrl === true,
        alt: key !== 'alt' && value.alt === true,
        shift: key !== 'shift' && value.shift === true,
        meta: key !== 'meta' && value.meta === true };
}

export function shortcutFromEvent(event) {
    return normalizeShortcut({ key: event.key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });
}

export function shortcutId(shortcut) {
    const normalized = normalizeShortcut(shortcut);
    return normalized ? JSON.stringify(normalized) : '';
}

export function formatShortcut(shortcut) {
    const value = normalizeShortcut(shortcut);
    if (!value) return '录制按键';
    const key = { ' ': 'Space', control: 'Ctrl', meta: 'Meta', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓' }[value.key]
        || (value.key.length === 1 ? value.key.toUpperCase() : value.key[0].toUpperCase() + value.key.slice(1));
    return [value.ctrl && 'Ctrl', value.alt && 'Alt', value.shift && 'Shift', value.meta && 'Meta', key].filter(Boolean).join(' + ');
}

export function normalizeInputShortcutRule(value) {
    if (!value || typeof value.id !== 'string' || !value.id) return null;
    const shortcut = normalizeShortcut(value.shortcut);
    if (!shortcut || !['insert', 'wrap'].includes(value.action)) return null;
    const rule = { id: value.id, enabled: value.enabled !== false, shortcut, action: value.action,
        text: typeof value.text === 'string' ? value.text : '',
        left: typeof value.left === 'string' ? value.left : '',
        right: typeof value.right === 'string' ? value.right : '' };
    return (rule.action === 'insert' ? rule.text.length : rule.left.length + rule.right.length) ? rule : null;
}

export function normalizeInputShortcutsSettings(value) {
    const ids = new Set();
    const shortcuts = new Set();
    const rules = [];
    for (const item of Array.isArray(value?.rules) ? value.rules : []) {
        const rule = normalizeInputShortcutRule(item);
        if (!rule || ids.has(rule.id) || shortcuts.has(shortcutId(rule.shortcut))) continue;
        ids.add(rule.id);
        shortcuts.add(shortcutId(rule.shortcut));
        rules.push(rule);
    }
    return { enabled: value?.enabled === true, rules };
}
