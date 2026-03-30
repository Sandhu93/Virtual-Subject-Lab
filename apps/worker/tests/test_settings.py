from virtual_subject.config import get_settings


def test_settings_defaults() -> None:
    settings = get_settings()

    assert settings.tribe_mode in {"mock", "real"}
    assert settings.oat_version == "0.5.1"
