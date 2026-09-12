# Bounded delegation examples

These are assignment templates, not tool schemas. Map them to the actual available interface. Replace bracketed values with known facts; do not dispatch unresolved placeholders.

## Assignment

```text
Objective: [one independently verifiable outcome]
Sources: [resolvable locations, revisions, and authorized excerpts if needed]
Context: [only decisions and definitions necessary for this outcome]
Authority: [allowed operations and scope]
Non-goals: [excluded files, systems, disclosures, or changes]
Acceptance: [specific checks and evidence required]
Effort: [bounded attempts/time/cost using supported controls]
Return: [findings, artifact references, checks, blockers, actual usage if exposed]
```

A requested effort limit is not enforced unless the execution system supports it. Do not assume a worker can access parent-only attachments or connector grants.

## Hub login audit: read-only

Poor: "Read the entire project and figure out authentication. Here is our conversation."

Better: "At the supplied commit, inspect the declared login providers, callback handlers, and relevant tests. Do not edit the repository, use live credentials, or deploy. Run existing safe tests only in an authorized isolated workspace. Return provider, implementation location, test coverage, reproduced failure, and evidence reference. Distinguish missing coverage from a broken provider. Stop after the initial inspection and one targeted follow-up. Omit full logs."

Useful split: one worker maps provider and callback implementation; a second checks test coverage. The parent compares requirements against both results. Do not give both workers the whole audit.

## Repetitive data inspection: code before agents

For a structured table, use an authorized query or script to calculate counts, nulls, duplicates, and grouped totals. Give the model only flagged rows and the schema context needed to interpret them. Do not allocate one agent per row or summarize the same raw table repeatedly.

## Independent patch proposal

"In the assigned isolated branch, add tests for the specified callback behavior at the supplied revision. Own only the named test files. Do not modify authentication policy, install unapproved dependencies, merge, or deploy. Run the existing relevant suite and return the patch/commit location, actual test results, and any blocked checks."

If workers cannot use isolated workspaces, serialize overlapping edits. A passing test at one revision must not be attributed to another revision without revalidation.

## Compact return

```text
Execution: finished | failed | blocked | cancelled
Acceptance: passed | failed | not_evaluated
Summary: [conclusion and material caveat]
Evidence: [source revision; resolvable artifact/file/test references]
Changes: [actual files or artifacts, or none]
Checks: [executed results; separate skipped and unavailable checks]
Blocker: [cause and smallest decision needed, or none]
Usage: [observed metrics and their source, or unavailable]
```

Use a short summary by default, not a hard length limit that hides safety warnings or acceptance failures. A worker's confidence score is not a substitute for evidence.
