# Cloud installation and distribution

Documentation checked September 12, 2026. This guide records a supported path, not a claim that this repository has already been imported or installed in an account.

## GitHub-backed workspace import

For an eligible workspace administrator, open **Workspace settings > Plugins > Add > Import marketplace**.

| Field | Value |
| --- | --- |
| Source | `https://github.com/eidos-agi/hephaestus` |
| Path | Leave empty; the marketplace is at the repository root. |
| Branch, tag, or commit | `main` for updates, or a reviewed commit for a pinned version. |

The importer discovers `.agents/plugins/marketplace.json`. Do not put that filename in Path. Its one entry points to the plugin at `./`, relative to the repository/marketplace root. The catalog does not import other applications.

Review the import report and the resulting plugin's workspace availability. Hephaestus has no app connections to authorize. Marketplace policy fields are catalog hints; the workspace's installation/access settings are authoritative and are not granted by repository JSON.

A public GitHub repository does not automatically publish a plugin in the universal directory or install it in a ChatGPT account. Workspace sharing is not public-directory publication.

## Updates

The documented workspace import supports daily GitHub sync and a **Sync now** control. A pinned commit does not advance; a tracked branch can. Review changes before updating a tracked branch. Import/sync acceptance and cross-surface behavior must be checked against the actual imported revision.

## Standalone skill alternative

Where the account exposes personal Skills upload, the generated `hephaestus-skill-0.1.0.zip` contains only the entry skill and its references. The documented route is **Plugins > Skills > Create > Upload from your computer**. Accounts and workspaces differ in availability; do not assume every personal Pro account exposes that control. The target product scans uploaded skills, and this package's acceptance there has not yet been established.

This is an alternative distribution unit, not a different method or a local-Codex requirement. The generated full-plugin archive is for supported plugin-import surfaces; it is not interchangeable with the standalone skill archive.

## Fresh-cloud checks

After import/install, begin a fresh web Chat and invoke Hephaestus. Confirm the core skill and one reference can be read without a local path. Repeat in web Work where available, with an explicit request for independent subagents. Record real tool/worker activity and model identity only when exposed.

In Chat without workers, expect useful direct execution, not a mode-switch demand. In Work without model selection, expect no unverified cheaper-model claim. See [evaluation](EVALUATION.md) for the scenario suite and release gates.

## Avoid Desktop only dependencies

OpenAI documents that declaring MCP servers in `mcp.json` or `.mcp.json` can classify imported plugins as Desktop only, even for remote HTTPS servers. Hephaestus declares neither. It also has no hooks, app dependencies, installation scripts, or machine-specific runtime paths. Optional task tools are discovered from the existing conversation rather than bundled as dependencies.

Avoiding these declarations removes that specific packaging risk; it does not certify all accounts, future product versions, or runtime capabilities.

## Sources

- [Marketplace import, source fields, sync, and restrictions](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github)
- [Plugins, workspace controls, and Desktop only](https://help.openai.com/en/articles/20001256/)
- [Personal Skills creation and upload](https://help.openai.com/en/articles/20001066)
- [Portable and compatibility manifests](https://developers.openai.com/plugins/build/plugins)
