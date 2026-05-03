import { createRuntimeScrollPreserver } from '../ui-runtime/scroll-preserver-core.js';

export const TABLE_VIEWER_SCROLL_SELECTOR = '.phone-app-body';

export function createTableViewerScrollPreserver(container, state, selector = TABLE_VIEWER_SCROLL_SELECTOR, runtime = null) {
    return createRuntimeScrollPreserver(container, state, selector, runtime);
}
