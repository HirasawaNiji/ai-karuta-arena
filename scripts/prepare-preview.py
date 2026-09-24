"""Extract only hash-matching audio listed in the checked-in D0 audit for local review."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    audit = json.loads((Path(__file__).resolve().parents[1] / "docs/evidence/d0-pjsk-materials.json").read_text(encoding="utf-8"))
    with args.archive.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != audit["packageSha256"]:
            raise ValueError("Archive hash differs from audited package")
    root = args.output.resolve()
    with ZipFile(args.archive) as archive:
        for row in audit["records"]:
            item = row["audio"]
            target = (root / item["member"]).resolve()
            if not target.is_relative_to(root):
                raise ValueError("Unsafe material path")
            data = archive.read(item["member"])
            if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError("Audio hash mismatch: " + row["sourceTrackId"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    print(f"Prepared {len(audit['records'])} pending audio previews; semantic status unchanged.")


if __name__ == "__main__":
    main()
