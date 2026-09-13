# Live guidance MCP

A cloud-first instruction plugin from Eidos AGI. Hephaestus teaches focused context, bounded delegation, economical model selection when available, deterministic tool use, and evidence-based completion. The host supplies execution capabilities; Hephaestus supplies the method.

**MCP:** `https://hephaestus.eidosagi.com/mcp`  
**Health:** `https://hephaestus.eidosagi.com/health`

## Connect from ChatGPT

Create a developer-mode MCP connection with the MCP URL above and select **OAuth**. Leave client ID and client secret empty so ChatGPT uses dynamic client registration. Hephaestus supports ChatGPT's stable callback and its connection-specific callbacks. On the Hephaestus connection page, enter your personal API token. No local installation or SSO provider is needed.

ChatGPT receives its own read-only access token, valid for 30 days, and sends it automatically on tool calls. After expiry, reconnect using the same personal API token. Revoking the personal token immediately invalidates its linked connections on their next request. Refresh tokens are deliberately not issued in this first release.

The connection page lasts 30 minutes; the personal API token has no automatic expiry. Each pending connection has its own secure browser cookie, so opening another connection tab does not invalidate it. Missing cookies, mismatched pages, expired requests, and invalid API tokens now have distinct recovery messages. Start a fresh connection from ChatGPT after an expired or incomplete page; do not reuse an old authorization link. Origin and cookie checks remain mandatory.

