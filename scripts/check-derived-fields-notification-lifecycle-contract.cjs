const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_PATH = path.join(ROOT, 'modules/phone-core/derived-fields/derived-field-service.js');
const TABLE_CANDIDATE_RESOLVER_PATH = path.join(ROOT, 'modules/phone-core/derived-fields/table-candidate-resolver.js');
const DERIVED_FIELD_ADAPTERS = [
    {
        path: path.join(ROOT, 'modules/phone-core/derived-fields/small-calendar-derived-fields.js'),
        start: 'startSmallCalendarDerivedFieldsInjection',
        stop: 'stopSmallCalendarDerivedFieldsInjection',
        resolveContext: 'resolveSmallCalendarDerivedFieldsContext',
    },
    {
        path: path.join(ROOT, 'modules/phone-core/derived-fields/chronicle-today-relation.js'),
        start: 'startChronicleTodayRelationInjection',
        stop: 'stopChronicleTodayRelationInjection',
        resolveContext: 'resolveChronicleTodayRelationContext',
    },
];

function assertIncludes(source, needle, message) {
    assert.ok(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
    assert.ok(!source.includes(needle), message);
}

function readSection(source, startNeedle, endNeedle, label) {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start + startNeedle.length);
    assert.ok(start >= 0, `${label} 缺少起点 ${startNeedle}`);
    assert.ok(end > start, `${label} 缺少终点 ${endNeedle}`);
    return source.slice(start, end);
}

const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const tableCandidateResolverSource = fs.readFileSync(TABLE_CANDIDATE_RESOLVER_PATH, 'utf8');

[
    'const DEFAULT_DEBOUNCE_MS = 600;',
    'const DEFAULT_AVAILABILITY_RETRY_MS = 1000;',
    'const DEFAULT_QUERY_RETRY_DELAYS = Object.freeze([1000, 2000, 5000]);',
    'const DEFAULT_MUTATION_RETRY_DELAY_MS = 2000;',
    'const DEFAULT_MAX_MUTATION_ATTEMPTS = 2;',
    'notificationVersion',
    'consumedVersion',
    'generation',
    'runtime.running',
    'runtime.fillActive',
    'while (rounds < 2 && isCurrent(generation))',
    'availabilityTimer',
    'debounceTimer',
    'queryRetryTimer',
    'mutationRetryTimer',
].forEach((needle) => {
    assertIncludes(serviceSource, needle, `共享派生服务缺少调度合同 ${needle}`);
});
assertNotIncludes(serviceSource, 'do {', '共享派生服务不得保留无界 do/while pending runner');
assertNotIncludes(serviceSource, 'MUTATION_RETRY_DELAYS', 'mutation 只能有一次补试延迟，不得复用三段读侧退避数组');
[
    'DEFAULT_PROBE_RETRY_DELAYS',
    'probeRetryDelays',
    'probeRetryIndex',
    'probeTimer',
    'lastProbeErrorKey',
    'scheduleProbeRetry',
    'deps.probe',
    '.probe-failed',
    'hasProbeTimer',
].forEach((needle) => {
    assertNotIncludes(serviceSource, needle, `共享派生服务不得残留 probe 链路：${needle}`);
});

const requestRunSource = readSection(serviceSource, 'function requestRun()', 'function handleFillStart()', 'requestRun');
assertIncludes(requestRunSource, 'runtime.notificationVersion += 1;', '普通通知必须只增加脏版本');
assertIncludes(requestRunSource, 'scheduleDebounce(runtime.generation);', '空闲时的普通通知必须安排合并调度');
assertIncludes(requestRunSource, '!runtime.fillActive', '填表暂停期间普通通知不得直接安排派生任务');
[
    'runtime.mutationAttempts = 0',
    'runtime.mutationCircuitOpen = false',
    'runtime.mutationSourceSignature = null',
    'alignMutationBudget(',
].forEach((needle) => {
    assertNotIncludes(requestRunSource, needle, `普通通知不得重新武装同源 mutation 预算：${needle}`);
});

const availabilitySource = readSection(
    serviceSource,
    'function scheduleAvailabilityRetry(',
    'function scheduleQueryRetry(',
    'scheduleAvailabilityRetry',
);
assertIncludes(availabilitySource, 'availabilityRetryMs', 'runtime availability 必须使用固定短周期等待');
assertIncludes(availabilitySource, 'runtime.availabilityTimer', 'runtime availability 必须由独立 timer 托管');
assertNotIncludes(availabilitySource, 'logger.', 'runtime availability 等待必须静默，不得输出告警');
assertNotIncludes(availabilitySource, 'RetryIndex', 'runtime availability 等待不得消耗有限重试预算');
assertNotIncludes(availabilitySource, 'deps.query', 'runtime availability timer 不得自行执行 SQL');

