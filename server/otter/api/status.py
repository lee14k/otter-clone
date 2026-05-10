from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from otter.db import get_session
from otter.models import Lecture
from otter.schemas import StatusOut

router = APIRouter(prefix="/api/lectures", tags=["status"])


@router.get("/{lecture_id}/status", response_model=StatusOut)
def get_status(lecture_id: str, session: Session = Depends(get_session)) -> StatusOut:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status_code=404, detail="lecture not found")
    return StatusOut(status=lecture.status, error=lecture.error)
