import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildBundle, loadProjectTables, normalizeMatchText } from './lib.mjs';
import { createPreviewSessionController } from './preview-session.mjs';
import { parseCliArgs } from './project-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const previewRoot = path.resolve(here, '../preview');
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const STATIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/frame.html': ['frame.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/runtime-v1.js': ['runtime-v1.js', 'text/javascript; charset=utf-8'],
  '/image-actions.js': ['image-actions.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
});

function jsonResponse(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function httpError(message, { code = 'PREVIEW_HTTP_ERROR', statusCode = 400 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function errorPayload(error) {
  return {
    error: error?.code || 'preview-error',
    message: error?.message || String(error),
  };
}

async function readJsonRequest(request) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw httpError(`请求体超过 ${MAX_REQUEST_BYTES} 字节限制`, { code: 'PREVIEW_REQUEST_TOO_LARGE', statusCode: 413 });
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) {
      throw httpError(`请求体超过 ${MAX_REQUEST_BYTES} 字节限制`, { code: 'PREVIEW_REQUEST_TOO_LARGE', statusCode: 413 });
    }
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks).toString('utf8').trim();
  if (!source) throw httpError('请求体必须是 JSON 对象', { code: 'PREVIEW_JSON_REQUIRED' });
  try {
    const value = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw httpError('请求体必须是 JSON 对象', { code: 'PREVIEW_JSON_OBJECT_REQUIRED' });
    }
    return value;
  } catch (error) {
    if (error?.code) throw error;
    throw httpError('请求体不是合法 JSON', { code: 'PREVIEW_JSON_INVALID' });
  }
}

function stateForTable(table, index, total) {
  return {
    version: 1,
    sheetKey: table.sheetKey,
    tableName: table.tableName,
    headers: table.headers,
    rows: table.rows,
    route: `preview:table:${table.sheetKey}`,
    canPrevious: index > 0,
    canNext: index < total - 1,
  };
}

function selectByToken(values, token, keys) {
  if (!token) return null;
  const normalized = normalizeMatchText(token);
  return values.find(value => keys.some(key => normalizeMatchText(value[key]) === normalized)) || null;
}

function displayPreviewMock(display, tables) {
  if (!display) return null;
  return {
    kind: display.kind,
    id: display.id,
    name: display.name,
    targets: display.targets.map(target => {
      const table = selectByToken(tables, target.tableName, ['sheetKey', 'tableName']);
      return { tableName: target.tableName, fields: target.fields, state: table?.state || null };
    }),
    ...(display.integrations ? { integrations: structuredClone(display.integrations) } : {}),
    ...(display.imageGeneration ? { imageGeneration: structuredClone(display.imageGeneration) } : {}),
    ...(display.interactions ? { interactions: structuredClone(display.interactions) } : {}),
  };
}

function itemPreviewMock(item, tables) {
  if (!item) return null;
  const table = selectByToken(tables, item.target.tableName, ['sheetKey', 'tableName']);
  return {
    id: item.id,
    name: item.name,
    target: { tableName: item.target.tableName, fields: item.target.fields, state: table?.state || null },
    ...(item.integrations ? { integrations: structuredClone(item.integrations) } : {}),
    ...(item.imageGeneration ? { imageGeneration: structuredClone(item.imageGeneration) } : {}),
  };
}

function mockRoute(url) {
  const match = /^\/api\/mock\/tables\/([^/]+)(\/reset)?$/.exec(url.pathname);
  if (!match) return null;
  return { sheetKey: decodeURIComponent(match[1]), reset: Boolean(match[2]) };
}

