from pathlib import Path

import pytest

from otter.transcription import Segment


class _NoopTranscriber:
    """Default test transcriber — never loads a real model.

    Tests that need a specific transcriber output should monkeypatch
    ``otter.api.audio._make_transcriber`` themselves.
    """

    def transcribe(self, path: Path) -> tuple[list[Segment], float]:
        return [], 0.0


@pytest.fixture(autouse=True)
def _stub_transcriber(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent every audio-upload test from spawning a real faster-whisper job."""
    monkeypatch.setattr("otter.api.audio._make_transcriber", lambda: _NoopTranscriber())


@pytest.fixture
def audio_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target


def test_upload_audio_writes_file_and_updates_lecture(client, audio_dir: Path):
    created = client.post("/api/lectures", json={"title": "L"}).json()

    payload = b"FAKEAUDIO" * 100
    r = client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("clip.webm", payload, "audio/webm")},
    )
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "transcribing"

    files = list(audio_dir.iterdir())
    assert len(files) == 1
    assert files[0].read_bytes() == payload

    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["audio_mime"] == "audio/webm"


def test_upload_audio_404_when_lecture_missing(client, audio_dir: Path):
    r = client.put(
        "/api/lectures/missing/audio",
        files={"audio": ("clip.webm", b"x", "audio/webm")},
    )
    assert r.status_code == 404


def test_upload_audio_rejects_when_disk_full(client, audio_dir: Path, monkeypatch):
    monkeypatch.setattr("otter.storage.free_bytes", lambda _p: 100 * 1024 * 1024)  # 100MB
    created = client.post("/api/lectures", json={}).json()
    r = client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", b"x", "audio/webm")},
    )
    assert r.status_code == 507


def test_get_audio_returns_file(client, audio_dir: Path):
    created = client.post("/api/lectures", json={}).json()
    payload = b"AUDIO" * 50
    client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", payload, "audio/webm")},
    )
    r = client.get(f"/api/lectures/{created['id']}/audio")
    assert r.status_code == 200
    assert r.content == payload
    assert r.headers["content-type"] == "audio/webm"


def test_get_audio_supports_range(client, audio_dir: Path):
    created = client.post("/api/lectures", json={}).json()
    payload = b"0123456789" * 10  # 100 bytes
    client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", payload, "audio/webm")},
    )
    r = client.get(
        f"/api/lectures/{created['id']}/audio", headers={"Range": "bytes=10-19"}
    )
    assert r.status_code == 206
    assert r.content == payload[10:20]


def test_get_audio_404_when_missing(client, audio_dir: Path):
    created = client.post("/api/lectures", json={}).json()
    r = client.get(f"/api/lectures/{created['id']}/audio")
    assert r.status_code == 404


import time


def test_upload_triggers_transcription_job(client, audio_dir, monkeypatch):
    calls: list[str] = []

    class Fake:
        def transcribe(self, path):
            calls.append(str(path))
            return [Segment(0.0, 1.0, "hi")], 1.0

    monkeypatch.setattr("otter.api.audio._make_transcriber", lambda: Fake())

    created = client.post("/api/lectures", json={}).json()
    client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", b"x" * 32, "audio/webm")},
    )

    for _ in range(50):
        if client.get(f"/api/lectures/{created['id']}/status").json()["status"] == "ready":
            break
        time.sleep(0.05)

    assert len(calls) == 1
    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["status"] == "ready"
    assert detail["segments"][0]["text"] == "hi"
