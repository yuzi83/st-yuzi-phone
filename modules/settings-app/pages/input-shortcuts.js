import { generateUniqueId } from '../../utils/object.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { formatShortcut, shortcutFromEvent } from '../../input-shortcuts/config.js';
import { createScrollPreserver } from '../ui/settings-scroll-binding.js';
import { buildSettingsPageFrame, buildSettingsSectionHtml } from '../layout/primitives.js';

function buildTextField(field, label, value, rows = 2) {
    return `<label class="yuzi-input-shortcut-field"><span>${label}</span>
        <textarea class="phone-settings-textarea" data-field="${field}" rows="${rows}" spellcheck="false">${escapeHtml(value || '')}</textarea></label>`;
}

export function buildInputShortcutsPageHtml({ enabled, rules, recordingId = '', dirtyIds = [] }) {
    const intro = buildSettingsSectionHtml({
        title: '输入快捷键',
        desc: '在酒馆输入框中，用按键插入文字或包裹选区。',
        actionsHtml: `<label class="yuzi-input-shortcut-toggle"><span>启用</span>
            <input type="checkbox" class="phone-settings-switch" data-field="enabled" aria-label="启用输入快捷键"${enabled ? ' checked' : ''}></label>`,
        bodyHtml: `<div class="yuzi-input-shortcut-toolbar"><span>${rules.length} 条规则 · 修改后点击保存</span>
            <button type="button" class="phone-settings-btn" data-action="add">新增规则</button></div>`,
    });
    const cards = rules.map((rule, index) => `<div data-rule-id="${escapeHtmlAttr(rule.id)}">${buildSettingsSectionHtml({
        title: `规则 ${index + 1}`,
        desc: '',
        actionsHtml: `<label class="yuzi-input-shortcut-toggle"><span>启用</span>
            <input type="checkbox" class="phone-settings-switch" data-field="rule-enabled" aria-label="启用规则 ${index + 1}"${rule.enabled ? ' checked' : ''}></label>`,
        bodyHtml: `<div class="yuzi-input-shortcut-fields">
            <div class="yuzi-input-shortcut-binding">
                <label class="yuzi-input-shortcut-field"><span>快捷键</span>
                    <button type="button" class="phone-settings-btn yuzi-input-shortcut-key" data-action="record" aria-pressed="${recordingId === rule.id}">${recordingId === rule.id ? '请按键…' : escapeHtml(formatShortcut(rule.shortcut))}</button></label>
                <label class="yuzi-input-shortcut-field"><span>动作</span>
                    <select class="phone-settings-select" data-field="action">
                        <option value="insert"${rule.action === 'insert' ? ' selected' : ''}>插入文本</option>
                        <option value="wrap"${rule.action === 'wrap' ? ' selected' : ''}>成对包裹</option>
                    </select></label>
            </div>
            ${rule.action === 'wrap'
        ? `<div class="yuzi-input-shortcut-pair">${buildTextField('left', '左侧内容', rule.left)}${buildTextField('right', '右侧内容', rule.right)}</div>`
        : buildTextField('text', '插入内容', rule.text, 3)}
            <div class="yuzi-input-shortcut-actions">
                <span data-rule-status role="status">${dirtyIds.includes(rule.id) ? '未保存' : ''}</span>
                <button type="button" class="phone-settings-btn" data-action="delete">删除</button>
                <button type="button" class="phone-settings-btn phone-settings-btn-primary" data-action="save">保存</button>
            </div>
        </div>`,
    })}</div>`).join('');
    return buildSettingsPageFrame({
        title: '输入快捷键',
        bodyClass: 'phone-app-body phone-settings-scroll yuzi-input-shortcuts',
        bodyHtml: intro + (cards || '<p class="yuzi-input-shortcut-empty">还没有规则，点击「新增规则」开始。</p>'),
    });
}

