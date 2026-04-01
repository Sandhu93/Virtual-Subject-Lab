from __future__ import annotations

import io
import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import numpy as np
from minio import Minio

from virtual_subject.config import get_settings


class StorageAdapter(ABC):
    @abstractmethod
    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_bytes(self, key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    def stat(self, key: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    def put_text(self, key: str, text: str, content_type: str = "text/plain; charset=utf-8") -> None:
        self.put_bytes(key, text.encode("utf-8"), content_type)

    def get_text(self, key: str) -> str:
        return self.get_bytes(key).decode("utf-8")

    def put_json(self, key: str, payload: Any) -> None:
        self.put_bytes(key, json.dumps(payload, indent=2).encode("utf-8"), "application/json")

    def get_json(self, key: str) -> Any:
        return json.loads(self.get_text(key))

    def put_numpy(self, key: str, array: np.ndarray) -> None:
        buffer = io.BytesIO()
        np.save(buffer, array)
        self.put_bytes(key, buffer.getvalue(), "application/octet-stream")

    def get_numpy(self, key: str) -> np.ndarray:
        buffer = io.BytesIO(self.get_bytes(key))
        buffer.seek(0)
        return np.load(buffer)


class MinioStorageAdapter(StorageAdapter):
    def __init__(self) -> None:
        settings = get_settings()
        self.bucket = settings.minio_bucket
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            self.bucket,
            key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    def get_bytes(self, key: str) -> bytes:
        response = self.client.get_object(self.bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def stat(self, key: str) -> dict[str, Any]:
        info = self.client.stat_object(self.bucket, key)
        return {
            "size": info.size,
            "etag": info.etag,
            "content_type": info.content_type,
        }

    def delete(self, key: str) -> None:
        self.client.remove_object(self.bucket, key)


class FileStorageAdapter(StorageAdapter):
    def __init__(self, base_path: str | Path = "storage") -> None:
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = self.base_path / key
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        _ = content_type
        self._path(key).write_bytes(data)

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def stat(self, key: str) -> dict[str, Any]:
        path = self._path(key)
        return {
            "size": path.stat().st_size,
            "etag": "",
            "content_type": "",
        }

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()


def get_storage() -> StorageAdapter:
    settings = get_settings()
    if settings.storage_backend == "filesystem":
        return FileStorageAdapter()
    return MinioStorageAdapter()
