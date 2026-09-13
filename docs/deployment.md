# Deployment verification

Deployment and protocol checks on September 12–13, 2026.

- Worker: `hephaestus`, Eidos AGI account.
- Canonical MCP endpoint: `https://hephaestus.eidosagi.com/mcp`.
- Health: `https://hephaestus.eidosagi.com/health` returned HTTP 200, `status: ok`, and `check: liveness` without a database query.
- Worker deployment ID: `319297222cd244d386eab4b3f63523a7`.
- Runtime source: the Worker implementation in `src/`, including persistent usage limits and the pairing corrections described below.
- Published guidance revision: `65f1df029cd4ee13a0a73d7234af82e15f5d24aeb29e858560a1802f9586bca7`.
- Guidance version: `0.1.0`, six topics.

## Current deployment: usage limits and pairing recovery

The September 13 deployment adds the SQLite-backed `UsageGuard` Durable Object with migration tag `usage-guard-v1`. Cloudflare accepted the migration and the deployed settings confirm all three minute-level rate limiters, the guard binding, a 100 ms CPU ceiling, and the following daily allowances: 10,000 database-backed requests globally, 500 OAuth requests within that total, and 2,000 authenticated requests per user. `SERVICE_PAUSED` is false. Production request logging remains disabled.

The custom WAF ruleset `Hephaestus perimeter` is active only on `hephaestus.eidosagi.com`. The supported-route rule is enabled; the full emergency-stop rule is present and disabled. A public unsupported-path probe returned HTTP 403, while `/health` returned HTTP 200. Cloudflare confirmed that the alternate `workers.dev` and preview endpoints are disabled.

Local verification passed TypeScript checking, all 12 protocol/security/usage tests, Worker bundling, and the workerd integration test. The workerd test used synthetic credentials and verified D1-backed reads, the per-user limit, the global cutoff, and quota persistence after a runtime restart. All 18 Python package tests and package validation also passed. These checks do not establish a completed production ChatGPT connection.

Pending pairing tabs now use independent CSRF cookies. Recovery pages distinguish incomplete links, missing or mismatched cookies, expired requests, and unrecognized API tokens. The same-origin, cookie, PKCE, single-use-code, and token-revocation checks remain enforced. The personal token has no automatic expiry; OAuth access tokens still expire after 30 days and require reconnecting.

Daily cutoffs bound admitted database-backed work, not the total Cloudflare bill. Rejected traffic can still incur Worker or usage-guard charges. The full edge stop is a manual operator control. See [usage and cost controls](LIVE_GUIDANCE.md#usage-and-cost-controls) for exact semantics and limits.

## Earlier live protocol verification

Before the usage-limit deployment, `scripts/smoke.mjs` completed successfully against the canonical HTTPS endpoint. It verified:

- MCP initialization, all three tool descriptors, current release retrieval, unchanged responses, focused guidance, and release notes.
- Missing credentials return HTTP 401 with OAuth discovery metadata.
- OAuth authorization server discovery and dynamic client registration.
- S256 PKCE authorization through the token form, issuer and state preservation, and authorization-code exchange.
- The issued OAuth access token successfully calls the MCP.
- Reusing an authorization code fails.
- Revoking the OAuth connection token makes subsequent authenticated reads fail.

Temporary personal API tokens created for verification were revoked afterward. No active personal API credential is included in this repository.

## Actual ChatGPT setup screen

The signed-in ChatGPT plugin setup screen successfully discovered the deployed endpoints, selected Dynamic Client Registration (DCR), checked the `guidance:read` scope, and displayed the correct authorization URL, token URL, registration URL, issuer, and MCP resource.

Actual connector creation initially failed because ChatGPT requested an additional grant type during dynamic registration. The server now accepts an authorization-code registration request that also asks for refresh support and returns only the supported `authorization_code` grant. This metadata negotiation is permitted by [RFC 7591 section 3.2.1](https://www.rfc-editor.org/rfc/rfc7591.html#section-3.2.1). Refresh-token grants remain unavailable; connection tokens still expire after 30 days.

After deployment, ChatGPT successfully created the connector and navigated to the Hephaestus personal-token sign-in form. Completed account linking and a signed-in ChatGPT tool call remain pending. Successful connector creation does not prove account linking or tool invocation.

Regression coverage verifies the negotiated grant list, rejects registrations with no authorization-code grant, and confirms that the token endpoint still rejects refresh grants. Diagnostic logging records only rejected field names and validation codes. Temporary production diagnostics were disabled after identifying the mismatch.

The browser subsequently exposed a form-origin bug: `no-referrer` causes a navigation POST to send `Origin: null`, which the server correctly rejects. HTML now uses `strict-origin`, preserving the same-site form origin without disclosing URL paths or query strings. API responses retain `no-referrer`; null and foreign form origins remain rejected. This behavior follows the [Fetch Standard's Origin-header algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header).

The form-origin correction is deployed and covered by regression checks. An earlier browser security restriction prevented observing a secure submission. A subsequent attempt reached the server but the sign-in form had expired before completion.

The token-entry window is now 30 minutes. Approving a request resets its deadline to five minutes for authorization-code exchange, so the longer human sign-in window does not extend code validity. Regression coverage verifies approval after 15 minutes, rejection of expired forms, and rejection of codes at their five-minute deadline. Same-origin and CSRF-cookie checks remain required.

A fresh ChatGPT authorization attempt was opened after deployment of the expiry fix. Browser security restrictions prevented completing verification. Completed account linking and a signed-in ChatGPT tool call remain unverified. The usage-limit deployment was verified through local synthetic tests, infrastructure settings, public liveness, and the perimeter response; it did not retry the restricted sign-in flow.

## Reproduce

Run `npm run check` for local protocol/security/usage tests, Worker bundling, and the local workerd persistence test. An authorized operator can separately run the live smoke check with an active temporary Hephaestus API token set in the environment:

```sh
NODE_USE_ENV_PROXY=1 node scripts/smoke.mjs
```

The smoke script reads `HEPHAESTUS_API_TOKEN`; it never prints credentials. It creates a verification OAuth client, grants one read-only session, and revokes that session. Revoke the temporary personal API token afterward through authenticated administration.
