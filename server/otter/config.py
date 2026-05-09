from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

CONFIG_PATH = Path.home() / ".otter-clone" / "config.json"


@dataclass
class Config:
    anthropic_api_key: str | None = None
    whisper_model: str = "large-v3"
    summary_model: str = "claude-opus-4-7"


def load_config() -> Config:
    if not CONFIG_PATH.exists():
        return Config()
    raw = json.loads(CONFIG_PATH.read_text())
    return Config(
        anthropic_api_key=raw.get("anthropic_api_key"),
        whisper_model=raw.get("whisper_model", "large-v3"),
        summary_model=raw.get("summary_model", "claude-opus-4-7"),
    )


def save_config(cfg: Config) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(asdict(cfg), indent=2))