const runnerSource = readSection(serviceSource, 'async function runRunner(', 'function requestRun()', 'runRunner');
assertIncludes(runnerSource, "status === 'runtime-not-ready'", 'runner 必须识别 runtime-not-ready');
assertIncludes(runnerSource, 'scheduleAvailabilityRetry(generation);', 'runtime-not-ready 必须转入静默 availability 等待');
assertIncludes(runnerSource, "status === 'fill-active'", 'runner 必须识别填表暂停态');
assertNotIncludes(runnerSource, 'probe', 'runner 不得再执行 SQLite probe');

const alignBudgetSource = readSection(serviceSource, 'function alignMutationBudget(', 'function markMutationConfirmed(', 'alignMutationBudget');
assertIncludes(alignBudgetSource, 'if (runtime.mutationSourceSignature === source) return;', '同一 source signature 必须保留现有 mutation 预算');
assertIncludes(alignBudgetSource, 'runtime.mutationSourceSignature = source;', 'source signature 变化时必须记录新业务源');
assertIncludes(alignBudgetSource, 'runtime.mutationAttempts = 0;', 'source signature 变化时必须重新武装 mutation 次数');
assertIncludes(alignBudgetSource, 'runtime.mutationCircuitOpen = false;', 'source signature 变化时必须关闭旧源熔断');

const markConfirmedSource = readSection(serviceSource, 'function markMutationConfirmed(', 'function beginMutationAttempt(', 'markMutationConfirmed');
assertIncludes(markConfirmedSource, 'runtime.pendingConfirmationSourceSignature = null;', '成功确认必须清理 confirmation-only 状态');
assertIncludes(markConfirmedSource, "clearTimer('mutationRetryTimer');", '成功确认必须清理 mutation retry timer');
assertNotIncludes(markConfirmedSource, 'runtime.mutationAttempts = 0;', '成功确认不得重新武装同源 mutation 次数');
assertNotIncludes(markConfirmedSource, 'runtime.mutationCircuitOpen = false;', '成功确认不得关闭同源熔断');

const runPassSource = readSection(serviceSource, 'async function runPass(', 'async function runRound(', 'runPass');
assertIncludes(runPassSource, 'if (pre.pendingUpdateCount === 0)', 'pending_update_count=0 时必须在 mutation 前完成本轮');
assertIncludes(runPassSource, "if (runtime.fillActive) return 'fill-active';", '派生 pass 必须在关键阶段响应 fill-start 暂停');
assert.ok(
    runPassSource.indexOf('if (pre.pendingUpdateCount === 0)') < runPassSource.indexOf('await deps.mutation('),
    'pending_update_count 零写入门必须位于 mutation 调用之前',
);

const markFailedSource = readSection(serviceSource, 'function markMutationFailed(', 'function warnMutationCircuit(', 'markMutationFailed');
assertIncludes(markFailedSource, 'runtime.mutationAttempts >= maxMutationAttempts', '同源 mutation 必须按 maxMutationAttempts 判断预算耗尽');
assertIncludes(markFailedSource, 'runtime.mutationCircuitOpen = true;', '第二次明确失败后必须打开同源熔断');

const scheduleMutationRetrySource = readSection(serviceSource, 'function scheduleMutationRetry(', 'function clearReadFailureState(', 'scheduleMutationRetry');
assertIncludes(scheduleMutationRetrySource, 'markMutationFailed(sourceSignature)', 'mutation 补试前必须消费同源失败预算');
assertIncludes(scheduleMutationRetrySource, 'mutationRetryDelayMs', 'mutation 必须使用单个有限补试延迟');

const fillStartSource = readSection(serviceSource, 'function handleFillStart()', 'function handleTableUpdate()', 'handleFillStart');
assertIncludes(fillStartSource, 'runtime.fillActive = true;', 'fill-start 必须立即暂停派生服务');
['debounceTimer', 'availabilityTimer', 'queryRetryTimer', 'mutationRetryTimer'].forEach((timerName) => {
    assertIncludes(fillStartSource, `clearTimer('${timerName}');`, `fill-start 必须清理 ${timerName}`);
});

const tableUpdateSource = readSection(serviceSource, 'function handleTableUpdate()', 'function clearRuntimeState()', 'handleTableUpdate');
assertIncludes(tableUpdateSource, 'runtime.fillActive = false;', 'table-update 必须解除填表暂停');
assertIncludes(tableUpdateSource, 'clearReadFailureState();', 'table-update 恢复时必须清理旧读失败状态');
assertIncludes(tableUpdateSource, 'requestRun();', 'table-update 恢复后必须重新安排派生计算');

