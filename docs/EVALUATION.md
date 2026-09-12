# Evaluation and release gates

## Automated checks

Run `python3 -m unittest discover -s tests -v` and `python3 scripts/package.py`.

These checks validate the actual package files: manifest identity, compatibility metadata, marketplace resolution, short starter prompts, skill frontmatter, bounded entry size, reference containment, dependency-free packaging, and reproducible ZIP output. Negative tests ensure a missing reference, forbidden runtime component, metadata drift, or symlink cannot silently enter the archive.

They are package and regression tests, **not model-behavior evaluations** and not a substitute for the target product's importer.

## Behavioral scenarios

`evals/scenarios.json` is a set of prompts, capability fixtures, expected observations, and failure conditions. It is a manual/agent-run evaluation specification, not a script that spawns paid models. Passing static validation of its format does not mean any scenario has been run.

Run scenarios in fresh conversations with the tested plugin version, source revision, and known capability fixture. Preserve actual transcripts or tool receipts in an authorized evidence location. Include negative activation, no-worker fallback, unavailable model selection, private-data routing, worker failure, write conflict, prompt injection, and continuity cases.

Do not manufacture fixture capabilities in the live account. A fixture needing unavailable tools is blocked, not passed. Repeat relevant cases separately in cloud Chat and cloud Work; one surface does not certify the other.

## Cost benchmark

Compare direct execution, deterministic-only processing where applicable, and Hephaestus-guided execution on the same tasks and acceptance rubric. Include parent and worker usage, retries, review overhead, latency, and success rate. Report parent-context reduction separately from total-token reduction and money saved. Unknown usage is unavailable, not zero.

The benchmark hypothesis is **lower total cost per accepted result**, not "subagents always use fewer tokens." No numerical savings are claimed by v0.1.0.

## Outstanding runtime release gates

| Gate | Initial status |
| --- | --- |
| Target workspace marketplace import | Not run |
| Standalone skill-upload acceptance | Not run |
| Fresh cloud Chat activation and reference reading | Not run |
| Fresh cloud Work native-worker execution | Not run |
| Economical model selection confirmed by runtime | Not run; capability-dependent |
| Behavioral scenario suite in target runtimes | Not run |
| End-to-end cost/quality benchmark | Not run |

Update a status only with actual evidence identifying the package revision, surface, date, and result. Local static checks do not close these gates.
