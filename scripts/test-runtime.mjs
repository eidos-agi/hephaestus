import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { buildRelease } from './build-guidance.mjs';

// Local workerd only. No production credentials or HTTP calls to the live service.
const directory=await mkdtemp(join(tmpdir(),'hephaestus-runtime-'));
const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const options=convertV4MiniflareOptions({
  name:'hephaestus-runtime',modules:true,scriptPath:new URL('../dist/worker/index.js',import.meta.url).pathname,
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
  bindings:{...config.vars,GLOBAL_DAILY_LIMIT:'6',USER_DAILY_LIMIT:'2'},
  resourcePersistencePath:directory,d1Databases:['DB'],
  durableObjects:{USAGE_GUARD:{className:'UsageGuard',useSQLite:true}},
  ratelimits:Object.fromEntries(config.ratelimits.map(({name,...value})=>[name,value])),
});
let mf=new Miniflare(options);
try {
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_guidance.sql','0002_api_tokens.sql','0003_oauth.sql']) {
    const sql=await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
    for(const statement of sql.split(';').filter(s=>s.trim())) await db.prepare(statement).run();
  }
  const release=await buildRelease();
  await db.prepare('INSERT INTO guidance_releases(revision,payload) VALUES(?,?)').bind(release.revision,JSON.stringify(release)).run();
  const token='hph_'+randomBytes(32).toString('base64url');
  await db.prepare('INSERT INTO api_tokens(id,user_id,token_hash) VALUES(?,?,?)').bind('runtime-fixture','example-user',createHash('sha256').update(token).digest('hex')).run();
  const read=(credential=token)=>mf.dispatchFetch('https://local.test/api/latest',{headers:{Authorization:`Bearer ${credential}`}});
  assert.equal((await mf.dispatchFetch('https://local.test/health')).status,200);
  assert.equal((await mf.dispatchFetch('https://local.test/mcp',{method:'POST'})).status,401);
  assert.equal((await read()).status,200);
  assert.equal((await read()).status,200);
  assert.equal((await read()).status,429);
  for(let i=0;i<3;i++) assert.equal((await read('hph_'+'a'.repeat(43))).status,401);
  const denied=await read();assert.equal(denied.status,503);assert.equal((await denied.json()).error,'usage_limit_reached');
  await mf.dispose();mf=new Miniflare(options);
  const persisted=await read();assert.equal(persisted.status,503);assert.equal((await persisted.json()).error,'usage_limit_reached');
  console.log(JSON.stringify({status:'passed',runtime:'local workerd',checks:['D1-backed authenticated read','per-user quota','global cutoff','Durable Object persistence after restart']}));
} finally {
  await mf.dispose();
  await rm(directory,{recursive:true,force:true});
}
