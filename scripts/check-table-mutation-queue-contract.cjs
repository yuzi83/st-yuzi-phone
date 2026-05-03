const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    repository: 'modules/phone-core/data-api/table-repository.js',
    queue: 'modules/phone-core/data-api/mutation-queue.js',
    projection: 'modules/phone-core/chat-support/message-projection.js',
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

    check(results, 'queue', 'mutation queue 暴露 enqueueTableMutation()', has(contents.queue, 'export function enqueueTableMutation('));
    check(results, 'queue', 'mutation queue 暴露 hasPendingTableMutations()', has(contents.queue, 'export function hasPendingTableMutations('));
    check(results, 'queue', 'mutation queue 暴露 getPendingTableMutationCount()', has(contents.queue, 'export function getPendingTableMutationCount('));

    check(results, 'repository', 'table-repository 导入 mutation-queue', has(contents.repository, "from './mutation-queue.js';"));
    check(results, 'repository', 'saveTableData() 通过 enqueueTableMutation 串行化', has(contents.repository, "return enqueueTableMutation('saveTableData'"));
    check(results, 'repository', 'updateTableCell() 通过 enqueueTableMutation 串行化', has(contents.repository, "return enqueueTableMutation('updateTableCell'"));
    check(results, 'repository', 'updateTableRow() 通过 enqueueTableMutation 串行化', has(contents.repository, "return enqueueTableMutation('updateTableRow'"));
    check(results, 'repository', 'insertTableRow() 通过 enqueueTableMutation 串行化', has(contents.repository, "return enqueueTableMutation('insertTableRow'"));
    check(results, 'repository', 'deleteTableRowViaApi() 通过 enqueueTableMutation 串行化', has(contents.repository, "return enqueueTableMutation('deleteTableRowViaApi'"));

    check(results, 'projection', 'message-projection 仍通过 data-api facade 使用写接口', has(contents.projection, "from '../data-api.js';"));
    check(results, 'projection', 'message-projection 继续使用 insertTableRow()', has(contents.projection, 'insertTableRow('));
    check(results, 'projection', 'message-projection 继续使用 updateTableRow()', has(contents.projection, 'updateTableRow('));
    check(results, 'projection', 'message-projection 继续使用 saveTableData()', has(contents.projection, 'saveTableData('));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[table-mutation-queue-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[table-mutation-queue-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
