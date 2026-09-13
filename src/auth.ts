import { sha256 } from './schema.ts';
import { RESOURCE } from './oauth.ts';

export function bearerToken(request: Request) {
  return /^Bearer ((?:hph|hpo)_[A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') ?? '')?.[1] ?? null;
}
export async function authenticate(request: Request, db: D1Database) {
  const token = bearerToken(request);
  if (!token) return null;
  const hash = await sha256(token);
  if (token.startsWith('hpo_')) return db.withSession('first-primary').prepare(`
    SELECT t.id,t.user_id FROM oauth_sessions s JOIN api_tokens t ON t.id=s.root_token_id
    WHERE s.token_hash=? AND s.resource=? AND s.expires_at>? AND s.revoked_at IS NULL AND t.revoked_at IS NULL
  `).bind(hash,RESOURCE,Date.now()).first<{id:string;user_id:string}>();
  // Do not cache this lookup: revocation takes effect on the next request.
  return db.withSession('first-primary').prepare(
    'SELECT id, user_id FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL'
  ).bind(hash).first<{id:string;user_id:string}>();
}
