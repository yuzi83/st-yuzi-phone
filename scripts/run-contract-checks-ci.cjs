const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const CHECK_SCRIPT_PATTERN = /^check-.*\.cjs$/i;

const EXPECTED_FAILED_CHECKS = new Set();

function listCheckScripts() {
    if (!fs.existsSync(SCRIPTS_DIR)) {
        return [];
    }

    return fs.readdirSync(SCRIPTS_DIR)
        .filter((name) => CHECK_SCRIPT_PATTERN.test(name))
        .sort((a, b) => a.localeCompare(b, 'en'));
}

function runCheckScript(scriptName) {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    return {
        scriptName,
        status: Number.isInteger(result.status) ? result.status : 1,
        stdout: String(result.stdout || '').trim(),
        stderr: String(result.stderr || '').trim(),
        error: result.error || null,
    };
}

function printResult(result) {
    const prefix = result.status === 0 ? '[PASS]' : '[FAIL]';
    console.log(`${prefix} ${result.scriptName}`);

    if (result.stdout) {
        console.log(result.stdout);
    }
    if (result.stderr) {
        console.error(result.stderr);
    }
    if (result.error) {
        console.error(result.error);
    }
}

function setDifference(left, right) {
    return [...left].filter((item) => !right.has(item)).sort((a, b) => a.localeCompare(b, 'en'));
}

function assertExpectedFailureBaseline(results) {
    const actualFailedChecks = new Set(results
        .filter((item) => item.status !== 0)
        .map((item) => item.scriptName));

    const unexpectedFailures = setDifference(actualFailedChecks, EXPECTED_FAILED_CHECKS);
    const unexpectedlyPassing = setDifference(EXPECTED_FAILED_CHECKS, actualFailedChecks);

    if (unexpectedFailures.length > 0) {
        console.error('[run-contract-checks-ci] 发现新增 contract 失败：');
        unexpectedFailures.forEach((scriptName) => console.error(`- ${scriptName}`));
    }

    if (unexpectedlyPassing.length > 0) {
        console.error('[run-contract-checks-ci] contract 基线已过期：以下历史失败现在已通过，请从 EXPECTED_FAILED_CHECKS 中移除：');
        unexpectedlyPassing.forEach((scriptName) => console.error(`- ${scriptName}`));
    }

    if (unexpectedFailures.length > 0 || unexpectedlyPassing.length > 0) {
        process.exitCode = 1;
        return false;
    }

    console.log(`[run-contract-checks-ci] contract 基线匹配：${actualFailedChecks.size} 个历史失败，无新增失败`);
    return true;
}

function assertKnownScriptsExist(scripts) {
    const scriptSet = new Set(scripts);
    const missingExpectedFailures = setDifference(EXPECTED_FAILED_CHECKS, scriptSet);

    if (missingExpectedFailures.length === 0) {
        return true;
    }

    console.error('[run-contract-checks-ci] contract 基线引用了不存在的脚本：');
    missingExpectedFailures.forEach((scriptName) => console.error(`- ${scriptName}`));
    process.exitCode = 1;
    return false;
}

function main() {
    const scripts = listCheckScripts();
    if (scripts.length === 0) {
        console.error('[run-contract-checks-ci] 未找到任何 check-*.cjs 脚本');
        process.exitCode = 1;
        return;
    }

    console.log(`[run-contract-checks-ci] 共发现 ${scripts.length} 个 contract 检查脚本`);

    if (!assertKnownScriptsExist(scripts)) {
        return;
    }

    const results = scripts.map(runCheckScript);
    results.forEach(printResult);

    const failed = results.filter((item) => item.status !== 0);
    console.log(`[run-contract-checks-ci] 完成：成功 ${results.length - failed.length} 个，失败 ${failed.length} 个`);

    assertExpectedFailureBaseline(results);
}

main();
