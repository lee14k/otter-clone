from __future__ import annotations

from fastapi import APIRouter

from otter.config import load_config, save_config
from otter.schemas import SettingsOut, SettingsPatch

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _to_out(cfg) -> SettingsOut:
    return SettingsOut(
        whisper_model=cfg.whisper_model,
        summary_model=cfg.summary_model,
        anthropic_key_set=bool(cfg.anthropic_api_key),
    )


@router.get("", response_model=SettingsOut)
def get_settings() -> SettingsOut:
    return _to_out(load_config())


@router.patch("", response_model=SettingsOut)
def patch_settings(payload: SettingsPatch) -> SettingsOut:
    cfg = load_config()
    if payload.whisper_model is not None:
        cfg.whisper_model = payload.whisper_model
    if payload.summary_model is not None:
        cfg.summary_model = payload.summary_model
    if payload.anthropic_api_key is not None:
        cfg.anthropic_api_key = payload.anthropic_api_key
    save_config(cfg)
    return _to_out(cfg)
