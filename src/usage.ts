import type { Env } from './data.ts';

type Admission = { kind: 'global' | 'auth' | 'user'; user?: string };
const dayLength = 86400000;
export function dailyLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000000) throw new Error('Invalid usage limit');
  return parsed;
}

// A single persistent object serializes admissions across regions and restarts.
// These are request quotas, not an account-wide dollar cap.
export class UsageGuard {
  private blocked = new Map<string, number>();
  private state: DurableObjectState;
  private env: Env;
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_usage (day INTEGER NOT NULL, bucket TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(day,bucket))');
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status:405 });
    const text = await request.text();
    if (text.length > 256) return new Response(null, { status:413 });
    const input = JSON.parse(text) as Admission;
    if (!['global','auth','user'].includes(input.kind) || (input.kind === 'user' && !/^[a-f0-9]{64}$/.test(input.user ?? ''))) return new Response(null, { status:400 });
    const now = Date.now(), day = Math.floor(now / dayLength), reset = (day + 1) * dayLength;
    const buckets: [string, number][] = input.kind === 'user'
      ? [['user:' + input.user, dailyLimit(this.env.USER_DAILY_LIMIT, 2000)]]
      : [['global', dailyLimit(this.env.GLOBAL_DAILY_LIMIT, 10000)]];
    if (input.kind === 'auth') buckets.push(['auth', dailyLimit(this.env.AUTH_DAILY_LIMIT, 500)]);
    for (const [key, until] of this.blocked) if (until <= now) this.blocked.delete(key);
    let denied = buckets.find(([bucket]) => this.blocked.get(bucket) === reset)?.[0];
    if (!denied) denied = this.state.storage.transactionSync(() => {
      for (const [bucket, limit] of buckets) {
        const row = [...this.state.storage.sql.exec<{used:number}>('SELECT used FROM daily_usage WHERE day=? AND bucket=?', day, bucket)][0];
        if ((row?.used ?? 0) >= limit) return bucket;
      }
      for (const [bucket] of buckets) this.state.storage.sql.exec('INSERT INTO daily_usage(day,bucket,used) VALUES(?,?,1) ON CONFLICT(day,bucket) DO UPDATE SET used=used+1', day, bucket);
      this.state.storage.sql.exec('DELETE FROM daily_usage WHERE day < ?', day - 1);
      return undefined;
    });
    if (denied) this.blocked.set(denied, reset);
    return Response.json({ allowed: !denied, bucket: denied, reset_at: reset });
  }
}

const pauses = new WeakMap<DurableObjectNamespace, Map<string, number>>();
export async function admit(env: Env, input: Admission): Promise<Response | null> {
  if (!env.USAGE_GUARD) throw new Error('Usage guard unavailable');
  let paused = pauses.get(env.USAGE_GUARD);
  if (!paused) { paused = new Map(); pauses.set(env.USAGE_GUARD, paused); }
  const now = Date.now();
  for (const [key, until] of paused) if (until <= now) paused.delete(key);
  const key = input.kind === 'user' ? 'user:' + input.user : input.kind;
  let reset = paused.get('global') ?? paused.get(key);
  if (!reset) {
    const stub = env.USAGE_GUARD.get(env.USAGE_GUARD.idFromName('hephaestus-daily-usage-v1'));
    const response = await stub.fetch('https://usage.internal/admit', { method:'POST', body:JSON.stringify(input) });
    if (!response.ok) throw new Error('Usage guard unavailable');
    const decision = await response.json<{allowed:boolean;bucket?:string;reset_at:number}>();
    if (typeof decision.allowed !== 'boolean' || !Number.isSafeInteger(decision.reset_at) || decision.reset_at <= now || decision.reset_at > now + dayLength) throw new Error('Invalid usage decision');
    if (decision.allowed) return null;
    reset = decision.reset_at;
    paused.set(decision.bucket === 'global' ? 'global' : key, reset);
  }
  return Response.json({ error:'usage_limit_reached', message:'The usage allowance is exhausted. Access resumes after the daily reset.' }, {
    status: input.kind === 'user' ? 429 : 503,
    headers: { 'Retry-After': String(Math.max(1, Math.ceil((reset - now) / 1000))) },
  });
}
