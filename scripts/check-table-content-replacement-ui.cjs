const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
    const modulePath = path.resolve(
        __dirname,
        '..',
        'modules',
        'settings-app',
        'layout',
        'page-builders',
        'table-content-replacement-builders.js',
    );
    const { buildTableContentReplacementPageHtml } = await import(pathToFileURL(modulePath).href);
    const styles = fs.readFileSync(path.resolve(__dirname, '..', 'styles', '14-table-content-replacement.css'), 'utf8');

    const html = buildTableContentReplacementPageHtml({
        config: {
            global: {
                enabled: true,
                rules: [{ id: 'g1', source: '你好', target: '不好' }],
            },
            tableRules: [{
                mappingId: 'm1',
                sheetKey: 'sheet_1',
                tableNameSnapshot: '纪要',
                enabled: false,
                rules: [{ id: 't1', source: '旧词', target: '新词' }],
            }],
        },
        tables: [{
            sheetKey: 'sheet_1',
            tableName: '纪要',
            status: 'available',
            headers: ['row_id', '内容'],
        }],
        tableRules: [{
            mappingId: 'm1',
            sheetKey: 'sheet_1',
            tableName: '纪要',
            status: 'available',
            tableNameSnapshot: '纪要',
            enabled: false,
            rules: [{ id: 't1', source: '旧词', target: '新词' }],
        }],
        activeConfig: {
            global: {
                enabled: true,
                rules: [{ id: 'active-global', source: '启用', target: '运行' }],
            },
            tableRules: [{
                mappingId: 'm2',
                sheetKey: 'sheet_2',
                tableNameSnapshot: '其他',
                enabled: true,
                rules: [{ id: 'active-table', source: '旧词', target: '新词' }],
            }],
        },
        errors: { global: {}, mappings: {} },
    });

    const runningSummary = html.match(/<section class="phone-table-content-replacement-running-summary">([\s\S]*?)<\/section>/u)?.[1] || '';
    assert.ok(html.includes('表格内容词汇替换'), '页面标题必须使用最终确认名称');
    assert.ok(runningSummary, '页面顶部必须提供当前运行规则总览');
    assert.ok(runningSummary.includes('data-running-rule-scope="global"'), '运行规则总览必须显示已启用的全局规则');
    assert.ok(runningSummary.includes('data-running-rule-scope="table"'), '运行规则总览必须显示已启用的单表规则');
    assert.ok(runningSummary.includes('启用') && runningSummary.includes('运行'), '运行规则总览必须显示全局替换内容');
    assert.ok(runningSummary.includes('旧词') && runningSummary.includes('新词'), '运行规则总览必须显示单表替换内容');
    assert.ok(styles.includes('.phone-table-content-replacement-running-summary'), '运行规则总览必须有独立卡片样式');
    assert.ok(styles.includes('.phone-table-content-replacement-running-item'), '运行规则总览必须有清爽的只读规则行样式');
    assert.ok(html.includes('phone-table-content-replacement-global-enabled'), '必须提供全局区域开关');
    assert.ok(html.includes('phone-table-content-replacement-mapping-enabled'), '必须提供单表区域开关');
    assert.ok(html.includes('data-action="save-global"'), '必须提供全局区域保存按钮');
    assert.ok(html.includes('data-action="save-table"'), '必须提供单表区域保存按钮');
    assert.ok(html.includes('data-action="add-global-rule"'), '必须提供新增全局规则入口');
    assert.ok(html.includes('data-action="add-table-rule"'), '必须提供新增单表规则入口');
    assert.ok(html.includes('textarea'), '规则内容必须使用 textarea 保留空格和换行');
    assert.ok((html.match(/class="phone-settings-textarea/g) || []).length >= 4, '规则 textarea 必须复用设置页全局表单主题 class');
    assert.ok(html.includes('class="phone-settings-select phone-table-content-replacement-table-select"'), '表格选择框必须复用设置页全局 select 主题 class');
    assert.ok(html.includes('data-action="add-table"'), '必须提供添加表格入口');
    assert.ok(html.includes('按普通文字匹配；修改后需点击「保存并应用」。'), '页面必须说明匹配方式和生效操作');
    assert.ok(!html.includes('总开关'), '不得渲染整个功能总开关');

    assert.ok(runningSummary.includes('已生效规则') && runningSummary.includes('>2条</p>'));
    assert.ok(!runningSummary.includes('你好'), '草稿内容不得混入已生效规则');
    assert.doesNotMatch(html, /sheetKey：|按稳定表格映射|phone-settings-hero|phone-settings-chip|静默后台|>可用<|第一版使用/);
    assert.doesNotMatch(html, /<h3[^>]*>全局替换<\/h3>/, '删除编辑区重复标题');
    assert.match(html, /先于单表规则执行/);
    assert.match(html, /data-action="delete-table"[^>]*>移除配置<\/button>/);
    assert.match(html, /data-action="add-table"[^>]*>添加表格<\/button>/);
    assert.match(html, /data-mapping-id="m1"/, '真实表绑定不受文案精简影响');
    const empty = buildTableContentReplacementPageHtml({ status: 'ready' });
    for (const text of ['暂无已生效规则。', '暂无规则。', '暂无单表配置。']) assert.ok(empty.includes(text), text);
    const unavailable = buildTableContentReplacementPageHtml({
        status: 'ready', config: { tableRules: [{ mappingId: 'missing', sheetKey: 'lost', tableNameSnapshot: '缺失表', rules: [] }] },
    });
    assert.match(unavailable, /当前不可用/);
    assert.match(unavailable, /表格暂不可用，规则保留，恢复后继续生效。/);
    const pageSource = fs.readFileSync(path.resolve(__dirname, '..', 'modules/settings-app/pages/table-content-replacement.js'), 'utf8');
    assert.match(pageSource, /确认删除匹配文本？/);
    assert.match(pageSource, /保存后会删除匹配到的文字/);
    assert.match(pageSource, /不会回滚已经写入表格的数据/);
    console.log('[通过] 表格内容词汇替换设置页面渲染 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
