"""Check tracked text files and the label catalog without third-party packages."""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".md", ".py", ".json", ".yml", ".yaml", ".ts", ".mjs"}
TEXT_NAMES = {".editorconfig", ".gitattributes", ".gitignore", ".node-version", ".npmrc", ".prettierignore"}


def main():
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    paths = [Path(name) for name in result.stdout.decode("utf-8").split("\0") if name]
    errors = []
    checked = 0
    for relative in paths:
        if relative.suffix not in TEXT_SUFFIXES and relative.name not in TEXT_NAMES:
            continue
        checked += 1
        try:
            raw = (ROOT / relative).read_bytes()
            text = raw.decode("utf-8")
        except (OSError, UnicodeError) as error:
            errors.append(f"{relative}: {error}")
            continue
        if raw.startswith(b"\xef\xbb\xbf"):
            errors.append(f"{relative}: remove UTF-8 BOM")
        if b"\r" in raw:
            errors.append(f"{relative}: use LF line endings")
        if raw and not raw.endswith(b"\n"):
            errors.append(f"{relative}: missing final newline")
        for number, line in enumerate(text.splitlines(), 1):
            if line.rstrip(" \t") != line:
                errors.append(f"{relative}:{number}: trailing whitespace")
        if relative.suffix == ".json":
            try:
                json.loads(text)
            except ValueError as error:
                errors.append(f"{relative}: invalid JSON: {error}")

    try:
        labels = json.loads((ROOT / ".github/labels.json").read_text(encoding="utf-8"))
        names = [label["name"] for label in labels]
        if len(names) != len(set(names)):
            errors.append("Duplicate label names")
        for label in labels:
            if not re.fullmatch(r"[0-9a-fA-F]{6}", label["color"]):
                errors.append(f"Invalid label color: {label['name']}")
            if not label["description"]:
                errors.append(f"Missing description: {label['name']}")
        expected = {"graveyard", "idle", "pending", "wip", "qualified", "ranked"}
        actual = {name.removeprefix("status:") for name in names if name.startswith("status:")}
        if actual != expected:
            errors.append("Lifecycle labels do not match the documented states")
    except (OSError, ValueError, KeyError, TypeError) as error:
        errors.append(f"Invalid label catalog: {error}")

    if checked == 0:
        errors.append("No tracked text files found; stage new files before running this check")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Repository checks passed ({checked} tracked text files; {len(labels)} labels).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
