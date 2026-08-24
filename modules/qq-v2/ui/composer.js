function asText(value) {
    return String(value ?? '');
}

function cssPixelValue(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function createDefaultComposerHeightMeasurer() {
    let ownerDocument = null;
    let mirror = null;

    const dispose = () => {
        mirror?.remove?.();
        mirror = null;
        ownerDocument = null;
    };

    const ensureMirror = (input) => {
        const nextDocument = input?.ownerDocument;
        if (!nextDocument?.body?.append || typeof nextDocument.createElement !== 'function') return null;
        if (mirror && ownerDocument === nextDocument) return mirror;
        dispose();
        ownerDocument = nextDocument;
        mirror = ownerDocument.createElement('textarea');
        mirror.setAttribute('aria-hidden', 'true');
        mirror.setAttribute('data-yuzi-qq-composer-height-measurer', '');
        mirror.tabIndex = -1;
        mirror.wrap = 'soft';
        ownerDocument.body.append(mirror);
        return mirror;
    };

    const measure = (input, computedStyle = {}) => {
        const target = ensureMirror(input);
        if (!target) return Number(input?.scrollHeight) || 0;

        const measuredWidth = Number(input?.getBoundingClientRect?.().width);
        const width = Number.isFinite(measuredWidth) && measuredWidth > 0
            ? measuredWidth
            : cssPixelValue(computedStyle.width, 0);
        Object.assign(target.style, {
            position: 'fixed',
            inset: '0 auto auto -100000px',
            zIndex: '-1',
            visibility: 'hidden',
            pointerEvents: 'none',
            boxSizing: computedStyle.boxSizing || 'border-box',
            width: `${Math.max(0, width)}px`,
            height: '0px',
            minHeight: '0px',
            maxHeight: 'none',
            margin: '0',
            overflow: 'hidden',
            paddingBlockStart: computedStyle.paddingBlockStart || computedStyle.paddingTop || '0px',
            paddingBlockEnd: computedStyle.paddingBlockEnd || computedStyle.paddingBottom || '0px',
            paddingInlineStart: computedStyle.paddingInlineStart || computedStyle.paddingLeft || '0px',
            paddingInlineEnd: computedStyle.paddingInlineEnd || computedStyle.paddingRight || '0px',
            borderBlockStartWidth: computedStyle.borderBlockStartWidth || computedStyle.borderTopWidth || '0px',
            borderBlockEndWidth: computedStyle.borderBlockEndWidth || computedStyle.borderBottomWidth || '0px',
            borderInlineStartWidth: computedStyle.borderInlineStartWidth || computedStyle.borderLeftWidth || '0px',
            borderInlineEndWidth: computedStyle.borderInlineEndWidth || computedStyle.borderRightWidth || '0px',
            borderStyle: computedStyle.borderStyle || 'solid',
            font: computedStyle.font || '',
            fontFamily: computedStyle.fontFamily || '',
            fontSize: computedStyle.fontSize || '',
            fontStyle: computedStyle.fontStyle || '',
            fontWeight: computedStyle.fontWeight || '',
            lineHeight: computedStyle.lineHeight || '',
            letterSpacing: computedStyle.letterSpacing || '',
            tabSize: computedStyle.tabSize || '',
            textIndent: computedStyle.textIndent || '',
            textTransform: computedStyle.textTransform || '',
            whiteSpace: computedStyle.whiteSpace || 'pre-wrap',
            wordBreak: computedStyle.wordBreak || 'break-word',
            overflowWrap: computedStyle.overflowWrap || 'break-word',
        });
        target.value = asText(input?.value);
        return Number(target.scrollHeight) || 0;
    };

    return Object.freeze({ measure, dispose });
}

export function createComposerAutoHeightController({
    requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame = (frameId) => globalThis.cancelAnimationFrame(frameId),
    getComputedStyle = (element) => globalThis.getComputedStyle(element),
    measureContentHeight,
} = {}) {
    let disposed = false;
    let frameId = null;
    let pendingInput = null;
    const defaultMeasurer = typeof measureContentHeight === 'function'
        ? null
        : createDefaultComposerHeightMeasurer();
    const measure = measureContentHeight || defaultMeasurer.measure;

    const cancel = () => {
        pendingInput = null;
        if (frameId === null) return false;
        cancelFrame(frameId);
        frameId = null;
        return true;
    };

    const flush = () => {
        const input = pendingInput;
        pendingInput = null;
        frameId = null;
        if (disposed || !input || input.isConnected === false) return;
        const computedStyle = getComputedStyle(input);
        const minHeight = Math.max(0, cssPixelValue(computedStyle?.minHeight, 0));
        const maxHeight = Math.max(minHeight, cssPixelValue(computedStyle?.maxHeight, Number.POSITIVE_INFINITY));
        const contentHeight = Math.max(0, Number(measure(input, computedStyle)) || 0);
        const nextHeight = Math.ceil(Math.min(maxHeight, Math.max(minHeight, contentHeight)));
        const currentHeight = cssPixelValue(computedStyle?.height, 0);
        const nextOverflow = contentHeight > maxHeight ? 'auto' : 'hidden';

        if (Math.abs(nextHeight - currentHeight) >= 0.5) {
            input.style.height = `${nextHeight}px`;
        }
        if (computedStyle?.overflowY !== nextOverflow) {
            input.style.overflowY = nextOverflow;
        }
    };

    return Object.freeze({
        schedule(input) {
            if (disposed || !input) return false;
            pendingInput = input;
            if (frameId !== null) return false;
            frameId = requestFrame(flush);
            return true;
        },
        cancel,
        dispose() {
            if (disposed) return;
            disposed = true;
            cancel();
            defaultMeasurer?.dispose();
        },
    });
}

/**
 * Validate the draft without rewriting what the user typed. Whitespace-only
 * drafts are rejected, while non-empty drafts retain their original content.
 */
export function normalizeComposerSubmission(value) {
    const content = asText(value);
    if (!content.trim()) return Object.freeze({ ok: false, reason: 'empty', content: '' });
    return Object.freeze({ ok: true, reason: '', content });
}

export function shouldSubmitComposerKey(event = {}) {
    return event.key === 'Enter'
        && event.shiftKey !== true
        && event.isComposing !== true;
}
