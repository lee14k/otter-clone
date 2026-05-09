from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from otter.db import get_session
from otter.models import Lecture
from otter.schemas import LectureCreate, LectureDetail, LectureOut, LecturePatch

router = APIRouter(prefix="/api/lectures", tags=["lectures"])


def _default_title() -> str:
    return f"Lecture {datetime.now().strftime('%Y-%m-%d %H:%M')}"


@router.post("", status_code=status.HTTP_201_CREATED, response_model=LectureOut)
def create_lecture(payload: LectureCreate, session: Session = Depends(get_session)) -> Lecture:
    lecture = Lecture(
        title=payload.title or _default_title(),
        duration_sec=0,
        audio_path="",
        audio_mime="",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()
    session.refresh(lecture)
    return lecture


@router.get("", response_model=list[LectureOut])
def list_lectures(session: Session = Depends(get_session)) -> list[Lecture]:
    return session.query(Lecture).order_by(Lecture.created_at.desc()).all()


@router.get("/{lecture_id}", response_model=LectureDetail)
def get_lecture(lecture_id: str, session: Session = Depends(get_session)) -> Lecture:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status_code=404, detail="lecture not found")
    return lecture


@router.patch("/{lecture_id}", response_model=LectureOut)
def patch_lecture(
    lecture_id: str, payload: LecturePatch, session: Session = Depends(get_session)
) -> Lecture:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status_code=404, detail="lecture not found")
    lecture.title = payload.title
    session.commit()
    session.refresh(lecture)
    return lecture


@router.delete("/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lecture(lecture_id: str, session: Session = Depends(get_session)) -> None:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status_code=404, detail="lecture not found")
    session.delete(lecture)
    session.commit()
