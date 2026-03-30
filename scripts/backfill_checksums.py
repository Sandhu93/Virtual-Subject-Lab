#!/usr/bin/env python3
"""backfill_checksums.py — compute missing sha256 checksums for existing stimuli.

Run this after migrating data from an older version of the schema where
checksum_sha256 was not always populated on finalization.

Usage:
    python scripts/backfill_checksums.py [--dry-run]
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

import os

os.chdir(REPO_ROOT)

from sqlalchemy import select

from virtual_subject.db.bootstrap import init_db
from virtual_subject.db.models import Stimulus
from virtual_subject.db.session import SessionLocal
from virtual_subject.adapters.storage import get_storage
from virtual_subject.domain.utils import sha256_bytes, sha256_text

DRY_RUN = "--dry-run" in sys.argv


def main() -> None:
    init_db()
    storage = get_storage()

    with SessionLocal() as db:
        stimuli = list(db.scalars(select(Stimulus).where(Stimulus.checksum_sha256 == None)))  # noqa: E711

    if not stimuli:
        print("No stimuli with missing checksums found.")
        return

    print(f"Found {len(stimuli)} stimulus record(s) with missing checksums.")

    updated = 0
    with SessionLocal() as db:
        for stimulus in stimuli:
            checksum = None
            if stimulus.source_type == "text" and stimulus.text_content:
                checksum = sha256_text(stimulus.text_content)
            elif stimulus.storage_key:
                try:
                    raw = storage.get_bytes(stimulus.storage_key)
                    checksum = sha256_bytes(raw)
                except Exception as exc:
                    print(f"  WARN stimulus {stimulus.id}: could not read storage key — {exc}")
                    continue
            else:
                print(f"  SKIP stimulus {stimulus.id}: no text content or storage key")
                continue

            print(f"  stimulus {stimulus.id} ({stimulus.source_type}): {checksum}")
            if not DRY_RUN:
                row = db.get(Stimulus, stimulus.id)
                if row:
                    row.checksum_sha256 = checksum
                    db.add(row)
                    updated += 1

        if not DRY_RUN:
            db.commit()

    suffix = " (dry-run, no changes written)" if DRY_RUN else ""
    print(f"\nUpdated {updated} record(s){suffix}.")


if __name__ == "__main__":
    main()
