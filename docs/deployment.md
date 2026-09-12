# Deployment verification

Verified on September 12, 2026.

- Worker: `hephaestus`, Eidos AGI account.
- Canonical MCP endpoint: `https://hephaestus.eidosagi.com/mcp`.
- Health: `https://hephaestus.eidosagi.com/health` returned HTTP 200 and `status: ok`.
- Worker deployment ID: `6bc856c1a6f14806bbab4e20edd01e72`.
- Runtime source: the Worker implementation in `src/`, including the OAuth registration compatibility fix described below.
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

Actual connector creation initially failed because ChatGPT requested an additional grant type during dynamic registration. The server now accepts an authorization-code registration request that also asks for refresh support and returns only the supported `authorization_code` grant. This metadata negotiation is permitted by [RFC 7591 section 3.2.1](https://www.rfc-editor.org/rfc/rfc7591.html#section-3.2.1). Refresh-token grants remain unavailable; connection tokens still expire after 30 days.

After deployment, ChatGPT successfully created the connector and navigated to the Hephaestus personal-token sign-in form. Credential entry and a signed-in ChatGPT tool call remain pending. Successful connector creation does not prove account linking or tool invocation.

Regression coverage verifies the negotiated grant list, rejects registrations with no authorization-code grant, and confirms that the token endpoint still rejects refresh grants. Diagnostic logging records only rejected field names and validation codes. Temporary production diagnostics were disabled after identifying the mismatch.

## Reproduce

Run `npm run check` for local protocol/security tests and Worker bundling. With an active temporary Hephaestus API token set in the environment:

```sh
NODE_USE_ENV_PROXY=1 node scripts/smoke.mjs
```

The smoke script reads `HEPHAESTUS_API_TOKEN`; it never prints credentials. It creates a verification OAuth client, grants one read-only session, and revokes that session. Revoke the temporary personal API token afterward through authenticated administration.