const clearRuntimeSource = readSection(serviceSource, 'function clearRuntimeState()', 'function disposeSubscription(', 'clearRuntimeState');
['debounceTimer', 'availabilityTimer', 'queryRetryTimer', 'mutationRetryTimer'].forEach((timerName) => {
    assertIncludes(clearRuntimeSource, `clearTimer('${timerName}');`, `完整清理必须覆盖 ${timerName}`);
});
['runtime.notificationVersion = 0;', 'runtime.running = false;', 'runtime.fillActive = false;', 'runtime.mutationSourceSignature = null;', 'runtime.mutationAttempts = 0;'].forEach((needle) => {
    assertIncludes(clearRuntimeSource, needle, `完整清理缺少 ${needle}`);
});

const rollbackStartSource = readSection(serviceSource, 'function rollbackFailedStart(', 'function start()', 'rollbackFailedStart');
assertIncludes(rollbackStartSource, 'clearRuntimeState();', '启动失败必须回滚全部运行状态');
assertIncludes(rollbackStartSource, '.start-failed', '启动失败必须记录结构化警告');
assertIncludes(rollbackStartSource, "subscriptions?.update, 'start-rollback-update'", '启动失败必须清理 table-update 订阅');
assertIncludes(rollbackStartSource, "subscriptions?.fillStart, 'start-rollback-fill-start'", '启动失败必须清理 fill-start 订阅');

const startSource = readSection(serviceSource, 'function start()', 'function stop()', 'start');
assertIncludes(startSource, 'try {', '启动订阅必须捕获异常');
assertIncludes(startSource, 'deps.subscribeFillStart(handleFillStart)', '启动必须订阅 fill-start');
assertIncludes(startSource, 'deps.subscribeUpdate(handleTableUpdate)', '启动必须订阅 table-update');
assertIncludes(startSource, "'invalid-fill-start-disposer'", '启动必须拒绝无效 fill-start disposer');
assertIncludes(startSource, "'invalid-update-disposer'", '启动必须拒绝无效 update disposer');
assertIncludes(startSource, 'rollbackFailedStart(', '任一启动失败必须统一回滚');
assertIncludes(startSource, 'requestRun();', '两个订阅成功后必须安排首次运行');

const stopSource = readSection(serviceSource, 'function stop()', 'function setDeps(', 'stop');
assertIncludes(stopSource, "disposeSubscription(unsubscribeUpdate, 'stop-update'", 'stop 必须清理 table-update 订阅');
assertIncludes(stopSource, "disposeSubscription(unsubscribeFillStart, 'stop-fill-start'", 'stop 必须清理 fill-start 订阅');
assertIncludes(stopSource, 'clearRuntimeState();', '两个 disposer 执行后必须清理全部运行状态');

const getStateSource = readSection(serviceSource, 'function getState()', 'return Object.freeze(', 'getState');
assertIncludes(getStateSource, 'hasAvailabilityTimer', '测试状态必须暴露 availability timer');
assertNotIncludes(getStateSource, 'hasProbeTimer', '测试状态不得继续暴露 probe timer');

[
    'getTableAvailability',
    'queryTableRows',
    'runtime_not_ready',
    'runtime.shouldPause?.()',
    'table_not_found',
    'limit: 1',
].forEach((needle) => assertIncludes(tableCandidateResolverSource, needle, `候选表选择器缺少派生字段适配合同 ${needle}`));

for (const adapter of DERIVED_FIELD_ADAPTERS) {
    const source = fs.readFileSync(adapter.path, 'utf8');
    const basename = path.basename(adapter.path);
    [
        'createDerivedFieldService',
        'readDerivedField',
        'querySqlViaApi',
        'queryTableRowsViaApi',
        'executeSqlMutationViaApi',
        'subscribeTableUpdate',
        'subscribeTableFillStart',
        'resolveFirstAvailableTableCandidate',
        adapter.resolveContext,
        'source_signature',
        'input_signature',
        'pending_update_count',
        'maxMutationAttempts: 2',
        adapter.start,
        adapter.stop,
    ].forEach((needle) => assertIncludes(source, needle, `${basename} 缺少共享调度适配合同 ${needle}`));
    ['probeSqliteCapabilityViaApi', 'probeFailed', 'probe:', 'notificationVersion', 'runtime.running', 'scheduleDebounce', 'probeTimer', 'debounceTimer'].forEach((needle) => {
        assertNotIncludes(source, needle, `${basename} 不得重新复制共享调度实现 ${needle}`);
    });
}

const callbacks = fs.readFileSync(path.join(ROOT, 'modules/phone-core/callbacks.js'), 'utf8');
assertIncludes(callbacks, 'export function subscribeTableUpdate(callback)', 'callbacks 必须提供 table-update 多订阅入口');
assertIncludes(callbacks, 'export function subscribeTableFillStart(callback)', 'callbacks 必须提供 fill-start 多订阅入口');
assert.ok(callbacks.includes('.forEach') || callbacks.includes('for (const'), '原始回调必须继续逐订阅者分发');
console.log('[通过] 派生字段通知生命周期合同：1000ms runtime availability 静默等待、禁止 probe、fill-start 暂停/table-update 恢复、双订阅回滚与完整清理');
