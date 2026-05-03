import { subscribeWorldbookUpdates } from '../worldbook-selection.js';
import { Logger } from '../../../error-handler.js';

const logger = Logger.withScope({ scope: 'settings-app/services/api-prompt-worldbook-runtime/subscription', feature: 'settings-app' });

export function createWorldbookSubscription(ctx = {}) {
    const {
        handleWorldbookUpdate,
    } = ctx;

    let activeCleanup = null;
    let subscriptionToken = 0;
    let disposed = false;

    const runActiveCleanup = () => {
        if (typeof activeCleanup !== 'function') {
            activeCleanup = null;
            return;
        }

        const cleanup = activeCleanup;
        activeCleanup = null;

        try {
            cleanup();
        } catch (error) {
            logger.warn('worldbook subscription cleanup 执行失败', error);
        }
    };

    const cleanupWorldbookSubscription = () => {
        disposed = true;
        subscriptionToken += 1;
        runActiveCleanup();
    };

    const bindWorldbookSubscription = ({ worldbookSelect, syncWorldbookControlStates } = {}) => {
        disposed = false;
        subscriptionToken += 1;
        const currentToken = subscriptionToken;

        runActiveCleanup();

        subscribeWorldbookUpdates(() => handleWorldbookUpdate({ worldbookSelect, syncWorldbookControlStates }))
            .then((cleanup) => {
                if (currentToken !== subscriptionToken || disposed) {
                    if (typeof cleanup === 'function') {
                        try {
                            cleanup();
                        } catch (error) {
                            logger.warn('worldbook subscription 过期 cleanup 执行失败', error);
                        }
                    }
                    return;
                }

                activeCleanup = typeof cleanup === 'function' ? cleanup : null;
            })
            .catch(() => {
                if (currentToken !== subscriptionToken || disposed) {
                    return;
                }
                activeCleanup = null;
            });
    };

    return {
        bindWorldbookSubscription,
        cleanupWorldbookSubscription,
    };
}
