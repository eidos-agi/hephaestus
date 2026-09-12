#!/usr/bin/env python3
"""Validate and reproducibly package Hephaestus. Maintainer-only; stdlib only."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = 'skills/hephaestus'
SKILL_FILES = (
    f'{SKILL_ROOT}/SKILL.md',
    f'{SKILL_ROOT}/references/runtime-recipes.md',
    f'{SKILL_ROOT}/references/delegation-examples.md',
    f'{SKILL_ROOT}/references/evidence-and-cost.md',
)
PLUGIN_FILES = (
    'plugin.json', '.codex-plugin/plugin.json', 'README.md',
    'docs/CLOUD_INSTALL.md', 'docs/EVALUATION.md', 'evals/scenarios.json',
    *SKILL_FILES,
)
REQUIRED_FILES = (*PLUGIN_FILES, '.agents/plugins/marketplace.json')
SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'


class ValidationError(ValueError):
    """A package invariant failed. This is not an official importer result."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def safe_file(root: Path, relative: str) -> Path:
    require(not Path(relative).is_absolute(), f'Absolute package path: {relative}')
    require('..' not in Path(relative).parts, f'Parent traversal: {relative}')
    path = root / relative
    for part in (path, *path.parents):
        if part == root:
            break
        require(not part.is_symlink(), f'Symlink is not allowed: {relative}')
    require(path.resolve().is_relative_to(root.resolve()), f'Escaped package root: {relative}')
    require(path.is_file(), f'Missing package file: {relative}')
    return path


def load_json(root: Path, relative: str) -> dict:
    try:
        value = json.loads(safe_file(root, relative).read_text(encoding='utf-8'))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValidationError(f'Cannot read JSON {relative}: {exc}') from exc
    require(isinstance(value, dict), f'Expected JSON object: {relative}')
    return value


