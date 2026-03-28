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

function push(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    push(results, 'facade', '继续导出 registerSlashCommands()', has(contents.facade, 'export function registerSlashCommands('));
    push(results, 'facade', '继续导出 unregisterSlashCommands()', has(contents.facade, 'export function unregisterSlashCommands('));
    push(results, 'facade', '继续导出 registerCommandHandler()', has(contents.facade, 'export function registerCommandHandler('));
    push(results, 'facade', '继续导出 getRegisteredCommands()', has(contents.facade, 'export function getRegisteredCommands('));

    push(results, 'hostAdapter', '存在 getSillyTavernSlashCommandRegistrar()', has(contents.hostAdapter, 'export function getSillyTavernSlashCommandRegistrar('));
    push(results, 'hostAdapter', '存在 getSillyTavernSlashCommandUnregistrar()', has(contents.hostAdapter, 'export function getSillyTavernSlashCommandUnregistrar('));
    push(results, 'hostAdapter', '存在 registerFallbackSlashCommands()', has(contents.hostAdapter, 'export function registerFallbackSlashCommands('));
    push(results, 'hostAdapter', '存在 clearFallbackSlashCommands()', has(contents.hostAdapter, 'export function clearFallbackSlashCommands('));

    push(results, 'state', '存在 hasSlashCommandsRegistered()', has(contents.state, 'export function hasSlashCommandsRegistered('));
    push(results, 'state', '存在 getRegisteredCommandsSnapshot()', has(contents.state, 'export function getRegisteredCommandsSnapshot('));
    push(results, 'state', '存在 getCommandHandler()', has(contents.state, 'export function getCommandHandler('));
    push(results, 'state', '存在 clearCommandHandlers()', has(contents.state, 'export function clearCommandHandlers('));

    push(results, 'commandActions', '存在 handlePhoneCommand()', has(contents.commandActions, 'export function handlePhoneCommand('));
    push(results, 'commandActions', '存在 handleTableCommand()', has(contents.commandActions, 'export function handleTableCommand('));
    push(results, 'commandActions', '存在 handleSettingsCommand()', has(contents.commandActions, 'export function handleSettingsCommand('));
    push(results, 'commandActions', '存在 createFallbackSlashCommands()', has(contents.commandActions, 'export function createFallbackSlashCommands('));

    push(results, 'commandRegistration', '存在 registerSlashCommandDefinitions()', has(contents.commandRegistration, 'export function registerSlashCommandDefinitions('));
    push(results, 'commandRegistration', '存在 registerFallbackCommandSet()', has(contents.commandRegistration, 'export function registerFallbackCommandSet('));
    push(results, 'commandRegistration', '存在 unregisterSlashCommandDefinitions()', has(contents.commandRegistration, 'export function unregisterSlashCommandDefinitions('));

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
