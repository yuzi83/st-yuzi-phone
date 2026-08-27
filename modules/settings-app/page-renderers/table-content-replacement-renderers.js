import {
    createTableContentReplacementPage,
    renderTableContentReplacementPage as renderTableContentReplacementPageImpl,
} from '../pages/table-content-replacement.js';
import { buildTableContentReplacementPageContext } from './page-context-builders.js';

export function createTableContentReplacementPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;
    const tableContentReplacementContext = pageContexts.tableContentReplacement
        || buildTableContentReplacementPageContext(deps);

    return {
        pages: {
            table_content_replacement: {
                createPage() {
                    return createTableContentReplacementPage(tableContentReplacementContext);
                },
            },
        },
        renderTableContentReplacementPage() {
            renderTableContentReplacementPageImpl(tableContentReplacementContext);
        },
    };
}

