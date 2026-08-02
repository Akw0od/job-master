#!/usr/bin/env python3
"""Safely install, update, inspect, or deactivate the Jobmaster Codex skill."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


SKILL_NAME = "resume-application-agent"
RELEASE_FILE = "skill-release.json"
INSTALL_MANIFEST = ".jobmaster-skill-install.json"
MANIFEST_SCHEMA_VERSION = 1
PRESERVED_FILES = (Path(".npmrc"), Path("data/profile_context.md"))
PRESERVED_DIRECTORIES = (Path("runs"), Path("outputs"))
RUNTIME_DIRECTORY_NAMES = {
    ".git", ".jobmaster-skill-backups", ".npm-cache", "__pycache__",
    "dist", "node_modules", "tmp",
}
FALLBACK_EXCLUDED_NAMES = RUNTIME_DIRECTORY_NAMES | {
    ".codex_research", "design-audit", "design-qa-captures",
}
FALLBACK_EXCLUDED_FILES = {INSTALL_MANIFEST, ".DS_Store"}
SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
HEX_256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


class SkillManagerError(RuntimeError):
    """A bounded, user-actionable lifecycle failure."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def timestamp_token() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def aggregate_fingerprint(file_hashes: dict[str, str]) -> str:
    digest = hashlib.sha256()
    for relative_path, file_hash in sorted(file_hashes.items()):
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_hash.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def safe_relative_path(value: str) -> Path:
    path = Path(value)
    if not value or path.is_absolute() or ".." in path.parts:
        raise SkillManagerError(f"Unsafe relative path in manifest: {value!r}")
    return path


def read_release(source: Path) -> dict[str, object]:
    release_path = source / RELEASE_FILE
    try:
        release = json.loads(release_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SkillManagerError(f"Cannot read {release_path}: {error}") from error
    if not isinstance(release, dict) or release.get("schemaVersion") != 1:
        raise SkillManagerError("skill-release.json has an unsupported schema")
    if release.get("name") != SKILL_NAME:
        raise SkillManagerError(f"skill-release.json must identify {SKILL_NAME}")
    version = release.get("version")
    source_url = release.get("source")
    if not isinstance(version, str) or not SEMVER_PATTERN.fullmatch(version):
        raise SkillManagerError("skill-release.json must contain a semantic version")
    if not isinstance(source_url, str) or not source_url.startswith("https://github.com/"):
        raise SkillManagerError("skill-release.json must contain the canonical HTTPS GitHub source")
    return release


def verify_skill_identity(path: Path) -> None:
    skill_path = path / "SKILL.md"
    try:
        header = skill_path.read_text(encoding="utf-8")[:4096]
    except OSError as error:
        raise SkillManagerError(f"Cannot read {skill_path}: {error}") from error
    if not re.search(rf"(?m)^name:\s*{re.escape(SKILL_NAME)}\s*$", header):
        raise SkillManagerError(f"{path} is not the {SKILL_NAME} skill")


def git_tracked_files(source: Path) -> list[Path] | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(source), "ls-files", "-z"],
            check=False,
            capture_output=True,
        )
    except OSError:
        return None
    if result.returncode != 0 or not result.stdout:
        return None
    paths = []
    for raw_path in result.stdout.decode("utf-8").split("\0"):
        if not raw_path:
            continue
        relative_path = safe_relative_path(raw_path)
        candidate = source / relative_path
        if candidate.is_symlink():
            raise SkillManagerError(f"Distribution symlinks are not supported: {relative_path.as_posix()}")
        if not candidate.is_file():
            raise SkillManagerError(
                f"Tracked distribution file is missing or unsupported: {relative_path.as_posix()}"
            )
        paths.append(relative_path)
    return sorted(set(paths), key=lambda item: item.as_posix())


def fallback_distribution_files(source: Path) -> list[Path]:
    paths = []
    for current_root, directory_names, file_names in os.walk(source):
        current = Path(current_root)
        kept_directories = []
        for directory_name in sorted(directory_names):
            if directory_name in FALLBACK_EXCLUDED_NAMES:
                continue
            candidate = current / directory_name
            relative_path = candidate.relative_to(source)
            if candidate.is_symlink():
                raise SkillManagerError(
                    f"Distribution symlinks are not supported: {relative_path.as_posix()}"
                )
            kept_directories.append(directory_name)
        directory_names[:] = kept_directories
        for file_name in sorted(file_names):
            candidate = current / file_name
            relative_path = candidate.relative_to(source)
            if file_name in FALLBACK_EXCLUDED_FILES or file_name == ".env" or file_name.startswith(".env."):
                continue
            if candidate.is_symlink():
                raise SkillManagerError(f"Distribution symlinks are not supported: {relative_path.as_posix()}")
            if candidate.is_file():
                paths.append(relative_path)
    return paths


