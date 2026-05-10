from pathlib import Path

import pytest

from otter.models import Lecture, TranscriptSegment
from otter.transcription import Segment, run_transcription_job


class FakeTranscriber:
    def __init__(self, segments: list[Segment]):
        self._segments = segments
        self.calls: list[Path] = []

    def transcribe(self, audio_path: Path) -> tuple[list[Segment], float]:
        self.calls.append(audio_path)
        duration = self._segments[-1].end_sec if self._segments else 0.0
        return self._segments, duration


def _make_lecture(session, audio_dir: Path) -> Lecture:
    audio = audio_dir / "x.webm"
    audio.write_bytes(b"FAKE")
    lecture = Lecture(
        title="t",
        audio_path=str(audio.relative_to(audio_dir.parent)),
        audio_mime="audio/webm",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()
    return lecture


@pytest.fixture
def audio_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target


def test_run_transcription_writes_segments_and_marks_ready(session, audio_dir: Path):
    lecture = _make_lecture(session, audio_dir)
    fake = FakeTranscriber(
        [
            Segment(start_sec=0.0, end_sec=2.0, text="Hello."),
            Segment(start_sec=2.0, end_sec=5.0, text="World."),
        ]
    )

    run_transcription_job(lecture.id, session_factory=lambda: session, transcriber=fake)

    session.expire_all()
    refreshed = session.get(Lecture, lecture.id)
    assert refreshed.status == "ready"
    assert refreshed.duration_sec == 5
    rows = (
        session.query(TranscriptSegment)
        .filter_by(lecture_id=lecture.id)
        .order_by(TranscriptSegment.start_sec)
        .all()
    )
    assert [(r.start_sec, r.text) for r in rows] == [(0.0, "Hello."), (2.0, "World.")]


def test_run_transcription_marks_failed_on_exception(session, audio_dir: Path):
    lecture = _make_lecture(session, audio_dir)

    class Boom:
        def transcribe(self, audio_path):
            raise RuntimeError("model load failed")

    run_transcription_job(lecture.id, session_factory=lambda: session, transcriber=Boom())

    session.expire_all()
    refreshed = session.get(Lecture, lecture.id)
    assert refreshed.status == "failed"
    assert "model load failed" in refreshed.error
