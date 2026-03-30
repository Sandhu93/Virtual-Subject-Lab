from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from uuid import uuid4


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_hash(payload: dict | list | tuple | str) -> str:
    if isinstance(payload, str):
        material = payload
    else:
        material = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return sha256_text(material)

