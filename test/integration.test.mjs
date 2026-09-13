import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { randomBytes,createHash } from 'node:crypto';
import worker from '../src/index.ts';
import { buildRelease } from '../scripts/build-guidance.mjs';
import { canonical,sha256,validateRelease } from '../src/schema.ts';
import { ISSUER,RESOURCE } from '../src/oauth.ts';

async function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  for(const file of ['0001_guidance.sql','0002_api_tokens.sql','0003_oauth.sql']) sqlite.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const sessions=[];
  const DB={
    withSession(constraint){sessions.push(constraint);return this;},
    prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async run(){return sqlite.prepare(sql).run(...params);}};},
  };
  const env={DB};
  const release=await buildRelease();
  sqlite.prepare('INSERT INTO guidance_releases(revision,payload) VALUES(?,?)').run(release.revision,JSON.stringify(release));
  const token='hph_'+randomBytes(32).toString('base64url');
  sqlite.prepare('INSERT INTO api_tokens(id,user_id,token_hash) VALUES(?,?,?)').run('owner','example-user',await sha256(token));
  const request=(path,options={})=>worker.fetch(new Request(ISSUER+path,options),env);
  const rpc=async(method,params={},auth=token)=>{
    const response=await request('/mcp',{method:'POST',headers:{Authorization:`Bearer ${auth}`,Accept:'application/json, text/event-stream','Content-Type':'application/json','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    const text=await response.text();
    let body;try{body=JSON.parse(text);}catch{const data=text.split('\n').find(s=>s.startsWith('data: '));body=data?JSON.parse(data.slice(6)):text;}
    return {status:response.status,body};
  };
  const call=async(name,args={})=>(await rpc('tools/call',{name,arguments:args})).body.result;
  return {sqlite,env,release,token,request,rpc,call,sessions};
}

test('MCP initialization, focused reads, unchanged replies, resource discovery and validation',async()=>{
  const f=await fixture();
  const init=await f.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'integration',version:'1'}});
  assert.equal(init.status,200);assert.equal(init.body.result.serverInfo.name,'hephaestus');
  const listed=await f.rpc('tools/list');assert.equal(listed.body.result.tools.length,3);
  assert.ok(listed.body.result.tools.every(t=>t.annotations.readOnlyHint));
  const current=(await f.call('hephaestus_latest')).structuredContent;
  assert.equal(current.revision,f.release.revision);assert.equal(current.topics.length,6);
  const unchanged=(await f.call('hephaestus_latest',{known_revision:current.revision})).structuredContent;
  assert.equal(unchanged.changed,false);assert.equal(unchanged.topics,undefined);
  const focused=(await f.call('hephaestus_guidance',{topic:'core',revision:current.revision})).structuredContent;
  assert.ok(focused.text.includes('Efficient execution'));
  const reused=(await f.call('hephaestus_guidance',{topic:'core',known_hash:focused.hash})).structuredContent;
  assert.equal(reused.changed,false);assert.equal(reused.text,undefined);
  assert.equal((await f.call('hephaestus_guidance',{topic:'missing'})).isError,true);
  assert.equal((await f.call('hephaestus_guidance',{topic:'../../private'})).isError,true);
  assert.equal((await f.rpc('resources/list')).body.result.resources.length,1);
  assert.equal((await f.rpc('resources/read',{uri:'hephaestus://guidance/current'})).body.result.contents.length,1);
  assert.ok(f.sessions.every(s=>s==='first-primary'));
});

test('New publications are visible on next call while pinned revisions remain stable',async()=>{
  const f=await fixture();
  const body={...f.release,version:'0.1.1',previous_revision:f.release.revision,summary:'Publication check'};delete body.revision;
  const newer=await validateRelease({...body,revision:await sha256(canonical(body))});
  f.sqlite.prepare('INSERT INTO guidance_releases(revision,payload) VALUES(?,?)').run(newer.revision,JSON.stringify(newer));
  const latest=(await f.call('hephaestus_latest',{known_revision:f.release.revision})).structuredContent;
  assert.equal(latest.revision,newer.revision);assert.equal(latest.changed,true);
  assert.equal((await f.call('hephaestus_guidance',{topic:'core',revision:f.release.revision})).structuredContent.revision,f.release.revision);
  const updates=(await f.call('hephaestus_updates',{after_revision:f.release.revision})).structuredContent;
  assert.equal(updates.releases.length,1);assert.equal(updates.releases[0].revision,newer.revision);
  const page=(await f.call('hephaestus_updates',{limit:1})).structuredContent;assert.equal(page.has_more,true);
  assert.equal((await f.call('hephaestus_updates',{after_revision:'a'.repeat(64)})).structuredContent.reset_required,true);
  const tampered={...newer,summary:'tampered'};
  f.sqlite.prepare('UPDATE guidance_releases SET payload=? WHERE revision=?').run(JSON.stringify(tampered),newer.revision);
  assert.equal((await f.call('hephaestus_latest')).isError,true);
});

