from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from otter import storage
from otter.db import get_session
from otter.models import Lecture

router = APIRouter(prefix="/api/lectures", tags=["audio"])

_MIME_TO_EXT = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}


def _ext_for_mime(mime: str) -> str:
    return _MIME_TO_EXT.get(mime, "bin")


@router.put("/{lecture_id}/audio", status_code=status.HTTP_202_ACCEPTED)
def upload_audio(
    lecture_id: str,
    audio: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status_code=404, detail="lecture not found")

    if storage.free_bytes(storage.ensure_audio_dir()) < storage.MIN_FREE_BYTES:
        raise HTTPException(
            status_code=507, detail="insufficient disk space (need >=500MB free)"
        )

    mime = audio.content_type or "application/octet-stream"
    ext = _ext_for_mime(mime)
    path = storage.audio_path_for(lecture_id, ext)
    with path.open("wb") as f:
        while chunk := audio.file.read(1024 * 1024):
            f.write(chunk)

    lecture.audio_path = str(path.relative_to(storage.AUDIO_DIR.parent))
    lecture.audio_mime = mime
    lecture.status = "transcribing"
    session.commit()

    return {"id": lecture_id, "status": "transcribing"}


@router.get("/{lecture_id}/audio")
def get_audio(lecture_id: str, session: Session = Depends(get_session)) -> FileResponse:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None or not lecture.audio_path:
        raise HTTPException(status_code=404, detail="audio not found")

    full = Path(storage.AUDIO_DIR.parent / lecture.audio_path)
    if not full.exists():
        raise HTTPException(status_code=404, detail="audio file missing on disk")

    return FileResponse(full, media_type=lecture.audio_mime)