function writeSse(response, type, payload) {
  response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function buildPreviewSession(projectFile, { item = null, display = null, table = null } = {}) {
  const [bundle, tableSource] = await Promise.all([buildBundle(projectFile), loadProjectTables(projectFile)]);
  const tables = tableSource.tables.map((entry, index, all) => ({ ...entry, state: stateForTable(entry, index, all.length) }));
  const selectedItem = selectByToken(bundle.manifest.items, item, ['id', 'name']) || bundle.manifest.items[0] || null;
  const selectedDisplay = selectByToken(bundle.manifest.displays || [], display, ['id', 'name']);
  const preferredTableName = table || selectedDisplay?.targets[0]?.tableName || selectedItem?.target?.tableName;
  const selectedTable = selectByToken(tables, preferredTableName, ['sheetKey', 'tableName']) || tables[0] || null;
  return {
    kind: 'yuzi-beautify-preview-session',
    simulationOnly: true,
    disclaimer: '制作期模拟：Mock 数据只存在本地预览进程内存，不会写入表格、Bundle 或真实 SillyTavern。未验证真实宿主的 CSP、路由、数据库、IndexedDB、主题叠加或滚动恢复。',
    projectFile: tableSource.projectPath,
    bundle,
    tables,
    selectedItemId: selectedItem?.id || null,
    selectedDisplayId: selectedDisplay?.id || null,
    selectedSheetKey: selectedTable?.sheetKey || null,
    itemMock: itemPreviewMock(selectedItem, tables),
    displayMock: displayPreviewMock(selectedDisplay, tables),
    builtAt: new Date().toISOString(),
  };
}

export async function startPreviewServer({
  projectFile,
  port = 4173,
  item = null,
  display = null,
  table = null,
  watch = true,
  watchDebounceMs = 160,
  closeDrainMs,
  watchFactory,
} = {}) {
  if (!projectFile) throw new Error('preview 需要 project.json 路径');
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) throw new Error(`端口无效：${port}`);
  const controller = await createPreviewSessionController({
    projectFile,
    buildSession: () => buildPreviewSession(projectFile, { item, display, table }),
    watch,
    watchDebounceMs,
    ...(closeDrainMs === undefined ? {} : { closeDrainMs }),
    ...(watchFactory ? { watchFactory } : {}),
  });
  const sseClients = new Set();
  const unsubscribeController = controller.subscribe(event => {
    const payload = {
      ...event.detail,
      revision: event.session.revision,
      build: event.session.build,
      mockRevision: event.session.mock.revision,
    };
    for (const response of [...sseClients]) {
      if (response.writableEnded || response.destroyed) {
        sseClients.delete(response);
        continue;
      }
      writeSse(response, event.type, payload);
    }
  });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/session') {
        jsonResponse(response, 200, controller.getSession());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/events') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-content-type-options': 'nosniff',
        });
        response.write('retry: 1000\n\n');
        sseClients.add(response);
        request.once('close', () => {
          sseClients.delete(response);
          if (!response.writableEnded) response.end();
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/reload') {
        try {
          const session = await controller.rebuild({ reason: 'manual', throwOnError: true });
          jsonResponse(response, 200, session);
        } catch (error) {
          jsonResponse(response, error?.statusCode || 422, { ...errorPayload(error), session: controller.getSession() });
        }
        return;
      }
      const route = mockRoute(url);
      if (route && request.method === 'PATCH' && !route.reset) {
        const body = await readJsonRequest(request);
        const result = controller.updateMockTable(route.sheetKey, body, { expectedRevision: body.expectedRevision });
        jsonResponse(response, 200, result);
        return;
      }
      if (route && request.method === 'POST' && route.reset) {
        const result = controller.resetMockTable(route.sheetKey);
        jsonResponse(response, 200, result);
        return;
      }
      const staticEntry = request.method === 'GET' ? STATIC_FILES[url.pathname] : null;
      if (!staticEntry) {
        jsonResponse(response, 404, { error: 'not-found' });
        return;
      }
      const [relative, contentType] = staticEntry;
      const content = await fs.readFile(path.join(previewRoot, relative));
      const isFrame = relative === 'frame.html';
      const headers = {
        'content-type': contentType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': isFrame
          ? "default-src 'none'; script-src http://127.0.0.1:* blob:; style-src 'self' 'unsafe-inline'; img-src blob: data:; media-src blob: data:; font-src blob: data:; connect-src 'none'"
          : "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self'",
      };
      if (relative.endsWith('.js')) headers['access-control-allow-origin'] = '*';
      response.writeHead(200, headers);
      response.end(content);
    } catch (error) {
      jsonResponse(response, error?.statusCode || 500, errorPayload(error));
    }
  });
  try {
    await new Promise((resolve, reject) => {
      const onError = error => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(parsedPort, '127.0.0.1');
    });
  } catch (error) {
    unsubscribeController();
    await controller.close();
    throw error;
  }
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : parsedPort;
  let closePromise = null;
  return {
    host: '127.0.0.1',
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}/`,
    getSession: () => controller.getSession(),
    reload: () => controller.rebuild({ reason: 'manual', throwOnError: true }),
    controller,
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        unsubscribeController();
        for (const response of sseClients) response.end();
        sseClients.clear();
        await controller.close();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      })();
      return closePromise;
    },
  };
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const options = parseCliArgs(process.argv.slice(2), { boolean: ['json'] });
  const projectFile = options.project || options._[0];
  if (!projectFile) throw new Error('用法：npm run preview -- <project.json> [--item id] [--display id] [--table sheetKey] [--port 4173]');
  const preview = await startPreviewServer({
    projectFile,
    port: options.port || 4173,
    item: options.item || null,
    display: options.display || null,
    table: options.table || null,
  });
  if (options.json) console.log(JSON.stringify({ host: preview.host, port: preview.port, url: preview.url }, null, 2));
  else console.log(`[preview] 制作期模拟面板：${preview.url}\n[preview] Mock 数据仅存于当前预览进程内存；按 Ctrl+C 停止。真实 SillyTavern 仍需独立人工验收。`);
}
