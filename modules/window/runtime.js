import { createRuntimeScope } from '../runtime-manager.js';

export const DRAG_BOUND_ATTR = 'yuziPhoneDragBound';
export const RESIZE_BOUND_ATTR = 'resizeBound';

let windowInteractionRuntime = createRuntimeScope('phone-window');

export function getWindowInteractionRuntime() {
    return windowInteractionRuntime;
}

export function destroyPhoneWindowInteractions() {
    windowInteractionRuntime.dispose();
    windowInteractionRuntime = createRuntimeScope('phone-window');
}
