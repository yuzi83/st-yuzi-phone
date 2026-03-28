import { subscribeWorldbookUpdates } from '../worldbook-selection.js';

export function createWorldbookSubscription(ctx = {}) {
    const {
        state,
        handleWorldbookUpdate,
    } = ctx;

    const bindWorldbookSubscription = ({ worldbookSelect, syncWorldbookControlStates } = {}) => {
        if (typeof state.worldbookEventCleanup === 'function') {
            state.worldbookEventCleanup();
            state.worldbookEventCleanup = null;
        }

        subscribeWorldbookUpdates(() => handleWorldbookUpdate({ worldbookSelect, syncWorldbookControlStates }))
            .then((cleanup) => {
                state.worldbookEventCleanup = typeof cleanup === 'function' ? cleanup : null;
            })
            .catch(() => {
                state.worldbookEventCleanup = null;
            });
    };

    return {
        bindWorldbookSubscription,
    };
}
