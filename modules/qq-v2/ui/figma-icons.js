const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const QQ_FIGMA_ROOT_ICON_MAP = Object.freeze({
    messages: 'message',
    contacts: 'person',
    assistant: 'channel',
    settings: 'dynamic',
});

export const QQ_FIGMA_TOOL_ICON_MAP = Object.freeze({
    voice: 'voice',
    image: 'image',
    video: 'camera',
    transfer: 'transfer',
    emoji: 'emoji',
    plus: 'plus',
});

const ICON_SPECS = Object.freeze({
    message: Object.freeze([
        Object.freeze({
            tag: 'path',
            attributes: Object.freeze({
                d: 'M12 3.5c-4.9 0-8.8 3-8.8 7.1 0 2.25 1.44 4.28 3.75 5.52-.1 1.24-.52 2.48-1.32 3.38 1.83-.26 3.42-.94 4.53-1.83.6.12 1.21.18 1.84.18 4.9 0 8.8-3 8.8-7.1s-3.9-7.25-8.8-7.25Z',
                fill: 'currentColor',
                stroke: 'none',
            }),
        }),
        Object.freeze({
            tag: 'circle',
            attributes: Object.freeze({ cx: '8.5', cy: '10.7', r: '1.05', fill: 'var(--yuzi-qq-on-accent, #fff)', stroke: 'none' }),
        }),
        Object.freeze({
            tag: 'circle',
            attributes: Object.freeze({ cx: '12', cy: '10.7', r: '1.05', fill: 'var(--yuzi-qq-on-accent, #fff)', stroke: 'none' }),
        }),
        Object.freeze({
            tag: 'circle',
            attributes: Object.freeze({ cx: '15.5', cy: '10.7', r: '1.05', fill: 'var(--yuzi-qq-on-accent, #fff)', stroke: 'none' }),
        }),
    ]),
    channel: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9 3 7 21' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm17 3-2 18' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 9h16' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 15h16' }) }),
    ]),
    person: Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '7.4', r: '3.1' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4.5 19.5c.8-3.3 3.5-5.2 7.5-5.2s6.7 1.9 7.5 5.2' }) }),
    ]),
    dynamic: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M20.5 9.5A8.5 8.5 0 1 0 20 14.5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M20.5 4.5v5h-5' }) }),
    ]),
    voice: Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '9', y: '3.5', width: '6', height: '10', rx: '3' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5.5 11.5a6.5 6.5 0 0 0 13 0' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 18v2.5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.5 20.5h7' }) }),
    ]),
    image: Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3.5', y: '5.5', width: '17', height: '13', rx: '1.6' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '7.5', cy: '9.2', r: '1.2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm4.5 16 4-4 3.1 3 2.4-2.4 5.5 5.3' }) }),
    ]),
    camera: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 7.5h3l1.4-2h5.2l1.4 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '13', r: '3.2' }) }),
    ]),
    transfer: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5.5 7h13v12.5h-13z' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9 7V5.6a3 3 0 0 1 6 0V7' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm9.5 11 2.5 2.3 2.5-2.3' }) }),
    ]),
    emoji: Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '8.5' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '9', cy: '10.2', r: '.8', fill: 'currentColor', stroke: 'none' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '15', cy: '10.2', r: '.8', fill: 'currentColor', stroke: 'none' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.5 14a4.2 4.2 0 0 0 7 0' }) }),
    ]),
    plus: Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '8.5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 8v8' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 12h8' }) }),
    ]),
});

function createSvgElement(documentRef, tagName) {
    if (typeof documentRef?.createElementNS === 'function') {
        return documentRef.createElementNS(SVG_NAMESPACE, tagName);
    }
    if (typeof documentRef?.createElement === 'function') {
        return documentRef.createElement(tagName);
    }
    throw new TypeError('A DOM document is required to create a QQ Figma icon');
}

function applyAttributes(element, attributes) {
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
}

export function createQQFigmaIconElement(name, documentRef = globalThis.document, className = '') {
    const iconName = String(name || '').trim();
    const spec = ICON_SPECS[iconName];
    if (!spec) throw new RangeError(`Unknown QQ Figma icon: ${iconName}`);

    const icon = createSvgElement(documentRef, 'svg');
    applyAttributes(icon, {
        viewBox: '0 0 24 24',
        width: '1em',
        height: '1em',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        'data-qq-figma-icon': iconName,
    });
    if (className && icon.classList) icon.classList.add(...className.split(/\s+/).filter(Boolean));

    spec.forEach(({ tag, attributes }) => {
        const child = createSvgElement(documentRef, tag);
        applyAttributes(child, attributes);
        icon.append(child);
    });
    return icon;
}
