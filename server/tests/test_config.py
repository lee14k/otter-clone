from pathlib import Path

import pytest

from otter.config import Config, load_config, save_config


@pytest.fixture
def config_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setattr("otter.config.CONFIG_PATH", path)
    return path


def test_load_returns_defaults_when_file_missing(config_path: Path):
    cfg = load_config()
    assert cfg.anthropic_api_key is None
    assert cfg.whisper_model == "large-v3"
    assert cfg.summary_model == "claude-opus-4-7"


def test_save_then_load_roundtrip(config_path: Path):
    save_config(Config(anthropic_api_key="sk-ant-test", whisper_model="medium"))
    cfg = load_config()
    assert cfg.anthropic_api_key == "sk-ant-test"
    assert cfg.whisper_model == "medium"


def test_save_creates_parent_directory(config_path: Path):
    nested = config_path.parent / "nested" / "config.json"
    import otter.config

    otter.config.CONFIG_PATH = nested
    save_config(Config(anthropic_api_key="x"))
    assert nested.exists()
