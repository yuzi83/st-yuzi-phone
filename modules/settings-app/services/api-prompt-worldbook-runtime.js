import { createWorldbookRenderers } from './api-prompt-worldbook-runtime/renderers.js';
import { createWorldbookStateActions } from './api-prompt-worldbook-runtime/state-actions.js';
import { createWorldbookSubscription } from './api-prompt-worldbook-runtime/subscription.js';

export function createApiPromptWorldbookRuntime(ctx = {}) {
    const renderers = createWorldbookRenderers(ctx);
    const stateActions = createWorldbookStateActions({
        ...ctx,
        ...renderers,
    });
    const {
        bindWorldbookSubscription,
        cleanupWorldbookSubscription,
    } = createWorldbookSubscription({
        handleWorldbookUpdate: stateActions.handleWorldbookUpdate,
    });

    return {
        ...renderers,
        ...stateActions,
        bindWorldbookSubscription,
        cleanupWorldbookSubscription,
    };
}
