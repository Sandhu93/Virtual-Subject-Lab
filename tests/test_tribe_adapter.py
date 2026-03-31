from __future__ import annotations

import numpy as np
import pandas as pd

from virtual_subject.adapters.tribe import MockTribeAdapter, get_tribe_adapter
from virtual_subject.domain.constants import DEFAULT_VERTEX_COUNT


def _stimulus(checksum: str = "abc123", duration: float = 6.0) -> dict:
    return {
        "id": "stim_test",
        "source_type": "text",
        "duration_seconds": duration,
        "checksum_sha256": checksum,
        "text_content": None,
    }


def test_get_tribe_adapter_returns_mock():
    adapter = get_tribe_adapter()
    assert isinstance(adapter, MockTribeAdapter)


def test_mock_build_events_dataframe_returns_dataframe():
    adapter = MockTribeAdapter()
    df = adapter.build_events_dataframe(_stimulus(duration=6.0))
    assert isinstance(df, pd.DataFrame)
    assert len(df) == 6
    assert "time_seconds" in df.columns
    assert "token" in df.columns


def test_mock_predict_output_shape():
    adapter = MockTribeAdapter()
    s = _stimulus()
    events = adapter.build_events_dataframe(s)
    result = adapter.predict(s, "full", events)
    assert result.predictions.shape == (len(events), DEFAULT_VERTEX_COUNT)
    assert result.predictions.dtype == np.float32
    assert len(result.segments) == len(events)


def test_mock_predict_is_deterministic():
    adapter = MockTribeAdapter()
    s = _stimulus(checksum="deadbeef")
    events = adapter.build_events_dataframe(s)
    r1 = adapter.predict(s, "full", events)
    r2 = adapter.predict(s, "full", events)
    np.testing.assert_array_equal(r1.predictions, r2.predictions)


def test_mock_predict_differs_across_stimuli():
    adapter = MockTribeAdapter()

    def _run(checksum: str) -> np.ndarray:
        s = _stimulus(checksum=checksum)
        events = adapter.build_events_dataframe(s)
        return adapter.predict(s, "full", events).predictions

    assert not np.array_equal(_run("aaa"), _run("bbb"))


def test_mock_predict_minimum_duration():
    adapter = MockTribeAdapter()
    # duration_seconds < 4 should clamp to 4 rows
    s = _stimulus(duration=2.0)
    events = adapter.build_events_dataframe(s)
    assert len(events) >= 4
