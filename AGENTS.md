# Maintaining Hephaestus

Keep this a cloud-first instructional plugin, not an agent platform. The runtime payload is one entry skill plus selectively read references. Do not add MCP declarations, app dependencies, hooks, installation steps, hard-coded models, or machine-specific paths without an explicit scope change.

The repository is public. Never include private workspaces, account records, transcripts, credentials, or real customer examples. Use generic fixtures.

Keep portable `plugin.json` canonical and mirror its identity/interface in `.codex-plugin/plugin.json`. Use supported schemas; do not invent fields. Keep the marketplace source at `./` while the plugin remains at the repository root.

Before committing, run `python3 -m unittest discover -s tests -v` and `python3 scripts/package.py`. Maintain the explicit package allowlist. Development tests/scripts must not become runtime prerequisites. Do not claim cloud installation or behavioral/cost benchmarks from static tests; preserve the unrun gates until evidence exists.

Prefer small reversible improvements and executable checks over extra documentation or overlapping skills. No license has been selected; do not assign one without the owner's direction.
