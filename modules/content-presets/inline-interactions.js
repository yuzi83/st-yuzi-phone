/**
 * 为内容预设正文展示提供只影响当前展示的本地交互。
 *
 * 该模块刻意不持有表格、路由或发送消息能力；作者只能展开、切换标签，
 * 或把文本追加到酒馆现有输入框中。
 *
 * @param {object} [options]
 * @param {Document} [options.document=globalThis.document] 注入的宿主文档。
 * @param {() => (HTMLTextAreaElement|HTMLInputElement|null|undefined)} [options.findComposer]
 *   定位当前酒馆输入框的可替换 seam。
 * @param {(type: string, init?: EventInit) => Event} [options.createEvent=Event]
 *   创建 DOM 事件的可替换 seam。
 * @param {{ expanded?: boolean, activeTab?: string|null }} [options.initialState]
 * @param {(state: { expanded: boolean, activeTab: string|null }) => void} [options.onStateChange]
 */
export function createContentPresetInlineInteractions(options = {}) {
    const documentRef = options.document ?? globalThis.document;
    const findComposer = options.findComposer ?? (() => documentRef?.querySelector?.('#send_textarea') ?? null);
    const createEvent = options.createEvent ?? ((type, init) => new Event(type, init));
    const onStateChange = options.onStateChange;
    let state = {
        expanded: options.initialState?.expanded === true,
        activeTab: options.initialState?.activeTab ?? null,
    };

    function snapshot() {
        return { ...state };
    }

    function publish() {
        const nextState = snapshot();
        onStateChange?.(nextState);
        return nextState;
    }

    return {
        getState: snapshot,

        /** 切换展开状态；传入布尔值时设置为指定状态。 */
        expand(nextExpanded) {
            state = { ...state, expanded: typeof nextExpanded === 'boolean' ? nextExpanded : !state.expanded };
            return publish();
        },

        /** 只切换当前正文展示的活动标签。 */
        tab(tabId) {
            state = { ...state, activeTab: tabId ?? null };
            return publish();
        },

        /**
         * 将文本追加到酒馆草稿，不发送消息。
         *
         * @param {string} text
         * @returns {{ ok: true, value: string } | { ok: false, reason: 'composer-not-found' }}
         */
        appendToComposer(text) {
            const composer = findComposer();
            if (!composer || typeof composer.value !== 'string') {
                return { ok: false, reason: 'composer-not-found' };
            }

            composer.value += String(text ?? '');
            const end = composer.value.length;
            composer.selectionStart = end;
            composer.selectionEnd = end;
            composer.dispatchEvent?.(createEvent('input', { bubbles: true }));
            composer.dispatchEvent?.(createEvent('change', { bubbles: true }));
            composer.focus?.();
            return { ok: true, value: composer.value };
        },
    };
}