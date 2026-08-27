const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testImagePromptOutputFilterReusesQQTagSemantics() {
    const {
        filterImagePromptOutput,
        normalizeImagePromptOutputFilterSettings,
    } = await importModule('modules/image-generation/prompt-output-filter.js');

    assert.deepEqual(
        normalizeImagePromptOutputFilterSettings({
            promptTranslationExtractTag: '<content>',
            promptTranslationExcludeTags: 'analysis、meta',
        }),
        {
            extractTag: 'content',
            excludeTags: ['analysis', 'meta'],
        },
    );

    assert.equal(
        filterImagePromptOutput(
            '<content>1girl, silver hair\n<analysis>internal</analysis></content>\n<meta>ignore</meta>',
            {
                extractTag: 'content',
                excludeTags: ['meta', 'analysis'],
            },
        ),
        '1girl, silver hair',
    );

    assert.equal(
        filterImagePromptOutput('1girl, silver hair', {
            extractTag: 'content',
            excludeTags: [],
        }),
        '1girl, silver hair',
        'missing extraction tag must preserve the full AI output',
    );
}

testImagePromptOutputFilterReusesQQTagSemantics()
    .then(() => console.log('[image-prompt-output-filter] passed'))
    .catch((error) => {
        console.error('[image-prompt-output-filter] failed');
        console.error(error);
        process.exitCode = 1;
    });
