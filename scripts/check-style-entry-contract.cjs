const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    entry: 'style.css',
    base: 'styles/01-phone-base.css',
    readme: 'styles/README.md',
    phoneBaseReadme: 'styles/phone-base/README.md',
    legacyReadme: 'styles/legacy/README.md',
    legacyPhoneBaseReadme: 'styles/legacy/phone-base/README.md',
    tableLegacy: 'styles/phone-base/03-table-legacy.css',
    settingsLegacy: 'styles/phone-base/04-settings-legacy.css',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'entry', '顶层入口继续导入 shell layer', has(contents.entry, "@import url('./styles/00-phone-shell.css');"));
    check(results, 'entry', '顶层入口继续导入 base layer', has(contents.entry, "@import url('./styles/01-phone-base.css');"));
    check(results, 'entry', '顶层入口继续导入 nav/detail layer', has(contents.entry, "@import url('./styles/02-phone-nav-detail.css');"));
    check(results, 'entry', '顶层入口继续导入 special base layer', has(contents.entry, "@import url('./styles/03-phone-special-base.css');"));
    check(results, 'entry', '顶层入口继续导入 special interactions layer', has(contents.entry, "@import url('./styles/04-phone-special-interactions.css');"));
    check(results, 'entry', '顶层入口继续导入 generic template layer', has(contents.entry, "@import url('./styles/05-phone-generic-template.css');"));
    check(results, 'entry', '顶层入口声明 shell / base / special / generic 分层说明', has(contents.entry, 'Layer map'));

    check(results, 'base', 'base 入口继续声明 Active modern layers', has(contents.base, 'Active modern layers'));
    check(results, 'base', 'base 入口继续声明 Legacy archive', has(contents.base, 'Legacy archive'));
    check(results, 'base', 'base 入口继续导入 tokens', has(contents.base, "@import url('./phone-base/00-phone-tokens.css');"));
    check(results, 'base', 'base 入口继续导入 shell system', has(contents.base, "@import url('./phone-base/01-shell-system.css');"));
    check(results, 'base', 'base 入口继续导入 settings modern', has(contents.base, "@import url('./phone-base/07-settings-modern.css');"));
    check(results, 'base', 'base 入口继续导入 table manage detail', has(contents.base, "@import url('./phone-base/09-table-manage-detail.css');"));
    check(results, 'base', 'base 入口继续导入 scroll patches', has(contents.base, "@import url('./phone-base/10-scroll-generic-patches.css');"));
    check(results, 'base', 'base 入口不再默认加载 table legacy', !has(contents.base, "@import url('./phone-base/03-table-legacy.css');"));
    check(results, 'base', 'base 入口不再默认加载 settings legacy', !has(contents.base, "@import url('./phone-base/04-settings-legacy.css');"));

    check(results, 'readme', 'styles README 说明顶层入口', has(contents.readme, '## 顶层入口'));
    check(results, 'readme', 'styles README 说明 legacy archive', has(contents.readme, '## phone-base 子目录'));
    check(results, 'readme', 'styles README 指向 phone-base README', has(contents.readme, '`styles/phone-base/README.md`'));
    check(results, 'readme', 'styles README 指向 legacy README', has(contents.readme, '`styles/legacy/README.md`'));
    check(results, 'readme', 'styles README 指向 legacy phone-base README', has(contents.readme, '`styles/legacy/phone-base/README.md`'));
    check(results, 'readme', 'styles README 说明收口原则', has(contents.readme, '## 当前收口原则'));

    check(results, 'phoneBaseReadme', 'phone-base README 说明 modern active', has(contents.phoneBaseReadme, '## modern active'));
    check(results, 'phoneBaseReadme', 'phone-base README 说明 legacy archive', has(contents.phoneBaseReadme, '## legacy archive'));
    check(results, 'phoneBaseReadme', 'phone-base README 标注 table legacy 替代层', has(contents.phoneBaseReadme, '09-table-manage-detail.css'));
    check(results, 'phoneBaseReadme', 'phone-base README 标注 settings legacy 替代层', has(contents.phoneBaseReadme, '07-settings-modern.css'));
    check(results, 'phoneBaseReadme', 'phone-base README 指向目标 legacy 目录', has(contents.phoneBaseReadme, 'styles/legacy/phone-base/'));

    check(results, 'legacyReadme', 'legacy README 说明当前状态', has(contents.legacyReadme, '## 当前状态'));
    check(results, 'legacyReadme', 'legacy README 说明迁移原则', has(contents.legacyReadme, '## 迁移原则'));
    check(results, 'legacyPhoneBaseReadme', 'legacy phone-base README 说明未来迁移顺序', has(contents.legacyPhoneBaseReadme, '## 未来迁移顺序'));
    check(results, 'legacyPhoneBaseReadme', 'legacy phone-base README 标注 table legacy 文件', has(contents.legacyPhoneBaseReadme, '03-table-legacy.css'));
    check(results, 'legacyPhoneBaseReadme', 'legacy phone-base README 标注 settings legacy 文件', has(contents.legacyPhoneBaseReadme, '04-settings-legacy.css'));

    check(results, 'tableLegacy', 'table legacy 文件声明 Legacy archive', has(contents.tableLegacy, 'Legacy archive'));
    check(results, 'tableLegacy', 'table legacy 文件标注默认不加载', has(contents.tableLegacy, '默认不加载'));
    check(results, 'tableLegacy', 'table legacy 文件标注目标归档路径', has(contents.tableLegacy, 'styles/legacy/phone-base/03-table-legacy.css'));
    check(results, 'settingsLegacy', 'settings legacy 文件声明 Legacy archive', has(contents.settingsLegacy, 'Legacy archive'));
    check(results, 'settingsLegacy', 'settings legacy 文件标注默认不加载', has(contents.settingsLegacy, '默认不加载'));
    check(results, 'settingsLegacy', 'settings legacy 文件标注目标归档路径', has(contents.settingsLegacy, 'styles/legacy/phone-base/04-settings-legacy.css'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[style-entry-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[style-entry-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
