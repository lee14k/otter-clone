from __future__ import annotations

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from otter.config import load_config
from otter.db import get_session
from otter.models import Lecture, Summary, SummaryTemplate
from otter.schemas import SummaryCreate, SummaryOut
from otter.summarization import generate_summary

router = APIRouter(tags=["summaries"])


def _anthropic_client() -> Anthropic:
    cfg = load_config()
    if not cfg.anthropic_api_key:
        raise HTTPException(status_code=400, detail="Anthropic API key not configured")
    return Anthropic(api_key=cfg.anthropic_api_key)


def _transcript_text(lecture: Lecture) -> str:
    return "\n".join(s.text for s in lecture.segments)


@router.post(
    "/api/lectures/{lecture_id}/summaries",
    status_code=status.HTTP_201_CREATED,
    response_model=SummaryOut,
)
def create_summary(
    lecture_id: str,
    payload: SummaryCreate,
    session: Session = Depends(get_session),
) -> Summary:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status_code=404, detail="lecture not found")
    if lecture.status != "ready":
        raise HTTPException(status_code=409, detail="lecture is not ready")

    template = session.get(SummaryTemplate, payload.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="template not found")

    cfg = load_config()
    client = _anthropic_client()
    content = generate_summary(
        client=client,
        model=cfg.summary_model,
        template_prompt=template.prompt,
        transcript=_transcript_text(lecture),
    )

    # replace any existing summary for the same template on this lecture
    existing = (
        session.query(Summary)
        .filter_by(lecture_id=lecture_id, template_id=template.id)
        .all()
    )
    for s in existing:
        session.delete(s)

    summary = Summary(
        lecture_id=lecture.id,
        template_id=template.id,
        content=content,
        model=cfg.summary_model,
    )
    session.add(summary)
    session.commit()
    session.refresh(summary)
    return summary


@router.delete("/api/summaries/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_summary(summary_id: str, session: Session = Depends(get_session)) -> None:
    summary = session.get(Summary, summary_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="summary not found")
    session.delete(summary)
    session.commit()


@router.get("/api/summaries/{summary_id}", response_model=SummaryOut)
def get_summary(summary_id: str, session: Session = Depends(get_session)) -> Summary:
    summary = session.get(Summary, summary_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="summary not found")
    return summary