test('Missing credentials, wrong origin, oversized bodies, and revoked tokens fail closed',async()=>{
  const f=await fixture();
  const missing=await f.request('/mcp',{method:'POST'});assert.equal(missing.status,401);
  assert.ok(missing.headers.get('WWW-Authenticate').includes('resource_metadata='));
  assert.equal(missing.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal((await f.request('/api/latest',{headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await f.request('/mcp',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.request('/mcp',{method:'POST',body:'x'.repeat(33000)})).status,413);
  f.sqlite.prepare("UPDATE api_tokens SET revoked_at='now' WHERE id='owner'").run();
  assert.equal((await f.rpc('tools/list')).status,401);
});

test('ChatGPT OAuth discovery, DCR, PKCE, code replay, audience binding, session expiry and user revocation',async()=>{
  const f=await fixture();
  const discovery=await (await f.request('/.well-known/oauth-authorization-server')).json();
  assert.ok(discovery.code_challenge_methods_supported.includes('S256'));
  assert.equal((await (await f.request('/.well-known/oauth-protected-resource')).json()).resource,RESOURCE);
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const reg=await f.request('/oauth/register',{method:'POST',body:JSON.stringify({client_name:'ChatGPT',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token']})});
  assert.equal(reg.status,201);const {client_id,grant_types}=await reg.json();
  assert.deepEqual(grant_types,['authorization_code']);
  assert.equal((await f.request('/oauth/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token'})})).status,400);
  for(const grants of [[],['refresh_token'],['client_credentials']]) {
    assert.equal((await f.request('/oauth/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect],grant_types:grants})})).status,400);
  }
  assert.equal((await f.request('/oauth/register',{method:'POST',body:JSON.stringify({redirect_uris:['https://evil.example/callback']})})).status,400);
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const q=new URLSearchParams({client_id,redirect_uri:redirect,response_type:'code',resource:RESOURCE,scope:'guidance:read',state:'keep-me',code_challenge:challenge,code_challenge_method:'S256'});
  const page=await f.request('/oauth/authorize?'+q);assert.equal(page.status,200);
  assert.equal(page.headers.get('Referrer-Policy'),'strict-origin');
  const cookie=page.headers.get('Set-Cookie').split(';')[0];
  const id=/name="request_id" value="([^"]+)"/.exec(await page.text())[1];
  const form=new URLSearchParams({request_id:id,api_token:f.token});
  for(const origin of ['null','https://evil.example']) {
    assert.equal((await f.request('/oauth/authorize',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form})).status,403);
  }
  assert.equal((await f.request('/oauth/authorize',{method:'POST',headers:{Origin:ISSUER},body:form})).status,403);
  const approval=await f.request('/oauth/authorize',{method:'POST',headers:{Origin:ISSUER,Cookie:cookie},body:form});assert.equal(approval.status,303);
  const callback=new URL(approval.headers.get('Location'));assert.equal(callback.searchParams.get('state'),'keep-me');assert.equal(callback.searchParams.get('iss'),ISSUER);
  const exchange=new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri:redirect,resource:RESOURCE,code:callback.searchParams.get('code'),code_verifier:verifier});
  const wrong=new URLSearchParams(exchange);wrong.set('resource','https://evil.example/mcp');
  assert.equal((await f.request('/oauth/token',{method:'POST',body:wrong})).status,400);
  wrong.set('resource',RESOURCE);wrong.set('code_verifier','a'.repeat(43));
  assert.equal((await f.request('/oauth/token',{method:'POST',body:wrong})).status,400);
  const tokenResponse=await f.request('/oauth/token',{method:'POST',body:exchange});assert.equal(tokenResponse.status,200);
  const {access_token}=await tokenResponse.json();assert.ok(access_token.startsWith('hpo_'));assert.notEqual(access_token,f.token);
  assert.equal((await f.request('/oauth/token',{method:'POST',body:exchange})).status,400);
  assert.equal((await f.rpc('tools/list',{},access_token)).status,200);
  f.sqlite.prepare('UPDATE oauth_sessions SET expires_at=0').run();assert.equal((await f.rpc('tools/list',{},access_token)).status,401);
  f.sqlite.prepare('UPDATE oauth_sessions SET expires_at=?').run(Date.now()+60000);
  f.sqlite.prepare("UPDATE api_tokens SET revoked_at='now' WHERE id='owner'").run();assert.equal((await f.rpc('tools/list',{},access_token)).status,401);
});

test('Human sign-in has 30 minutes while approved codes expire after five minutes',async(t)=>{
  const f=await fixture(),started=Date.now();
  let now=started;
  t.mock.method(Date,'now',()=>now);
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const {client_id}=await (await f.request('/oauth/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect]})})).json();
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const query=new URLSearchParams({client_id,redirect_uri:redirect,response_type:'code',resource:RESOURCE,code_challenge:challenge,code_challenge_method:'S256'});
  const begin=async()=>{
    const page=await f.request('/oauth/authorize?'+query);
    assert.match(page.headers.get('Set-Cookie'),/Max-Age=1800(?:;|$)/);
    const cookie=page.headers.get('Set-Cookie').split(';')[0];
    const request_id=/name="request_id" value="([^"]+)"/.exec(await page.text())[1];
    return {cookie,form:new URLSearchParams({request_id,api_token:f.token})};
  };
  const first=await begin();
  now=started+15*60*1000;
  const approval=await f.request('/oauth/authorize',{method:'POST',headers:{Origin:ISSUER,Cookie:first.cookie},body:first.form});
  assert.equal(approval.status,303);
  const code=new URL(approval.headers.get('Location')).searchParams.get('code');
  now+=5*60*1000;
  const exchange=new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri:redirect,resource:RESOURCE,code,code_verifier:verifier});
  assert.equal((await f.request('/oauth/token',{method:'POST',body:exchange})).status,400);
  const second=await begin();
  now+=30*60*1000;
  assert.equal((await f.request('/oauth/authorize',{method:'POST',headers:{Origin:ISSUER,Cookie:second.cookie},body:second.form})).status,400);
});
