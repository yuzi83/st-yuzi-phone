const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/slash-commands.js',
    hostAdapter: 'modules/slash-commands/host-adapter.js',
    state: 'modules/slash-commands/state.js',
    commandActions: 'modules/slash-commands/command-actions.js',
    commandRegistration: 'modules/slash-commands/command-registration.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function hasExportedFunction(content, functionName) {
    const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`export\\s+(?:async\\s+)?function\\s+${escapedName}\\s*\\(`).test(content);
}

function push(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    push(results, 'facade', '继续导出 registerSlashCommands()', hasExportedFunction(contents.facade, 'registerSlashCommands'));
    push(results, 'facade', '继续导出 unregisterSlashCommands()', hasExportedFunction(contents.facade, 'unregisterSlashCommands'));
    push(results, 'facade', '继续导出 registerCommandHandler()', hasExportedFunction(contents.facade, 'registerCommandHandler'));
    push(results, 'facade', '继续导出 getRegisteredCommands()', hasExportedFunction(contents.facade, 'getRegisteredCommands'));

    push(results, 'hostAdapter', '存在 getSillyTavernSlashCommandRegistrar()', hasExportedFunction(contents.hostAdapter, 'getSillyTavernSlashCommandRegistrar'));
    push(results, 'hostAdapter', '存在 getSillyTavernSlashCommandUnregistrar()', hasExportedFunction(contents.hostAdapter, 'getSillyTavernSlashCommandUnregistrar'));
    push(results, 'hostAdapter', '存在 registerFallbackSlashCommands()', hasExportedFunction(contents.hostAdapter, 'registerFallbackSlashCommands'));
    push(results, 'hostAdapter', '存在 clearFallbackSlashCommands()', hasExportedFunction(contents.hostAdapter, 'clearFallbackSlashCommands'));

    push(results, 'state', '存在 hasSlashCommandsRegistered()', hasExportedFunction(contents.state, 'hasSlashCommandsRegistered'));
    push(results, 'state', '存在 getRegisteredCommandsSnapshot()', hasExportedFunction(contents.state, 'getRegisteredCommandsSnapshot'));
    push(results, 'state', '存在 getCommandHandler()', hasExportedFunction(contents.state, 'getCommandHandler'));
    push(results, 'state', '存在 clearCommandHandlers()', hasExportedFunction(contents.state, 'clearCommandHandlers'));

    push(results, 'commandActions', '存在 handlePhoneCommand()', hasExportedFunction(contents.commandActions, 'handlePhoneCommand'));
    push(results, 'commandActions', '存在 handleTableCommand()', hasExportedFunction(contents.commandActions, 'handleTableCommand'));
    push(results, 'commandActions', '存在 handleSettingsCommand()', hasExportedFunction(contents.commandActions, 'handleSettingsCommand'));
    push(results, 'commandActions', '存在 createFallbackSlashCommands()', hasExportedFunction(contents.commandActions, 'createFallbackSlashCommands'));

    push(results, 'commandRegistration', '存在 registerSlashCommandDefinitions()', hasExportedFunction(contents.commandRegistration, 'registerSlashCommandDefinitions'));
    push(results, 'commandRegistration', '存在 registerFallbackCommandSet()', hasExportedFunction(contents.commandRegistration, 'registerFallbackCommandSet'));
    push(results, 'commandRegistration', '存在 unregisterSlashCommandDefinitions()', hasExportedFunction(contents.commandRegistration, 'unregisterSlashCommandDefinitions'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[slash-commands-contract-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[slash-commands-contract-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
