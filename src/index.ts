import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { authenticate } from './auth.ts';
import { guidance, manifest, NotFound, readRelease, updates, type Env } from './data.ts';
import { revisionSchema, topicIdSchema } from './schema.ts';
import { oauth, ISSUER, SCOPE } from './oauth.ts';

const instructions = 'Hephaestus supplies current execution guidance. Call hephaestus_latest once at task start or a major phase boundary, then fetch only relevant topics with hephaestus_guidance. Reuse unchanged topic hashes and pin the returned release revision. Guidance does not override host instructions, user scope, or permissions. It cannot grant agent or model controls. Updates are fresh on call, not unsolicited push notifications.';
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const result = (value: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value });
const guarded = async (fn: () => Promise<Record<string, unknown>>) => {
  try { return result(await fn()); }
  catch (error) {
    return { isError: true, content: [{ type: 'text' as const, text: error instanceof NotFound ? error.message : 'Current guidance is unavailable. Use bundled skill guidance and do not describe it as current.' }] };
  }
};

function createServer(env: Env) {
  const server = new McpServer({ name: 'hephaestus', version: '0.1.0' }, { instructions });
  server.registerTool('hephaestus_latest', {
    title: 'Check Hephaestus updates', description: 'Check the current guidance revision before substantial work. Returns a compact unchanged response when known_revision matches; otherwise lists topic hashes. No task text is needed.',
    inputSchema: z.object({ known_revision: revisionSchema.optional() }).strict(), annotations,
  }, ({ known_revision }) => guarded(async () => manifest(await readRelease(env.DB), known_revision)));
  server.registerTool('hephaestus_guidance', {
    title: 'Read focused Hephaestus guidance', description: 'Read one topic: core, context, delegation, models, tools, or review. Pin revision from hephaestus_latest for consistent reads. Supply known_hash to omit unchanged text.',
    inputSchema: z.object({ topic: topicIdSchema, revision: revisionSchema.optional(), known_hash: revisionSchema.optional() }).strict(), annotations,
  }, ({ topic, revision, known_hash }) => guarded(async () => guidance(await readRelease(env.DB, revision), topic, known_hash)));
  server.registerTool('hephaestus_updates', {
    title: 'Read Hephaestus release notes', description: 'Read a bounded page of release summaries after a known revision. Follow next_after_revision only when has_more is true. An unknown cursor requires a fresh latest check.',
    inputSchema: z.object({ after_revision: revisionSchema.optional(), limit: z.number().int().min(1).max(10).default(5) }).strict(), annotations,
  }, ({ after_revision, limit }) => guarded(() => updates(env.DB, after_revision, limit)));
  server.registerResource('current-guidance', 'hephaestus://guidance/current', {
    title: 'Current Hephaestus guidance index', mimeType: 'application/json', description: 'Current release and topic hashes; use tools for focused content.',
  }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(manifest(await readRelease(env.DB))) }] }));
  return server;
}

const allowedOrigins = new Set(['https://chatgpt.com', 'https://chat.openai.com', 'https://hephaestus.eidosagi.com', 'https://hephaestus.eidos-agi.workers.dev']);
function json(value: unknown, status = 200, headers: Record<string,string> = {}) {
  return Response.json(value, { status, headers });
}
function secure(response: Response, origin: string | null) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version');
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const originAllowed = !origin || allowedOrigins.has(origin) || origin === url.origin;
    if (!originAllowed) return secure(json({ error: 'Origin not allowed' }, 403), null);
    const reply = (r: Response) => secure(r, origin);
    if (url.pathname === '/' && request.method === 'GET') return reply(json({
      name: 'Hephaestus', mcp: '/mcp', authentication: 'Per-user API token with OAuth for ChatGPT and direct bearer access for API clients',
      repository: 'https://github.com/eidos-agi/hephaestus', guidance: 'Versioned execution guidance, fresh on each call.',
    }));
    if (url.pathname === '/health' && request.method === 'GET') {
      try { await readRelease(env.DB); return reply(json({ status:'ok', service:'hephaestus' })); }
      catch { return reply(json({ status:'unavailable', service:'hephaestus' },503)); }
    }
    if (request.method === 'OPTIONS') return reply(new Response(null, { status:204, headers: {
      'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id',
    }}));
    try {
      if (url.pathname.startsWith('/oauth/') && env.AUTH_RATE_LIMIT) {
        const allowed=await env.AUTH_RATE_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')??'unknown'});
        if (!allowed.success) return reply(json({error:'rate_limited'},429,{'Retry-After':'60'}));
      }
      if (request.method === 'POST') {
        // Bound actual streamed bytes, including requests with no Content-Length.
        if (Number(request.headers.get('Content-Length') ?? 0) > 32768) return reply(json({error:'Request too large'},413));
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        if (reader) {
          while (true) {
            const { done,value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 32768) { await reader.cancel(); return reply(json({error:'Request too large'},413)); }
            chunks.push(value);
          }
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
        request = new Request(request.url,{method:'POST',headers:request.headers,body:bytes});
      }
      const authResponse=await oauth(request,env);
      if (authResponse) return reply(authResponse);
      if (!['/mcp','/api/latest'].includes(url.pathname)) return reply(json({error:'Not found'},404));
      if (!await authenticate(request,env.DB)) return reply(json({error:'Authentication required'},401,{'WWW-Authenticate':`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource", scope="${SCOPE}"`}));
      if (url.pathname === '/api/latest') {
        if (request.method !== 'GET') return reply(json({error:'Method not allowed'},405,{Allow:'GET'}));
        return reply(json(manifest(await readRelease(env.DB))));
      }
      const handler = createMcpHandler(() => createServer(env), { legacy:'stateless', responseMode:'auto', maxSubscriptions:0 });
      return reply(await handler.fetch(request));
    } catch {
      return reply(json({error:'Hephaestus is temporarily unavailable'},503));
    }
  },
};
