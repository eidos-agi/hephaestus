import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admit } from '../src/usage.ts';
import { usageFixture } from './usage-fixture.mjs';

test('Global admission is exact under concurrency, persists on restart, and resets at UTC midnight',async(t)=>{
  let now=Date.UTC(2026,0,1,12);
  t.mock.method(Date,'now',()=>now);
  const env={GLOBAL_DAILY_LIMIT:'10'};
  const f=usageFixture(env);env.USAGE_GUARD=f.binding;
  const responses=await Promise.all(Array.from({length:50},()=>admit(env,{kind:'global'})));
  assert.equal(responses.filter(r=>r===null).length,10);
  assert.ok(responses.filter(Boolean).every(r=>r.status===503));
  const calls=f.calls;
  assert.equal((await admit(env,{kind:'global'})).status,503);
  assert.equal(f.calls,calls,'warm rejected requests do not keep calling the guard');
  f.restart();
  const afterRestart=await f.binding.get().fetch('https://usage.internal/admit',{method:'POST',body:JSON.stringify({kind:'global'})});
  assert.equal((await afterRestart.json()).allowed,false);
  now=Date.UTC(2026,0,2);
  assert.equal(await admit(env,{kind:'global'}),null);
});

test('OAuth and per-user budgets are independent and denied work does not advance counters',async()=>{
  const env={GLOBAL_DAILY_LIMIT:'10',AUTH_DAILY_LIMIT:'1',USER_DAILY_LIMIT:'1'};
  const f=usageFixture(env);env.USAGE_GUARD=f.binding;
  assert.equal(await admit(env,{kind:'auth'}),null);
  assert.equal((await admit(env,{kind:'auth'})).status,503);
  assert.equal(await admit(env,{kind:'global'}),null);
  assert.equal(await admit(env,{kind:'user',user:'a'.repeat(64)}),null);
  assert.equal((await admit(env,{kind:'user',user:'a'.repeat(64)})).status,429);
  assert.equal(await admit(env,{kind:'user',user:'b'.repeat(64)}),null);
  assert.equal(f.sqlite.prepare("SELECT used FROM daily_usage WHERE bucket='global'").get().used,2);
});

test('Missing or malformed admission infrastructure fails closed',async()=>{
  await assert.rejects(()=>admit({}, {kind:'global'}));
  const USAGE_GUARD={idFromName:x=>x,get:()=>({fetch:async()=>Response.json({})})};
  await assert.rejects(()=>admit({USAGE_GUARD},{kind:'global'}));
  const f=usageFixture({GLOBAL_DAILY_LIMIT:'unlimited'});
  await assert.rejects(()=>f.binding.get().fetch('https://usage.internal/admit',{method:'POST',body:JSON.stringify({kind:'global'})}));
});
