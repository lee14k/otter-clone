from pathlib import Path

import pytest


@pytest.fixture
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setattr("otter.config.CONFIG_PATH", path)
    return path


def test_get_settings_reflects_defaults_when_no_key(client, isolated_config):
    body = client.get("/api/settings").json()
    assert body == {
        "whisper_model": "large-v3",
        "summary_model": "claude-opus-4-7",
        "anthropic_key_set": False,
    }


def test_patch_settings_stores_key_and_models(client, isolated_config):
    r = client.patch(
        "/api/settings",
        json={
            "anthropic_api_key": "sk-ant-secret",
            "whisper_model": "medium",
            "summary_model": "claude-sonnet-4-6",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "whisper_model": "medium",
        "summary_model": "claude-sonnet-4-6",
        "anthropic_key_set": True,
    }
    assert "sk-ant-secret" in isolated_config.read_text()


def test_patch_settings_partial_update_preserves_existing(client, isolated_config):
    client.patch("/api/settings", json={"anthropic_api_key": "k"})
    r = client.patch("/api/settings", json={"whisper_model": "small"})
    body = r.json()
    assert body["anthropic_key_set"] is True
    assert body["whisper_model"] == "small"
