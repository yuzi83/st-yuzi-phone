import { normalizeInputShortcutsSettings, shortcutFromEvent, shortcutId } from './config.js';

/** 只拥有键盘监听；由宿主桥提供 document 和已保存配置。 */
export function createInputShortcutsRuntime({ document }) {
    let composing = false;
    const pressed = new Set();
    const listenerOptions = { capture: true };
    const clearPressed = () => { pressed.clear(); composing = false; };
    const release = event => pressed.delete(event.code || event.key);
    const compositionStart = () => { composing = true; };
    const compositionEnd = () => { composing = false; };
    let rules = new Map();
    function handleKeydown(event) {
        const composer = document.activeElement;
        if (!composer || composer.id !== 'send_textarea' || event.target !== composer
            || composer.disabled || composer.readOnly || typeof composer.setRangeText !== 'function'
            || composing || event.isComposing || event.keyCode === 229) return;
        const rule = rules.get(shortcutId(shortcutFromEvent(event)));
        if (!rule) return;
        const key = event.code || event.key;
        if (event.repeat || pressed.has(key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        const start = composer.selectionStart;
        const end = composer.selectionEnd;
        const selected = composer.value.slice(start, end);
        const wrapping = rule.action === 'wrap';
        const text = wrapping ? rule.left + selected + rule.right : rule.text;
        composer.setRangeText(text, start, end);
        const caret = start + (wrapping ? rule.left.length : text.length);
        composer.setSelectionRange(caret, wrapping ? caret + selected.length : caret);
        pressed.add(key);
        event.preventDefault();
        event.stopImmediatePropagation();
        const InputEvent = document.defaultView?.Event || Event;
        composer.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    const listeners = [
        [document, 'keydown', handleKeydown], [document, 'keyup', release],
        [document, 'compositionstart', compositionStart], [document, 'compositionend', compositionEnd],
        [document.defaultView, 'blur', clearPressed],
    ];
    function dispose() {
        listeners.forEach(([target, type, listener]) => target?.removeEventListener(type, listener, listenerOptions));
        clearPressed();
    }
    return {
        configure(next) {
            dispose();
            const config = normalizeInputShortcutsSettings(next);
            rules = new Map(config.rules.filter(rule => rule.enabled).map(rule => [shortcutId(rule.shortcut), rule]));
            if (config.enabled) listeners.forEach(([target, type, listener]) => target?.addEventListener(type, listener, listenerOptions));
        },
        dispose,
    };
}
