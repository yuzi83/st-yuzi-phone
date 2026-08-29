const DEFAULT_LAYER_ID = 'yuzi-phone-fullscreen-overlay-layer';
const DEFAULT_LAYER_CLASS = 'yuzi-phone-fullscreen-overlay-layer';

function removeAllChildren(element) {
    if (!element) return;
    if (typeof element.replaceChildren === 'function') {
        element.replaceChildren();
        return;
    }
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * 管理宿主 body 下唯一的 Yuzi 全屏透明浮层。
 *
 * @param {{
 *   documentRef?: Document,
 *   layerId?: string,
 *   layerClassName?: string,
 * }} [options]
 */
export function createFullscreenOverlayLayerRuntime(options = {}) {
    const documentRef = options.documentRef || globalThis.document;
    const layerId = String(options.layerId || DEFAULT_LAYER_ID);
    const layerClassName = String(options.layerClassName || DEFAULT_LAYER_CLASS);
    let disposed = false;
    let layerElement = null;

    const getElement = () => {
        if (disposed) return null;
        if (layerElement?.parentNode) return layerElement;
        layerElement = documentRef?.getElementById?.(layerId) || null;
        return layerElement;
    };

    const mount = () => {
        if (disposed) return null;
        const mounted = getElement();
        if (mounted) {
            mounted.className = layerClassName;
            mounted.setAttribute?.('aria-hidden', 'true');
            mounted.setAttribute?.('role', 'presentation');
            if (documentRef?.body && mounted.parentNode !== documentRef.body) {
                documentRef.body.appendChild(mounted);
            }
            return mounted;
        }
        if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
            return null;
        }

        const element = documentRef.createElement('div');
        element.id = layerId;
        element.className = layerClassName;
        element.setAttribute?.('aria-hidden', 'true');
        element.setAttribute?.('role', 'presentation');
        documentRef.body.appendChild(element);
        layerElement = element;
        return element;
    };

    const clear = () => {
        removeAllChildren(getElement());
    };

    const dispose = () => {
        if (disposed) return;
        const mounted = getElement();
        removeAllChildren(mounted);
        mounted?.remove?.();
        layerElement = null;
        disposed = true;
    };

    return {
        mount,
        getElement,
        clear,
        dispose,
        isMounted: () => Boolean(getElement()?.parentNode),
        isDisposed: () => disposed,
    };
}
