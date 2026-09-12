# Hephaestus

**Use judgment where it matters. Use tools where they suffice. Delegate when it helps. Verify what comes back.**

Hephaestus is an instructional plugin for efficient AI execution. It teaches an agent how to work, rather than introducing another orchestration platform.

Designed for ChatGPT web **Chat and Work**, with capability-based behavior in other compatible runtimes. Installation and runtime support depend on the account and workspace; a valid package is not proof of successful cloud installation.

## Start

After installation, select Hephaestus or ask:

> Use Hephaestus to complete this task efficiently. Delegate independent work to available subagents when worthwhile, and verify the result.

The core method needs no terminal, API key, MCP server, Fleet connection, or local repository. The actual task may still need authorized tools or source access.

## What it teaches

- Retrieve the relevant slice of context instead of repeatedly loading whole histories.
- Use deterministic operations before model inference when appropriate.
- Give workers bounded assignments and request compact results with evidence.
- Select an economical model only when the actual interface and policy permit it.
- Verify acceptance criteria, recover from failed attempts, and preserve useful state.

Without worker tools, the agent applies the method directly. It never invents a subagent or claims an unconfirmed model choice. Smaller parent context is not automatically lower total cost.

## Cloud distribution

This repository includes a one-plugin marketplace at `.agents/plugins/marketplace.json`.

For an eligible workspace administrator, the import source is `https://github.com/eidos-agi/hephaestus`, Path is empty, and the default branch is `main`. Importing a repository is a separate step from committing its files. See [cloud installation](docs/CLOUD_INSTALL.md) for exact settings and account-dependent alternatives.

No `mcp.json`, `.mcp.json`, app dependency, hook, or runtime installation script is declared. This deliberately avoids the documented MCP-related **Desktop only** restriction for imported plugins. Existing authorized tools remain optional execution routes, not plugin dependencies.

## Optional live guidance

The live MCP at `https://hephaestus.eidosagi.com/mcp` serves current, versioned guidance through three read-only tools. Connect it separately in ChatGPT using OAuth; a personal API token is entered once on Hephaestus’s connection page. The instruction package remains usable without that connection.

See [live guidance and administration](docs/LIVE_GUIDANCE.md) and [deployment verification](docs/deployment.md). The Worker and its development dependencies are excluded from the installable instruction archives.

## Package

```text
plugin.json                         Portable Agent Plugins entry point
.codex-plugin/plugin.json          Legacy compatibility metadata
.agents/plugins/marketplace.json   GitHub workspace-import catalog
skills/hephaestus/SKILL.md          Small, cloud-readable entry skill
skills/hephaestus/references/       Selectively loaded recipes and evidence rules
```

The root manifest is canonical. OpenAI presentation metadata lives in `extensions.com.openai`; the legacy manifest mirrors it for older consumers. Modern clients do not merge the two overlays.

## Validate and package

These are maintainer commands, not runtime prerequisites. They use only Python's standard library:

```sh
python3 -m unittest discover -s tests -v
python3 scripts/package.py
```

The packager produces `dist/hephaestus-plugin-0.1.0.zip` and `dist/hephaestus-skill-0.1.0.zip` with fixed timestamps, an explicit file allowlist, and SHA-256 receipts. The skill ZIP has a top-level `hephaestus/` directory containing `SKILL.md` and references. Import acceptance must still be tested in the target surface.

See [evaluation](docs/EVALUATION.md) for fresh-chat scenarios, cost accounting, and unverified release gates. Static tests do **not** certify model behavior, token savings, or ChatGPT installation.

## Design references

Current documentation reviewed September 12, 2026:

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI skills authoring](https://developers.openai.com/plugins/build/skills)
- [OpenAI subagent behavior](https://developers.openai.com/codex/agent-configuration/subagents)
- [ChatGPT plugins, permissions, and surface restrictions](https://help.openai.com/en/articles/20001256/)
- [GitHub marketplace import](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github)

Hephaestus v0.1.0 is an initial implementation, not a public-directory listing or a measured savings claim.
