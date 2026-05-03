const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const CHECK_SCRIPT_PATTERN = /^check-.*\.cjs$/i;

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

function main() {
    const scripts = listCheckScripts();
    if (scripts.length === 0) {
        console.log('[run-contract-checks] 未找到任何 check-*.cjs 脚本');
        return;
    }

    console.log(`[run-contract-checks] 共发现 ${scripts.length} 个 contract 检查脚本`);

    const results = scripts.map(runCheckScript);
    results.forEach(printResult);

    const failed = results.filter((item) => item.status !== 0);
    console.log(`[run-contract-checks] 完成：成功 ${results.length - failed.length} 个，失败 ${failed.length} 个`);

    if (failed.length > 0) {
        console.error('[run-contract-checks] 失败脚本：');
        failed.forEach((item) => {
            console.error(`- ${item.scriptName}`);
        });
        process.exitCode = 1;
    }
}

main();
