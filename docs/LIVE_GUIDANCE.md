# Live guidance MCP

A cloud-first instruction plugin from Eidos AGI. Hephaestus teaches focused context, bounded delegation, economical model selection when available, deterministic tool use, and evidence-based completion. The host supplies execution capabilities; Hephaestus supplies the method.

**MCP:** `https://hephaestus.eidosagi.com/mcp`  
**Health:** `https://hephaestus.eidosagi.com/health`

## Connect from ChatGPT

Create a developer-mode MCP connection with the MCP URL above and select **OAuth**. Leave client ID and client secret empty so ChatGPT uses dynamic client registration. Hephaestus supports ChatGPT's stable callback and its connection-specific callbacks. On the Hephaestus connection page, enter your personal API token. No local installation or SSO provider is needed.

ChatGPT receives its own read-only access token, valid for 30 days, and sends it automatically on tool calls. After expiry, reconnect using the same personal API token. Revoking the personal token immediately invalidates its linked connections on their next request. Refresh tokens are deliberately not issued in this first release.

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

Clients that support custom HTTP headers can send `Authorization: Bearer <personal-api-token>` directly to `/mcp` or `GET /api/latest`. Both direct and OAuth tokens are checked against the current revocation state on every request. The public `/health` endpoint reports availability without guidance or identity data.

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
node scripts/admin.mjs issue-token daniel /private/path/hephaestus-token.json
node scripts/admin.mjs list-tokens
node scripts/admin.mjs revoke-token TOKEN_ID
```

To publish guidance: edit the relevant Markdown references; update `guidance/catalog.json` with a version, actual publication timestamp, release summary, and the current `previous_revision`; run `npm run check`; commit the changes; then run `npm run publish:guidance`. Repeating publication of the same current revision is safe. To roll back advice, publish a new release containing the earlier topic text with the current head as `previous_revision`.

The GitHub Actions CI workflow validates code and builds. Deployment is a separate manual workflow requiring the repository's Cloudflare secret; until that secret is configured, connected Cloudflare administration or the commands above provide the release route.

## Verification and boundaries

Tests exercise actual SQLite queries, MCP initialization and tools, release updates and pinning, integrity failures, bearer revocation, OAuth discovery and DCR, S256 PKCE, callback restrictions, form CSRF protection, single-use codes, resource binding, expiry, and linked-token revocation. Worker bundling checks Cloudflare compatibility; live protocol verification is recorded in `docs/deployment.md` after deployment.

OAuth grants only `guidance:read`. Registration accepts supported ChatGPT callbacks and local Codex loopback callbacks, not arbitrary third-party redirect hosts. Authentication routes have a Cloudflare rate limit; request bodies are bounded. Raw user, connection, and authorization-code secrets are never stored in D1. This is a small guidance service, not a general identity provider or agent runtime.
