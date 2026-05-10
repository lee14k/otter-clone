from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from otter.db import get_session
from otter.models import SummaryTemplate
from otter.schemas import TemplateCreate, TemplateOut, TemplatePatch

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _validate_prompt(prompt: str) -> None:
    if "{transcript}" not in prompt:
        raise HTTPException(status_code=422, detail="prompt must contain {transcript}")


@router.get("", response_model=list[TemplateOut])
def list_templates(session: Session = Depends(get_session)) -> list[SummaryTemplate]:
    return session.query(SummaryTemplate).order_by(SummaryTemplate.name).all()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TemplateOut)
def create_template(
    payload: TemplateCreate, session: Session = Depends(get_session)
) -> SummaryTemplate:
    _validate_prompt(payload.prompt)
    tpl = SummaryTemplate(
        name=payload.name, prompt=payload.prompt, is_default=payload.is_default
    )
    session.add(tpl)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="template name already exists")
    session.refresh(tpl)
    return tpl


@router.patch("/{template_id}", response_model=TemplateOut)
def patch_template(
    template_id: str, payload: TemplatePatch, session: Session = Depends(get_session)
) -> SummaryTemplate:
    tpl = session.get(SummaryTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    if payload.name is not None:
        tpl.name = payload.name
    if payload.prompt is not None:
        _validate_prompt(payload.prompt)
        tpl.prompt = payload.prompt
    if payload.is_default is not None:
        tpl.is_default = payload.is_default
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="template name already exists")
    session.refresh(tpl)
    return tpl


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, session: Session = Depends(get_session)) -> None:
    tpl = session.get(SummaryTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    session.delete(tpl)
    session.commit()
