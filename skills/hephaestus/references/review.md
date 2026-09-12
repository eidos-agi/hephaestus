# Evidence-based completion

Begin with the user's expected behavior and the failures that would materially defeat it. Select checks that distinguish success from plausible but incorrect output. Formatting-only changes may need inspection; a remote protocol endpoint needs real protocol calls; financial calculations need reconciliation to source data.

Inspect and test the produced artifact, not only the implementation plan. Use required repository gates and additional checks justified by concrete risk. Avoid tests that merely echo implementation details or exact wording. Stop expanding checks once the outcome is sufficiently verified.

When review is delegated, provide the requirements and actual artifact with enough context to assess correctness. Let findings emerge independently. The primary agent must verify consequential findings and integrate changes without discarding unrelated work.

Report what changed, evidence of success, and practical limitations. Distinguish local validation, deployment acceptance, live endpoint checks, and confirmation inside a particular client. A reachable MCP endpoint does not prove installation in ChatGPT, and fresh-on-call guidance does not imply a running model receives unsolicited updates.