def is_preserved_file_path(relative_path: Path) -> bool:
    return (
        relative_path in PRESERVED_FILES
        or relative_path.name == ".env"
        or relative_path.name.startswith(".env.")
    )


def is_preserved_directory_path(relative_path: Path) -> bool:
    return any(
        relative_path == directory or directory in relative_path.parents
        for directory in PRESERVED_DIRECTORIES
    )


def is_preserved_path(relative_path: Path) -> bool:
    return is_preserved_file_path(relative_path) or is_preserved_directory_path(relative_path)


def is_runtime_path(relative_path: Path) -> bool:
    return (
        any(part in RUNTIME_DIRECTORY_NAMES for part in relative_path.parts)
        or relative_path.name == ".DS_Store"
        or relative_path.suffix == ".pyc"
    )


def is_source_excluded_path(relative_path: Path) -> bool:
    return (
        is_runtime_path(relative_path)
        or is_preserved_directory_path(relative_path)
        or relative_path.name == ".env"
        or relative_path.name.startswith(".env.")
    )


def source_snapshot(source: Path) -> dict[str, object]:
    verify_skill_identity(source)
    release = read_release(source)
    candidate_files = git_tracked_files(source) or fallback_distribution_files(source)
    distribution_files = [
        relative_path
        for relative_path in candidate_files
        if not is_source_excluded_path(relative_path)
    ]
    required = {Path("SKILL.md"), Path(RELEASE_FILE), Path("scripts/manage_skill.py")}
    missing = sorted(path.as_posix() for path in required if path not in distribution_files)
    if missing:
        raise SkillManagerError(
            "Required lifecycle files are not part of the distribution: " + ", ".join(missing)
        )
    managed_hashes = {
        relative_path.as_posix(): sha256_file(source / relative_path)
        for relative_path in distribution_files
        if not is_preserved_path(relative_path)
    }
    return {
        "release": release,
        "distributionFiles": distribution_files,
        "managedFiles": managed_hashes,
        "fingerprint": aggregate_fingerprint(managed_hashes),
    }


def install_manifest(snapshot: dict[str, object]) -> dict[str, object]:
    release = snapshot["release"]
    return {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "managedBy": "jobmaster-skill-manager",
        "name": SKILL_NAME,
        "version": release["version"],
        "source": release["source"],
        "sourceFingerprint": snapshot["fingerprint"],
        "installedAt": utc_now(),
        "managedFiles": snapshot["managedFiles"],
        "preservedPaths": [
            ".npmrc",
            ".env*",
            "data/profile_context.md",
            "runs/",
            "outputs/",
        ],
    }


