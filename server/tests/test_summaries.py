import pytest

from otter.models import Lecture, TranscriptSegment
from otter.transcription import Segment


def _seed_ready_lecture(session) -> str:
    lecture = Lecture(
        title="L",
        duration_sec=10,
        audio_path="audio/x.webm",
        audio_mime="audio/webm",
        status="ready",
    )
    session.add(lecture)
    session.flush()
    session.add_all(
        [
            TranscriptSegment(lecture_id=lecture.id, start_sec=0, end_sec=2, text="Hello."),
            TranscriptSegment(lecture_id=lecture.id, start_sec=2, end_sec=5, text="World."),
        ]
    )
    session.commit()
    return lecture.id


@pytest.fixture
def fake_summary(monkeypatch):
    calls: list[dict] = []

    def fake(*, client, model, template_prompt, transcript, max_tokens=4096):
        calls.append({"model": model, "transcript": transcript, "prompt": template_prompt})
        return f"SUMMARY-OF:{transcript[:5]}"

    monkeypatch.setattr("otter.api.summaries.generate_summary", fake)
    monkeypatch.setattr("otter.transcription.generate_summary", fake)
    monkeypatch.setattr("otter.api.summaries._anthropic_client", lambda: object())
    monkeypatch.setattr("otter.transcription._anthropic_client", lambda: object())
    return calls


def test_create_summary_for_template(client, session, fake_summary):
    lid = _seed_ready_lecture(session)
    template = client.get("/api/templates").json()[0]
    r = client.post(f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]})
    assert r.status_code == 201
    body = r.json()
    assert body["content"].startswith("SUMMARY-OF:Hello")
    assert body["template_id"] == template["id"]
    assert len(fake_summary) == 1


def test_create_summary_replaces_existing_for_same_template(client, session, fake_summary):
    lid = _seed_ready_lecture(session)
    template = client.get("/api/templates").json()[0]
    first = client.post(f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]}).json()
    second = client.post(f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]}).json()
    assert first["id"] != second["id"]
    detail = client.get(f"/api/lectures/{lid}").json()
    assert sum(1 for s in detail["summaries"] if s["template_id"] == template["id"]) == 1


def test_create_summary_404_when_lecture_missing(client, fake_summary):
    template = client.get("/api/templates").json()[0]
    r = client.post("/api/lectures/missing/summaries", json={"template_id": template["id"]})
    assert r.status_code == 404


def test_create_summary_409_when_lecture_not_ready(client, session, fake_summary):
    lecture = Lecture(
        title="L",
        duration_sec=0,
        audio_path="x",
        audio_mime="audio/webm",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()
    template = client.get("/api/templates").json()[0]
    r = client.post(
        f"/api/lectures/{lecture.id}/summaries", json={"template_id": template["id"]}
    )
    assert r.status_code == 409


def test_delete_summary(client, session, fake_summary):
    lid = _seed_ready_lecture(session)
    template = client.get("/api/templates").json()[0]
    summary = client.post(
        f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]}
    ).json()
    assert client.delete(f"/api/summaries/{summary['id']}").status_code == 204


def test_transcription_auto_generates_default_summaries(session, audio_dir, fake_summary):
    from otter.transcription import run_transcription_job

    audio = audio_dir / "x.webm"
    audio.write_bytes(b"x")
    lecture = Lecture(
        title="t",
        audio_path=str(audio.relative_to(audio_dir.parent)),
        audio_mime="audio/webm",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()

    class Trans:
        def transcribe(self, p):
            return [Segment(0, 2, "Hello.")], 2.0

    run_transcription_job(
        lecture.id, session_factory=lambda: session, transcriber=Trans()
    )

    session.expire_all()
    refreshed = session.get(Lecture, lecture.id)
    assert refreshed.status == "ready"
    assert len(refreshed.summaries) == 2  # Study Guide + Outline


@pytest.fixture
def audio_dir(tmp_path, monkeypatch):
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target
