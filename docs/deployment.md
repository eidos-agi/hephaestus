# Deployment verification

Verified on September 12, 2026.

- Worker: `hephaestus`, Eidos AGI account.
- Canonical MCP endpoint: `https://hephaestus.eidosagi.com/mcp`.
- Health: `https://hephaestus.eidosagi.com/health` returned HTTP 200 and `status: ok`.
- Worker deployment ID: `86c3adade1c549a2a1b30bb7295c0fe9`.
- Runtime source commit: `797d118`.
- Published guidance revision: `65f1df029cd4ee13a0a73d7234af82e15f5d24aeb29e858560a1802f9586bca7`.
- Guidance version: `0.1.0`, six topics.

## Live protocol verification

`scripts/smoke.mjs` completed successfully against the canonical HTTPS endpoint. It verified:

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

This verifies ChatGPT's discovery/configuration compatibility. The connection form was prepared but not submitted, and a signed-in ChatGPT tool call has not yet been performed. The live protocol test is separate from completing a connection inside the user's ChatGPT account.

## Reproduce

Run `npm run check` for local protocol/security tests and Worker bundling. With an active temporary Hephaestus API token set in the environment:

```sh
NODE_USE_ENV_PROXY=1 node scripts/smoke.mjs
```

The smoke script reads `HEPHAESTUS_API_TOKEN`; it never prints credentials. It creates a verification OAuth client, grants one read-only session, and revokes that session. Revoke the temporary personal API token afterward through authenticated administration.
