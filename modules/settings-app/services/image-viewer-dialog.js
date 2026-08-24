import {
    clearPhoneTemporaryLayers,
    getPhoneTemporaryLayerHost,
    mountPhoneTemporaryLayer,
} from '../../phone-core/shell-temporary-layer-host.js';

let viewerSequence = 0;

function asText(value) {
    return String(value ?? '').trim();
}

function scheduleNextFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(callback);
        return;
    }
    callback();
}

function createElement(tagName, className = '') {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
}

export function showImageViewerDialog({ imagePath, altText = '图片预览', runtime = null } = {}) {
    const src = asText(imagePath);
    if (!src || typeof document === 'undefined' || !getPhoneTemporaryLayerHost()) return null;

    clearPhoneTemporaryLayers();

    const titleId = `phone-image-viewer-title-${++viewerSequence}`;
    const overlay = createElement('div', 'phone-image-viewer-overlay');
    const dialog = createElement('section', 'phone-image-viewer-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', titleId);

    const header = createElement('header', 'phone-image-viewer-header');
    const title = createElement('h2', 'phone-image-viewer-title');
    title.id = titleId;
    title.textContent = '查看图片';
    const closeButton = createElement('button', 'phone-image-viewer-close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', '关闭图片查看');
    closeButton.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeButton);

    const stage = createElement('div', 'phone-image-viewer-stage');
    const image = createElement('img', 'phone-image-viewer-image');
    image.src = src;
    image.alt = asText(altText) || '图片预览';
    stage.appendChild(image);
    dialog.appendChild(header);
    dialog.appendChild(stage);
    overlay.appendChild(dialog);

    const cleanups = [];
    let closed = false;
    let disposeLayer = () => {};
    const bind = (target, type, listener, options) => {
        if (!target || typeof target.addEventListener !== 'function') return;
        target.addEventListener(type, listener, options);
        cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    const cleanup = () => {
        cleanups.splice(0).reverse().forEach((dispose) => {
            dispose();
        });
    };
    const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        disposeLayer();
    };

    disposeLayer = mountPhoneTemporaryLayer(overlay, () => {
        if (closed) return;
        closed = true;
        cleanup();
    });
    bind(closeButton, 'click', close);
    bind(overlay, 'click', (event) => {
        if (event.target === overlay) close();
    });
    bind(document, 'keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close();
    });
    runtime?.registerCleanup?.(close);

    scheduleNextFrame(() => {
        if (closed) return;
        overlay.classList.add('is-visible');
        closeButton.focus?.();
    });

    return close;
}
