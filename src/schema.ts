import { z } from 'zod';

export const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const topicIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const topicSchema = z.object({
  id: topicIdSchema,
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(240),
  path: z.string().regex(/^skills\/hephaestus\/references\/[a-z-]+\.md$/),
  hash: revisionSchema,
  text: z.string().min(1).max(12000),
}).strict();
export const releaseSchema = z.object({
  schema_version: z.literal(1),
  revision: revisionSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  published_at: z.iso.datetime(),
  previous_revision: revisionSchema.nullable(),
  summary: z.string().min(1).max(1000),
  topics: z.array(topicSchema).min(1).max(20),
}).strict().refine(r => new Set(r.topics.map(t => t.id)).size === r.topics.length, 'Duplicate topic IDs');
export type Release = z.infer<typeof releaseSchema>;

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(k => JSON.stringify(k) + ':' + canonical(object[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export async function validateRelease(raw: unknown): Promise<Release> {
  const release = releaseSchema.parse(raw);
  const { revision, ...body } = release;
  if (await sha256(canonical(body)) !== revision) throw new Error('Release integrity mismatch');
  for (const topic of release.topics) {
    if (await sha256(topic.text) !== topic.hash) throw new Error('Topic integrity mismatch');
  }
  return release;
}

