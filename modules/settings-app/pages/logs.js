import { escapeHtml } from '../../utils/dom-escape.js';
import { qqFailureLog } from '../../qq-v2/request/failure-log.js';
import { writeToClipboard } from '../../utils/clipboard.js';
import { buildSettingsPageFrame, buildSettingsSectionHtml } from '../layout/primitives.js';
import { createScrollPreserver } from '../ui/settings-scroll-binding.js';

export function formatFailureLog(entry) {
    return [
        `${entry.source} · ${entry.title}`, entry.time, entry.conversation, entry.model,
        '本次 AI 原始返回', entry.response || '本次未取得 AI 回复正文',
        '这次是什么问题', entry.explanation, '你可以怎么做', entry.suggestion,
        '技术详情', entry.detail || '当前调用通道未提供详细错误信息',
    ].filter(Boolean).join('\n');
}

export function buildFailureLogCard(entry) {
    const response = escapeHtml(entry.response || '本次未取得 AI 回复正文');
    return `<article class="yuzi-failure-log" data-log-id="${entry.id}">
        ${buildSettingsSectionHtml({
            title: `${entry.source} · ${entry.title}`,
            desc: [entry.time, entry.conversation, entry.model].filter(Boolean).join(' · '),
            actionsHtml: `<button type="button" class="phone-settings-btn" data-copy-log="${entry.id}" aria-label="复制本条日志">复制</button>`,
            bodyHtml: `<details><summary>本次 AI 原始返回</summary><pre>${response}</pre></details>
                <details><summary>这次是什么问题</summary><p>${escapeHtml(entry.explanation)}</p></details>
                <details><summary>你可以怎么做</summary><p>${escapeHtml(entry.suggestion)}</p></details>
                <details><summary>技术详情</summary><pre>${escapeHtml(entry.detail || '当前调用通道未提供详细错误信息')}</pre></details>`,
        })}
    </article>`;
}

export function createLogsPage(ctx) {
    const { container, state, render, pageRuntime, showToast } = ctx;
    const log = ctx.failureLog || qqFailureLog;
    const scroll = createScrollPreserver(container, state, undefined, pageRuntime);
    let unsubscribe = null;
    let disposed = false;
    let mounted = false;
    let revision = log.getSnapshot().revision;
    const sync = () => {
        if (disposed) return;
        const snapshot = log.getSnapshot();
        const list = container.querySelector('.yuzi-failure-log-list');
        if (!list) return;
        if (mounted) scroll.captureScroll('logsScrollTop');
        mounted = true;
        if (revision !== snapshot.revision) state.logsScrollTop = 0;
        revision = snapshot.revision;
        const ids = new Set(snapshot.entries.map(entry => String(entry.id)));
        for (const card of [...list.children]) {
            if (!ids.has(card.dataset.logId)) card.remove();
        }
        // Keep existing cards and native <details> intact; copying never rebuilds the page.
        for (const entry of [...snapshot.entries].reverse()) {
            if (!list.querySelector(`[data-log-id="${entry.id}"]`)) list.insertAdjacentHTML('afterbegin', buildFailureLogCard(entry));
        }
        container.querySelector('[data-log-empty]').hidden = snapshot.entries.length > 0;
        container.querySelector('[data-log-count]').textContent = `${snapshot.entries.length} / 50 条`;
        container.querySelector('[data-log-trimmed]').hidden = !snapshot.trimmed;
        container.querySelector('[data-clear-logs]').disabled = snapshot.entries.length === 0;
        scroll.restoreScroll('logsScrollTop');
    };
    return {
        mount() {
            container.innerHTML = buildSettingsPageFrame({
                title: '日志',
                bodyClass: 'phone-app-body phone-settings-scroll yuzi-failure-logs',
                bodyHtml: buildSettingsSectionHtml({
                    title: '当前聊天的 QQ 日志',
                    desc: '仅记录失败，最新的在前。最近 50 条；刷新或切换酒馆聊天后清空。',
                    actionsHtml: '<button type="button" class="phone-settings-btn" data-clear-logs>清空日志</button>',
                    bodyHtml: `<p data-log-count role="status"></p>
                        <p data-log-trimmed hidden>日志文本已达到内存上限，部分最旧记录已移除。</p>
                        <p data-log-empty>暂无失败日志。已读不回和正常取消不会记为错误。</p>`,
                }) + '<div class="yuzi-failure-log-list"></div>',
            });
            pageRuntime.addEventListener(container, 'click', async event => {
                const target = event.target.closest('button');
                if (!target) return;
                if (target.matches('.phone-nav-back')) {
                    state.mode = 'home';
                    render();
                } else if (target.matches('[data-clear-logs]')) {
                    log.clear();
                } else if (target.matches('[data-copy-log]')) {
                    const entry = log.getSnapshot().entries.find(item => String(item.id) === target.dataset.copyLog);
                    if (!entry) return;
                    try {
                        const copied = await writeToClipboard(formatFailureLog(entry));
                        if (copied === false) throw new Error('clipboard unavailable');
                        if (!disposed) showToast(container, '日志已复制，请留意其中的对话隐私。', false, pageRuntime);
                    } catch {
                        if (!disposed) showToast(container, '复制失败，请展开原文后手动复制。', true, pageRuntime);
                    }
                }
            });
            unsubscribe = log.subscribe(sync);
            sync();
        },
        dispose() {
            disposed = true;
            scroll.captureScroll('logsScrollTop');
            unsubscribe?.();
        },
    };
}
