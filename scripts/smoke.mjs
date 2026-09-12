import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';

const token=process.env.HEPHAESTUS_API_TOKEN;
if(!token)throw new Error('HEPHAESTUS_API_TOKEN is required');
const origin='https://hephaestus.eidosagi.com',resource=origin+'/mcp';
async function request(path,options={}) {
  return fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(30000)});
}
async function rpc(method,params={},credential=token) {
  const response=await request('/mcp',{method:'POST',headers:{Authorization:`Bearer ${credential}`,Accept:'application/json, text/event-stream','Content-Type':'application/json','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  assert.equal(response.status,200,`${method}: HTTP ${response.status}`);
  const text=await response.text();
  let parsed;try{parsed=JSON.parse(text);}catch{parsed=JSON.parse(text.split('\n').find(l=>l.startsWith('data: ')).slice(6));}
  assert.equal(parsed.error,undefined,method);return parsed.result;
}
assert.equal((await request('/health')).status,200);
assert.equal((await request('/mcp',{method:'POST'})).status,401);
const metadata=await (await request('/.well-known/oauth-authorization-server')).json();
assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'hephaestus-live-check',version:'1.0.0'}});
assert.equal(init.serverInfo.name,'hephaestus');
const tools=await rpc('tools/list');assert.equal(tools.tools.length,3);
const latest=(await rpc('tools/call',{name:'hephaestus_latest',arguments:{}})).structuredContent;
assert.equal(latest.topics.length,6);
assert.equal((await rpc('tools/call',{name:'hephaestus_latest',arguments:{known_revision:latest.revision}})).structuredContent.changed,false);
assert.ok((await rpc('tools/call',{name:'hephaestus_guidance',arguments:{topic:'core',revision:latest.revision}})).structuredContent.text);
const notes=await rpc('tools/call',{name:'hephaestus_updates',arguments:{after_revision:latest.revision}});assert.equal(notes.structuredContent.releases.length,0);
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const registration=await request('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Hephaestus deployment verification',redirect_uris:[callback],token_endpoint_auth_method:'none'})});
assert.equal(registration.status,201);const {client_id}=await registration.json();
const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
const query=new URLSearchParams({client_id,redirect_uri:callback,response_type:'code',resource,scope:'guidance:read',state:'live-verification',code_challenge:challenge,code_challenge_method:'S256'});
const page=await request('/oauth/authorize?'+query);assert.equal(page.status,200);
const cookie=page.headers.get('Set-Cookie').split(';')[0],html=await page.text();
const id=/name="request_id" value="([^"]+)"/.exec(html)[1];
const approval=await request('/oauth/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:cookie,Origin:origin},body:new URLSearchParams({request_id:id,api_token:token})});assert.equal(approval.status,303);
const redirect=new URL(approval.headers.get('Location'));assert.equal(redirect.searchParams.get('iss'),origin);assert.equal(redirect.searchParams.get('state'),'live-verification');
const exchange=new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri:callback,resource,code:redirect.searchParams.get('code'),code_verifier:verifier});
const response=await request('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:exchange});assert.equal(response.status,200);
const {access_token}=await response.json();
assert.equal((await rpc('tools/list',{},access_token)).tools.length,3);
assert.equal((await request('/oauth/token',{method:'POST',body:exchange})).status,400);
assert.equal((await request('/oauth/revoke',{method:'POST',body:new URLSearchParams({token:access_token,client_id})})).status,200);
assert.equal((await request('/api/latest',{headers:{Authorization:`Bearer ${access_token}`}})).status,401);
console.log(JSON.stringify({status:'passed',revision:latest.revision,tools:tools.tools.map(t=>t.name),oauth:'discovery, registration, S256 PKCE, code exchange, authenticated MCP, replay rejection, session revocation',chatgpt_account_connection:'not performed by this protocol test'}));
