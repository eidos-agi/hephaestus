"""Static and packaging regressions, not an LLM behavior benchmark."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hephaestus_package', ROOT / 'scripts/package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'source'
        self.root.mkdir()
        for relative in package.REQUIRED_FILES:
            destination = self.root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)

    def tearDown(self):
        self.temp.cleanup()

    def edit_json(self, path, mutate):
        file = self.root / path
        value = json.loads(file.read_text())
        mutate(value)
        file.write_text(json.dumps(value))

    def test_source_package_passes(self):
        report = package.validate(self.root)
        self.assertEqual(report['validation'], 'passed')
        self.assertEqual(report['runtime_evaluation'], 'not_run')
        self.assertEqual(report['scenario_count'], 14)
        self.assertLessEqual(report['entry_words'], 1000)

    def test_rejects_metadata_drift(self):
        self.edit_json('.codex-plugin/plugin.json', lambda x: x.update(version='9.9.9'))
        with self.assertRaisesRegex(package.ValidationError, 'drift'):
            package.validate(self.root)

    def test_rejects_mcp_declaration(self):
        (self.root / '.mcp.json').write_text('{"mcpServers": {}}')
        with self.assertRaisesRegex(package.ValidationError, 'Forbidden runtime'):
            package.validate(self.root)

    def test_rejects_hook_directory(self):
        (self.root / 'hooks').mkdir()
        with self.assertRaisesRegex(package.ValidationError, 'Forbidden runtime'):
            package.validate(self.root)

    def test_rejects_inline_runtime_dependency(self):
        self.edit_json('plugin.json', lambda x: x['extensions']['com.openai'].update(apps='./.app.json'))
        with self.assertRaisesRegex(package.ValidationError, 'Only presentation'):
            package.validate(self.root)

    def test_rejects_missing_reference(self):
        (self.root / package.SKILL_FILES[1]).unlink()
        with self.assertRaisesRegex(package.ValidationError, 'Missing package file'):
            package.validate(self.root)

    def test_rejects_symlink(self):
        path = self.root / package.SKILL_FILES[1]
        path.unlink()
        path.symlink_to(self.root / 'README.md')
        with self.assertRaisesRegex(package.ValidationError, 'Symlink'):
            package.validate(self.root)

    def test_rejects_unlisted_runtime_script(self):
        (self.root / package.SKILL_ROOT / 'surprise.py').write_text('print("unexpected")')
        with self.assertRaisesRegex(package.ValidationError, 'Unlisted runtime'):
            package.validate(self.root)

    def test_rejects_bad_marketplace_path(self):
        self.edit_json('.agents/plugins/marketplace.json', lambda x: x['plugins'][0]['source'].update(path='./missing'))
        with self.assertRaisesRegex(package.ValidationError, 'repository-root'):
            package.validate(self.root)

    def test_rejects_oversized_entry(self):
        with (self.root / package.SKILL_FILES[0]).open('a') as f:
            f.write(' word' * 1001)
        with self.assertRaisesRegex(package.ValidationError, 'context budget'):
            package.validate(self.root)

    def test_rejects_unknown_manifest_field(self):
        self.edit_json('plugin.json', lambda x: x.update(run_agents_automatically=True))
        with self.assertRaisesRegex(package.ValidationError, 'Unknown portable'):
            package.validate(self.root)

    def test_rejects_long_starter_prompt(self):
        for path in ('plugin.json', '.codex-plugin/plugin.json'):
            def mutate(x):
                interface = x['extensions']['com.openai']['interface'] if 'extensions' in x else x['interface']
                interface['defaultPrompt'] = ['x' * 129]
            self.edit_json(path, mutate)
        with self.assertRaisesRegex(package.ValidationError, '128 characters'):
            package.validate(self.root)

    def test_rejects_duplicate_scenario_id(self):
        self.edit_json('evals/scenarios.json', lambda x: x['scenarios'].append(x['scenarios'][0]))
        with self.assertRaisesRegex(package.ValidationError, 'Duplicate scenario'):
            package.validate(self.root)

    def test_rejects_false_runtime_pass(self):
        self.edit_json('evals/scenarios.json', lambda x: x.update(execution_status='passed'))
        with self.assertRaisesRegex(package.ValidationError, 'separate evidence'):
            package.validate(self.root)

    def test_reproducible_artifacts(self):
        output_a = Path(self.temp.name) / 'a'
        output_b = Path(self.temp.name) / 'b'
        a = package.build(self.root, output_a)
        b = package.build(self.root, output_b)
        self.assertEqual(a['artifacts'], b['artifacts'])
        for name in a['artifacts']:
            self.assertEqual((output_a / name).read_bytes(), (output_b / name).read_bytes())

    def test_skill_archive_is_self_contained(self):
        output = Path(self.temp.name) / 'out'
        package.build(self.root, output)
        with ZipFile(output / 'hephaestus-skill-0.1.0.zip') as archive:
            expected = {'hephaestus/' + p.removeprefix(package.SKILL_ROOT + '/') for p in package.SKILL_FILES}
            self.assertEqual(set(archive.namelist()), expected)
            self.assertIn('hephaestus/SKILL.md', archive.namelist())
            self.assertIsNone(archive.testzip())

    def test_full_archive_excludes_development_and_private_files(self):
        (self.root / '.env').write_text('TEST_ONLY_SECRET=never-ship')
        output = Path(self.temp.name) / 'out'
        package.build(self.root, output)
        with ZipFile(output / 'hephaestus-plugin-0.1.0.zip') as archive:
            self.assertEqual(set(archive.namelist()), {'hephaestus/' + p for p in package.PLUGIN_FILES})
            self.assertFalse(any('.env' in p or '/scripts/' in p or '/tests/' in p for p in archive.namelist()))
            self.assertIsNone(archive.testzip())

    def test_rejects_output_overlapping_skill(self):
        with self.assertRaisesRegex(package.ValidationError, 'overlaps runtime'):
            package.build(self.root, self.root / package.SKILL_ROOT / 'output')


if __name__ == '__main__':
    unittest.main()
