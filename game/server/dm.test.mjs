import test from 'node:test';
import assert from 'node:assert/strict';
import { createDMHandlers } from './dm.mjs';

const world = {
  revision: 7,
  region: { id: '0,0', name: 'Mereford' },
  nearbyTargets: [{ id: 'sluice', name: 'Sluice gate' }],
  availableActions: [{ id: 'repair_sluice', description: 'Repair the gate', targetIds: ['sluice'] }, { id: 'rest', targetIds: [] }],
};
const runtime = { env: { OPENAI_API_KEY: 'test-only-not-a-credential' } };
const request = (body = { message: 'Can I brace the sluice with driftwood?', context: world }, extraHeaders = {}) =>
  new Request('https://game.example/api/dm', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://game.example', ...extraHeaders },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const proposal = { narration: 'You can attempt to brace the damaged gate.', actionId: 'repair_sluice', targetId: 'sluice' };
const modelReply = (value = proposal, status = 'completed') => Response.json({
  status, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
});

test('missing key is honest, reports local mode, and never calls a model', async () => {
  const handlers = createDMHandlers({ fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal((await (await handlers.GET(request(), {})).json()).mode, 'local');
  const result = await handlers.POST(request(), {});
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'not_configured');
});

test('valid live output echoes original revision and only proposes a known pair', async () => {
  let sent;
  const handlers = createDMHandlers({ fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    sent = JSON.parse(options.body);
    return modelReply();
  } });
  const response = await handlers.POST(request(), runtime);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, mode: 'live', ...proposal, basedOnRevision: 7 });
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.strict, true);
  assert.deepEqual(sent.text.format.schema.properties.actionId.enum, ['repair_sluice','rest',null]);
});

test('arbitrary prose can return narration without a world mutation', async () => {
  const handlers = createDMHandlers({ fetchImpl: async () => modelReply({ narration: 'Water presses against the damaged gate.', actionId: null, targetId: null }) });
  const response = await handlers.POST(request(), runtime);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).actionId, null);
});

test('rejects hallucinated target and valid action with mismatched pair', async () => {
  for (const invalid of [{ ...proposal, targetId: 'distant-village' }, { ...proposal, actionId: 'rest' }]) {
    const handlers = createDMHandlers({ fetchImpl: async () => modelReply(invalid) });
    const response = await handlers.POST(request(), runtime);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'invalid_model_proposal');
  }
});

test('a targeted action with no nearby target cannot become targetless', async () => {
  const handlers = createDMHandlers({ fetchImpl: async () => modelReply({ ...proposal, targetId: null }) });
  const response = await handlers.POST(request({ message: 'Repair it', context: { ...world, nearbyTargets: [] } }), runtime);
  assert.equal(response.status, 502);
});

test('cross-origin browser requests are rejected before inference', async () => {
  const handlers = createDMHandlers({ fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal((await handlers.POST(request(undefined, { Origin: 'https://elsewhere.example' }), runtime)).status, 403);
});

test('malformed, oversized, or revisionless requests are rejected before inference', async () => {
  const handlers = createDMHandlers({ fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal((await handlers.POST(request('{no'), runtime)).status, 400);
  assert.equal((await handlers.POST(request('a'.repeat(33_000)), runtime)).status, 413);
  assert.equal((await handlers.POST(request({ message: 'Listen', context: { ...world, revision: null } }), runtime)).status, 400);
});

test('provider error details and credentials never reach the browser', async () => {
  const handlers = createDMHandlers({ fetchImpl: async () => new Response('account-private-error-and-key', { status: 401 }) });
  const response = await handlers.POST(request(), runtime);
  const text = await response.text();
  assert.equal(response.status, 503);
  assert.ok(!text.includes('account-private'));
  assert.ok(!text.includes(runtime.env.OPENAI_API_KEY));
});

test('incomplete model replies cannot apply a partial action', async () => {
  const handlers = createDMHandlers({ fetchImpl: async () => modelReply(proposal, 'incomplete') });
  const response = await handlers.POST(request(), runtime);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'model_incomplete');
});

test('refusals are handled without attempting JSON parsing or simulation changes', async () => {
  const handlers = createDMHandlers({ fetchImpl: async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] }) });
  const response = await handlers.POST(request(), runtime);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'model_refusal');
});

test('timeout aborts the provider and returns a recoverable failure', async () => {
  const handlers = createDMHandlers({ timeoutMs: 5, fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const response = await handlers.POST(request(), runtime);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, 'model_timeout');
});

test('a request cancelled before dispatch cannot initiate model inference', async () => {
  let calls = 0;
  const handlers = createDMHandlers({ fetchImpl: async () => { calls++; return modelReply(); } });
  const controller = new AbortController();
  controller.abort();
  const aborted = new Request(request(), { signal: controller.signal });
  const response = await handlers.POST(aborted, runtime);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'request_cancelled');
  assert.equal(calls, 0);
});
