from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    start_sec: float
    end_sec: float
    text: str


class SummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    template_id: str
    content: str
    model: str
    created_at: datetime


class LectureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    created_at: datetime
    duration_sec: int
    audio_mime: str
    status: Literal["transcribing", "ready", "failed"]
    error: str | None = None


class LectureDetail(LectureOut):
    segments: list[SegmentOut] = Field(default_factory=list)
    summaries: list[SummaryOut] = Field(default_factory=list)


class LectureCreate(BaseModel):
    title: str | None = None


class LecturePatch(BaseModel):
    title: str


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    prompt: str
    is_default: bool
    created_at: datetime


class TemplateCreate(BaseModel):
    name: str
    prompt: str
    is_default: bool = False


class TemplatePatch(BaseModel):
    name: str | None = None
    prompt: str | None = None
    is_default: bool | None = None


class StatusOut(BaseModel):
    status: Literal["transcribing", "ready", "failed"]
    error: str | None = None


class SettingsOut(BaseModel):
    whisper_model: str
    summary_model: str
    anthropic_key_set: bool


class SettingsPatch(BaseModel):
    whisper_model: str | None = None
    summary_model: str | None = None
    anthropic_api_key: str | None = None


class SummaryCreate(BaseModel):
    template_id: str
