import { Logger } from '../../error-handler.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/mutation-queue', feature: 'db-api' });

let mutationTail = Promise.resolve();
let pendingMutationCount = 0;
let mutationSequence = 0;

export function enqueueTableMutation(actionName, task) {
    if (typeof task !== 'function') {
        return Promise.resolve(null);
    }

    const safeActionName = String(actionName || 'table-mutation').trim() || 'table-mutation';
    const mutationId = ++mutationSequence;
    pendingMutationCount += 1;

    const runTask = async () => {
        try {
            return await task();
        } catch (error) {
            logger.warn({
                action: 'mutation.run',
                message: '表格写入队列任务失败',
                context: {
                    actionName: safeActionName,
                    mutationId,
                },
                error,
            });
            throw error;
        } finally {
            pendingMutationCount = Math.max(0, pendingMutationCount - 1);
        }
    };

    const current = mutationTail
        .catch(() => undefined)
        .then(runTask);

    mutationTail = current.catch(() => undefined);
    return current;
}

export function hasPendingTableMutations() {
    return pendingMutationCount > 0;
}

export function getPendingTableMutationCount() {
    return pendingMutationCount;
}
