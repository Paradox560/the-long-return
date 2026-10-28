import { randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';

const ISSUER = 'https://auth.openai.com';
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');
export const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};
export class AuthError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const abortAfter = () => AbortSignal.timeout(15_000);
const hasPlanScope = record => record?.scopes?.includes('chatgpt.tokens.use.direct') && record?.scopes?.includes('resource.invoke');

export class ChatGPTAuth {
  constructor({ store, origin, fetchImpl = fetch, now = () => Date.now() }) {
    this.store = store; this.origin = origin; this.fetch = fetchImpl; this.now = now;
    this.pending = new Map(); this.refreshes = new Map(); this.catalogs = new Map();
    this.epoch = 0; this.disconnecting = new Set();
  }
  get active() { return this.store.state.registrations.find(item => item.id === this.store.state.activeId) || null; }
  assertCurrent(record, epoch = this.epoch) {
    if (!record || this.active?.id !== record.id || this.epoch !== epoch || this.disconnecting.has(record.id)) {
      throw new AuthError('connection_changed', 'The ChatGPT connection changed. Please retry from the current account.', 409);
    }
  }
  async metadata() {
    if (this.discovery) return this.discovery;
    const response = await this.fetch(DISCOVERY, { signal: abortAfter() });
    if (!response.ok) throw new AuthError('discovery_unavailable', 'ChatGPT sign-in is temporarily unavailable.', 503);
    const meta = await response.json();
    if (meta.issuer !== ISSUER) throw new AuthError('invalid_discovery', 'ChatGPT sign-in configuration could not be verified.', 502);
    for (const key of ['authorization_endpoint','token_endpoint','jwks_uri','revocation_endpoint']) {
      if (typeof meta[key] !== 'string' || new URL(meta[key]).origin !== ISSUER) throw new AuthError('invalid_discovery', 'ChatGPT sign-in configuration could not be verified.', 502);
    }
    this.discovery = meta;
    return meta;
  }
  async start(session, { newAccount = false } = {}) {
    const meta = await this.metadata();
    for (const [id, pending] of this.pending) if (pending.expiresAt <= this.now()) this.pending.delete(id);
    const selected = newAccount ? null : this.active;
    const clientId = selected?.client_id || (!newAccount && session.retryClientId) || 'dynamic_agent_client';
    const transaction = {
      state: random(), nonce: random(), verifier: randomBytes(64).toString('base64url'),
      redirectUri: `${this.origin}/auth/callback`, clientId,
      selectedId: selected?.id || null, expectedSubject: selected?.subject || null,
      expiresAt: this.now() + 10 * 60_000, epoch: this.epoch,
    };
    this.pending.set(session.id, transaction);
    const parameters = new URLSearchParams({
      client_id: clientId, ext_agent_host_id: this.store.state.hostId,
      response_type: 'code', redirect_uri: transaction.redirectUri, scope: SCOPES, resource: RESOURCE,
      state: transaction.state, nonce: transaction.nonce,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(transaction.verifier).digest('base64url'),
    });
    if (clientId === 'dynamic_agent_client') parameters.set('agent_name_hint', 'The Long Return');
    if (selected?.id_token) parameters.set('id_token_hint', selected.id_token);
    if (selected?.email) parameters.set('login_hint', selected.email);
    return `${meta.authorization_endpoint}?${parameters}`;
  }
  async verifyIdentity(idToken, clientId, { nonce, expectedSubject } = {}) {
    const meta = await this.metadata();
    const response = await this.fetch(meta.jwks_uri, { signal: abortAfter() });
    if (!response.ok) throw new AuthError('identity_unavailable', 'ChatGPT identity could not be verified.', 503);
    try {
      const jwks = createLocalJWKSet(await response.json());
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: ISSUER, audience: clientId, requiredClaims: ['sub','iat','exp'], clockTolerance: 5,
        algorithms: ['RS256','ES256'], currentDate: new Date(this.now()),
      });
      if (typeof payload.sub !== 'string' || !payload.sub ||
          (payload.azp !== undefined && payload.azp !== clientId) ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) ||
          (nonce !== undefined && !safeEqual(payload.nonce, nonce)) ||
          (expectedSubject && payload.sub !== expectedSubject)) throw new Error('Identity mismatch');
      return payload;
    } catch { throw new AuthError('identity_invalid', 'ChatGPT returned an identity that could not be verified. Please sign in again.', 400); }
  }
  async tokenRequest(form) {
    const meta = await this.metadata();
    const response = await this.fetch(meta.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form), signal: abortAfter(),
    });
    if (!response.ok) throw new AuthError('token_exchange_failed', 'ChatGPT sign-in could not finish. Start a fresh sign-in.', response.status >= 500 ? 503 : 401);
    const tokens = await response.json();
    if (typeof tokens.access_token !== 'string' || !tokens.access_token ||
        !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 ||
        String(tokens.token_type).toLowerCase() !== 'bearer') throw new AuthError('token_response_invalid', 'ChatGPT returned an incomplete connection. Please sign in again.', 502);
    return tokens;
  }
  applyTokens(record, tokens) {
    record.access_token = tokens.access_token;
    record.refresh_token = tokens.refresh_token || record.refresh_token || null;
    record.id_token = tokens.id_token || record.id_token || null;
    record.token_type = 'Bearer';
    record.expiresAt = this.now() + tokens.expires_in * 1000;
    record.scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : (record.scopes || []);
    record.savedAt = new Date(this.now()).toISOString();
  }
  async callback(session, url) {
    const transaction = this.pending.get(session.id);
    this.pending.delete(session.id);
    if (!transaction || transaction.expiresAt <= this.now() || !safeEqual(url.searchParams.get('state'), transaction.state)) {
      throw new AuthError('invalid_state', 'This sign-in attempt expired or could not be verified. Return to the game and try again.');
    }
    if (url.searchParams.has('error')) throw new AuthError('access_denied', 'ChatGPT sign-in was cancelled or not approved. You can keep playing locally.');
    const code = url.searchParams.get('code');
    const returnedClient = url.searchParams.get('client_id');
    const registering = transaction.clientId === 'dynamic_agent_client';
    const clientId = registering ? returnedClient : transaction.clientId;
    if (!code || !clientId || clientId === 'dynamic_agent_client' || !/^[a-zA-Z0-9_-]{3,200}$/.test(clientId) ||
        (!registering && returnedClient && returnedClient !== clientId)) {
      throw new AuthError('registration_invalid', 'ChatGPT registration was incomplete or changed accounts. Start again.');
    }
    session.retryClientId = clientId;
    const tokens = await this.tokenRequest({ grant_type: 'authorization_code', client_id: clientId,
      code, code_verifier: transaction.verifier, redirect_uri: transaction.redirectUri, resource: RESOURCE });
    if (typeof tokens.id_token !== 'string') throw new AuthError('identity_missing', 'ChatGPT did not return a verifiable identity. Start again.');
    const identity = await this.verifyIdentity(tokens.id_token, clientId, { nonce: transaction.nonce, expectedSubject: transaction.expectedSubject });
    if (transaction.epoch !== this.epoch) throw new AuthError('connection_changed', 'This sign-in was replaced or cancelled. Return to the game and try again.', 409);
    let record = this.store.state.registrations.find(item => item.client_id === clientId && item.subject === identity.sub);
    if (!record) {
      record = { id: randomUUID(), issuer: ISSUER, client_id: clientId, subject: identity.sub, selectedModel: null };
      this.store.state.registrations.push(record);
    }
    record.email = typeof identity.email === 'string' ? identity.email : null;
    record.name = typeof identity.name === 'string' ? identity.name : null;
    this.applyTokens(record, tokens);
    this.epoch++;
    this.store.state.activeId = record.id;
    this.catalogs.delete(record.id);
    await this.store.save();
    delete session.retryClientId;
    return { enabled: hasPlanScope(record) };
  }
  async accessToken(record = this.active) {
    if (!record?.access_token) throw new AuthError('sign_in_required', 'Continue with ChatGPT to connect your plan.', 401);
    const epoch = this.epoch;
    this.assertCurrent(record, epoch);
    if (!hasPlanScope(record)) throw new AuthError('plan_permission_required', 'ChatGPT plan usage was not granted. Enable it in ChatGPT usage settings and sign in again.', 403);
    if (record.expiresAt > this.now() + 60_000) return record.access_token;
    if (!record.refresh_token) throw new AuthError('sign_in_required', 'Your ChatGPT connection expired. Please sign in again.', 401);
    if (!this.refreshes.has(record.id)) this.refreshes.set(record.id, this.refresh(record).finally(() => this.refreshes.delete(record.id)));
    await this.refreshes.get(record.id);
    this.assertCurrent(record, epoch);
    return record.access_token;
  }
  async refresh(record) {
    const tokens = await this.tokenRequest({ grant_type: 'refresh_token', client_id: record.client_id, refresh_token: record.refresh_token, resource: RESOURCE });
    if (!tokens.refresh_token) throw new AuthError('refresh_incomplete', 'ChatGPT token renewal was incomplete. Please sign in again.', 401);
    if (tokens.id_token) await this.verifyIdentity(tokens.id_token, record.client_id, { expectedSubject: record.subject });
    this.applyTokens(record, tokens);
    await this.store.save();
  }
  async models({ refresh = false } = {}) {
    const record = this.active;
    const epoch = this.epoch;
    const token = await this.accessToken(record);
    this.assertCurrent(record, epoch);
    const cached = this.catalogs.get(record.id);
    if (!refresh && cached && cached.expires > this.now()) return cached.models;
    const response = await this.fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` }, signal: abortAfter() });
    if (!response.ok) throw new AuthError('models_unavailable', 'Your ChatGPT models could not be loaded. Check your plan or reconnect.', response.status === 401 ? 401 : 503);
    const body = await response.json();
    this.assertCurrent(record, epoch);
    const models = (Array.isArray(body.models) ? body.models : []).filter(item => item.visibility === 'list' && typeof item.slug === 'string')
      .map(item => ({ slug: item.slug, display_name: String(item.display_name || item.slug) }));
    this.catalogs.set(record.id, { models, expires: this.now() + 5 * 60_000 });
    if (!models.some(item => item.slug === record.selectedModel)) {
      record.selectedModel = models[0]?.slug || null;
      await this.store.save();
    }
    return models;
  }
  async selectModel(model) {
    const record = this.active, epoch = this.epoch;
    if (!(await this.models()).some(item => item.slug === model)) throw new AuthError('model_unavailable', 'Choose a model available to this ChatGPT account.');
    this.assertCurrent(record, epoch);
    record.selectedModel = model;
    await this.store.save();
    return model;
  }
  async selectAccount(id) {
    const record = this.store.state.registrations.find(item => item.id === id);
    if (!record) throw new AuthError('account_unknown', 'That saved ChatGPT account was not found.');
    this.epoch++;
    this.pending.clear();
    this.store.state.activeId = record.id;
    await this.store.save();
  }
  async logout() {
    const record = this.active;
    let revoked = !record?.refresh_token;
    this.epoch++;
    this.pending.clear();
    if (!record) return { revoked: true };
    this.disconnecting.add(record.id);
    // Serialize logout after a pending refresh so it revokes the replacement token.
    await this.refreshes.get(record.id)?.catch(() => {});
    if (record.refresh_token) {
      try {
        const meta = await this.metadata();
        for (let attempt = 0; attempt < 2 && !revoked; attempt++) {
          const response = await this.fetch(meta.revocation_endpoint, { method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: record.refresh_token, token_type_hint: 'refresh_token', client_id: record.client_id }), signal: abortAfter() });
          revoked = response.status === 200;
          if (!revoked && response.status < 500) break;
          if (!revoked) await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch { /* Clear local credentials even when remote revocation cannot be confirmed. */ }
    }
    for (const key of ['access_token','refresh_token','id_token','expiresAt','scopes','savedAt']) delete record[key];
    this.catalogs.delete(record.id);
    await this.store.save();
    this.disconnecting.delete(record.id);
    return { revoked };
  }
  publicState() {
    const record = this.active;
    const summary = item => ({ id: item.id, name: item.name, email: item.email,
      label: `${item.name || item.email || 'ChatGPT account'} · ${item.id.slice(0,6)}`, signedIn: Boolean(item.access_token) });
    return {
      connected: Boolean(record?.access_token && !this.disconnecting.has(record.id)), configured: Boolean(record?.access_token && hasPlanScope(record) && !this.disconnecting.has(record.id)),
      account: record ? summary(record) : null,
      accounts: this.store.state.registrations.map(summary), selectedModel: record?.selectedModel || null,
      models: this.catalogs.get(record?.id)?.models || [],
    };
  }
}
