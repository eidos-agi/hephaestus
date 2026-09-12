import { z } from 'zod';
import { sha256 } from './schema.ts';
import type { Env } from './data.ts';

export const ISSUER = 'https://hephaestus.eidosagi.com';
export const RESOURCE = ISSUER + '/mcp';
export const SCOPE = 'guidance:read';
const reply = (body: unknown, status=200) => Response.json(body,{status});
const error = (name: string, description: string, status=400) => reply({error:name,error_description:description},status);
const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const cookieName = '__Host-hephaestus-connect';
const escape = (text: string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function redirectAllowed(uri: string) {
  try {
    const url = new URL(uri);
    if (url.username || url.password || url.hash || url.search) return false;
    if (url.origin === 'https://chatgpt.com') return url.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname);
    return url.protocol === 'http:' && ['127.0.0.1','[::1]','localhost'].includes(url.hostname) && /^\/(oauth\/)?callback(?:\/[a-zA-Z0-9_-]+)?$/.test(url.pathname);
  } catch { return false; }
}

const registerSchema = z.object({
  client_name:z.string().min(1).max(100).default('MCP client'),
  redirect_uris:z.array(z.string().max(2048).refine(redirectAllowed)).min(1).max(5),
  token_endpoint_auth_method:z.literal('none').default('none'),
  grant_types:z.array(z.literal('authorization_code')).default(['authorization_code']),
  response_types:z.array(z.literal('code')).default(['code']),
});

interface Pending { client_id:string; redirect_uri:string; resource:string; state:string; challenge:string; expires_at:number; root_token_id:string|null; }

