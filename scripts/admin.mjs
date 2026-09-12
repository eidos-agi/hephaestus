import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { buildRelease } from './build-guidance.mjs';
import { sha256 } from '../src/schema.ts';

const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const apiToken=process.env.CLOUDFLARE_API_TOKEN;
if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required for administration.');
async function query(sql,params=[]) {
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/d1/database/${config.d1_databases[0].database_id}/query`,{
    method:'POST',headers:{Authorization:`Bearer ${apiToken}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),
  });
  const data=await response.json();
  if (!response.ok || !data.success || data.result?.some(r=>!r.success)) throw new Error(`Cloudflare administration failed (${response.status}).`);
  return data.result[0];
}
const [command,arg,out]=process.argv.slice(2);
if (command==='publish') {
  const release=await buildRelease();
  const result=await query(`INSERT INTO guidance_releases(revision,payload)
    SELECT ?,? WHERE COALESCE((SELECT revision FROM guidance_releases ORDER BY seq DESC LIMIT 1),'')=?
    ON CONFLICT(revision) DO NOTHING RETURNING seq`,[release.revision,JSON.stringify(release),release.previous_revision??'']);
  if (!result.results.length) {
    const head=await query('SELECT revision FROM guidance_releases ORDER BY seq DESC LIMIT 1');
    if (head.results[0]?.revision!==release.revision) throw new Error('Release conflict: update previous_revision to the current published revision and rebuild.');
  }
  console.log(JSON.stringify({published_revision:release.revision}));
} else if (command==='issue-token') {
  if (!arg || arg.length>120 || !out) throw new Error('Usage: admin.mjs issue-token USER_ID OUTPUT_FILE');
  const token='hph_'+randomBytes(32).toString('base64url'),id=randomUUID();
  // Create the private output first; an API failure leaves an unusable token, not a lost active credential.
  await writeFile(out,JSON.stringify({id,user_id:arg,api_token:token,mcp_url:'https://hephaestus.eidosagi.com/mcp'},null,2)+'\n',{mode:0o600,flag:'wx'});
  await query('INSERT INTO api_tokens(id,user_id,token_hash) VALUES(?,?,?)',[id,arg,await sha256(token)]);
  console.log(JSON.stringify({id,user_id:arg,credential_file:out}));
} else if (command==='revoke-token') {
  if (!arg) throw new Error('Usage: admin.mjs revoke-token TOKEN_ID');
  const result=await query("UPDATE api_tokens SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING id,user_id",[arg]);
  console.log(JSON.stringify(result.results));
} else if (command==='list-tokens') {
  console.log(JSON.stringify((await query('SELECT id,user_id,created_at,revoked_at FROM api_tokens ORDER BY created_at DESC')).results,null,2));
} else throw new Error('Commands: publish, issue-token, revoke-token, list-tokens');