def validate_install_manifest(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or value.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        raise SkillManagerError("Installed Skill manifest has an unsupported schema")
    if value.get("managedBy") != "jobmaster-skill-manager" or value.get("name") != SKILL_NAME:
        raise SkillManagerError("Installed Skill manifest belongs to another manager or skill")
    version = value.get("version")
    fingerprint = value.get("sourceFingerprint")
    managed_files = value.get("managedFiles")
    if not isinstance(version, str) or not SEMVER_PATTERN.fullmatch(version):
        raise SkillManagerError("Installed Skill manifest has an invalid version")
    if not isinstance(fingerprint, str) or not HEX_256_PATTERN.fullmatch(fingerprint):
        raise SkillManagerError("Installed Skill manifest has an invalid fingerprint")
    if not isinstance(managed_files, dict) or len(managed_files) > 2000:
        raise SkillManagerError("Installed Skill manifest has an invalid file list")
    normalized_hashes = {}
    for raw_path, file_hash in managed_files.items():
        if not isinstance(raw_path, str) or not isinstance(file_hash, str) or not HEX_256_PATTERN.fullmatch(file_hash):
            raise SkillManagerError("Installed Skill manifest contains an invalid file entry")
        normalized_path = safe_relative_path(raw_path).as_posix()
        if normalized_path in normalized_hashes:
            raise SkillManagerError("Installed Skill manifest contains duplicate normalized paths")
        normalized_hashes[normalized_path] = file_hash
    if aggregate_fingerprint(normalized_hashes) != fingerprint:
        raise SkillManagerError("Installed Skill manifest fingerprint does not match its file list")
    return {**value, "managedFiles": normalized_hashes}


def read_install_manifest(target: Path) -> dict[str, object] | None:
    path = target / INSTALL_MANIFEST
    if path.is_symlink():
        raise SkillManagerError("Installed Skill manifest is not a regular file")
    if not path.exists():
        return None
    if not path.is_file():
        raise SkillManagerError("Installed Skill manifest is not a regular file")
    try:
        return validate_install_manifest(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as error:
        raise SkillManagerError(f"Cannot read installed Skill manifest: {error}") from error


def managed_changes(target: Path, manifest: dict[str, object]) -> list[str]:
    changes = []
    for raw_path, expected_hash in manifest["managedFiles"].items():
        relative_path = safe_relative_path(raw_path)
        candidate = target / relative_path
        if candidate.is_symlink() or not candidate.is_file() or sha256_file(candidate) != expected_hash:
            changes.append(relative_path.as_posix())
    return changes


def unexpected_target_files(target: Path, manifest: dict[str, object]) -> list[str]:
    known = set(manifest["managedFiles"])
    unexpected = []
    for current_root, directory_names, file_names in os.walk(target):
        current = Path(current_root)
        kept_directories = []
        for directory_name in sorted(directory_names):
            candidate = current / directory_name
            relative_directory = candidate.relative_to(target)
            relative_text = relative_directory.as_posix()
            if is_runtime_path(relative_directory):
                continue
            if candidate.is_symlink() or is_preserved_file_path(relative_directory):
                unexpected.append(relative_text)
                continue
            if is_preserved_directory_path(relative_directory):
                continue
            kept_directories.append(directory_name)
        directory_names[:] = kept_directories
        for file_name in sorted(file_names):
            candidate = current / file_name
            relative_path = candidate.relative_to(target)
            relative_text = relative_path.as_posix()
            if relative_text == INSTALL_MANIFEST or relative_text in known:
                continue
            if is_runtime_path(relative_path):
                continue
            if candidate.is_symlink() or relative_path in PRESERVED_DIRECTORIES:
                unexpected.append(relative_text)
                continue
            if is_preserved_file_path(relative_path):
                continue
            unexpected.append(relative_text)
    return unexpected


def default_destination() -> Path:
    configured_root = os.environ.get("CODEX_HOME")
    codex_root = Path(configured_root).expanduser() if configured_root else Path.home() / ".codex"
    return codex_root / "skills" / SKILL_NAME


def resolved_source(value: str | None) -> Path:
    raw_source = Path(value).expanduser() if value else Path(__file__).resolve().parents[1]
    source = raw_source.resolve()
    if not source.is_dir():
        raise SkillManagerError(f"Skill source does not exist: {source}")
    return source


def resolved_destination(value: str | None) -> Path:
    raw_destination = Path(value).expanduser() if value else default_destination()
    if raw_destination.is_symlink():
        raise SkillManagerError("Refusing to manage a symlinked Skill destination")
    destination = raw_destination.resolve(strict=False)
    if destination.name != SKILL_NAME:
        raise SkillManagerError(f"Destination folder must be named {SKILL_NAME}")
    forbidden = {Path("/").resolve(), Path.home().resolve()}
    if destination in forbidden:
        raise SkillManagerError("Refusing to manage a broad filesystem destination")
    return destination


def validate_mutation_paths(source: Path, target: Path) -> None:
    if source == target or source in target.parents or target in source.parents:
        raise SkillManagerError("Skill source and destination must be separate directories")
    if target.exists() and (target.is_symlink() or not target.is_dir()):
        raise SkillManagerError("Skill destination must be a regular directory")


def write_stage(source: Path, target_parent: Path, snapshot: dict[str, object]) -> Path:
    target_parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{SKILL_NAME}-stage-", dir=target_parent))
    try:
        for relative_path in snapshot["distributionFiles"]:
            source_file = source / relative_path
            destination_file = stage / relative_path
            destination_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, destination_file)
        manifest_path = stage / INSTALL_MANIFEST
        manifest_path.write_text(
            json.dumps(install_manifest(snapshot), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return stage


def assert_no_symlinks(path: Path) -> None:
    if path.is_symlink():
        raise SkillManagerError(f"Cannot preserve symlinked user data: {path}")
    if path.is_dir():
        for candidate in path.rglob("*"):
            if candidate.is_symlink():
                raise SkillManagerError(f"Cannot preserve symlinked user data: {candidate}")


def copy_preserved_path(source_path: Path, destination_path: Path) -> None:
    assert_no_symlinks(source_path)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if source_path.is_dir():
        if destination_path.exists():
            shutil.rmtree(destination_path)
        shutil.copytree(source_path, destination_path)
    elif source_path.is_file():
        shutil.copy2(source_path, destination_path)


def preserve_user_data(target: Path, stage: Path) -> list[str]:
    preserved = []
    for relative_path in (*PRESERVED_FILES, *PRESERVED_DIRECTORIES):
        source_path = target / relative_path
        if source_path.exists() or source_path.is_symlink():
            copy_preserved_path(source_path, stage / relative_path)
            preserved.append(relative_path.as_posix())
    for current_root, directory_names, file_names in os.walk(target):
        current = Path(current_root)
        directory_names[:] = [
            name for name in directory_names
            if name not in RUNTIME_DIRECTORY_NAMES and (current / name).relative_to(target) not in PRESERVED_DIRECTORIES
        ]
        for file_name in file_names:
            if file_name != ".env" and not file_name.startswith(".env."):
                continue
            source_path = current / file_name
            relative_path = source_path.relative_to(target)
            copy_preserved_path(source_path, stage / relative_path)
            preserved.append(relative_path.as_posix())
    return sorted(set(preserved))


def backup_path_for(target: Path, version: str) -> Path:
    backup_root = target.parent / ".jobmaster-skill-backups"
    backup_root.mkdir(parents=True, exist_ok=True)
    base_name = f"{SKILL_NAME}-{timestamp_token()}-{version}"
    candidate = backup_root / base_name
    suffix = 1
    while candidate.exists():
        candidate = backup_root / f"{base_name}-{suffix}"
        suffix += 1
    return candidate


def activate_stage(stage: Path, target: Path, previous_version: str = "legacy") -> Path | None:
    backup = None
    if target.exists():
        backup = backup_path_for(target, previous_version)
        target.replace(backup)
    try:
        stage.replace(target)
    except Exception as error:
        if backup and backup.exists() and not target.exists():
            backup.replace(target)
        raise SkillManagerError(f"Could not activate the staged Skill: {error}") from error
    return backup


def status_result(source: Path, target: Path) -> dict[str, object]:
    snapshot = source_snapshot(source)
    result = {
        "name": SKILL_NAME,
        "target": str(target),
        "sourceVersion": snapshot["release"]["version"],
        "sourceFingerprint": snapshot["fingerprint"],
        "installedVersion": None,
        "installedFingerprint": None,
        "state": "not-installed",
        "modifiedPaths": [],
        "unexpectedPaths": [],
    }
    if not target.exists():
        return result
    if target.is_symlink() or not target.is_dir():
        return {**result, "state": "invalid-target"}
    try:
        verify_skill_identity(target)
        manifest = read_install_manifest(target)
    except SkillManagerError as error:
        return {**result, "state": "invalid-install", "error": str(error)}
    if manifest is None:
        return {**result, "state": "unmanaged"}
    modified = managed_changes(target, manifest)
    unexpected = unexpected_target_files(target, manifest)
    state = "modified" if modified or unexpected else (
        "up-to-date"
        if manifest["sourceFingerprint"] == snapshot["fingerprint"]
        and manifest["version"] == snapshot["release"]["version"]
        else "update-available"
    )
    return {
        **result,
        "installedVersion": manifest["version"],
        "installedFingerprint": manifest["sourceFingerprint"],
        "state": state,
        "modifiedPaths": modified,
        "unexpectedPaths": unexpected,
    }


def install_skill(source: Path, target: Path) -> dict[str, object]:
    validate_mutation_paths(source, target)
    if target.exists():
        raise SkillManagerError(f"Destination already exists: {target}. Use update instead.")
    snapshot = source_snapshot(source)
    stage = write_stage(source, target.parent, snapshot)
    activate_stage(stage, target)
    return {
        "action": "installed",
        "target": str(target),
        "version": snapshot["release"]["version"],
        "fingerprint": snapshot["fingerprint"],
    }


def update_skill(source: Path, target: Path, *, adopt: bool, force: bool) -> dict[str, object]:
    validate_mutation_paths(source, target)
    if not target.exists():
        raise SkillManagerError(f"Skill is not installed at {target}. Use install instead.")
    verify_skill_identity(target)
    manifest = read_install_manifest(target)
    if manifest is None and not adopt:
        raise SkillManagerError("Existing Skill is unmanaged. Review it, then rerun update with --adopt.")
    if manifest is not None:
        modified = managed_changes(target, manifest)
        unexpected = unexpected_target_files(target, manifest)
        if (modified or unexpected) and not force:
            paths = (modified + unexpected)[:12]
            raise SkillManagerError(
                "Refusing to overwrite locally modified managed files: " + ", ".join(paths)
                + (" …" if len(modified) + len(unexpected) > len(paths) else "")
                + ". Review them, then rerun with --force; the previous install will be backed up."
            )
    snapshot = source_snapshot(source)
    if manifest is not None and not force:
        current_status = status_result(source, target)
        if current_status["state"] == "up-to-date":
            return {
                "action": "already-up-to-date",
                "target": str(target),
                "version": snapshot["release"]["version"],
                "fingerprint": snapshot["fingerprint"],
            }
    stage = write_stage(source, target.parent, snapshot)
    try:
        preserved = preserve_user_data(target, stage)
        previous_version = manifest["version"] if manifest else "legacy"
        backup = activate_stage(stage, target, previous_version)
    except Exception:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
        raise
    return {
        "action": "adopted-and-updated" if manifest is None else "updated",
        "target": str(target),
        "version": snapshot["release"]["version"],
        "fingerprint": snapshot["fingerprint"],
        "backup": str(backup) if backup else None,
        "preservedPaths": preserved,
    }


def uninstall_skill(target: Path, *, force: bool) -> dict[str, object]:
    if not target.exists():
        return {"action": "already-not-installed", "target": str(target), "backup": None}
    verify_skill_identity(target)
    manifest = read_install_manifest(target)
    if manifest is None:
        raise SkillManagerError("Refusing to uninstall an unmanaged Skill. Adopt it with update --adopt first.")
    modified = managed_changes(target, manifest)
    unexpected = unexpected_target_files(target, manifest)
    if (modified or unexpected) and not force:
        raise SkillManagerError("Installed Skill has local modifications. Review them, then rerun uninstall with --force.")
    backup = backup_path_for(target, manifest["version"])
    target.replace(backup)
    return {"action": "deactivated", "target": str(target), "backup": str(backup)}


def emit_result(result: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    if "state" in result:
        print(f"state: {result['state']}")
        print(f"source: {result['sourceVersion']} ({str(result['sourceFingerprint'])[:12]})")
        installed = result.get("installedVersion")
        installed_fingerprint = result.get("installedFingerprint")
        print(f"installed: {installed or '-'} ({str(installed_fingerprint)[:12] if installed_fingerprint else '-'})")
        print(f"target: {result['target']}")
        if result.get("modifiedPaths"):
            print("modified: " + ", ".join(result["modifiedPaths"][:12]))
        if result.get("unexpectedPaths"):
            print("unexpected: " + ", ".join(result["unexpectedPaths"][:12]))
        if result.get("error"):
            print(f"error: {result['error']}")
        return
    print(f"action: {result['action']}")
    print(f"target: {result['target']}")
    if result.get("version"):
        print(f"version: {result['version']}")
    if result.get("fingerprint"):
        print(f"fingerprint: {str(result['fingerprint'])[:12]}")
    if result.get("backup"):
        print(f"backup: {result['backup']}")
    if result.get("preservedPaths"):
        print("preserved: " + ", ".join(result["preservedPaths"]))


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--source", help="Skill source checkout; defaults to this repository")
    parser.add_argument("--dest", help=f"Destination; defaults to $CODEX_HOME/skills/{SKILL_NAME}")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("status", "version", "install"):
        add_common_arguments(commands.add_parser(command))
    update_parser = commands.add_parser("update")
    add_common_arguments(update_parser)
    update_parser.add_argument("--adopt", action="store_true", help="Migrate a reviewed legacy install")
    update_parser.add_argument("--force", action="store_true", help="Replace modified managed files after backing up")
    uninstall_parser = commands.add_parser("uninstall")
    add_common_arguments(uninstall_parser)
    uninstall_parser.add_argument("--force", action="store_true", help="Deactivate a modified managed install")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        source = resolved_source(args.source)
        target = resolved_destination(args.dest)
        if args.command in {"status", "version"}:
            result = status_result(source, target)
        elif args.command == "install":
            result = install_skill(source, target)
        elif args.command == "update":
            result = update_skill(source, target, adopt=args.adopt, force=args.force)
        else:
            result = uninstall_skill(target, force=args.force)
        emit_result(result, args.json)
        return 0
    except SkillManagerError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
