from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parent
TMP = ROOT / ".tmp" / "tests"
TMP.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("DATABASE_URL", f"sqlite:///{(TMP / 'test.db').as_posix()}")
os.environ.setdefault("STORAGE_BACKEND", "filesystem")
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
os.environ.setdefault("MINIO_BUCKET", "virtual-subject")
os.environ.setdefault("TRIBE_MODE", "mock")


@pytest.fixture(autouse=True)
def reset_state():
    from virtual_subject.db import models as _models  # noqa: F401
    from virtual_subject.db.session import Base, engine

    storage_dir = ROOT / "storage"
    if storage_dir.exists():
        shutil.rmtree(storage_dir, ignore_errors=True)

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
