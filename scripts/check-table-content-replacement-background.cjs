const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
    const moduleUrl = `${pathToFileURL(path.resolve(
        __dirname,
        '..',
        'modules',
        'phone-core',
        'background-services.js',
    )).href}?table-content-replacement-background=${Date.now()}`;
    const background = await import(moduleUrl);
    const logs = [];

    background.__test__setPhoneBackgroundServiceDeps({
        startChronicle: () => true,
        stopChronicle: () => true,
        startSmallCalendar: () => true,
        stopSmallCalendar: () => true,
        startTableContentReplacement: () => { throw new Error('replacement start failure'); },
        stopTableContentReplacement: () => { throw new Error('replacement stop failure'); },
        logger: {
            warn(entry) { logs.push(entry); },
            debug(entry) { logs.push(entry); },
        },
    });

    assert.equal(background.startPhoneBackgroundServices('silent-replacement'), true);
    assert.equal(background.isPhoneBackgroundServicesStarted(), true, '替换旁路失败不能影响既有派生服务');
    background.stopPhoneBackgroundServices('silent-replacement');
    assert.equal(background.isPhoneBackgroundServicesStarted(), false);
    assert.equal(
        logs.some(entry => String(entry?.action || '').includes('table-content-replacement')),
        false,
        '替换旁路生命周期异常不得写入 warning/debug 日志',
    );
    background.__test__resetPhoneBackgroundServices();

    console.log('[通过] 表格内容词汇替换后台静默隔离 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

