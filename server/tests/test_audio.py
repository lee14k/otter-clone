from pathlib import Path

import pytest


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
