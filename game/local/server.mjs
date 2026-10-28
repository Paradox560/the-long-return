import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { CredentialStore } from './storage.mjs';
import { ChatGPTAuth, AuthError, safeEqual } from './oauth.mjs';
import { createPlanFetch } from './inference.mjs';
import { createDMHandlers } from '../server/dm.mjs';

const GAME_ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIC_FILES = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/style.css', ['style.css','text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs','text/javascript; charset=utf-8']],
  ['/engine.mjs', ['engine.mjs','text/javascript; charset=utf-8']],
  ['/render.mjs', ['render.mjs','text/javascript; charset=utf-8']],
  ['/design.html', ['../dist/index.html','text/html; charset=utf-8']],
  ['/design-document.txt', ['../dist/design-document.txt','text/plain; charset=utf-8']],
]);
const random = () => randomBytes(32).toString('base64url');
const SECURITY = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const json = (res, value, status = 200) => {
  res.writeHead(status, { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};
const safeError = error => error instanceof AuthError
  ? { ok: false, mode: 'unavailable', code: error.code, message: error.message }
  : { ok: false, mode: 'unavailable', code: 'connection_unavailable', message: 'The ChatGPT connection could not complete this request. Keep exploring or reconnect.' };
const cookieValue = req => {
  const match = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('long_return_session='));
  return match?.slice('long_return_session='.length) || null;
};
async function bodyOf(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 32_768) chunks.push(chunk);
  }
  if (size > 32_768) throw new AuthError('request_too_large', 'This request is too large.', 413);
  return Buffer.concat(chunks).toString('utf8');
}

