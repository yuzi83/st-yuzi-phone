const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FONT_LIBRARY_SERVICE = path.join(
    ROOT,
    'modules/settings-app/services/appearance-settings/font-library-service.js',
);

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function main() {
    const service = read('modules/settings-app/services/appearance-settings/font-library-service.js');

    assert.match(
        service,
        /`#\$\{FONT_CONTAINER_ID\}\[data-yuzi-phone-font-id\] \.yuzi-qq-app \*:not\(svg\)/,
        '字体作用域必须覆盖 QQ 内部普通文字节点',
    );
    assert.match(
        service,
        /#\$\{FONT_CONTAINER_ID\}\[data-yuzi-phone-font-id\] \.yuzi-qq-app :where\(button, input, textarea, select\)/,
        '字体作用域必须明确覆盖 QQ 表单控件字体',
    );

    assert.match(service, /'\.yuzi-phone-fullscreen-overlay-layer'/,
        'body-level overlay must receive the same active font even while the phone is closed');
    assert.match(service, /'\.yuzi-phone-fullscreen-overlay-layer \*:not\(svg\)/,
        'popup fields and barrage content must share the active font without overriding SVG icons');

    console.log(`[qq-font-library-contract] passed: ${FONT_LIBRARY_SERVICE}`);
}

main();