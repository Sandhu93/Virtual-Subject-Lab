import numpy as np

from virtual_subject.adapters.atlas import get_atlas
from virtual_subject.adapters.storage import FileStorageAdapter
from virtual_subject.domain.utils import stable_hash


def test_stable_hash_is_deterministic() -> None:
    payload = {"a": 1, "b": ["x", "y"]}
    assert stable_hash(payload) == stable_hash({"b": ["x", "y"], "a": 1})


def test_file_storage_round_trip() -> None:
    storage = FileStorageAdapter("storage")
    payload = b"virtual subject"
    storage.put_bytes("tests/payload.bin", payload, "application/octet-stream")
    assert storage.get_bytes("tests/payload.bin") == payload


def test_lab_atlas_aggregates_vertices() -> None:
    atlas = get_atlas()
    tensor = np.ones((6, 20484), dtype=np.float32)
    traces = atlas.aggregate(tensor)
    assert len(traces) == len(atlas.rois)
    assert traces["early_visual_L"].shape == (6,)
    assert float(traces["early_visual_L"].mean()) == 1.0

