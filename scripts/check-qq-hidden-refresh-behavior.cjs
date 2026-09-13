const assert = require('node:assert/strict');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
async function main() {
    const { createQQRouteLifecycle } = await import('../modules/qq-v2/ui/route-lifecycle.js');
    let visible = true, notify, activity, reads = 0, renders = 0, mounts = 0, suspends = 0, unsubscribed = 0;
    let slow = null;
    const facade = { query: { async bootstrap() { reads += 1; return slow ? slow.promise : { ok: true, context: { scopeId: 'a' } }; } }, subscribe(fn) { notify = fn; return () => { unsubscribed += 1; }; } };
    const lifecycle = createQQRouteLifecycle({ page: { isConnected: true }, facade,
        isVisible: () => visible, subscribeActivity(fn) { activity = fn; return () => { unsubscribed += 1; }; },
        createApp: () => ({ mount() { mounts += 1; }, refresh() { renders += 1; }, suspend() { suspends += 1; }, destroy() {} }),
    });
    await lifecycle.mount(); await flush();
    visible = false; activity(false);
    const before = reads;
    for (let i = 0; i < 3; i += 1) await notify({ scopeId: 'a' });
    assert.equal(reads, before, '隐藏通知不得读取UI快照'); assert.equal(renders, 0);
    visible = true; activity(true); await flush();
    assert.equal(reads, before + 1); assert.equal(renders, 1); assert.equal(mounts, 1);
    visible = false; activity(false); visible = true; activity(true); await flush();
    assert.equal(renders, 1, '无变化不补刷');
    slow = deferred(); const old = slow;
    const work = notify({ scopeId: 'a' });
    visible = false; activity(false); visible = true; slow = null; activity(true);
    old.resolve({ ok: true, context: { scopeId: 'a' } }); await work; await flush();
    assert.equal(renders, 2, '快速隐藏恢复后只提交新一轮，不提交旧查询');
    assert.ok(suspends >= 3);
    lifecycle.destroy(); assert.equal(unsubscribed, 2);
    await notify({ scopeId: 'a' }); activity(true); await flush(); assert.equal(renders, 2);

    visible = false; reads = 0; mounts = 0;
    const initial = createQQRouteLifecycle({ page: { isConnected: true }, facade, isVisible: () => visible,
        subscribeActivity(fn) { activity = fn; return () => {}; },
        createApp: () => ({ mount() { mounts += 1; }, destroy() {} }),
    });
    await initial.mount(); assert.equal(reads, 0); assert.equal(mounts, 0);
    visible = true; activity(true); await flush(); assert.equal(mounts, 1); initial.destroy();
    visible = true; slow = deferred(); const coldRead = slow; mounts = 0;
    const cold = createQQRouteLifecycle({ page: { isConnected: true }, facade, isVisible: () => visible,
        subscribeActivity(fn) { activity = fn; return () => {}; },
        createApp: () => ({ mount() { mounts += 1; }, destroy() {} }),
    });
    const mounting = cold.mount(); visible = false; activity(false);
    slow = null; coldRead.resolve({ ok: true, context: { scopeId: 'a' } }); await mounting;
    assert.equal(mounts, 0, 'bootstrap进行中隐藏，不得在后台挂载App');
    visible = true; activity(true); await flush(); assert.equal(mounts, 1); cold.destroy();
    const detached = createQQRouteLifecycle({ page: { isConnected: false }, facade,
        createApp: () => ({ mount() { mounts += 1; }, destroy() {} }),
    });
    assert.equal(await detached.mount(), true, '初始页面尚未由路由提交DOM，不得因此永远停在骨架');
    detached.destroy();

    const { getPhoneCoreState, subscribePhoneActivity, notifyPhoneActivity, resetPhoneCoreState } = await import('../modules/phone-core/state.js');
    const { onPhoneDeactivated } = await import('../modules/phone-core/lifecycle.js');
    const state = getPhoneCoreState();
    const states = [];
    const stop = subscribePhoneActivity(value => states.push(value));
    state.isPhoneActive = true;
    onPhoneDeactivated(); assert.deepEqual(states, [false], '外壳停用必须真正发出通知');
    state.isPhoneActive = true; notifyPhoneActivity(); assert.deepEqual(states, [false, true]);
    stop(); notifyPhoneActivity(); assert.equal(states.length, 2);
    const { initSmartRefreshListener, unregisterTableUpdateListener } = await import('../modules/phone-core/callbacks.js');
    let tableUpdate;
    global.window = { AutoCardUpdaterAPI: { registerTableUpdateCallback(fn) { tableUpdate = fn; return true; }, unregisterTableUpdateCallback() { return true; } } };
    global.window.parent = global.window;
    state.isPhoneActive = false; state.currentRoute = 'qq';
    assert.equal(initSmartRefreshListener(), true);
    tableUpdate({}); assert.equal(state.pendingRouteRefresh, false, '无关表格更新不能在恢复时重建QQ页面栈');
    state.currentRoute = 'home'; tableUpdate({}); assert.equal(state.pendingRouteRefresh, true, '首页的表格刷新保持原行为');
    unregisterTableUpdateListener(); resetPhoneCoreState(); delete global.window;
    console.log('[qq-hidden-refresh-behavior] passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