function loginPage(id:string,clientName:string,redirectUri:string) {
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Hephaestus</title><style>body{font:17px system-ui;background:#11141b;color:#edf0f6;margin:0;padding:8vh 24px}main{max-width:460px;margin:auto}h1{font-size:36px;letter-spacing:-1px}p{line-height:1.6;color:#b6bece}label{display:block;margin:28px 0 10px}input,button{box-sizing:border-box;width:100%;padding:15px;font:inherit;border-radius:8px}input{background:#202633;border:1px solid #485163;color:white}button{margin-top:18px;background:#efad59;color:#11141b;border:0;font-weight:650;cursor:pointer}small{color:#b6bece;overflow-wrap:anywhere}</style><main><small>EIDOS AGI</small><h1>Connect Hephaestus</h1><p>Allow <strong>${escape(clientName)}</strong> to read Hephaestus execution guidance and updates.</p><p>This connection can only read guidance. Enter your personal Hephaestus API token to continue.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${id}"><label for="api_token">Your API token</label><input id="api_token" name="api_token" type="password" required autocomplete="off" spellcheck="false" placeholder="hph_…"><button>Connect and continue</button></form><p><small>Returns to ${escape(redirectUri)}. Your API token stays with Hephaestus; the client receives a separate connection token valid for 30 days. Revoking your API token also disconnects linked clients.</small></p></main></html>`;
  return new Response(page,{headers:{
    'Content-Type':'text/html;charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Frame-Options':'DENY',
    'Set-Cookie':`${cookieName}=${id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
  }});
}

export async function oauth(request:Request,env:Env):Promise<Response|null> {
  const url = new URL(request.url);
  const path=url.pathname;
  if (request.method==='GET' && ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(path)) return reply({
    resource:RESOURCE,authorization_servers:[ISSUER],scopes_supported:[SCOPE],bearer_methods_supported:['header'],
    resource_documentation:'https://github.com/eidos-agi/hephaestus',
  });
  if (request.method==='GET' && path==='/.well-known/oauth-authorization-server') return reply({
    issuer:ISSUER,authorization_endpoint:ISSUER+'/oauth/authorize',token_endpoint:ISSUER+'/oauth/token',
    registration_endpoint:ISSUER+'/oauth/register',revocation_endpoint:ISSUER+'/oauth/revoke',
    response_types_supported:['code'],grant_types_supported:['authorization_code'],
    token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:[SCOPE],
    authorization_response_iss_parameter_supported:true,
  });
  if (path==='/oauth/register' && request.method==='POST') {
    const parsed=registerSchema.safeParse(await request.json().catch(()=>null));
    if (!parsed.success) return error('invalid_client_metadata','Use public-client PKCE and a ChatGPT or local Codex callback.');
    const c=parsed.data,id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO oauth_clients(id,name,redirect_uris) VALUES(?,?,?)').bind(id,c.client_name,JSON.stringify(c.redirect_uris)).run();
    return reply({...c,client_id:id,client_id_issued_at:Math.floor(Date.now()/1000)},201);
  }
  if (path==='/oauth/authorize' && request.method==='GET') {
    const p=url.searchParams;
    const client=await env.DB.withSession('first-primary').prepare('SELECT name,redirect_uris FROM oauth_clients WHERE id=?').bind(p.get('client_id')??'').first<{name:string;redirect_uris:string}>();
    const redirect=p.get('redirect_uri')??'';
    if (!client || !(JSON.parse(client.redirect_uris) as string[]).includes(redirect)) return error('invalid_request','Unregistered client or redirect URI.');
    if (p.get('response_type')!=='code' || p.get('code_challenge_method')!=='S256' || !/^[A-Za-z0-9_-]{43}$/.test(p.get('code_challenge')??'') || p.get('resource')!==RESOURCE || (p.get('scope')??SCOPE)!==SCOPE || (p.get('state')??'').length>2048) return error('invalid_request','S256 PKCE, the Hephaestus resource, and guidance:read scope are required.');
    const id=random();
    await env.DB.prepare('INSERT INTO oauth_requests(id_hash,client_id,redirect_uri,resource,state,challenge,expires_at) VALUES(?,?,?,?,?,?,?)').bind(await sha256(id),p.get('client_id'),redirect,RESOURCE,p.get('state')??'',p.get('code_challenge'),Date.now()+600000).run();
    return loginPage(id,client.name,redirect);
  }
  if (path==='/oauth/authorize' && request.method==='POST') {
    if (request.headers.get('Origin')!==ISSUER) return error('invalid_request','Invalid form origin.',403);
    const form=new URLSearchParams(await request.text());
    const id=form.get('request_id')??'';
    const cookie=request.headers.get('Cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(id) || cookie!==id) return error('invalid_request','Connection request expired. Start again.',403);
    const token=form.get('api_token')??'';
    if (!/^hph_[A-Za-z0-9_-]{43}$/.test(token)) return error('access_denied','Invalid API token.',401);
    const root=await env.DB.withSession('first-primary').prepare('SELECT id FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL').bind(await sha256(token)).first<{id:string}>();
    if (!root) return error('access_denied','Invalid API token.',401);
    const code=random();
    const pending=await env.DB.prepare('UPDATE oauth_requests SET code_hash=?,root_token_id=? WHERE id_hash=? AND expires_at>? AND code_hash IS NULL RETURNING redirect_uri,state').bind(await sha256(code),root.id,await sha256(id),Date.now()).first<{redirect_uri:string;state:string}>();
    if (!pending) return error('invalid_request','Connection request expired or already approved.');
    const redirect=new URL(pending.redirect_uri);redirect.searchParams.set('code',code);redirect.searchParams.set('state',pending.state);redirect.searchParams.set('iss',ISSUER);
    return new Response(null,{status:303,headers:{Location:redirect.href,'Set-Cookie':`${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`}});
  }
  if (path==='/oauth/token' && request.method==='POST') {
    const p=new URLSearchParams(await request.text());
    if (p.get('grant_type')!=='authorization_code') return error('unsupported_grant_type','Use authorization_code with PKCE.');
    if (p.get('resource')!==RESOURCE || !/^[A-Za-z0-9._~-]{43,128}$/.test(p.get('code_verifier')??'')) return error('invalid_grant','Invalid resource or code verifier.');
    const hash=await sha256(p.get('code_verifier')!);
    const challenge=btoa(String.fromCharCode(...hash.match(/../g)!.map(h=>parseInt(h,16)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    // Atomic consumption makes concurrent code replay fail.
    const pending=await env.DB.prepare(`UPDATE oauth_requests SET consumed_at=? WHERE code_hash=? AND client_id=? AND redirect_uri=? AND resource=? AND challenge=? AND expires_at>? AND consumed_at IS NULL AND EXISTS(SELECT 1 FROM api_tokens t WHERE t.id=root_token_id AND t.revoked_at IS NULL) RETURNING root_token_id`).bind(Date.now(),await sha256(p.get('code')??''),p.get('client_id')??'',p.get('redirect_uri')??'',RESOURCE,challenge,Date.now()).first<{root_token_id:string}>();
    if (!pending) return error('invalid_grant','Invalid, expired, or consumed authorization code.');
    const token='hpo_'+random(),expiresIn=30*24*60*60;
    await env.DB.prepare('INSERT INTO oauth_sessions(id,root_token_id,client_id,resource,token_hash,expires_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),pending.root_token_id,p.get('client_id'),RESOURCE,await sha256(token),Date.now()+expiresIn*1000).run();
    return reply({access_token:token,token_type:'Bearer',expires_in:expiresIn,scope:SCOPE});
  }
  if (path==='/oauth/revoke' && request.method==='POST') {
    const p=new URLSearchParams(await request.text());
    await env.DB.prepare('UPDATE oauth_sessions SET revoked_at=? WHERE token_hash=? AND client_id=?').bind(Date.now(),await sha256(p.get('token')??''),p.get('client_id')??'').run();
    return reply({});
  }
  if (path.startsWith('/oauth/') || path.startsWith('/.well-known/')) return error('invalid_request','Unknown endpoint or method.',404);
  return null;
}
