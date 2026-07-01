const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ROUTE_RENDERER = 'modules/phone-core/route-renderer.js';
const source = fs.readFileSync(path.join(ROOT, ROUTE_RENDERER), 'utf8');

function functionBlock(functionName) {
    const startNeedle = `function ${functionName}(`;
    const start = source.indexOf(startNeedle);
    assert.notEqual(start, -1, `${functionName}() should exist`);

    const nextFunction = source.indexOf('\nfunction ', start + startNeedle.length);
    const nextExport = source.indexOf('\nexport ', start + startNeedle.length);
    const candidates = [nextFunction, nextExport].filter((index) => index !== -1);
    const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
    return source.slice(start, end);
}

function assertSourceIncludes(description, snippet) {
    assert.ok(source.includes(snippet), description);
}

function main() {
    assertSourceIncludes(
        'route renderer should enumerate direct screen children instead of querying nested page content',
        'Array.from(screen.children)',
    );
    assertSourceIncludes(
        'route renderer should only clean direct phone-page children',
        "child.classList.contains('phone-page')",
    );
    assertSourceIncludes(
        'route render context should use the latest committed phone page as oldContent',
        'oldContent: getCurrentRoutePage(screen),',
    );

    const previousRemovalBlock = functionBlock('schedulePreviousPageRemoval');
    assert.ok(
        previousRemovalBlock.includes('if (!oldContent.isConnected) return;'),
        'previous page removal should only depend on the old page still being connected',
    );
    assert.ok(
        !previousRemovalBlock.includes('isActiveRouteRender(renderToken)'),
        'previous page removal must not be cancelled by a newer render token',
    );
    assert.ok(
        !previousRemovalBlock.includes('renderToken'),
        'previous page removal should not accept or use renderToken',
    );

    const commitBlock = functionBlock('commitRoutePage');
    assert.ok(
        commitBlock.includes('removeStaleRoutePages(screen, [oldContent, page]);'),
        'committing a page should prune stale phone-page siblings',
    );
    assert.ok(
        commitBlock.includes('schedulePreviousPageRemoval(oldContent, exitClass);'),
        'commit should schedule previous page removal without a render token',
    );

    const scheduleBlock = functionBlock('scheduleRouteCommit');
    const skipLogIndex = scheduleBlock.indexOf("action: 'commit.schedule.skip'");
    assert.notEqual(skipLogIndex, -1, 'scheduled commit skip log should still exist');
    assert.ok(
        scheduleBlock.slice(Math.max(0, skipLogIndex - 120), skipLogIndex).includes('logger.debug({'),
        'scheduled commit skip should be logged at debug level because stale delayed commits are expected',
    );

    console.log('[route-renderer-page-cleanup-check] passed');
    console.log(`- OK | ${ROUTE_RENDERER} keeps oldContent aligned with latest direct .phone-page`);
    console.log(`- OK | ${ROUTE_RENDERER} removes stale .phone-page siblings on commit`);
    console.log(`- OK | ${ROUTE_RENDERER} does not cancel previous-page removal with stale render tokens`);
}

main();
