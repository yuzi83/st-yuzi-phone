const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'yuzi-contract-runner-'));
const scripts = path.join(fixture, 'scripts');
function run(ci) {
    const entry = path.join(__dirname, ci ? 'run-contract-checks-ci.cjs' : 'run-contract-checks.cjs');
    const result = spawnSync(process.execPath, [entry], { cwd: fixture, encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { status: result.status, output: result.stdout + result.stderr };
}
try {
    // 普通入口允许没有检查；CI 必须防止空跑被误报成功。
    assert.equal(run(false).status, 0);
    assert.equal(run(true).status, 1);
    fs.mkdirSync(scripts);
    assert.equal(run(false).status, 0);
    assert.equal(run(true).status, 1);
    fs.writeFileSync(path.join(scripts, 'helper.cjs'), 'throw new Error("helper must not run");');
    fs.writeFileSync(path.join(scripts, 'check-a.cjs'), 'console.log("first-check");');
    fs.writeFileSync(path.join(scripts, 'check-b.cjs'), 'console.log("second-check");');
    for (const ci of [false, true]) {
        const result = run(ci);
        assert.equal(result.status, 0);
        assert.match(result.output, /成功 2 个，失败 0 个/);
        assert.ok(result.output.indexOf('first-check') < result.output.indexOf('second-check'));
    }
    fs.writeFileSync(path.join(scripts, 'check-a.cjs'), 'console.error("intentional-failure"); process.exitCode = 7;');
    for (const ci of [false, true]) {
        const result = run(ci);
        assert.equal(result.status, 1, '任何检查失败，两种入口都必须失败');
        assert.match(result.output, /intentional-failure/);
        assert.match(result.output, /second-check/, '前项失败仍须执行后续检查');
        assert.match(result.output, /成功 1 个，失败 1 个/);
    }
    console.log('[contract-runner-behavior] 通过：发现、排序、输出、零失败与 CI 空跑保护');
} finally {
    const tempRoot = fs.realpathSync(os.tmpdir());
    const resolved = fs.realpathSync(fixture);
    const relative = path.relative(tempRoot, resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.ok(path.basename(resolved).startsWith('yuzi-contract-runner-'));
    fs.rmSync(resolved, { recursive: true, force: true });
}
