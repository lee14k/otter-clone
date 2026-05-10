from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from sqlalchemy.orm import Session

from otter import storage
from otter.config import load_config
from otter.models import Lecture, Summary, SummaryTemplate, TranscriptSegment
from otter.summarization import generate_summary


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
        _generate_default_summaries(session, lecture)
    finally:
        if close_session:
            session.close()


def _anthropic_client():
    from anthropic import Anthropic

    cfg = load_config()
    if not cfg.anthropic_api_key:
        return None
    return Anthropic(api_key=cfg.anthropic_api_key)


def _generate_default_summaries(session: Session, lecture: Lecture) -> None:
    client = _anthropic_client()
    if client is None:
        return  # no key — skip silently; user can generate later

    cfg = load_config()
    transcript = "\n".join(s.text for s in lecture.segments)
    templates = (
        session.query(SummaryTemplate).filter(SummaryTemplate.is_default.is_(True)).all()
    )
    for tpl in templates:
        try:
            content = generate_summary(
                client=client,
                model=cfg.summary_model,
                template_prompt=tpl.prompt,
                transcript=transcript,
            )
        except Exception:  # noqa: BLE001
            continue  # one template failing should not block others
        session.add(
            Summary(
                lecture_id=lecture.id,
                template_id=tpl.id,
                content=content,
                model=cfg.summary_model,
            )
        )
    session.commit()
