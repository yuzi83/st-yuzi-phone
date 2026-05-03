import { createRuntimeScrollPreserver } from '../../ui-runtime/scroll-preserver-core.js';

export const SETTINGS_SCROLL_SELECTOR = '.phone-app-body.phone-settings-scroll';

export function createScrollPreserver(container, state, selector = SETTINGS_SCROLL_SELECTOR, runtime = null) {
    return createRuntimeScrollPreserver(container, state, selector, runtime);
}
