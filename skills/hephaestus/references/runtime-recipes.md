# Runtime recipes

Read only the route you need. Tool names, model controls, approval requirements, and quotas come from the current runtime's exposed interface, not from this document.

## Cloud Chat: no worker tool exposed

Use the source-specific search/read tool, retrieve a bounded relevant slice, and use ordinary computation where helpful. Keep a concise findings map with source references and synthesize directly. Do not label sequential reasoning as multiple agents. Do not tell the user to switch modes solely to make this method useful.

Example: for a repository audit, resolve the repository and revision, inspect relevant authentication files and tests, and return sourced gaps. Without test execution access, report static findings and the unexecuted checks separately.

## Hosted Work: native subagents exposed

An explicit request such as "delegate independent work to available subagents" gives a clear entry point where the runtime requires a delegation request. Follow the actual spawn schema. Send one bounded assignment per independent concern, retain the returned worker IDs, and use the runtime's supported result/wait mechanism.

Choose a model or reasoning setting only when the interface accepts it. When the selected model is not returned, report the selection as requested, not verified. Do not assume a local configuration file controls hosted workers. Permission inheritance is not an excuse to expand scope.

Do not re-run the workers' entire exploration in the parent. Check their evidence and consolidate disagreements. If spawning fails, capture the cause and continue useful direct work without repeatedly trying the same unavailable route.

## Existing external-worker connector

Discover and read the actual tool schema before dispatch. Confirm destination/provider eligibility, source access, cost controls, permitted actions, and how results are retrieved. Never export confidential content to a new provider merely because it is cheaper.

Use idempotency and an existing run ID where supported to avoid duplicate jobs. Keep the requested budget within the user's authorization. If the tool cannot enforce a hard budget, do not describe an instruction as a hard cap. Follow actual cancellation semantics and report a cancellation request separately from confirmed cancellation.

Fleet, a cloud executor, or another approved connector can supply this route. None is a Hephaestus dependency. Do not install runtimes, open tunnels, change permissions, or create infrastructure just to obtain delegation unless the user specifically authorizes that work.

## Capabilities unavailable or resource handle unresolved

A tool/resource failure is not proof the entire task is impossible. Use the available authorized route and report the exact remaining gap. Do not invent a local path from an opaque resource identifier, search unrelated personal files, or silently reroute private material.

## Documentation basis

OpenAI documents hosted Work subagents, context isolation, permission boundaries, and the extra token overhead of delegation in its [subagent guide](https://developers.openai.com/codex/agent-configuration/subagents). Availability and installation remain [surface- and workspace-dependent](https://help.openai.com/en/articles/20001256/). These recipes deliberately avoid fixed model names and local-only commands.
