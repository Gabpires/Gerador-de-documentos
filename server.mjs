import { createServer } from 'node:http';
import { readFile, readdir, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const resourcesRoot = resolve(process.env.RESOURCES_DIR || join(root, 'resources', 'templates'));
const archiveRoot = resolve(resourcesRoot, '_archived');
const MAX_BODY = 768 * 1024;
const kinds = new Set(['receipt', 'declaration', 'term', 'contract', 'custom']);
const fieldTypes = new Set(['text', 'textarea', 'number', 'currency', 'date', 'select', 'checkbox']);
const validations = new Set(['none', 'cpfCnpj', 'currency', 'date']);

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
function text(response, status, value) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(value);
}
function validId(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,62}$/.test(value); }
function safePath(folder, id, extension) {
  if (!validId(id)) throw new Error('Identificador de template inválido.');
  const target = resolve(folder, `${id}.${extension}`);
  if (!target.startsWith(folder + sep)) throw new Error('Caminho de template inválido.');
  return target;
}
function plain(value, max = 240) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeHtml(html) {
  if (typeof html !== 'string' || !html.trim() || html.length > MAX_BODY) throw new Error('HTML ausente ou muito grande.');
  const forbidden = /<(?:script|iframe|frame|object|embed|form|svg|math|base)\b|<meta\b[^>]*http-equiv|\son[a-z]+\s*=|\s(?:src|href)\s*=\s*['"]?(?:https?:|\/\/)|(?:javascript|vbscript)\s*:|@import\b|url\s*\(/i;
  if (forbidden.test(html)) throw new Error('O HTML contém conteúdo ativo ou recurso externo não permitido.');
  return html;
}
function validateDefinition(source, routeId) {
  if (!source || typeof source !== 'object') throw new Error('Definição JSON inválida.');
  const id = plain(source.id, 64);
  const name = plain(source.name, 120);
  if (id !== routeId || !validId(id)) throw new Error('O ID do JSON deve corresponder ao endereço e usar letras minúsculas, números e hífen.');
  if (name.length < 3) throw new Error('Informe um nome de template com ao menos 3 caracteres.');
  if (!kinds.has(source.documentKind)) throw new Error('Categoria de documento inválida.');
  if (!Array.isArray(source.fields) || source.fields.length > 80) throw new Error('A lista de campos é inválida.');
  const ids = new Set(), tags = new Set();
  const fields = source.fields.map((item, index) => {
    const fieldId = plain(item && item.id, 64);
    const fieldName = plain(item && item.name, 120);
    const tag = plain(item && item.tag, 80);
    const type = item && item.type;
    const validation = item && item.validation || 'none';
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(fieldId) || ids.has(fieldId)) throw new Error(`Campo ${index + 1}: identificador inválido ou repetido.`);
    if (fieldName.length < 2) throw new Error(`Campo ${index + 1}: informe o nome.`);
    if (!/^\{\{[A-Z][A-Z0-9_]{1,63}\}\}$/.test(tag) || tags.has(tag)) throw new Error(`Campo ${index + 1}: tag inválida ou repetida.`);
    if (!fieldTypes.has(type) || !validations.has(validation)) throw new Error(`Campo ${index + 1}: tipo ou validação inválidos.`);
    if (item.required !== undefined && typeof item.required !== 'boolean') throw new Error(`Campo ${index + 1}: obrigatório deve ser verdadeiro ou falso.`);
    const options = type === 'select' ? (Array.isArray(item.options) ? item.options : []).map(option => ({ label: plain(option && option.label, 120), value: plain(option && option.value, 120) })).filter(option => option.label && option.value) : [];
    if (type === 'select' && (!options.length || options.length > 100 || new Set(options.map(option => option.value)).size !== options.length)) throw new Error(`Campo ${index + 1}: informe opções únicas para o combobox.`);
    ids.add(fieldId); tags.add(tag);
    return { id: fieldId, name: fieldName, tag, type, required: item.required === true, defaultValue: typeof item.defaultValue === 'boolean' ? item.defaultValue : plain(String(item.defaultValue ?? ''), 2000), helpText: plain(item.helpText, 280), validation, options };
  });
  return { schemaVersion: 1, id, name, documentKind: source.documentKind, status: source.status === 'archived' ? 'archived' : 'active', revision: Math.max(1, Number(source.revision) || 1), createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString(), fields };
}
async function readBody(request) {
  let body = '', size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) throw new Error('Corpo da requisição muito grande.'); body += chunk; }
  try { return JSON.parse(body || '{}'); } catch { throw new Error('JSON de requisição inválido.'); }
}
async function pair(folder, id) {
  const [definition, html] = await Promise.all([readFile(safePath(folder, id, 'json'), 'utf8'), readFile(safePath(folder, id, 'html'), 'utf8')]);
  return { definition: JSON.parse(definition), html };
}
async function list(folder, status) {
  await mkdir(folder, { recursive: true });
  const names = await readdir(folder, { withFileTypes: true });
  const results = [];
  for (const entry of names) {
    if (!entry.isFile() || extname(entry.name) !== '.json') continue;
    const id = entry.name.slice(0, -5);
    try {
      const current = await pair(folder, id);
      results.push({ id: current.definition.id, name: current.definition.name, documentKind: current.definition.documentKind, status, revision: current.definition.revision, updatedAt: current.definition.updatedAt, fieldCount: current.definition.fields.length });
    } catch { /* pares incompletos não são publicados */ }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
async function writePair(id, definition, html, expectedRevision) {
  await mkdir(resourcesRoot, { recursive: true });
  const jsonPath = safePath(resourcesRoot, id, 'json'), htmlPath = safePath(resourcesRoot, id, 'html');
  let previous = null;
  try { previous = await pair(resourcesRoot, id); } catch { /* novo template */ }
  if (previous && Number(expectedRevision) !== Number(previous.definition.revision)) {
    const error = new Error('O template foi alterado em outra sessão. Recarregue antes de salvar.'); error.status = 409; throw error;
  }
  const next = { ...definition, status: 'active', revision: previous ? previous.definition.revision + 1 : 1, createdAt: previous ? previous.definition.createdAt : definition.createdAt, updatedAt: new Date().toISOString() };
  const nonce = `${process.pid}-${Date.now()}`;
  const jsonTemp = `${jsonPath}.${nonce}.tmp`, htmlTemp = `${htmlPath}.${nonce}.tmp`;
  try {
    await Promise.all([writeFile(jsonTemp, JSON.stringify(next, null, 2) + '\n', 'utf8'), writeFile(htmlTemp, html, 'utf8')]);
    await Promise.all([rename(jsonTemp, jsonPath), rename(htmlTemp, htmlPath)]);
  } finally { await Promise.all([rm(jsonTemp, { force: true }), rm(htmlTemp, { force: true })]); }
  return { definition: next, html };
}
async function movePair(id, from, to, status) {
  const current = await pair(from, id);
  await mkdir(to, { recursive: true });
  const definition = { ...current.definition, status, revision: Number(current.definition.revision || 0) + 1, updatedAt: new Date().toISOString() };
  const jsonTarget = safePath(to, id, 'json'), htmlTarget = safePath(to, id, 'html');
  await Promise.all([writeFile(jsonTarget, JSON.stringify(definition, null, 2) + '\n'), writeFile(htmlTarget, current.html)]);
  await Promise.all([rm(safePath(from, id, 'json')), rm(safePath(from, id, 'html'))]);
  return { definition, html: current.html };
}
async function api(request, response, pathname) {
  if (pathname === '/api/health' && request.method === 'GET') return json(response, 200, { ok: true, resourcesRoot });
  if (pathname === '/api/templates' && request.method === 'GET') return json(response, 200, { templates: await list(resourcesRoot, 'active'), archived: await list(archiveRoot, 'archived') });
  const match = pathname.match(/^\/api\/templates\/([a-z0-9-]+)(?:\/(archive|restore))?$/);
  if (!match) return false;
  const [, id, action] = match;
  try {
    if (request.method === 'GET' && !action) return json(response, 200, await pair(existsSync(safePath(resourcesRoot, id, 'json')) ? resourcesRoot : archiveRoot, id));
    if (request.method === 'PUT' && !action) {
      const payload = await readBody(request), definition = validateDefinition(payload.definition, id), html = safeHtml(payload.html);
      return json(response, 200, await writePair(id, definition, html, payload.expectedRevision));
    }
    if (request.method === 'POST' && action === 'archive') return json(response, 200, await movePair(id, resourcesRoot, archiveRoot, 'archived'));
    if (request.method === 'POST' && action === 'restore') return json(response, 200, await movePair(id, archiveRoot, resourcesRoot, 'active'));
    return text(response, 405, 'Método não permitido.');
  } catch (error) { return json(response, error.status || 400, { error: error.message || 'Falha ao processar o template.' }); }
}
function staticFile(rootDir, pathname) {
  const candidate = resolve(rootDir, pathname === '/' ? 'index.html' : '.' + pathname);
  return candidate.startsWith(rootDir + sep) ? candidate : null;
}
function contentType(file) { return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'; }
const productionCsp = "default-src 'self'; base-uri 'none'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'";
async function start() {
  const dev = process.argv.includes('--dev');
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 5173);
  let vite;
  if (dev) { const { createServer: createViteServer } = await import('vite'); vite = await createViteServer({ root: join(root, 'src'), server: { middlewareMode: true }, appType: 'spa' }); }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
      if (url.pathname.startsWith('/api/')) { const handled = await api(request, response, url.pathname); if (!handled) json(response, 404, { error: 'Rota não encontrada.' }); return; }
      if (dev) {
        vite.middlewares(request, response, (error) => {
          if (response.writableEnded || response.headersSent) return;
          if (error) text(response, 500, 'Erro ao servir a aplicação em desenvolvimento.');
          else text(response, 404, 'Não encontrado.');
        });
        return;
      }
      const distRoot = resolve(root, 'src', 'dist');
      const target = staticFile(distRoot, url.pathname);
      if (!target) return text(response, 404, 'Não encontrado.');
      try { response.writeHead(200, { 'content-type': contentType(target), 'content-security-policy': productionCsp }); response.end(await readFile(target)); } catch { if (url.pathname !== '/') text(response, 404, 'Não encontrado.'); else { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': productionCsp }); response.end(await readFile(join(distRoot, 'index.html'))); } }
    } catch { if (!response.headersSent && !response.writableEnded) text(response, 500, 'Erro interno do servidor local.'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Gerador local em http://127.0.0.1:${port}`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) start();
export { validateDefinition, safeHtml, validId, resourcesRoot, productionCsp };
