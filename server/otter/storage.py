from __future__ import annotations

import shutil
from pathlib import Path

AUDIO_DIR = Path(__file__).resolve().parents[2] / "data" / "audio"
MIN_FREE_BYTES = 500 * 1024 * 1024  # 500MB


def ensure_audio_dir() -> Path:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    return AUDIO_DIR


def audio_path_for(lecture_id: str, extension: str) -> Path:
    ensure_audio_dir()
    return AUDIO_DIR / f"{lecture_id}.{extension.lstrip('.')}"


def free_bytes(path: Path) -> int:
    return shutil.disk_usage(path).free


def has_enough_disk_space() -> bool:
    return free_bytes(ensure_audio_dir()) >= MIN_FREE_BYTES