ChatGPT's native connector does not accept arbitrary API keys directly. The OAuth adapter makes the per-user API token model compatible with its documented authentication contract. The API token is submitted only to Hephaestus's HTTPS form, never as a URL parameter, tool argument, or ChatGPT client credential. See [OpenAI's authentication contract](https://developers.openai.com/plugins/build/auth).

The repository includes portable and compatibility plugin manifests plus the `skills/hephaestus` package. The MCP is connected separately; `docs/mcp-client.json` is an example for clients that support explicit MCP configuration. It is not a runtime dependency of the imported plugin. A registered MCP connection and an installed skill package are separate capabilities: use MCP tools directly in Chat, and the skill plus MCP in Work when both are available. The plugin cannot create subagent or model-selection controls absent from the host.

## Calling pattern

1. Call `hephaestus_latest` at the start of substantial work, passing `known_revision` when available.
2. Fetch only relevant topics using `hephaestus_guidance`, passing the release revision for a consistent snapshot.
3. Reuse topics whose hash is unchanged. Check again at a meaningful phase boundary.
4. Use `hephaestus_updates` when release notes matter; follow its bounded cursor if needed.

Topics: `core`, `context`, `delegation`, `models`, `tools`, `review`. The server also exposes a current-index MCP resource. No private task text is needed by these tools.

## Updates

Guidance is stored as immutable, content-hashed releases in D1. Each current read starts at the database primary; the Worker and client need no redeployment to pick up a published release. Historical revisions remain readable. Publication uses an expected previous revision to reject stale concurrent updates. Integrity failures return an explicit error instead of silently labelling fallback content current.

“Real time” means fresh on the next call after publication. There is no background model interruption, pushed instruction replacement, automatic web-news ingestion, or automatic publishing from unreviewed upstream content. The maintained advice is released through authenticated administration.

## Direct API clients

Clients that support custom HTTP headers can send `Authorization: Bearer <personal-api-token>` directly to `/mcp` or `GET /api/latest`. Both direct and OAuth tokens are checked against the current revocation state on every request. The public `/health` endpoint is a database-free liveness check; use an authenticated guidance read to check database readiness.

## Usage and cost controls

Guidance remains available only to authenticated users. Defaults in `wrangler.jsonc` are:

| Control | Default | Enforcement |
| --- | --- | --- |
| Requests to API/OAuth routes per IP | 120/minute | Before reading request bodies or querying D1 |
| OAuth requests per IP | 60/minute | Before registration, pairing, or token database work |
| Authenticated requests per user | 60/minute | Shared across that user's personal and connection tokens |
| Database-backed requests across the service | 10,000/UTC day | Persistent, serialized global admission before D1 |
| OAuth requests across the service | 500/UTC day | Included in the global allowance |
| Authenticated reads per user | 2,000/UTC day | Shared across tokens; checked after identity lookup and before guidance access |
| Worker CPU time | 100 ms/invocation | Cloudflare runtime limit |
| Request body | 32 KiB | Counts actual streamed bytes |

Minute-level throttles use Cloudflare's regional, eventually consistent rate limiter. Daily admissions use one SQLite-backed Durable Object, so concurrent requests, different regions, and restarts do not reset or multiply the allowance. Failed well-formed token lookups consume global allowance. Anonymous malformed or missing tokens are rejected without D1 or quota-storage access. Protocol initialization and tool discovery also count when authenticated.

Exhausting the global or OAuth allowance returns 503; a user's exhausted allowance returns 429. `Retry-After` identifies the remaining time until the UTC daily reset. A warm Worker remembers an exhausted allowance to avoid repeatedly querying the usage guard. Missing or failing guard infrastructure fails closed. Admitted requests already in progress may finish. Attackers can exhaust the shared allowance and cause temporary unavailability; this deliberately prioritizes bounded database work.

Set `SERVICE_PAUSED` to `"true"` and deploy to stop API/OAuth work immediately before quota or database calls. Public liveness and OAuth discovery remain available. For a full stop before the Worker executes, enable the disabled `hephaestus_emergency_stop` rule in Cloudflare's custom WAF rules. Its expression is restricted to the Hephaestus hostname. Restore it to disabled to reopen the service.

`ops/edge-rules.json` defines the hostname-scoped perimeter and emergency-stop rules. Preserve unrelated zone rules when applying updates. Unsupported paths/methods are blocked at the edge. The `workers.dev` and preview endpoints are disabled to keep traffic on the custom domain.

These controls are not an account-wide dollar cap. Rejected requests can still incur Worker or usage-guard charges, and minute-level throttles are not exact accounting. The zone's Free Website plan cannot scope rate-limit expressions by hostname; no zone-wide rate rule is applied that could throttle other Eidos applications. A dedicated edge-rate policy requires an appropriate plan or a separately isolated zone. Billing alerts are useful notification, not a shutdown mechanism. See [Workers pricing and CPU limits](https://developers.cloudflare.com/workers/platform/pricing/), [rate limiter accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#accuracy), and [WAF plan availability](https://developers.cloudflare.com/waf/rate-limiting-rules/#availability).

For direct bearer configuration in Codex:

```toml
[mcp_servers.hephaestus]
url = "https://hephaestus.eidosagi.com/mcp"
bearer_token_env_var = "HEPHAESTUS_API_TOKEN"
```

## Maintain

Node 24+ is required for the build and tests; calling the deployed server requires no Node installation.

```sh
npm ci
npm run check
npm run db:migrate
npm run deploy
```

Cloudflare administration requires a scoped `CLOUDFLARE_API_TOKEN`, covering this account's Worker deployment or D1 database administration as appropriate. Do not confuse it with a Hephaestus user API token.

```sh
node scripts/admin.mjs issue-token example-user /private/path/hephaestus-token.json
node scripts/admin.mjs list-tokens
node scripts/admin.mjs revoke-token TOKEN_ID
```

To publish guidance: edit the relevant Markdown references; update `guidance/catalog.json` with a version, actual publication timestamp, release summary, and the current `previous_revision`; run `npm run check`; commit the changes; then run `npm run publish:guidance`. Repeating publication of the same current revision is safe. To roll back advice, publish a new release containing the earlier topic text with the current head as `previous_revision`.

The GitHub Actions CI workflow validates code and builds. Deployment is a separate manual workflow requiring the repository's Cloudflare secret; until that secret is configured, connected Cloudflare administration or the commands above provide the release route.

## Verification and boundaries

Tests exercise actual SQLite queries, MCP initialization and tools, release updates and pinning, integrity failures, bearer revocation, OAuth discovery and DCR, S256 PKCE, callback restrictions, form CSRF protection across multiple tabs, single-use codes, resource binding, expiry, and linked-token revocation. Usage tests cover concurrent quota admissions, restart persistence, UTC reset, shared user limits, and failure before database work. `scripts/test-runtime.mjs` additionally checks the built Worker and Durable Object in local workerd using synthetic credentials. This local test does not verify a production account connection. Live protocol verification is recorded in `docs/deployment.md` after deployment.

OAuth grants only `guidance:read`. Registration accepts supported ChatGPT callbacks and local Codex loopback callbacks, not arbitrary third-party redirect hosts. Authentication routes have a Cloudflare rate limit; request bodies are bounded. Raw user, connection, and authorization-code secrets are never stored in D1. This is a small guidance service, not a general identity provider or agent runtime.
