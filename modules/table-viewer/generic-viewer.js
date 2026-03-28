import { createGenericTableViewerRuntime } from './generic-runtime.js';

export function renderGenericTableViewer(container, context, hooks = {}) {
    if (!(container instanceof HTMLElement)) return;

    const viewerRuntime = hooks.viewerRuntime;
    const runtime = createGenericTableViewerRuntime(container, context, {
        ...hooks,
        viewerRuntime,
    });
    if (!runtime) return;

    runtime.start();
}
