from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from sqlalchemy.orm import Session

from otter import storage
from otter.config import load_config
from otter.models import Lecture, TranscriptSegment


@dataclass(frozen=True)
class Segment:
    start_sec: float
    end_sec: float
    text: str


class Transcriber(Protocol):
    def transcribe(self, audio_path: Path) -> tuple[list[Segment], float]: ...


class FasterWhisperTranscriber:
    """Lazy-loads faster-whisper model on first use; cached process-wide."""

    _model = None
    _model_name: str | None = None

    def __init__(self, model_name: str | None = None) -> None:
        self._name = model_name or load_config().whisper_model

    def _ensure_model(self):
        from faster_whisper import WhisperModel

        if FasterWhisperTranscriber._model is None or FasterWhisperTranscriber._model_name != self._name:
            FasterWhisperTranscriber._model = WhisperModel(
                self._name, device="auto", compute_type="auto"
            )
            FasterWhisperTranscriber._model_name = self._name
        return FasterWhisperTranscriber._model

    def transcribe(self, audio_path: Path) -> tuple[list[Segment], float]:
        model = self._ensure_model()
        segments_iter, info = model.transcribe(str(audio_path), vad_filter=True)
        segments = [
            Segment(start_sec=float(s.start), end_sec=float(s.end), text=s.text.strip())
            for s in segments_iter
        ]
        return segments, float(info.duration)


def run_transcription_job(
    lecture_id: str,
    session_factory: Callable[[], Session],
    transcriber: Transcriber | None = None,
    close_session: bool = False,
) -> None:
    """Transcribe a lecture and persist the result.

    ``close_session=True`` is for production where ``session_factory`` creates a
    fresh session that this function owns. Tests pass ``close_session=False``
    (the default) because they share their fixture's session.
    """
    session = session_factory()
    transcriber = transcriber or FasterWhisperTranscriber()
    try:
        lecture = session.get(Lecture, lecture_id)
        if lecture is None:
            return
        audio_full = storage.AUDIO_DIR.parent / lecture.audio_path
        try:
            segments, duration = transcriber.transcribe(audio_full)
        except Exception as exc:  # noqa: BLE001
            lecture.status = "failed"
            lecture.error = str(exc)
            session.commit()
            return

        for s in segments:
            session.add(
                TranscriptSegment(
                    lecture_id=lecture.id,
                    start_sec=s.start_sec,
                    end_sec=s.end_sec,
                    text=s.text,
                )
            )
        lecture.duration_sec = int(duration)
        lecture.status = "ready"
        lecture.error = None
        session.commit()
    finally:
        if close_session:
            session.close()
