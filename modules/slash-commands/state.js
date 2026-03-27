const commandHandlers = new Map();
let isRegistered = false;
let registeredCommands = [];

export function hasSlashCommandsRegistered() {
    return isRegistered;
}

export function setSlashCommandsRegistered(registered) {
    isRegistered = registered === true;
}

export function addRegisteredCommand(commandName) {
    registeredCommands.push(commandName);
}

export function getRegisteredCommandsSnapshot() {
    return [...registeredCommands];
}

export function clearRegisteredCommands() {
    registeredCommands = [];
}

export function getCommandHandler(commandName) {
    return commandHandlers.get(commandName);
}

export function setCommandHandler(commandName, handler) {
    commandHandlers.set(commandName, handler);
}

export function deleteCommandHandler(commandName) {
    commandHandlers.delete(commandName);
}

export function clearCommandHandlers() {
    commandHandlers.clear();
}