def validate(root: Path = ROOT) -> dict:
    root = root.resolve()
    for relative in REQUIRED_FILES:
        safe_file(root, relative)
    for forbidden in ('mcp.json', '.mcp.json', '.app.json', 'hooks', 'hooks.json',
                      'agents', 'commands', f'{SKILL_ROOT}/scripts', f'{SKILL_ROOT}/agents'):
        require(not ((root / forbidden).exists() or (root / forbidden).is_symlink()),
                f'Forbidden runtime component: {forbidden}')
    for area in (root / 'skills', root / '.codex-plugin'):
        for path in area.rglob('*'):
            require(not path.is_symlink(), f'Symlink in runtime payload: {path.name}')
            if path.is_file():
                require(path.relative_to(root).as_posix() in PLUGIN_FILES,
                        f'Unlisted runtime payload: {path.relative_to(root)}')

    manifest = load_json(root, 'plugin.json')
    legacy = load_json(root, '.codex-plugin/plugin.json')
    require(manifest.get('$schema') == SCHEMA, 'Incorrect portable schema identifier')
    require(manifest.get('name') == 'hephaestus', 'Incorrect plugin name')
    require(isinstance(manifest.get('version'), str) and
            re.fullmatch(r'\d+\.\d+\.\d+', manifest['version']) is not None,
            'Expected stable semantic version')
    allowed = {'$schema', 'name', 'version', 'description', 'author', 'repository',
               'homepage', 'keywords', 'license', 'extensions'}
    require(not (set(manifest) - allowed), 'Unknown portable manifest field')
    require(isinstance(manifest.get('extensions'), dict), 'Missing extension object')
    extension = manifest['extensions'].get('com.openai')
    require(isinstance(extension, dict) and set(extension) == {'interface'},
            'Only presentation is allowed in the OpenAI extension')
    interface = extension['interface']
    require(isinstance(interface, dict) and interface.get('displayName') == 'Hephaestus',
            'Incorrect display name')
    identity = {k: v for k, v in manifest.items() if k not in ('$schema', 'extensions')}
    require(legacy == {**identity, 'skills': './skills/', 'interface': interface},
            'Portable/compatibility metadata drift')
    prompts = interface.get('defaultPrompt')
    require(isinstance(prompts, list) and 1 <= len(prompts) <= 3,
            'Expected one to three starter prompts')
    require(all(isinstance(p, str) and 0 < len(p) <= 128 for p in prompts),
            'Starter prompt exceeds 128 characters or is empty')

    market = load_json(root, '.agents/plugins/marketplace.json')
    entries = market.get('plugins')
    require(isinstance(entries, list) and len(entries) == 1, 'Expected one marketplace entry')
    require(entries[0].get('name') == manifest['name'], 'Marketplace name mismatch')
    require(entries[0].get('source') == {'source': 'local', 'path': './'},
            'Marketplace must resolve the repository-root plugin')
    require(safe_file(root, 'plugin.json').exists(), 'Marketplace target is missing')

    skill = safe_file(root, SKILL_FILES[0]).read_text(encoding='utf-8')
    match = re.match(r'\A---\nname: hephaestus\ndescription: ([^\n]+)\n---\n', skill)
    require(match is not None, 'Missing or malformed skill frontmatter')
    require(len(match.group(1)) <= 1024, 'Skill description is too long')
    require(len(skill.split()) <= 1000 and len(skill.encode('utf-8')) <= 10000,
            'Entry skill exceeds its context budget')
    actual_refs = set(re.findall(r'\]\((references/[^)]+)\)', skill))
    expected_refs = {p.removeprefix(SKILL_ROOT + '/') for p in SKILL_FILES[1:]}
    require(actual_refs == expected_refs, 'Entry reference set differs from package allowlist')

    # All relative Markdown links in the distribution must resolve within it.
    for relative in PLUGIN_FILES:
        if not relative.endswith('.md'):
            continue
        text = safe_file(root, relative).read_text(encoding='utf-8')
        for target in re.findall(r'\]\(([^\s)]+)\)', text):
            if target.startswith(('https://', 'http://', '#', 'mailto:')):
                continue
            target = target.split('#', 1)[0]
            local = (Path(relative).parent / target).as_posix()
            safe_file(root, local)
            require(local in PLUGIN_FILES, f'Linked file absent from archive: {local}')

    suite = load_json(root, 'evals/scenarios.json')
    require(suite.get('schema_version') == 1, 'Unsupported scenario version')
    require(suite.get('execution_status') == 'not_run',
            'Scenarios must not imply execution without a separate evidence report')
    cases = suite.get('scenarios')
    require(isinstance(cases, list) and len(cases) >= 10, 'Insufficient scenario coverage')
    ids = set()
    for case in cases:
        require(isinstance(case, dict), 'Invalid scenario')
        for field in ('id', 'capabilities', 'prompt'):
            require(isinstance(case.get(field), str) and bool(case[field]),
                    f'Missing scenario field: {field}')
        require(case['id'] not in ids, 'Duplicate scenario ID')
        ids.add(case['id'])
        for field in ('expect', 'fail_if'):
            require(isinstance(case.get(field), list) and bool(case[field]) and
                    all(isinstance(x, str) and bool(x) for x in case[field]),
                    f'Invalid scenario checks: {field}')
    return {'version': manifest['version'], 'entry_words': len(skill.split()),
            'runtime_files': len(SKILL_FILES), 'scenario_count': len(cases),
            'validation': 'passed', 'runtime_evaluation': 'not_run'}


def write_zip(root: Path, destination: Path, entries: dict[str, str]) -> None:
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for arcname, relative in sorted(entries.items()):
            require(not Path(arcname).is_absolute() and '..' not in Path(arcname).parts,
                    f'Unsafe archive name: {arcname}')
            data = safe_file(root, relative).read_bytes()
            info = ZipInfo(arcname, date_time=(2026, 9, 12, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=9)


def build(root: Path = ROOT, output: Path | None = None) -> dict:
    root = root.resolve()
    report = validate(root)
    output = (output or root / 'dist').resolve()
    # Never allow output to replace source input, even with a caller-supplied path.
    require(not output.is_relative_to(root / 'skills'), 'Output overlaps runtime sources')
    require(output != root, 'Output must not be the repository root')
    output.mkdir(parents=True, exist_ok=True)
    version = report['version']
    plugin = output / f'hephaestus-plugin-{version}.zip'
    skill = output / f'hephaestus-skill-{version}.zip'
    write_zip(root, plugin, {f'hephaestus/{p}': p for p in PLUGIN_FILES})
    write_zip(root, skill, {f"hephaestus/{p.removeprefix(SKILL_ROOT + '/')}" : p for p in SKILL_FILES})
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (plugin, skill)}
    (output / 'SHA256SUMS').write_text(''.join(f'{digest}  {name}\n' for name, digest in hashes.items()), encoding='utf-8')
    return {**report, 'artifacts': hashes}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate without building ZIPs')
    parser.add_argument('--output', type=Path, help='Output directory (default: dist/)')
    args = parser.parse_args()
    try:
        print(json.dumps(validate() if args.check else build(output=args.output), indent=2))
    except (ValidationError, OSError) as exc:
        print(f'Hephaestus package error: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
