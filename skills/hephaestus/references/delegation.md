# Bounded delegation

Use an agent when an independent deliverable can be specified and the expected benefit exceeds startup, duplicated context, coordination, and review. Examples include inspecting one subsystem, checking a specific hypothesis, or implementing an isolated module. Do not spawn agents when the next primary step is simply waiting for their answer.

Check both capability and authorization. If agent creation or model choice is unavailable or disallowed, perform the work directly. This recipe does not override a host rule limiting delegation.

A useful contract includes:

- Outcome and scope: one concrete deliverable with clear exclusions where needed.
- Inputs: the smallest set of relevant sources and known interfaces.
- Ownership: files or artifacts the agent may change; use isolation for overlapping work.
- Completion criteria: observable behavior, necessary validation, and expected evidence.
- Return format: changed artifacts, findings, validation, and remaining uncertainty; bounded output.

Keep the primary agent responsible for integration and the final answer. Allow the delegate to choose its implementation within the contract. Do not recursively fan out work by default. On failure, inspect what failed before deciding to narrow the task, supply missing evidence, change models if supported, or take it back.

For independent review, provide the actual artifact and requirements without leading the reviewer toward the author's preferred conclusion. Only integrate findings supported by evidence.

