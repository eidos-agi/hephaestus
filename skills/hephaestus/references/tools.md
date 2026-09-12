# Deterministic work and receipts

Use native search, parsers, compilers, tests, database queries, and structured APIs for work they can perform exactly. Narrow outputs to the fields needed for the next decision. Prefer structured arguments to shell interpolation for multiline text or user-provided values.

Batch independent reads when the platform supports it. Respect rate limits and tool-specific concurrency rules. A mutation that depends on a previous result must wait for that result; do not parallelize dependency chains merely to reduce wall time.

For remote work, distinguish acceptance from completion. Save the operation identifier and inspect its durable receipt until there is a final outcome. When a response is uncertain, query existing status before issuing the mutation again. Reuse an idempotency key only for an identical retry where supported.

Do not send full documents, logs, credentials, or private task context to Hephaestus. Its tools need only a release revision, topic identifier, or topic hash. Guidance retrieval never requires shell access, a personal machine, or production credentials.

If a tool is unavailable, use a supported alternative within the same authorization. Explain an actual access blocker after preserving useful completed work; do not fabricate success or ask the user to test work the available environment can verify.

