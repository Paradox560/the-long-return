import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { mkdtemp, stat, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { ChatGPTAuth } from './oauth.mjs';
import { CredentialStore } from './storage.mjs';
import { createPlanFetch } from './inference.mjs';
import { createLocalServer } from './server.mjs';

const issuer = 'https://auth.openai.com';
const metadata = { issuer, authorization_endpoint: `${issuer}/api/accounts/authorize`,
  token_endpoint: `${issuer}/api/accounts/oauth/token`, jwks_uri: `${issuer}/.well-known/jwks.json`, revocation_endpoint: `${issuer}/oauth/revoke` };
const keys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const seconds = () => Math.floor(Date.now()/1000);
const memoryStore = () => ({ state: { version: 1, hostId: 'urn:uuid:test-host', activeId: null, registrations: [] }, async save() {} });
async function idToken({ nonce = 'test-nonce', sub = 'test-user', aud = 'oaiapp_test', azp, iss = issuer, exp = seconds()+3600, key = keys.privateKey } = {}) {
  return new SignJWT({ nonce, email: 'player@example.test', name: 'Player', ...(azp ? {azp} : {}) }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime(exp).sign(key);
}
function provider(tokenHandler) {
  return async (url, options = {}) => {
    if (url === `${issuer}/.well-known/openid-configuration`) return Response.json(metadata);
    if (url === metadata.jwks_uri) return Response.json({ keys: [jwk] });
    if (url === metadata.token_endpoint) return tokenHandler(new URLSearchParams(options.body));
    if (url === metadata.revocation_endpoint) return new Response(null, { status: 200 });
    if (url === 'https://api.openai.com/v1/models') return Response.json({ models: [
      { slug: 'account-specific-model', display_name: 'My account model', visibility: 'list' },
      { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hidden' },
    ] });
    throw new Error('Unexpected network endpoint in test');
  };
}

test('dynamic OAuth registration uses real app name, exact loopback URI, state, nonce and S256 PKCE', async () => {
  const auth = new ChatGPTAuth({ store: memoryStore(), origin: 'http://127.0.0.1:4174', fetchImpl: provider() });
  const session = { id: 'browser' };
  const url = new URL(await auth.start(session));
  const pending = auth.pending.get(session.id);
  assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');
  assert.equal(url.searchParams.get('agent_name_hint'),'The Long Return');
  assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:4174/auth/callback');
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('nonce'),pending.nonce);
  assert.ok(url.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));
  assert.equal(url.searchParams.get('resource'),'https://api.openai.com/v1');
});

test('invalid or Unicode state and a missing issued ID never exchange a code; callback cannot replay', async () => {
  let calls = 0;
  const auth = new ChatGPTAuth({ store: memoryStore(), origin: 'http://127.0.0.1:4174', fetchImpl: provider(() => { calls++; throw new Error('must not run'); }) });
  const session = { id: 'browser' };
  await auth.start(session);
  await assert.rejects(auth.callback(session,new URL('http://127.0.0.1:4174/auth/callback?state=ü&code=unused&client_id=oaiapp_test')),error => error.code==='invalid_state');
  await auth.start(session);
  const { state } = auth.pending.get(session.id);
  const url = new URL(`http://127.0.0.1:4174/auth/callback?state=${state}&code=unused`);
  await assert.rejects(auth.callback(session,url),error => error.code==='registration_invalid');
  await assert.rejects(auth.callback(session,url),error => error.code==='invalid_state');
  assert.equal(calls,0);
});

test('ID token verification rejects wrong issuer, audience, nonce, expiry and signature', async () => {
  const auth = new ChatGPTAuth({ store: memoryStore(), origin: 'http://127.0.0.1:4174', fetchImpl: provider() });
  const otherKeys = await generateKeyPair('RS256');
  for (const override of [{iss:'https://attacker.example'},{aud:'another-client'},{nonce:'wrong'},{exp:seconds()-100},{key:otherKeys.privateKey}]) {
    await assert.rejects(auth.verifyIdentity(await idToken(override),'oaiapp_test',{nonce:'test-nonce'}),error => error.code==='identity_invalid');
  }
  const identity = await auth.verifyIdentity(await idToken(),'oaiapp_test',{nonce:'test-nonce'});
  assert.equal(identity.sub,'test-user');
});

test('multi-audience identity tokens require this client as the authorized party', async () => {
  const auth = new ChatGPTAuth({ store: memoryStore(), origin: 'http://127.0.0.1:4174', fetchImpl: provider() });
  for (const override of [{aud:['oaiapp_test','another-client']},{aud:['oaiapp_test','another-client'],azp:'another-client'},{azp:'another-client'}]) {
    await assert.rejects(auth.verifyIdentity(await idToken(override),'oaiapp_test',{nonce:'test-nonce'}),error=>error.code==='identity_invalid');
  }
  const valid = await auth.verifyIdentity(await idToken({aud:['oaiapp_test','another-client'],azp:'oaiapp_test'}),'oaiapp_test',{nonce:'test-nonce'});
  assert.equal(valid.sub,'test-user');
});

test('successful sign-in saves verified registration and reports only safe account/model fields', async () => {
  const store = memoryStore();
  const session = { id:'browser' };
  let exchanged;
  let auth;
  const fetchImpl = provider(async form => {
    exchanged = form;
    return Response.json({ access_token:'test-access',refresh_token:'test-refresh',token_type:'Bearer',expires_in:3600,
      scope:'openid resource.invoke chatgpt.tokens.use.direct',id_token:await idToken({nonce:session.nonce}) });
  });
  auth = new ChatGPTAuth({store,origin:'http://127.0.0.1:4174',fetchImpl});
  await auth.start(session);
  const pending = auth.pending.get(session.id);
  session.nonce = pending.nonce;
  const result = await auth.callback(session,new URL(`http://127.0.0.1:4174/auth/callback?state=${pending.state}&code=test-code&client_id=oaiapp_test`));
  assert.equal(result.enabled,true);
  assert.equal(exchanged.get('client_id'),'oaiapp_test');
  assert.equal(exchanged.get('redirect_uri'),pending.redirectUri);
  assert.equal(exchanged.get('code_verifier'),pending.verifier);
  assert.equal(store.state.registrations[0].subject,'test-user');
  await auth.models();
  const state = auth.publicState();
  assert.equal(state.selectedModel,'account-specific-model');
  assert.equal(state.models.length,1);
  assert.ok(!JSON.stringify(state).includes('test-access'));
  assert.ok(!JSON.stringify(state).includes('test-refresh'));
  assert.ok(!JSON.stringify(state).includes('id_token'));
});

test('identity sign-in without plan scopes never authorizes inference', async () => {
  const store = memoryStore();
  store.state.registrations.push({id:'account',client_id:'oaiapp_test',subject:'test-user',access_token:'test-access',expiresAt:Date.now()+3600000,scopes:['openid']});
  store.state.activeId='account';
  const auth = new ChatGPTAuth({store,origin:'http://127.0.0.1:4174',fetchImpl:provider()});
  assert.equal(auth.publicState().configured,false);
  await assert.rejects(auth.accessToken(),error=>error.code==='plan_permission_required');
});

test('concurrent token renewals serialize and atomically retain rotating refresh token', async () => {
  const store = memoryStore();
  store.state.registrations.push({id:'account',client_id:'oaiapp_test',subject:'test-user',access_token:'old-access',refresh_token:'old-refresh',expiresAt:0,scopes:['resource.invoke','chatgpt.tokens.use.direct']});
  store.state.activeId='account';
  let calls=0;
  const auth=new ChatGPTAuth({store,origin:'http://127.0.0.1:4174',fetchImpl:provider(async form=>{
    calls++;
    assert.equal(form.get('client_id'),'oaiapp_test');
    assert.equal(form.get('grant_type'),'refresh_token');
    assert.equal(form.get('scope'),null);
    await new Promise(resolve=>setTimeout(resolve,5));
    return Response.json({access_token:'new-access',refresh_token:'new-refresh',token_type:'Bearer',expires_in:3600,scope:'resource.invoke chatgpt.tokens.use.direct'});
  })});
  assert.deepEqual(await Promise.all([auth.accessToken(),auth.accessToken()]),['new-access','new-access']);
  assert.equal(calls,1);
  assert.equal(store.state.registrations[0].refresh_token,'new-refresh');
});

test('logout clears all tokens while retaining account mapping and host ID', async () => {
  const store=memoryStore();
  store.state.registrations.push({id:'account',client_id:'oaiapp_test',subject:'test-user',access_token:'test-access',refresh_token:'test-refresh',id_token:'test-id',expiresAt:1,scopes:['openid']});
  store.state.activeId='account';
  const auth=new ChatGPTAuth({store,origin:'http://127.0.0.1:4174',fetchImpl:provider()});
  assert.equal((await auth.logout()).revoked,true);
  assert.equal(auth.active.client_id,'oaiapp_test');
  assert.equal(auth.active.access_token,undefined);
  assert.equal(auth.active.refresh_token,undefined);
  assert.equal(auth.active.id_token,undefined);
  assert.equal(store.state.hostId,'urn:uuid:test-host');
});

test('logout immediately blocks new model access while remote revocation is pending', async () => {
  const store=memoryStore();
  store.state.registrations.push({id:'account',client_id:'oaiapp_test',subject:'test-user',access_token:'test-access',refresh_token:'test-refresh',expiresAt:Date.now()+3600000,scopes:['resource.invoke','chatgpt.tokens.use.direct']});
  store.state.activeId='account';
  let finishRevocation, reachedRevocation;
  const reached=new Promise(resolve=>{reachedRevocation=resolve;});
  const ordinary=provider();
  const auth=new ChatGPTAuth({store,origin:'http://127.0.0.1:4174',fetchImpl:async(url,options)=>{
    if(url===metadata.revocation_endpoint){reachedRevocation();return new Promise(resolve=>{finishRevocation=()=>resolve(new Response(null,{status:200}));});}
    return ordinary(url,options);
  }});
  const signingOut=auth.logout();
  assert.equal(auth.publicState().configured,false);
  await reached;
  await assert.rejects(auth.accessToken(),error=>error.code==='connection_changed');
  await assert.rejects(auth.models(),error=>error.code==='connection_changed');
  finishRevocation();
  await signingOut;
  assert.equal(auth.active.access_token,undefined);
});

test('an account switch prevents a pending model selection from modifying another account', async () => {
  const store=memoryStore();
  for(const id of ['a','b'])store.state.registrations.push({id,client_id:`oaiapp_${id}`,subject:id,access_token:`test-${id}`,expiresAt:Date.now()+3600000,scopes:['resource.invoke','chatgpt.tokens.use.direct'],selectedModel:'original'});
  store.state.activeId='a';
  let finishCatalog,reachedCatalog;
  const reached=new Promise(resolve=>{reachedCatalog=resolve;});
  const auth=new ChatGPTAuth({store,origin:'http://127.0.0.1:4174',fetchImpl:async url=>{
    assert.equal(url,'https://api.openai.com/v1/models');reachedCatalog();
    return new Promise(resolve=>{finishCatalog=()=>resolve(Response.json({models:[{slug:'account-a-model',visibility:'list'}]}));});
  }});
  const selecting=auth.selectModel('account-a-model');
  const rejected=assert.rejects(selecting,error=>error.code==='connection_changed');
  await reached;
  await auth.selectAccount('b');
  finishCatalog();
  await rejected;
  assert.equal(auth.active.id,'b');
  assert.equal(auth.active.selectedModel,'original');
  assert.equal(store.state.registrations[0].selectedModel,'original');
});

test('credential file is private, atomic, and reusable without reading another app', async () => {
  const temp=await mkdtemp(join(tmpdir(),'long-return-auth-test-'));
  try {
    const store=new CredentialStore(join(temp,'app-data'));
    await store.load();
    const id=store.state.hostId;
    store.state.registrations.push({id:'example',access_token:'test-only-token'});
    await store.save();
    assert.equal((await stat(store.directory)).mode & 0o777,0o700);
    assert.equal((await stat(store.file)).mode & 0o777,0o600);
    const second=new CredentialStore(store.directory);
    await second.load();
    assert.equal(second.state.hostId,id);
    assert.equal(JSON.parse(await readFile(store.file,'utf8')).registrations[0].id,'example');
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('plan adapter enforces supported HTTP/SSE contract and waits for completed inference', async () => {
  let sent;
  const completed={status:'completed',output:[{content:[{type:'output_text',text:'{"narration":"A gate creaks.","actionId":null,"targetId":null}'}]}]};
  const stream='event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"A"}\r\n\r\n'+
    `event: response.completed\r\ndata: ${JSON.stringify({type:'response.completed',response:completed})}\r\n\r\n`;
  const adapter=createPlanFetch(async (_url,options)=>{
    sent=JSON.parse(options.body);
    const encoder=new TextEncoder();
    return new Response(new ReadableStream({start(controller){
      for(let i=0;i<stream.length;i+=7) controller.enqueue(encoder.encode(stream.slice(i,i+7)));
      controller.close();
    }}),{headers:{'Content-Type':'text/event-stream'}});
  });
  const response=await adapter('https://api.openai.com/v1/responses',{body:JSON.stringify({model:'catalog-model',input:[{role:'user',content:'Look'}],store:true,max_output_tokens:2000,previous_response_id:'old'})});
  assert.equal(sent.store,false);
  assert.equal(sent.stream,true);
  assert.equal(sent.max_output_tokens,undefined);
  assert.equal(sent.previous_response_id,undefined);
  assert.deepEqual(await response.json(),completed);
});

test('plan adapter rejects truncated streams rather than accepting partial narration',async()=>{
  const adapter=createPlanFetch(async()=>new Response('data: {"type":"response.output_text.delta","delta":"Partial"}\n\n',{headers:{'Content-Type':'text/event-stream'}}));
  const response=await adapter('https://api.openai.com/v1/responses',{body:'{"input":[]}'});
  assert.equal(response.status,502);
});

test('loopback server rejects DNS rebinding, cross-site writes, missing CSRF and source/credential paths',async()=>{
  const app=await createLocalServer({port:0,store:memoryStore(),fetchImpl:provider()});
  try {
    const status=await fetch(`${app.origin}/api/dm`);
    const cookie=status.headers.get('set-cookie').split(';')[0];
    const state=await status.json();
    assert.equal(state.localSignInAvailable,true);
    assert.equal(state.configured,false);
    assert.ok(state.csrfToken);
    const rebindingStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(`${app.origin}/api/dm`, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error',reject); request.end();
    });
    assert.equal(rebindingStatus,403);
    assert.equal((await fetch(`${app.origin}/api/dm`,{method:'POST',headers:{Cookie:cookie,Origin:'https://attacker.example','Content-Type':'application/json','X-CSRF-Token':state.csrfToken},body:'{}'})).status,403);
    assert.equal((await fetch(`${app.origin}/api/dm`,{method:'POST',headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json'},body:'{}'})).status,403);
    for (const path of ['/local/oauth.mjs','/server/dm.mjs','/.env','/../.config/the-long-return/chatgpt-session.json']) {
      assert.equal((await fetch(`${app.origin}${path}`)).status,404);
    }
    assert.equal((await fetch(`${app.origin}/`)).status,200);
    assert.equal((await fetch(`${app.origin}/design.html`)).status,200);
    assert.equal((await fetch(`${app.origin}/design-document.txt`)).status,200);
    assert.equal((await fetch(`${app.origin}/api/dm`,{method:'POST',headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-CSRF-Token':state.csrfToken},body:'{}'})).status,401);
  } finally { await app.close(); }
});

test('local browser flow completes mocked OAuth, model discovery and validated SSE inference', async () => {
  const store=memoryStore();
  let loginNonce, modelRequest;
  const proposal={narration:'You hear the gate creak beneath the current.',actionId:null,targetId:null};
  const ordinary=provider(async()=>Response.json({access_token:'test-only-access',refresh_token:'test-only-refresh',token_type:'Bearer',expires_in:3600,
    scope:'openid resource.invoke chatgpt.tokens.use.direct',id_token:await idToken({nonce:loginNonce})}));
  const app=await createLocalServer({port:0,store,fetchImpl:async(url,options)=>{
    if(url==='https://api.openai.com/v1/responses'){
      modelRequest=JSON.parse(options.body);
      assert.equal(options.headers.Authorization,'Bearer test-only-access');
      const response={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(proposal)}]}]};
      return new Response(`data: ${JSON.stringify({type:'response.completed',response})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
    }
    return ordinary(url,options);
  }});
  try{
    const initial=await fetch(`${app.origin}/api/dm`);
    const cookie=initial.headers.get('set-cookie').split(';')[0];
    const redirect=await fetch(`${app.origin}/api/auth/start`,{headers:{Cookie:cookie},redirect:'manual'});
    assert.equal(redirect.status,302);
    const authorization=new URL(redirect.headers.get('location'));
    assert.equal(authorization.origin,issuer);
    loginNonce=authorization.searchParams.get('nonce');
    const callback=await fetch(`${app.origin}/auth/callback?code=test-code&client_id=oaiapp_test&state=${authorization.searchParams.get('state')}`,{headers:{Cookie:cookie},redirect:'manual'});
    assert.equal(callback.status,303);
    assert.equal(callback.headers.get('location'),'/?chatgpt=connected');
    const status=await (await fetch(`${app.origin}/api/dm`,{headers:{Cookie:cookie}})).json();
    assert.equal(status.configured,true);
    assert.equal(status.selectedModel,'account-specific-model');
    assert.ok(!JSON.stringify(status).includes('test-only-access'));
    const result=await fetch(`${app.origin}/api/dm`,{method:'POST',headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-CSRF-Token':status.csrfToken},
      body:JSON.stringify({message:'Listen to the current',context:{revision:7,region:{id:'mereford'},nearbyTargets:[],availableActions:[]}})});
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{ok:true,mode:'live',...proposal,basedOnRevision:7});
    assert.equal(modelRequest.model,'account-specific-model');
    assert.equal(modelRequest.stream,true);
    assert.equal(modelRequest.max_output_tokens,undefined);
  }finally{await app.close();}
});

test('model request concurrency reserves slots while catalog preparation is pending',async()=>{
  const app=await createLocalServer({port:0,store:memoryStore(),fetchImpl:provider()});
  try{
    const initial=await fetch(`${app.origin}/api/dm`);
    const cookie=initial.headers.get('set-cookie').split(';')[0];
    const status=await initial.json();
    const record={id:'a',client_id:'oaiapp_a',subject:'a',access_token:'test-only-access',expiresAt:Date.now()+3600000,scopes:['resource.invoke','chatgpt.tokens.use.direct'],selectedModel:'a-model'};
    app.store.state.registrations.push(record);app.store.state.activeId='a';
    const releases=[];
    let reachedTwo;
    const ready=new Promise(resolve=>{reachedTwo=resolve;});
    app.auth.models=()=>new Promise(resolve=>{releases.push(()=>resolve([]));if(releases.length===2)reachedTwo();});
    const post=()=>fetch(`${app.origin}/api/dm`,{method:'POST',headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-CSRF-Token':status.csrfToken},body:'{}'});
    const first=post(),second=post();
    await ready;
    assert.equal((await post()).status,429);
    for(const release of releases)release();
    await Promise.all([first,second]);
  }finally{await app.close();}
});
