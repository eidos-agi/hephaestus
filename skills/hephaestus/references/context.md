# Focused context

Use a three-part handoff: **objective and constraints**, **minimum relevant sources**, and **expected result**. Include exact file paths or source identifiers, important interfaces, and what has already been verified. Do not include the full parent conversation unless the task depends on it.

Before a broad read, ask which decision the information will change. Start with filenames, symbol searches, schemas, or a bounded result page. Expand only if those are insufficient. When output truncates, request a narrower range rather than rerunning the same oversized request.

Preserve a compact checkpoint at natural boundaries: completed artifacts, commit or release revision, verified results, unresolved risks, and the next action. Separate observations from assumptions. If the environment has no persistent filesystem, use available connected artifacts or a concise in-conversation checkpoint.

Cache conclusions only while their evidence remains valid. Reread after relevant code, permissions, deployment, or data changes. For Hephaestus guidance, retain the release revision and topic hashes: check the release once per major phase, then fetch only topics with changed hashes. An unchanged response is enough to reuse the topic already loaded.

