import { validateRelease, type Release } from './schema.ts';

export interface Env {
  DB: D1Database;
  AUTH_RATE_LIMIT?: RateLimit;
  REQUEST_RATE_LIMIT?: RateLimit;
  USER_RATE_LIMIT?: RateLimit;
  USAGE_GUARD?: DurableObjectNamespace;
  GLOBAL_DAILY_LIMIT?: string;
  AUTH_DAILY_LIMIT?: string;
  USER_DAILY_LIMIT?: string;
  SERVICE_PAUSED?: string;
}
export class NotFound extends Error {}

export async function readRelease(db: D1Database, revision?: string): Promise<Release> {
  const session = db.withSession('first-primary');
  const query = revision
    ? session.prepare('SELECT payload FROM guidance_releases WHERE revision = ?').bind(revision)
    : session.prepare('SELECT payload FROM guidance_releases ORDER BY seq DESC LIMIT 1');
  const row = await query.first<{ payload: string }>();
  if (!row) throw new NotFound('Release not found');
  if (row.payload.length > 250000) throw new Error('Release exceeds size limit');
  return validateRelease(JSON.parse(row.payload));
}

export function manifest(release: Release, knownRevision?: string) {
  const base = {
    revision: release.revision, version: release.version, published_at: release.published_at,
    freshness: 'current-at-read', changed: release.revision !== knownRevision,
  };
  if (!base.changed) return base;
  return { ...base, summary: release.summary, topics: release.topics.map(({ id, title, summary, hash }) => ({ id, title, summary, hash })) };
}

export function guidance(release: Release, topicId: string, knownHash?: string) {
  const topic = release.topics.find(t => t.id === topicId);
  if (!topic) throw new NotFound('Topic not found');
  const base = { revision: release.revision, version: release.version, topic: topic.id, hash: topic.hash, changed: topic.hash !== knownHash };
  if (!base.changed) return base;
  return { ...base, title: topic.title, text: topic.text, source: `https://github.com/eidos-agi/hephaestus/blob/main/${topic.path}` };
}

export async function updates(db: D1Database, afterRevision?: string, limit = 5) {
  // One SQL statement gives a coherent latest revision, cursor, and bounded page.
  const row = await db.withSession('first-primary').prepare(`
    SELECT
      (SELECT revision FROM guidance_releases ORDER BY seq DESC LIMIT 1) AS latest_revision,
      (SELECT seq FROM guidance_releases WHERE revision = ?) AS after_seq,
      (SELECT json_group_array(json(payload)) FROM (
        SELECT payload FROM guidance_releases
        WHERE seq > COALESCE((SELECT seq FROM guidance_releases WHERE revision = ?), 0)
        ORDER BY seq ASC LIMIT ?
      )) AS releases
  `).bind(afterRevision ?? '', afterRevision ?? '', limit + 1).first<{latest_revision:string|null;after_seq:number|null;releases:string}>();
  if (!row?.latest_revision) throw new NotFound('Release not found');
  if (afterRevision && row.after_seq === null) return { latest_revision: row.latest_revision, reset_required: true, releases: [] };
  const releases = await Promise.all((JSON.parse(row.releases) as unknown[]).map(validateRelease));
  const page = releases.slice(0, limit);
  return {
    latest_revision: row.latest_revision, reset_required: false, has_more: releases.length > limit,
    next_after_revision: page.at(-1)?.revision ?? afterRevision ?? null,
    releases: page.map(({revision,version,published_at,summary}) => ({revision,version,published_at,summary})),
  };
}
