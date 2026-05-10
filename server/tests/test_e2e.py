import time
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "short_clip.wav"


@pytest.mark.e2e
def test_full_pipeline_with_tiny_model(client, audio_dir, monkeypatch):
    monkeypatch.setattr("otter.config.load_config", lambda: _cfg("tiny"))

    created = client.post("/api/lectures", json={"title": "Newton"}).json()
    audio_bytes = FIXTURE.read_bytes()
    r = client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("clip.wav", audio_bytes, "audio/wav")},
    )
    assert r.status_code == 202

    deadline = time.time() + 120
    while time.time() < deadline:
        status = client.get(f"/api/lectures/{created['id']}/status").json()["status"]
        if status in {"ready", "failed"}:
            break
        time.sleep(0.5)
    else:
        pytest.fail("transcription timed out after 120s")

    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["status"] == "ready"
    assert detail["duration_sec"] >= 5
    full_text = " ".join(seg["text"] for seg in detail["segments"]).lower()
    # tiny model is rough — accept any of these landmark words
    assert any(w in full_text for w in ["newton", "motion", "law"])


def _cfg(model: str):
    from otter.config import Config

    return Config(anthropic_api_key=None, whisper_model=model, summary_model="claude-opus-4-7")


@pytest.fixture
def audio_dir(tmp_path, monkeypatch):
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target
