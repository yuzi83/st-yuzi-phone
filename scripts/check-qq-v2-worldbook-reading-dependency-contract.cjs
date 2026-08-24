const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();

function source(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertExcludes(relativePath, forbidden) {
    const text = source(relativePath);
    for (const token of forbidden) {
        assert.equal(
            text.includes(token),
            false,
            `${relativePath} must not retain the legacy QQ worldbook dependency: ${token}`,
        );
    }
}

function testQQWorldbookReadingDoesNotDependOnHostActivationSnapshots() {
    for (const obsoleteModule of [
        'modules/qq-v2/prompt/worldbook-context.js',
        'modules/qq-v2/prompt/st-worldbook-context.js',
    ]) {
        assert.equal(
            fs.existsSync(path.join(ROOT, obsoleteModule)),
            false,
            `${obsoleteModule} must be removed with the legacy QQ worldbook reader`,
        );
    }
    assertExcludes('modules/qq-v2/application/production-runtime.js', [
        'createQQV2SillyTavernWorldbookContextGateway',
        'resolveQQV2WorldbookContext',
        'worldbookContextGateway',
        'activationSnapshots',
        'onWorldInfoActivated',
        'handleWorldInfoActivated',
        'getWorldInfoLifecycle',
    ]);
    assertExcludes('modules/qq-v2/runtime/runtime.js', [
        'onWorldInfoActivated',
        'handleWorldInfoActivated',
        'getWorldInfoLifecycle',
        'worldbookLifecycle',
    ]);
    assertExcludes('modules/qq-v2/runtime/default-runtime.js', [
        'handleWorldInfoActivated',
        'handleQQV2WorldInfoActivated',
        'getWorldInfoLifecycle',
        'getQQV2WorldInfoLifecycle',
    ]);
    assertExcludes('modules/bootstrap/event-registry.js', [
        'onWorldInfoActivated',
        'onQQV2WorldInfoActivated',
    ]);
    assertExcludes('index.js', ['handleQQV2WorldInfoActivated', 'onQQV2WorldInfoActivated']);
}

testQQWorldbookReadingDoesNotDependOnHostActivationSnapshots();
console.log('[qq-v2-worldbook-reading-dependency-contract] passed');
