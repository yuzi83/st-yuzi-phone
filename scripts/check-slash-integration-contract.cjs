const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    index: 'index.js',
    slashFacade: 'modules/slash-commands.js',
    commandRegistry: 'modules/bootstrap/command-registry.js',
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

    check(results, 'index', '继续从 slash façade 导入 registerSlashCommands()', has(contents.index, 'registerSlashCommands,'));
    check(results, 'index', '继续从 slash façade 导入 unregisterSlashCommands()', has(contents.index, 'unregisterSlashCommands,'));
    check(results, 'index', '继续从 slash façade 导入 registerCommandHandler()', has(contents.index, 'registerCommandHandler,'));
    check(results, 'index', '继续导入 registerPhoneSlashCommandHandlers()', has(contents.index, 'registerPhoneSlashCommandHandlers'));

    check(results, 'commandRegistry', '继续绑定 phone-action handler', has(contents.commandRegistry, "registerCommandHandler('phone-action',"));
    check(results, 'commandRegistry', '继续绑定 open-table handler', has(contents.commandRegistry, "registerCommandHandler('open-table',"));
    check(results, 'commandRegistry', '继续绑定 list-tables handler', has(contents.commandRegistry, "registerCommandHandler('list-tables',"));
    check(results, 'commandRegistry', '继续绑定 reset-settings handler', has(contents.commandRegistry, "registerCommandHandler('reset-settings',"));
    check(results, 'commandRegistry', '继续绑定 export-settings handler', has(contents.commandRegistry, "registerCommandHandler('export-settings',"));
    check(results, 'commandRegistry', '继续暴露 registerPhoneSlashCommandHandlers()', has(contents.commandRegistry, 'export function registerPhoneSlashCommandHandlers('));

    check(results, 'index', '继续在初始化链注册 Slash 命令', has(contents.index, 'if (registerSlashCommands()) {'));
    check(results, 'index', '继续在初始化链装配 setupSlashCommandHandlers()', has(contents.index, 'setupSlashCommandHandlers();'));
    check(results, 'index', 'setupSlashCommandHandlers() 继续委托 command registry', has(contents.index, 'return registerPhoneSlashCommandHandlers({'));
    check(results, 'index', '继续在卸载链注销 Slash 命令', has(contents.index, 'unregisterSlashCommands();'));

    check(results, 'slashFacade', '继续暴露 registerSlashCommands()', has(contents.slashFacade, 'export function registerSlashCommands('));
    check(results, 'slashFacade', '继续暴露 unregisterSlashCommands()', has(contents.slashFacade, 'export function unregisterSlashCommands('));
    check(results, 'slashFacade', '继续暴露 registerCommandHandler()', has(contents.slashFacade, 'export function registerCommandHandler('));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[slash-integration-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[slash-integration-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