export async function createLocalServer({ port = 4174, dataDir = join(homedir(), '.config', 'the-long-return'),
  fetchImpl = fetch, gameRoot = GAME_ROOT, store: suppliedStore } = {}) {
  const store = suppliedStore || new CredentialStore(dataDir);
  if (!store.state) await store.load();
  const sessions = new Map();
  const inFlight = new Set();
  let origin, auth;
  const dm = createDMHandlers({ fetchImpl: createPlanFetch(fetchImpl), timeoutMs: 45_000 });
  function sessionFor(req, res, { create = true } = {}) {
    const existing = sessions.get(cookieValue(req));
    if (existing && existing.expires > Date.now()) return existing;
    if (!create) throw new AuthError('session_required', 'Open the game page and try again.', 401);
    for (const [id,item] of sessions) if (item.expires <= Date.now()) sessions.delete(id);
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
    const session = { id: random(), csrfToken: random(), expires: Date.now() + 8 * 60 * 60_000 };
    sessions.set(session.id, session);
    // HTTP loopback is required by SIWC. This cookie is never used on a network host.
    res.setHeader('Set-Cookie', `long_return_session=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
    return session;
  }
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      if (req.headers.host !== new URL(origin).host || !req.url?.startsWith('/')) {
        return json(res, { ok: false, code: 'invalid_host', message: 'Use the 127.0.0.1 game address.' }, 403);
      }
      const url = new URL(req.url, origin);
      if (url.origin !== origin) return json(res, { ok: false, code: 'invalid_host' }, 403);
      const callback = url.pathname === '/auth/callback';
      if (!callback && ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')) {
        return json(res, { ok: false, code: 'origin_not_allowed', message: 'Open the local game directly to continue.' }, 403);
      }
      if (req.method === 'GET' && callback) {
        const session = sessionFor(req, res, { create: false });
        try {
          const result = await auth.callback(session, url);
          session.csrfToken = random();
          res.writeHead(303, { ...SECURITY, Location: `/?chatgpt=${result.enabled ? 'connected' : 'permission-needed'}` });
          return res.end();
        } catch (error) {
          // Never render or log the callback query: it contains a single-use authorization code.
          const message = error instanceof AuthError ? error.message : 'ChatGPT sign-in could not complete. Return to the game and try again.';
          res.writeHead(error.status || 400, { ...SECURITY, 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>ChatGPT connection</title><main><h1>Connection not completed</h1><p>${message.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</p><p><a href="/">Return to The Long Return</a></p></main>`);
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/auth/start') {
        const session = sessionFor(req, res);
        const location = await auth.start(session, { newAccount: url.searchParams.get('new') === '1' });
        res.writeHead(302, { ...SECURITY, Location: location });
        return res.end();
      }
      if (req.method === 'GET' && ['/api/dm','/api/auth/models','/api/auth/session'].includes(url.pathname)) {
        const session = sessionFor(req, res);
        let modelError = null;
        if (auth.publicState().configured) {
          try { await auth.models({ refresh: url.pathname === '/api/auth/models' }); }
          catch (error) { modelError = safeError(error).message; }
        }
        const state = auth.publicState();
        return json(res, { ok: true, ...state, mode: state.configured ? 'live' : 'local',
          provider: 'chatgpt-plan', localSignInAvailable: true, csrfToken: session.csrfToken,
          manageUsageUrl: 'https://chatgpt.com/settings/usage',
          message: modelError || (state.configured ? 'Using your ChatGPT plan. Usage is shared with your plan.' : 'Continue with ChatGPT to use your plan for the AI dungeon master.'),
        });
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const session = sessionFor(req, res, { create: false });
        if (!safeEqual(String(req.headers['x-csrf-token'] || ''), session.csrfToken)) {
          return json(res, { ok: false, code: 'csrf_invalid', message: 'Refresh the game connection and try again.' }, 403);
        }
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, { ok: false, code: 'invalid_content_type' }, 415);
        const body = await bodyOf(req);
        let input;
        try { input = JSON.parse(body); } catch { throw new AuthError('invalid_json', 'The request could not be read.'); }
        if (url.pathname === '/api/auth/logout') {
          for (const pending of inFlight) pending.abort();
          const result = await auth.logout();
          session.csrfToken = random();
          return json(res, { ok: true, ...result, message: result.revoked ? 'Signed out of ChatGPT.' : 'Signed out locally. Remote revocation was not confirmed; disconnect the app in ChatGPT settings.' });
        }
        if (url.pathname === '/api/auth/model') {
          const selectedModel = await auth.selectModel(input.model);
          return json(res, { ok: true, selectedModel });
        }
        if (url.pathname === '/api/auth/select') {
          for (const pending of inFlight) pending.abort();
          await auth.selectAccount(input.registrationId);
          return json(res, { ok: true });
        }
        if (url.pathname === '/api/dm') {
          if (inFlight.size >= 2) throw new AuthError('model_busy', 'Finish the current turn before starting another.', 429);
          inFlight.add(controller);
          try {
            const record = auth.active, epoch = auth.epoch;
            await auth.models();
            auth.assertCurrent(record, epoch);
            const token = await auth.accessToken(record);
            auth.assertCurrent(record, epoch);
            if (controller.signal.aborted) throw new AuthError('request_cancelled', 'The action was cancelled. Your world has not changed.', 409);
            if (!record?.selectedModel) throw new AuthError('model_unavailable', 'No eligible ChatGPT model is available for this account.', 403);
            const request = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body, signal: controller.signal });
            const response = await dm.POST(request, { env: { OPENAI_API_KEY: token, OPENAI_MODEL: record.selectedModel } });
            res.writeHead(response.status, { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(await response.text());
          } finally { inFlight.delete(controller); }
        }
      }
      if (req.method === 'GET' && STATIC_FILES.has(url.pathname)) {
        sessionFor(req, res);
        const [filename, type] = STATIC_FILES.get(url.pathname);
        const content = await readFile(join(gameRoot, filename));
        res.writeHead(200, { ...SECURITY, 'Content-Type': type });
        return res.end(content);
      }
      return json(res, { ok: false, code: 'not_found', message: 'Not found.' }, 404);
    } catch (error) { if (!res.headersSent) json(res, safeError(error), error instanceof AuthError ? error.status : 503); else res.end(); }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolvePromise); });
  origin = `http://127.0.0.1:${server.address().port}`;
  auth = new ChatGPTAuth({ store, origin, fetchImpl });
  return { server, origin, auth, store, close: () => new Promise(resolvePromise => {
    for (const pending of inFlight) pending.abort();
    server.close(resolvePromise); server.closeIdleConnections();
  }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4174);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
  createLocalServer({ port, dataDir: process.env.LONG_RETURN_DATA_DIR || join(homedir(), '.config', 'the-long-return') })
    .then(app => {
      console.log(`The Long Return is ready at ${app.origin}`);
      console.log('Continue with ChatGPT in the game to authorize your plan. No sign-in starts automatically.');
      for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
    }).catch(() => { console.error('The local game could not start. Check the port and protected data-directory permissions.'); process.exitCode = 1; });
}