export function createInputShortcutsPage(ctx) {
    const { container, state, render, pageRuntime, inputShortcutsSettingsService: service, showToast } = ctx;
    const scroll = createScrollPreserver(container, state, undefined, pageRuntime);
    let rules = service.readConfig().rules;
    const dirtyIds = new Set();
    let recording = null;

    function markDirty(id, card) {
        dirtyIds.add(id);
        const status = card?.querySelector('[data-rule-status]');
        if (status) status.textContent = '未保存';
    }
    function stopRecording(commit = false) {
        if (!recording) return;
        const { button, rule, candidate } = recording;
        recording = null;
        if (commit && candidate) {
            rule.shortcut = candidate;
            markDirty(rule.id, button.closest('[data-rule-id]'));
        }
        button.textContent = formatShortcut(rule.shortcut);
        button.setAttribute('aria-pressed', 'false');
    }
    function draw() {
        stopRecording();
        container.innerHTML = buildInputShortcutsPageHtml({
            enabled: service.readConfig().enabled, rules, dirtyIds: [...dirtyIds],
        });
    }
    const redraw = scroll.createRerenderWithScroll('inputShortcutsScrollTop', draw);
    function feedback(result, success = '') {
        if (!result.ok || success) showToast?.(container, result.ok ? success : result.error, !result.ok, pageRuntime);
        return result.ok;
    }
    function locate(target) {
        const card = target.closest('[data-rule-id]');
        return { card, rule: rules.find(item => item.id === card?.dataset.ruleId) };
    }
    function handleClick(event) {
        const button = event.target.closest('button');
        if (!button || !container.contains(button)) return;
        if (button.matches('.phone-nav-back')) {
            stopRecording();
            state.mode = 'home';
            render();
            return;
        }
        const action = button.dataset.action;
        if (action === 'add') {
            const rule = { id: generateUniqueId('shortcut'), enabled: true, shortcut: null, action: 'insert', text: '', left: '', right: '' };
            rules.push(rule);
            dirtyIds.add(rule.id);
            redraw();
            return;
        }
        const { rule } = locate(button);
        if (!rule) return;
        if (action === 'record') {
            const wasRecording = recording?.button === button;
            stopRecording();
            if (wasRecording) return;
            recording = { button, rule, candidate: null };
            button.textContent = '请按键…';
            button.setAttribute('aria-pressed', 'true');
            button.focus({ preventScroll: true });
        } else if (action === 'save') {
            const result = service.saveRule(rule);
            if (!result.ok) { feedback(result); return; }
            rules = rules.map(item => item.id === rule.id ? result.config.rules.find(saved => saved.id === rule.id) : item);
            dirtyIds.delete(rule.id);
            redraw();
            feedback(result, '规则已保存');
        } else if (action === 'delete') {
            const saved = service.readConfig().rules.some(item => item.id === rule.id);
            if (saved && !feedback(service.removeRule(rule.id))) return;
            rules = rules.filter(item => item.id !== rule.id);
            dirtyIds.delete(rule.id);
            redraw();
        }
    }
    function handleChange(event) {
        const target = event.target;
        if (target.dataset.field === 'enabled') {
            const result = service.setEnabled(target.checked);
            redraw();
            feedback(result);
            return;
        }
        const { rule, card } = locate(target);
        if (!rule) return;
        if (target.dataset.field === 'rule-enabled') {
            const saved = service.readConfig().rules.some(item => item.id === rule.id);
            if (saved) {
                const result = service.setRuleEnabled(rule.id, target.checked);
                if (!result.ok) { redraw(); feedback(result); return; }
            }
            rule.enabled = target.checked;
            if (!saved) markDirty(rule.id, card);
            redraw();
        } else if (target.dataset.field === 'action') {
            rule.action = target.value;
            markDirty(rule.id, card);
            redraw();
        }
    }
    function handleRecordingKey(event) {
        if (!recording || event.target !== recording.button || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        if (event.type === 'keydown') recording.candidate = shortcutFromEvent(event);
        else stopRecording(true);
    }
    return {
        mount() {
            draw();
            scroll.restoreScroll('inputShortcutsScrollTop');
            pageRuntime.addEventListener(container, 'click', handleClick);
            pageRuntime.addEventListener(container, 'change', handleChange);
            pageRuntime.addEventListener(container, 'input', event => {
                const { rule, card } = locate(event.target);
                const field = event.target.dataset.field;
                if (rule && ['text', 'left', 'right'].includes(field)) {
                    rule[field] = event.target.value;
                    markDirty(rule.id, card);
                }
            });
            pageRuntime.addEventListener(container, 'keydown', handleRecordingKey, true);
            pageRuntime.addEventListener(container, 'keyup', handleRecordingKey, true);
            pageRuntime.addEventListener(container, 'focusout', event => {
                if (event.target === recording?.button) stopRecording();
            });
        },
        dispose() {
            stopRecording();
            scroll.captureScroll('inputShortcutsScrollTop');
        },
    };
}
