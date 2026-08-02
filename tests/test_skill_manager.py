import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANAGER = PROJECT_ROOT / "scripts" / "manage_skill.py"
SKILL_NAME = "resume-application-agent"


class SkillManagerTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.source = self.root / "source"
        self.destination = self.root / "skills" / SKILL_NAME
        self.make_source()

    def tearDown(self):
        self.temporary_directory.cleanup()

    def make_source(self, version="0.1.0", tool_text="version one\n"):
        (self.source / "scripts").mkdir(parents=True, exist_ok=True)
        (self.source / "data").mkdir(parents=True, exist_ok=True)
        (self.source / "SKILL.md").write_text(
            "---\nname: resume-application-agent\ndescription: Test fixture\n---\n\n# Fixture\n",
            encoding="utf-8",
        )
        (self.source / "skill-release.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "name": SKILL_NAME,
                "version": version,
                "source": "https://github.com/Akw0od/job-master",
            }),
            encoding="utf-8",
        )
        shutil.copy2(MANAGER, self.source / "scripts" / "manage_skill.py")
        (self.source / "scripts" / "tool.py").write_text(tool_text, encoding="utf-8")
        (self.source / "data" / "profile_context.md").write_text("example facts\n", encoding="utf-8")
        (self.source / ".npmrc").write_text("fund=false\n", encoding="utf-8")

    def run_manager(self, command, *extra, expect_success=True):
        result = subprocess.run(
            [
                sys.executable,
                str(MANAGER),
                command,
                "--source",
                str(self.source),
                "--dest",
                str(self.destination),
                "--json",
                *extra,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if expect_success and result.returncode != 0:
            self.fail(f"manager failed: {result.stderr}\n{result.stdout}")
        if not expect_success:
            self.assertNotEqual(result.returncode, 0)
            return result
        return json.loads(result.stdout)

    def test_install_and_version_check_are_deterministic(self):
        (self.source / ".env.local").write_text("DO_NOT_COPY=secret\n", encoding="utf-8")
        (self.source / "runs" / "example").mkdir(parents=True)
        (self.source / "runs" / "example" / "packet.md").write_text("source output\n", encoding="utf-8")
        (self.source / "outputs").mkdir()
        (self.source / "outputs" / "resume.pdf").write_bytes(b"source output")
        installed = self.run_manager("install")
        self.assertEqual(installed["action"], "installed")
        self.assertEqual(installed["version"], "0.1.0")
        self.assertTrue((self.destination / ".jobmaster-skill-install.json").is_file())
        self.assertFalse((self.destination / ".env.local").exists())
        self.assertFalse((self.destination / "runs").exists())
        self.assertFalse((self.destination / "outputs").exists())

        status = self.run_manager("status")
        version = self.run_manager("version")
        self.assertEqual(status["state"], "up-to-date")
        self.assertEqual(version["sourceFingerprint"], status["sourceFingerprint"])
        self.assertEqual(version["installedFingerprint"], status["sourceFingerprint"])

    def test_update_preserves_candidate_facts_config_and_run_outputs(self):
        self.run_manager("install")
        (self.destination / "data" / "profile_context.md").write_text("candidate-owned facts\n", encoding="utf-8")
        (self.destination / ".npmrc").write_text("candidate-owned config\n", encoding="utf-8")
        (self.destination / ".env.local").write_text("SECRET_NAME=preserved\n", encoding="utf-8")
        (self.destination / "runs" / "application-1").mkdir(parents=True)
        (self.destination / "runs" / "application-1" / "packet.md").write_text("candidate output\n", encoding="utf-8")
        self.make_source(version="0.2.0", tool_text="version two\n")

        updated = self.run_manager("update")
        self.assertEqual(updated["action"], "updated")
        self.assertEqual((self.destination / "scripts" / "tool.py").read_text(encoding="utf-8"), "version two\n")
        self.assertEqual((self.destination / "data" / "profile_context.md").read_text(encoding="utf-8"), "candidate-owned facts\n")
        self.assertEqual((self.destination / ".npmrc").read_text(encoding="utf-8"), "candidate-owned config\n")
        self.assertEqual((self.destination / ".env.local").read_text(encoding="utf-8"), "SECRET_NAME=preserved\n")
        self.assertEqual((self.destination / "runs" / "application-1" / "packet.md").read_text(encoding="utf-8"), "candidate output\n")
        self.assertTrue(Path(updated["backup"]).is_dir())
        self.assertEqual(self.run_manager("status")["state"], "up-to-date")

    def test_managed_drift_and_unexpected_files_block_update_until_forced(self):
        self.run_manager("install")
        (self.destination / "scripts" / "tool.py").write_text("locally modified\n", encoding="utf-8")
        (self.destination / "unexpected.txt").write_text("local file\n", encoding="utf-8")
        self.make_source(version="0.2.0", tool_text="version two\n")

        blocked = self.run_manager("update", expect_success=False)
        self.assertIn("Refusing to overwrite locally modified managed files", blocked.stderr)
        self.assertEqual((self.destination / "scripts" / "tool.py").read_text(encoding="utf-8"), "locally modified\n")

        forced = self.run_manager("update", "--force")
        backup = Path(forced["backup"])
        self.assertEqual((backup / "scripts" / "tool.py").read_text(encoding="utf-8"), "locally modified\n")
        self.assertEqual((backup / "unexpected.txt").read_text(encoding="utf-8"), "local file\n")
        self.assertEqual((self.destination / "scripts" / "tool.py").read_text(encoding="utf-8"), "version two\n")
        self.assertFalse((self.destination / "unexpected.txt").exists())

    def test_symlinked_and_malformed_preserved_paths_fail_closed(self):
        self.run_manager("install")
        external_directory = self.root / "external"
        external_directory.mkdir()
        (self.destination / "linked-data").symlink_to(external_directory, target_is_directory=True)
        self.make_source(version="0.2.0", tool_text="version two\n")

        linked = self.run_manager("update", expect_success=False)
        self.assertIn("linked-data", linked.stderr)
        (self.destination / "linked-data").unlink()

        (self.destination / ".env.local").mkdir()
        malformed = self.run_manager("update", expect_success=False)
        self.assertIn(".env.local", malformed.stderr)
        self.assertTrue((self.destination / ".env.local").is_dir())

    def test_tampered_install_manifest_is_reported_as_invalid(self):
        self.run_manager("install")
        manifest_path = self.destination / ".jobmaster-skill-install.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["managedFiles"].pop("scripts/tool.py")
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        status = self.run_manager("status")
        self.assertEqual(status["state"], "invalid-install")
        self.assertIn("fingerprint", status["error"])

    def test_legacy_install_requires_explicit_adoption_and_retains_a_backup(self):
        self.destination.parent.mkdir(parents=True)
        shutil.copytree(self.source, self.destination)
        (self.destination / "data" / "profile_context.md").write_text("legacy candidate facts\n", encoding="utf-8")
        self.make_source(version="0.2.0", tool_text="version two\n")

        self.assertEqual(self.run_manager("status")["state"], "unmanaged")
        blocked = self.run_manager("update", expect_success=False)
        self.assertIn("rerun update with --adopt", blocked.stderr)

        adopted = self.run_manager("update", "--adopt")
        self.assertEqual(adopted["action"], "adopted-and-updated")
        self.assertEqual((self.destination / "data" / "profile_context.md").read_text(encoding="utf-8"), "legacy candidate facts\n")
        self.assertTrue(Path(adopted["backup"]).is_dir())
        self.assertEqual(self.run_manager("version")["state"], "up-to-date")

    def test_uninstall_deactivates_managed_skill_into_recoverable_backup(self):
        self.run_manager("install")
        (self.destination / "data" / "profile_context.md").write_text("keep me\n", encoding="utf-8")

        result = subprocess.run(
            [
                sys.executable,
                str(self.destination / "scripts" / "manage_skill.py"),
                "uninstall",
                "--dest",
                str(self.destination),
                "--json",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        removed = json.loads(result.stdout)
        backup = Path(removed["backup"])
        self.assertEqual(removed["action"], "deactivated")
        self.assertFalse(self.destination.exists())
        self.assertEqual((backup / "data" / "profile_context.md").read_text(encoding="utf-8"), "keep me\n")
        self.assertEqual(self.run_manager("status")["state"], "not-installed")


if __name__ == "__main__":
    unittest.main()
