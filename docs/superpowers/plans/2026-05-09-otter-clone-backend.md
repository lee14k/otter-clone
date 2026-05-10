# Otter Clone — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend that accepts audio uploads, transcribes them locally with `faster-whisper`, and generates structured AI summaries via the Anthropic API. End state: a single-process server you can hit with `curl` to upload an audio file and retrieve transcript + summaries.

**Architecture:** One FastAPI process, sync SQLAlchemy on SQLite, audio files on local disk under `data/audio/`. Transcription runs in a background thread pool inside the same process — no external job broker. Anthropic SDK calls run on demand and use prompt caching on the system+template portion of the prompt.

**Tech Stack:** Python 3.12, [uv](https://github.com/astral-sh/uv), FastAPI, SQLAlchemy 2.0 (sync), SQLite, faster-whisper, anthropic SDK ≥ 0.40, pytest.

**Spec reference:** [`docs/superpowers/specs/2026-05-09-otter-clone-design.md`](../specs/2026-05-09-otter-clone-design.md). This plan implements §§ 2-9, 11.

---

## File structure produced by this plan

```
server/
├── pyproject.toml
├── otter/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app factory + entrypoint
│   ├── db.py                      # SQLAlchemy engine + Session dep
│   ├── models.py                  # SQLAlchemy ORM models
│   ├── schemas.py                 # Pydantic request/response models
│   ├── config.py                  # ~/.otter-clone/config.json read/write
│   ├── storage.py                 # data/audio path helpers
│   ├── jobs.py                    # ThreadPoolExecutor wrapper
│   ├── transcription.py           # faster-whisper wrapper + orchestration
│   ├── summarization.py           # Anthropic SDK wrapper + orchestration
│   └── api/
│       ├── __init__.py
│       ├── lectures.py
│       ├── audio.py
│       ├── status.py
│       ├── summaries.py
│       ├── templates.py
│       └── settings.py
└── tests/
    ├── __init__.py
    ├── conftest.py                # pytest fixtures (temp DB, client)
    ├── fixtures/
    │   └── short_clip.wav         # ~10s test audio
    ├── test_health.py
    ├── test_config.py
    ├── test_models.py
    ├── test_lectures.py
    ├── test_audio.py
    ├── test_transcription.py
    ├── test_status.py
    ├── test_settings.py
    ├── test_templates.py
    ├── test_summarization.py
    ├── test_summaries.py
    └── test_e2e.py
.gitignore
```

Each file has one responsibility. `api/*.py` are thin routers; business logic lives in `transcription.py` / `summarization.py`. Tests mirror the source layout.

---

## Conventions used in this plan

- Every task is TDD: write the failing test, run it (verify it fails), write the minimal code, run it (verify it passes), commit.
- All commands assume CWD = `/Users/kailee/otter-clone/server` unless noted.
- All commits use Conventional Commits (`feat:`, `chore:`, `test:`, `refactor:`).
- Python imports use absolute paths (`from otter.db import ...`).
- All API routes are under `/api/`.

---

## Task 0: Initialize git repo

**Files:**
- Create: `.gitignore` (at repo root)

- [ ] **Step 1: Initialize repo**

Run from `/Users/kailee/otter-clone`:

```bash
git init
git branch -M main
```

- [ ] **Step 2: Write `.gitignore` at repo root**

Create `/Users/kailee/otter-clone/.gitignore`:

```gitignore
# Python
__pycache__/
*.pyc
.pytest_cache/
.venv/
.ruff_cache/

# Local data
data/audio/*
!data/audio/.gitkeep
data/*.db
data/*.db-*

# Local config
.env
.env.local

# Editors
.vscode/
.idea/
*.swp
.DS_Store

# Web build artifacts (used by Plan 2)
web/node_modules/
web/dist/
```

- [ ] **Step 3: Initial commit**

```bash
mkdir -p data/audio && touch data/audio/.gitkeep
git add .gitignore data/audio/.gitkeep docs/
git commit -m "chore: initialize repo with spec and plan"
```

---

## Task 1: Bootstrap server project with uv + FastAPI hello-world

**Files:**
- Create: `server/pyproject.toml`
- Create: `server/otter/__init__.py`
- Create: `server/otter/main.py`
- Create: `server/tests/__init__.py`
- Create: `server/tests/conftest.py`
- Create: `server/tests/test_health.py`

- [ ] **Step 1: Create the uv project**

Run from `/Users/kailee/otter-clone`:

```bash
mkdir -p server && cd server
uv init --no-readme --no-pin-python --package
```

This creates `pyproject.toml` and a stub `otter/` package. Replace `pyproject.toml` with the version below.

- [ ] **Step 2: Write `server/pyproject.toml`**

```toml
[project]
name = "otter"
version = "0.1.0"
description = "Local lecture transcription with faster-whisper"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0.36",
    "pydantic>=2.10",
    "anthropic>=0.40",
    "faster-whisper>=1.1.0",
    # onnxruntime 1.26+ does not yet ship a macOS 26 (Tahoe) ARM wheel.
    "onnxruntime>=1.20,<1.26",
    "python-multipart>=0.0.20",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "httpx>=0.28",
    "ruff>=0.8",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Sync deps**

```bash
uv sync --extra dev
```

Expected: `Resolved N packages` and a `.venv/` is created.

- [ ] **Step 4: Write the failing health-check test**

Create `server/tests/__init__.py` (empty). Create `server/tests/conftest.py`:

```python
import pytest
from fastapi.testclient import TestClient

from otter.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())
```

Create `server/tests/test_health.py`:

```python
def test_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
uv run pytest tests/test_health.py -v
```

Expected: FAIL — `ImportError: cannot import name 'create_app' from 'otter.main'` (or similar).

- [ ] **Step 6: Implement the minimal app**

Replace `server/otter/__init__.py` with empty content. Replace `server/otter/main.py` with:

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Otter", docs_url="/api/docs", openapi_url="/api/openapi.json")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
uv run pytest tests/test_health.py -v
```

Expected: PASS.

- [ ] **Step 8: Verify the server actually starts**

```bash
uv run uvicorn otter.main:app --port 8000 &
sleep 2
curl -s http://127.0.0.1:8000/api/health
kill %1
```

Expected: `{"status":"ok"}`.

- [ ] **Step 9: Commit**

```bash
git add server/pyproject.toml server/uv.lock server/otter server/tests
git commit -m "feat(server): bootstrap FastAPI app with health check"
```

---

## Task 2: Config module (Anthropic key + Whisper model)

**Files:**
- Create: `server/otter/config.py`
- Create: `server/tests/test_config.py`

The config lives at `~/.otter-clone/config.json`. The Anthropic key is never returned by the API; only `anthropic_key_set: bool` is exposed.

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_config.py`:

```python
from pathlib import Path

import pytest

from otter.config import Config, load_config, save_config


@pytest.fixture
def config_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setattr("otter.config.CONFIG_PATH", path)
    return path


def test_load_returns_defaults_when_file_missing(config_path: Path):
    cfg = load_config()
    assert cfg.anthropic_api_key is None
    assert cfg.whisper_model == "large-v3"
    assert cfg.summary_model == "claude-opus-4-7"


def test_save_then_load_roundtrip(config_path: Path):
    save_config(Config(anthropic_api_key="sk-ant-test", whisper_model="medium"))
    cfg = load_config()
    assert cfg.anthropic_api_key == "sk-ant-test"
    assert cfg.whisper_model == "medium"


def test_save_creates_parent_directory(config_path: Path):
    nested = config_path.parent / "nested" / "config.json"
    import otter.config

    otter.config.CONFIG_PATH = nested
    save_config(Config(anthropic_api_key="x"))
    assert nested.exists()
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_config.py -v
```

Expected: FAIL — `ModuleNotFoundError` or `ImportError` for `otter.config`.

- [ ] **Step 3: Implement `otter/config.py`**

```python
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
```

- [ ] **Step 4: Run to verify pass**

```bash
uv run pytest tests/test_config.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add server/otter/config.py server/tests/test_config.py
git commit -m "feat(server): add JSON-backed config module"
```

---

## Task 3: SQLAlchemy models + database session

**Files:**
- Create: `server/otter/db.py`
- Create: `server/otter/models.py`
- Create: `server/tests/test_models.py`
- Modify: `server/tests/conftest.py`

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_models.py`:

```python
from datetime import datetime, timezone

from otter.models import Lecture, Summary, SummaryTemplate, TranscriptSegment


def test_create_lecture_with_segments(session):
    lecture = Lecture(
        title="Test lecture",
        duration_sec=42,
        audio_path="audio/abc.webm",
        audio_mime="audio/webm",
        status="ready",
    )
    lecture.segments.append(
        TranscriptSegment(start_sec=0.0, end_sec=2.5, text="Hello world.")
    )
    session.add(lecture)
    session.commit()

    fetched = session.get(Lecture, lecture.id)
    assert fetched.title == "Test lecture"
    assert len(fetched.segments) == 1
    assert fetched.segments[0].text == "Hello world."


def test_summary_template_default_flag(session):
    tpl = SummaryTemplate(name="Study Guide", prompt="...{transcript}...", is_default=True)
    session.add(tpl)
    session.commit()

    rows = session.query(SummaryTemplate).filter_by(is_default=True).all()
    assert len(rows) == 1
    assert rows[0].name == "Study Guide"


def test_summary_links_lecture_and_template(session):
    lecture = Lecture(title="L", duration_sec=10, audio_path="x", audio_mime="y", status="ready")
    tpl = SummaryTemplate(name="T", prompt="{transcript}", is_default=False)
    session.add_all([lecture, tpl])
    session.flush()

    summary = Summary(
        lecture_id=lecture.id, template_id=tpl.id, content="# notes", model="claude-opus-4-7"
    )
    session.add(summary)
    session.commit()

    assert summary.created_at is not None
    assert summary.lecture_id == lecture.id
```

- [ ] **Step 2: Add the `session` fixture to conftest**

Replace `server/tests/conftest.py` with:

```python
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from otter.db import Base, get_session
from otter.main import create_app


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture
def engine(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def session(engine) -> Iterator[Session]:
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(engine) -> Iterator[TestClient]:
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    import otter.db as _db

    _orig_engine, _orig_session_local = _db._engine, _db._SessionLocal
    _db._engine = engine
    _db._SessionLocal = SessionLocal

    app = create_app()

    def _override_session() -> Iterator[Session]:
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_session] = _override_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        _db._engine = _orig_engine
        _db._SessionLocal = _orig_session_local
```

- [ ] **Step 3: Run to verify failure**

```bash
uv run pytest tests/test_models.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `otter/db.py`**

```python
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


DB_PATH = Path(__file__).resolve().parents[2] / "data" / "otter.db"


def make_engine(url: str | None = None):
    if url is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        url = f"sqlite:///{DB_PATH}"
    return create_engine(url, future=True, connect_args={"check_same_thread": False})


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def init_db() -> None:
    """Idempotent — tests pre-set ``_engine`` and ``_SessionLocal`` to point at a temp DB."""
    global _engine, _SessionLocal
    if _engine is not None:
        return
    _engine = make_engine()
    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)


def get_session() -> Iterator[Session]:
    assert _SessionLocal is not None, "init_db must be called before get_session"
    s = _SessionLocal()
    try:
        yield s
    finally:
        s.close()
```

- [ ] **Step 5: Implement `otter/models.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otter.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Lecture(Base):
    __tablename__ = "lectures"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    audio_path: Mapped[str] = mapped_column(String, nullable=False)
    audio_mime: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="transcribing", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    segments: Mapped[list["TranscriptSegment"]] = relationship(
        back_populates="lecture",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.start_sec",
    )
    summaries: Mapped[list["Summary"]] = relationship(
        back_populates="lecture", cascade="all, delete-orphan"
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lecture_id: Mapped[str] = mapped_column(
        String, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    speaker: Mapped[str | None] = mapped_column(String, nullable=True)

    lecture: Mapped[Lecture] = relationship(back_populates="segments")


class SummaryTemplate(Base):
    __tablename__ = "summary_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    lecture_id: Mapped[str] = mapped_column(
        String, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[str] = mapped_column(
        String, ForeignKey("summary_templates.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    lecture: Mapped[Lecture] = relationship(back_populates="summaries")
    template: Mapped[SummaryTemplate] = relationship()
```

- [ ] **Step 6: Wire `init_db` into the app startup**

Replace `server/otter/main.py`:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from otter.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 7: Run all tests**

```bash
uv run pytest -v
```

Expected: 4 passed (1 health + 3 model tests).

- [ ] **Step 8: Commit**

```bash
git add server/otter/db.py server/otter/models.py server/otter/main.py server/tests/conftest.py server/tests/test_models.py
git commit -m "feat(server): add SQLAlchemy models and database session"
```

---

## Task 4: Seed default summary templates on startup

**Files:**
- Modify: `server/otter/db.py`
- Create: `server/otter/seed.py`
- Modify: `server/otter/main.py`
- Modify: `server/tests/conftest.py` (engine fixture seeds too)
- Create: `server/tests/test_seed.py`

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_seed.py`:

```python
from otter.models import SummaryTemplate
from otter.seed import seed_templates


def test_seed_creates_two_default_templates(session):
    seed_templates(session)
    rows = session.query(SummaryTemplate).order_by(SummaryTemplate.name).all()
    assert [r.name for r in rows] == ["Outline", "Study Guide"]
    assert all(r.is_default for r in rows)


def test_seed_is_idempotent(session):
    seed_templates(session)
    seed_templates(session)
    rows = session.query(SummaryTemplate).all()
    assert len(rows) == 2
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_seed.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'otter.seed'`.

- [ ] **Step 3: Implement `otter/seed.py`**

```python
from __future__ import annotations

from sqlalchemy.orm import Session

from otter.models import SummaryTemplate


STUDY_GUIDE_PROMPT = """\
You are creating a study guide from a lecture transcript. Output markdown with:
- # Key takeaways (3-7 bullets)
- # Terminology (term — definition pairs)
- # Likely exam questions (5-10)
- # Topics to review further (where the lecture was thin or you sense gaps)

Transcript:
{transcript}
"""

OUTLINE_PROMPT = """\
You are creating a hierarchical outline of a lecture transcript. Preserve the lecture's structure. Output markdown with:
- # Main topic headings
- ## Subtopics under each
- Bulleted detail under each subtopic

Keep it faithful to what was actually said — do not invent content.

Transcript:
{transcript}
"""


DEFAULTS: list[tuple[str, str]] = [
    ("Study Guide", STUDY_GUIDE_PROMPT),
    ("Outline", OUTLINE_PROMPT),
]


def seed_templates(session: Session) -> None:
    existing = {row.name for row in session.query(SummaryTemplate.name).all()}
    for name, prompt in DEFAULTS:
        if name in existing:
            continue
        session.add(SummaryTemplate(name=name, prompt=prompt, is_default=True))
    session.commit()
```

- [ ] **Step 4: Wire seeding into `init_db`**

Edit `server/otter/db.py` — replace `init_db`:

```python
def init_db() -> None:
    """Idempotent — tests pre-set ``_engine`` and ``_SessionLocal`` to point at a temp DB."""
    global _engine, _SessionLocal
    if _engine is not None:
        return
    _engine = make_engine()
    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)
    from otter.seed import seed_templates

    with _SessionLocal() as s:
        seed_templates(s)
```

- [ ] **Step 5: Make the test `engine` fixture seed too**

Edit `server/tests/conftest.py` — change the `engine` fixture:

```python
@pytest.fixture
def engine(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    from otter.seed import seed_templates

    with SessionLocal() as s:
        seed_templates(s)
    return engine
```

- [ ] **Step 6: Run all tests**

```bash
uv run pytest -v
```

Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
git add server/otter/seed.py server/otter/db.py server/tests/conftest.py server/tests/test_seed.py
git commit -m "feat(server): seed default summary templates on init"
```

---

## Task 5: Pydantic schemas

**Files:**
- Create: `server/otter/schemas.py`

(No test file — schemas will be exercised by the API tests in subsequent tasks.)

- [ ] **Step 1: Implement `otter/schemas.py`**

```python
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
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
uv run python -c "from otter import schemas; print(schemas.LectureOut.model_json_schema()['title'])"
```

Expected: `LectureOut`.

- [ ] **Step 3: Commit**

```bash
git add server/otter/schemas.py
git commit -m "feat(server): add Pydantic request/response schemas"
```

---

## Task 6: Lectures CRUD (no audio yet)

**Files:**
- Create: `server/otter/api/__init__.py` (empty)
- Create: `server/otter/api/lectures.py`
- Modify: `server/otter/main.py`
- Create: `server/tests/test_lectures.py`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_lectures.py`:

```python
def test_create_lecture_returns_id_and_default_title(client):
    r = client.post("/api/lectures", json={})
    assert r.status_code == 201
    body = r.json()
    assert "id" in body
    assert body["title"].startswith("Lecture ")
    assert body["status"] == "transcribing"


def test_create_lecture_with_explicit_title(client):
    r = client.post("/api/lectures", json={"title": "Calc 101 lecture 1"})
    assert r.status_code == 201
    assert r.json()["title"] == "Calc 101 lecture 1"


def test_list_lectures_returns_newest_first(client):
    a = client.post("/api/lectures", json={"title": "A"}).json()
    b = client.post("/api/lectures", json={"title": "B"}).json()
    rows = client.get("/api/lectures").json()
    assert [r["id"] for r in rows[:2]] == [b["id"], a["id"]]


def test_get_lecture_404_when_missing(client):
    assert client.get("/api/lectures/does-not-exist").status_code == 404


def test_get_lecture_includes_empty_segments_and_summaries(client):
    created = client.post("/api/lectures", json={"title": "X"}).json()
    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["segments"] == []
    assert detail["summaries"] == []


def test_patch_lecture_updates_title(client):
    created = client.post("/api/lectures", json={"title": "old"}).json()
    r = client.patch(f"/api/lectures/{created['id']}", json={"title": "new"})
    assert r.status_code == 200
    assert r.json()["title"] == "new"


def test_delete_lecture(client):
    created = client.post("/api/lectures", json={"title": "x"}).json()
    assert client.delete(f"/api/lectures/{created['id']}").status_code == 204
    assert client.get(f"/api/lectures/{created['id']}").status_code == 404
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_lectures.py -v
```

Expected: all 7 fail with 404 / module not found.

- [ ] **Step 3: Implement `otter/api/lectures.py`**

```python
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
```

Create empty `server/otter/api/__init__.py`.

- [ ] **Step 4: Mount the router**

Edit `server/otter/main.py` — replace `create_app`:

```python
def create_app() -> FastAPI:
    from otter.api import lectures

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest -v
```

Expected: 13 passed (6 prior + 7 new).

- [ ] **Step 6: Commit**

```bash
git add server/otter/api server/otter/main.py server/tests/test_lectures.py
git commit -m "feat(server): add lectures CRUD endpoints"
```

---

## Task 7: Storage helpers + audio upload endpoint

**Files:**
- Create: `server/otter/storage.py`
- Create: `server/otter/api/audio.py`
- Modify: `server/otter/main.py`
- Create: `server/tests/test_audio.py`

This task adds `PUT /api/lectures/:id/audio` (multipart upload) and the disk write. Transcription is **not** triggered yet — that's Task 9. After upload, `status` stays `transcribing` (it's the resting "needs work" state) and `audio_path` is populated.

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_audio.py`:

```python
from pathlib import Path

import pytest


@pytest.fixture
def audio_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target


def test_upload_audio_writes_file_and_updates_lecture(client, audio_dir: Path):
    created = client.post("/api/lectures", json={"title": "L"}).json()

    payload = b"FAKEAUDIO" * 100
    r = client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("clip.webm", payload, "audio/webm")},
    )
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "transcribing"

    files = list(audio_dir.iterdir())
    assert len(files) == 1
    assert files[0].read_bytes() == payload

    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["audio_mime"] == "audio/webm"


def test_upload_audio_404_when_lecture_missing(client, audio_dir: Path):
    r = client.put(
        "/api/lectures/missing/audio",
        files={"audio": ("clip.webm", b"x", "audio/webm")},
    )
    assert r.status_code == 404


def test_upload_audio_rejects_when_disk_full(client, audio_dir: Path, monkeypatch):
    monkeypatch.setattr("otter.storage.free_bytes", lambda _p: 100 * 1024 * 1024)  # 100MB
    created = client.post("/api/lectures", json={}).json()
    r = client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", b"x", "audio/webm")},
    )
    assert r.status_code == 507
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_audio.py -v
```

Expected: all fail with 405/404.

- [ ] **Step 3: Implement `otter/storage.py`**

```python
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
```

- [ ] **Step 4: Implement `otter/api/audio.py`**

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
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
```

- [ ] **Step 5: Mount the router**

Edit `server/otter/main.py` — add `audio` import and mount:

```python
def create_app() -> FastAPI:
    from otter.api import audio, lectures

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 6: Run all tests**

```bash
uv run pytest -v
```

Expected: 16 passed.

- [ ] **Step 7: Commit**

```bash
git add server/otter/storage.py server/otter/api/audio.py server/otter/main.py server/tests/test_audio.py
git commit -m "feat(server): add audio upload endpoint with disk-space guard"
```

---

## Task 8: Audio streaming endpoint with Range support

**Files:**
- Modify: `server/otter/api/audio.py`
- Modify: `server/tests/test_audio.py`

Starlette's `FileResponse` handles `Range` natively, so we just need to expose the file.

- [ ] **Step 1: Add the failing test**

Append to `server/tests/test_audio.py`:

```python
def test_get_audio_returns_file(client, audio_dir: Path):
    created = client.post("/api/lectures", json={}).json()
    payload = b"AUDIO" * 50
    client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", payload, "audio/webm")},
    )
    r = client.get(f"/api/lectures/{created['id']}/audio")
    assert r.status_code == 200
    assert r.content == payload
    assert r.headers["content-type"] == "audio/webm"


def test_get_audio_supports_range(client, audio_dir: Path):
    created = client.post("/api/lectures", json={}).json()
    payload = b"0123456789" * 10  # 100 bytes
    client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", payload, "audio/webm")},
    )
    r = client.get(
        f"/api/lectures/{created['id']}/audio", headers={"Range": "bytes=10-19"}
    )
    assert r.status_code == 206
    assert r.content == payload[10:20]


def test_get_audio_404_when_missing(client, audio_dir: Path):
    created = client.post("/api/lectures", json={}).json()
    r = client.get(f"/api/lectures/{created['id']}/audio")
    assert r.status_code == 404
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_audio.py -v
```

Expected: 3 new tests fail.

- [ ] **Step 3: Add the route**

Append to `server/otter/api/audio.py`:

```python
from pathlib import Path

from fastapi.responses import FileResponse


@router.get("/{lecture_id}/audio")
def get_audio(lecture_id: str, session: Session = Depends(get_session)) -> FileResponse:
    lecture = session.get(Lecture, lecture_id)
    if lecture is None or not lecture.audio_path:
        raise HTTPException(status_code=404, detail="audio not found")

    full = Path(storage.AUDIO_DIR.parent / lecture.audio_path)
    if not full.exists():
        raise HTTPException(status_code=404, detail="audio file missing on disk")

    return FileResponse(full, media_type=lecture.audio_mime)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest -v
```

Expected: 19 passed.

- [ ] **Step 5: Commit**

```bash
git add server/otter/api/audio.py server/tests/test_audio.py
git commit -m "feat(server): serve audio with HTTP range support"
```

---

## Task 9: Background job runner + transcription wrapper

**Files:**
- Create: `server/otter/jobs.py`
- Create: `server/otter/transcription.py`
- Create: `server/tests/test_transcription.py`

Real faster-whisper is too slow / heavy to run in unit tests. We define a thin wrapper around it, and tests substitute a fake transcriber via dependency injection. Task 14 will run the real model end-to-end with a tiny audio fixture.

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_transcription.py`:

```python
from pathlib import Path

import pytest

from otter.models import Lecture, TranscriptSegment
from otter.transcription import Segment, run_transcription_job


class FakeTranscriber:
    def __init__(self, segments: list[Segment]):
        self._segments = segments
        self.calls: list[Path] = []

    def transcribe(self, audio_path: Path) -> tuple[list[Segment], float]:
        self.calls.append(audio_path)
        duration = self._segments[-1].end_sec if self._segments else 0.0
        return self._segments, duration


def _make_lecture(session, audio_dir: Path) -> Lecture:
    audio = audio_dir / "x.webm"
    audio.write_bytes(b"FAKE")
    lecture = Lecture(
        title="t",
        audio_path=str(audio.relative_to(audio_dir.parent)),
        audio_mime="audio/webm",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()
    return lecture


@pytest.fixture
def audio_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target


def test_run_transcription_writes_segments_and_marks_ready(session, audio_dir: Path):
    lecture = _make_lecture(session, audio_dir)
    fake = FakeTranscriber(
        [
            Segment(start_sec=0.0, end_sec=2.0, text="Hello."),
            Segment(start_sec=2.0, end_sec=5.0, text="World."),
        ]
    )

    run_transcription_job(lecture.id, session_factory=lambda: session, transcriber=fake)

    session.expire_all()
    refreshed = session.get(Lecture, lecture.id)
    assert refreshed.status == "ready"
    assert refreshed.duration_sec == 5
    rows = (
        session.query(TranscriptSegment)
        .filter_by(lecture_id=lecture.id)
        .order_by(TranscriptSegment.start_sec)
        .all()
    )
    assert [(r.start_sec, r.text) for r in rows] == [(0.0, "Hello."), (2.0, "World.")]


def test_run_transcription_marks_failed_on_exception(session, audio_dir: Path):
    lecture = _make_lecture(session, audio_dir)

    class Boom:
        def transcribe(self, audio_path):
            raise RuntimeError("model load failed")

    run_transcription_job(lecture.id, session_factory=lambda: session, transcriber=Boom())

    session.expire_all()
    refreshed = session.get(Lecture, lecture.id)
    assert refreshed.status == "failed"
    assert "model load failed" in refreshed.error
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_transcription.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `otter/jobs.py`**

```python
from __future__ import annotations

import threading
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor


class JobRunner:
    def __init__(self, max_workers: int = 1) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="otter-job")
        self._lock = threading.Lock()

    def submit(self, fn: Callable[..., None], *args, **kwargs) -> Future:
        with self._lock:
            return self._executor.submit(fn, *args, **kwargs)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=False)


_runner: JobRunner | None = None


def get_runner() -> JobRunner:
    global _runner
    if _runner is None:
        _runner = JobRunner()
    return _runner


def reset_runner() -> None:
    global _runner
    if _runner is not None:
        _runner.shutdown()
    _runner = None
```

- [ ] **Step 4: Implement `otter/transcription.py`**

```python
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from sqlalchemy.orm import Session

from otter import storage
from otter.config import load_config
from otter.models import Lecture, TranscriptSegment


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
) -> None:
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
    finally:
        session.close()
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_transcription.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add server/otter/jobs.py server/otter/transcription.py server/tests/test_transcription.py
git commit -m "feat(server): add transcription job + faster-whisper wrapper"
```

---

## Task 10: Trigger transcription from upload + status endpoint

**Files:**
- Modify: `server/otter/api/audio.py`
- Create: `server/otter/api/status.py`
- Modify: `server/otter/main.py`
- Create: `server/tests/test_status.py`
- Modify: `server/tests/test_audio.py`

The upload endpoint dispatches the job to the runner. We use a tiny fake transcriber in tests to keep things deterministic.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_status.py`:

```python
def test_status_returns_current_state(client):
    created = client.post("/api/lectures", json={}).json()
    r = client.get(f"/api/lectures/{created['id']}/status")
    assert r.status_code == 200
    assert r.json()["status"] == "transcribing"


def test_status_404_when_missing(client):
    assert client.get("/api/lectures/nope/status").status_code == 404
```

Append to `server/tests/test_audio.py`:

```python
import time

from otter.transcription import Segment


def test_upload_triggers_transcription_job(client, audio_dir, monkeypatch):
    calls: list[str] = []

    class Fake:
        def transcribe(self, path):
            calls.append(str(path))
            return [Segment(0.0, 1.0, "hi")], 1.0

    monkeypatch.setattr("otter.api.audio._make_transcriber", lambda: Fake())

    created = client.post("/api/lectures", json={}).json()
    client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("c.webm", b"x" * 32, "audio/webm")},
    )

    for _ in range(50):
        if client.get(f"/api/lectures/{created['id']}/status").json()["status"] == "ready":
            break
        time.sleep(0.05)

    assert len(calls) == 1
    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["status"] == "ready"
    assert detail["segments"][0]["text"] == "hi"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_status.py tests/test_audio.py::test_upload_triggers_transcription_job -v
```

Expected: failures.

- [ ] **Step 3: Implement `otter/api/status.py`**

```python
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
```

- [ ] **Step 4: Wire transcription into the upload handler**

Replace the body of `upload_audio` in `server/otter/api/audio.py` and add helpers above it:

```python
from otter import db as _db
from otter.jobs import get_runner
from otter.transcription import FasterWhisperTranscriber, run_transcription_job


def _make_transcriber():
    return FasterWhisperTranscriber()


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
    lecture.error = None
    session.commit()

    transcriber = _make_transcriber()
    get_runner().submit(
        run_transcription_job,
        lecture_id,
        session_factory=_db.make_session,
        transcriber=transcriber,
        close_session=True,
    )

    return {"id": lecture_id, "status": "transcribing"}
```

`_db.make_session()` returns a fresh `Session` that the caller owns. The background job passes `close_session=True` so `run_transcription_job` cleans it up in `finally`. (`get_session` is the FastAPI dependency-injection generator and shouldn't be called manually.)

- [ ] **Step 5: Mount the status router**

Edit `server/otter/main.py` `create_app`:

```python
def create_app() -> FastAPI:
    from otter.api import audio, lectures, status as status_router

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)
    app.include_router(status_router.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 6: Run all tests**

The conftest `client` fixture from Task 3 already pre-sets `_db._engine` and `_db._SessionLocal`, so the background job's `next(_db.get_session())` resolves to the test engine. No further fixture changes are needed.

```bash
uv run pytest -v
```

Expected: 22 passed.

- [ ] **Step 7: Commit**

```bash
git add server/otter/api server/otter/main.py server/tests/test_status.py server/tests/test_audio.py
git commit -m "feat(server): trigger background transcription on upload"
```

---

## Task 11: Settings API (Anthropic key + model selection)

**Files:**
- Create: `server/otter/api/settings.py`
- Modify: `server/otter/main.py`
- Create: `server/tests/test_settings.py`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_settings.py`:

```python
from pathlib import Path

import pytest


@pytest.fixture
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setattr("otter.config.CONFIG_PATH", path)
    return path


def test_get_settings_reflects_defaults_when_no_key(client, isolated_config):
    body = client.get("/api/settings").json()
    assert body == {
        "whisper_model": "large-v3",
        "summary_model": "claude-opus-4-7",
        "anthropic_key_set": False,
    }


def test_patch_settings_stores_key_and_models(client, isolated_config):
    r = client.patch(
        "/api/settings",
        json={
            "anthropic_api_key": "sk-ant-secret",
            "whisper_model": "medium",
            "summary_model": "claude-sonnet-4-6",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "whisper_model": "medium",
        "summary_model": "claude-sonnet-4-6",
        "anthropic_key_set": True,
    }
    assert "sk-ant-secret" in isolated_config.read_text()


def test_patch_settings_partial_update_preserves_existing(client, isolated_config):
    client.patch("/api/settings", json={"anthropic_api_key": "k"})
    r = client.patch("/api/settings", json={"whisper_model": "small"})
    body = r.json()
    assert body["anthropic_key_set"] is True
    assert body["whisper_model"] == "small"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_settings.py -v
```

Expected: 404.

- [ ] **Step 3: Implement `otter/api/settings.py`**

```python
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
```

- [ ] **Step 4: Mount the router**

Edit `server/otter/main.py`:

```python
def create_app() -> FastAPI:
    from otter.api import audio, lectures, settings, status as status_router

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)
    app.include_router(status_router.router)
    app.include_router(settings.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest -v
```

Expected: 25 passed.

- [ ] **Step 6: Commit**

```bash
git add server/otter/api/settings.py server/otter/main.py server/tests/test_settings.py
git commit -m "feat(server): add settings GET/PATCH endpoints"
```

---

## Task 12: Summary templates CRUD

**Files:**
- Create: `server/otter/api/templates.py`
- Modify: `server/otter/main.py`
- Create: `server/tests/test_templates.py`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_templates.py`:

```python
def test_list_returns_seeded_defaults(client):
    rows = client.get("/api/templates").json()
    names = {r["name"] for r in rows}
    assert names == {"Study Guide", "Outline"}
    assert all(r["is_default"] for r in rows)


def test_create_template(client):
    r = client.post(
        "/api/templates",
        json={"name": "Anki", "prompt": "Make cards from {transcript}", "is_default": False},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Anki"
    assert body["is_default"] is False


def test_create_rejects_duplicate_name(client):
    client.post("/api/templates", json={"name": "X", "prompt": "{transcript}"})
    r = client.post("/api/templates", json={"name": "X", "prompt": "{transcript}"})
    assert r.status_code == 409


def test_create_rejects_template_without_transcript_placeholder(client):
    r = client.post("/api/templates", json={"name": "Bad", "prompt": "no placeholder"})
    assert r.status_code == 422


def test_patch_template(client):
    rows = client.get("/api/templates").json()
    sg = next(r for r in rows if r["name"] == "Study Guide")
    r = client.patch(f"/api/templates/{sg['id']}", json={"is_default": False})
    assert r.status_code == 200
    assert r.json()["is_default"] is False


def test_delete_template(client):
    created = client.post(
        "/api/templates", json={"name": "Temp", "prompt": "{transcript}"}
    ).json()
    assert client.delete(f"/api/templates/{created['id']}").status_code == 204
    rows = client.get("/api/templates").json()
    assert all(r["id"] != created["id"] for r in rows)
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_templates.py -v
```

Expected: 404 / not found.

- [ ] **Step 3: Implement `otter/api/templates.py`**

```python
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
```

- [ ] **Step 4: Mount the router**

Edit `server/otter/main.py` — add `templates` to the imports and `app.include_router(templates.router)`.

```python
def create_app() -> FastAPI:
    from otter.api import audio, lectures, settings, status as status_router, templates

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)
    app.include_router(status_router.router)
    app.include_router(settings.router)
    app.include_router(templates.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest -v
```

Expected: 31 passed.

- [ ] **Step 6: Commit**

```bash
git add server/otter/api/templates.py server/otter/main.py server/tests/test_templates.py
git commit -m "feat(server): add summary template CRUD"
```

---

## Task 13: Summarization wrapper (Anthropic SDK with prompt caching)

**Files:**
- Create: `server/otter/summarization.py`
- Create: `server/tests/test_summarization.py`

The summarization module is decoupled from FastAPI: takes a transcript string + template prompt, returns markdown. Real Anthropic calls are mocked in tests; the wiring is exercised through dependency injection.

This task uses the **claude-api skill conventions** for prompt caching: the system prompt and template body are marked `cache_control: ephemeral`; only the per-lecture transcript varies.

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_summarization.py`:

```python
from otter.summarization import generate_summary


class FakeAnthropic:
    def __init__(self, reply: str = "# notes") -> None:
        self.reply = reply
        self.messages = self  # so .messages.create works
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)

        class Block:
            def __init__(self, text: str):
                self.type = "text"
                self.text = text

        class Resp:
            content = [Block(self.reply)]
            model = kwargs["model"]

        return Resp()


def test_generate_summary_returns_markdown_and_uses_cache_control():
    fake = FakeAnthropic("# Key takeaways\n- A")
    out = generate_summary(
        client=fake,
        model="claude-opus-4-7",
        template_prompt="Make a study guide.\nTranscript:\n{transcript}",
        transcript="Today we discussed gravity.",
    )
    assert out == "# Key takeaways\n- A"
    assert len(fake.calls) == 1
    call = fake.calls[0]
    assert call["model"] == "claude-opus-4-7"
    user_blocks = call["messages"][0]["content"]
    # First block (template) is cached, second (transcript) is not.
    assert user_blocks[0]["cache_control"] == {"type": "ephemeral"}
    assert "{transcript}" not in user_blocks[0]["text"]
    assert "gravity" in user_blocks[1]["text"]
    assert "cache_control" not in user_blocks[1]


def test_generate_summary_strips_transcript_placeholder_from_template():
    fake = FakeAnthropic("ok")
    generate_summary(
        client=fake,
        model="claude-opus-4-7",
        template_prompt="Outline this.\nTranscript:\n{transcript}",
        transcript="hello",
    )
    template_text = fake.calls[0]["messages"][0]["content"][0]["text"]
    assert "{transcript}" not in template_text
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_summarization.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `otter/summarization.py`**

```python
from __future__ import annotations

from typing import Any


SYSTEM_PROMPT = (
    "You are an expert academic note-taker. Output well-formatted markdown. "
    "Be faithful to the source — do not invent content."
)


def _split_template(template_prompt: str) -> str:
    """Remove the {transcript} placeholder; the transcript is sent in a separate block."""
    return template_prompt.replace("{transcript}", "").rstrip()


def generate_summary(
    *,
    client: Any,
    model: str,
    template_prompt: str,
    transcript: str,
    max_tokens: int = 4096,
) -> str:
    template_body = _split_template(template_prompt)
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[
            {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": template_body,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {"type": "text", "text": f"Transcript:\n{transcript}"},
                ],
            }
        ],
    )
    return "".join(block.text for block in response.content if block.type == "text")
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/test_summarization.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/otter/summarization.py server/tests/test_summarization.py
git commit -m "feat(server): add Anthropic summarization wrapper with prompt caching"
```

---

## Task 14: Summary endpoints + auto-trigger after transcription

**Files:**
- Create: `server/otter/api/summaries.py`
- Modify: `server/otter/transcription.py`
- Modify: `server/otter/main.py`
- Create: `server/tests/test_summaries.py`

After a transcription finishes successfully, we automatically generate a summary for each `is_default=true` template. We also expose endpoints to fetch / regenerate / generate-with-non-default-template / delete.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_summaries.py`:

```python
import pytest

from otter.models import Lecture, TranscriptSegment
from otter.transcription import Segment


def _seed_ready_lecture(session) -> str:
    lecture = Lecture(
        title="L",
        duration_sec=10,
        audio_path="audio/x.webm",
        audio_mime="audio/webm",
        status="ready",
    )
    session.add(lecture)
    session.flush()
    session.add_all(
        [
            TranscriptSegment(lecture_id=lecture.id, start_sec=0, end_sec=2, text="Hello."),
            TranscriptSegment(lecture_id=lecture.id, start_sec=2, end_sec=5, text="World."),
        ]
    )
    session.commit()
    return lecture.id


@pytest.fixture
def fake_summary(monkeypatch):
    calls: list[dict] = []

    def fake(*, client, model, template_prompt, transcript, max_tokens=4096):
        calls.append({"model": model, "transcript": transcript, "prompt": template_prompt})
        return f"SUMMARY-OF:{transcript[:5]}"

    monkeypatch.setattr("otter.api.summaries.generate_summary", fake)
    monkeypatch.setattr("otter.transcription.generate_summary", fake)
    monkeypatch.setattr("otter.api.summaries._anthropic_client", lambda: object())
    monkeypatch.setattr("otter.transcription._anthropic_client", lambda: object())
    return calls


def test_create_summary_for_template(client, session, fake_summary):
    lid = _seed_ready_lecture(session)
    template = client.get("/api/templates").json()[0]
    r = client.post(f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]})
    assert r.status_code == 201
    body = r.json()
    assert body["content"].startswith("SUMMARY-OF:Hello")
    assert body["template_id"] == template["id"]
    assert len(fake_summary) == 1


def test_create_summary_replaces_existing_for_same_template(client, session, fake_summary):
    lid = _seed_ready_lecture(session)
    template = client.get("/api/templates").json()[0]
    first = client.post(f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]}).json()
    second = client.post(f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]}).json()
    assert first["id"] != second["id"]
    detail = client.get(f"/api/lectures/{lid}").json()
    assert sum(1 for s in detail["summaries"] if s["template_id"] == template["id"]) == 1


def test_create_summary_404_when_lecture_missing(client, fake_summary):
    template = client.get("/api/templates").json()[0]
    r = client.post("/api/lectures/missing/summaries", json={"template_id": template["id"]})
    assert r.status_code == 404


def test_create_summary_409_when_lecture_not_ready(client, session, fake_summary):
    lecture = Lecture(
        title="L",
        duration_sec=0,
        audio_path="x",
        audio_mime="audio/webm",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()
    template = client.get("/api/templates").json()[0]
    r = client.post(
        f"/api/lectures/{lecture.id}/summaries", json={"template_id": template["id"]}
    )
    assert r.status_code == 409


def test_delete_summary(client, session, fake_summary):
    lid = _seed_ready_lecture(session)
    template = client.get("/api/templates").json()[0]
    summary = client.post(
        f"/api/lectures/{lid}/summaries", json={"template_id": template["id"]}
    ).json()
    assert client.delete(f"/api/summaries/{summary['id']}").status_code == 204


def test_transcription_auto_generates_default_summaries(session, audio_dir, fake_summary):
    from otter.transcription import run_transcription_job

    audio = audio_dir / "x.webm"
    audio.write_bytes(b"x")
    lecture = Lecture(
        title="t",
        audio_path=str(audio.relative_to(audio_dir.parent)),
        audio_mime="audio/webm",
        status="transcribing",
    )
    session.add(lecture)
    session.commit()

    class Trans:
        def transcribe(self, p):
            return [Segment(0, 2, "Hello.")], 2.0

    run_transcription_job(
        lecture.id, session_factory=lambda: session, transcriber=Trans()
    )

    session.expire_all()
    refreshed = session.get(Lecture, lecture.id)
    assert refreshed.status == "ready"
    assert len(refreshed.summaries) == 2  # Study Guide + Outline


@pytest.fixture
def audio_dir(tmp_path, monkeypatch):
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_summaries.py -v
```

Expected: failures.

- [ ] **Step 3: Implement `otter/api/summaries.py`**

```python
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
```

- [ ] **Step 4: Auto-generate default summaries after transcription**

Edit `server/otter/transcription.py` — add at the bottom and call from the success path:

```python
def _anthropic_client():
    from anthropic import Anthropic

    cfg = load_config()
    if not cfg.anthropic_api_key:
        return None
    return Anthropic(api_key=cfg.anthropic_api_key)


def _generate_default_summaries(session: Session, lecture: Lecture) -> None:
    from otter.models import Summary, SummaryTemplate
    from otter.summarization import generate_summary

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
```

Then in the success branch of `run_transcription_job` (right before the final commit on success), invoke `_generate_default_summaries(session, lecture)`. The full updated success path:

```python
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
```

- [ ] **Step 5: Mount the summaries router**

Edit `server/otter/main.py`:

```python
def create_app() -> FastAPI:
    from otter.api import (
        audio,
        lectures,
        settings,
        status as status_router,
        summaries,
        templates,
    )

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)
    app.include_router(status_router.router)
    app.include_router(settings.router)
    app.include_router(templates.router)
    app.include_router(summaries.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 6: Run tests**

```bash
uv run pytest -v
```

Expected: 37 passed.

- [ ] **Step 7: Commit**

```bash
git add server/otter/api/summaries.py server/otter/transcription.py server/otter/main.py server/tests/test_summaries.py
git commit -m "feat(server): generate summaries on demand and auto after transcription"
```

---

## Task 15: End-to-end smoke test with real faster-whisper

**Files:**
- Create: `server/tests/fixtures/short_clip.wav` (committed binary fixture, ~10s of speech)
- Create: `server/tests/test_e2e.py`
- Modify: `server/pyproject.toml` (add `numpy` to dev deps for fixture generation)

This test runs the actual `tiny` Whisper model against a real audio clip. It is skipped by default and run with `pytest -m e2e` to keep the regular test loop fast.

- [ ] **Step 1: Add a script to generate the fixture**

Create `server/tests/fixtures/__init__.py` (empty) and `server/tests/fixtures/generate_clip.py`:

```python
"""Generate a deterministic ~10s spoken WAV fixture using macOS `say` + ffmpeg."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).parent / "short_clip.wav"
TEXT = (
    "Today we are going to talk about Newton's laws of motion. "
    "The first law states that an object in motion stays in motion."
)


def main() -> None:
    if shutil.which("say") is None or shutil.which("ffmpeg") is None:
        print("Requires macOS `say` and `ffmpeg` to regenerate.", file=sys.stderr)
        sys.exit(1)

    aiff = OUT.with_suffix(".aiff")
    subprocess.run(["say", "-o", str(aiff), TEXT], check=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(aiff), "-ar", "16000", "-ac", "1", str(OUT)],
        check=True,
    )
    aiff.unlink()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate and commit the fixture**

```bash
cd /Users/kailee/otter-clone/server
uv run python tests/fixtures/generate_clip.py
ls -la tests/fixtures/short_clip.wav
```

Expected: WAV file ~300KB.

- [ ] **Step 3: Add `e2e` pytest marker**

Edit `server/pyproject.toml`, append to `[tool.pytest.ini_options]`:

```toml
markers = [
    "e2e: end-to-end test that loads real models (slow, run with -m e2e)",
]
```

- [ ] **Step 4: Write the e2e test**

Create `server/tests/test_e2e.py`:

```python
import time
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "short_clip.wav"


@pytest.mark.e2e
def test_full_pipeline_with_tiny_model(client, audio_dir, monkeypatch):
    monkeypatch.setattr("otter.config.load_config", lambda: _cfg("tiny"))

    created = client.post("/api/lectures", json={"title": "Newton"}).json()
    audio_bytes = FIXTURE.read_bytes()
    r = client.put(
        f"/api/lectures/{created['id']}/audio",
        files={"audio": ("clip.wav", audio_bytes, "audio/wav")},
    )
    assert r.status_code == 202

    deadline = time.time() + 120
    while time.time() < deadline:
        status = client.get(f"/api/lectures/{created['id']}/status").json()["status"]
        if status in {"ready", "failed"}:
            break
        time.sleep(0.5)
    else:
        pytest.fail("transcription timed out after 120s")

    detail = client.get(f"/api/lectures/{created['id']}").json()
    assert detail["status"] == "ready"
    assert detail["duration_sec"] >= 5
    full_text = " ".join(seg["text"] for seg in detail["segments"]).lower()
    # tiny model is rough — accept any of these landmark words
    assert any(w in full_text for w in ["newton", "motion", "law"])


def _cfg(model: str):
    from otter.config import Config

    return Config(anthropic_api_key=None, whisper_model=model, summary_model="claude-opus-4-7")


@pytest.fixture
def audio_dir(tmp_path, monkeypatch):
    target = tmp_path / "audio"
    target.mkdir()
    monkeypatch.setattr("otter.storage.AUDIO_DIR", target)
    return target
```

- [ ] **Step 5: Run the e2e test**

```bash
uv run pytest -m e2e -v
```

Expected: 1 passed (will take 30-90s on first run while the `tiny` model downloads, ~5s on subsequent runs).

- [ ] **Step 6: Verify the regular test loop still skips e2e**

```bash
uv run pytest -v
```

Expected: 37 passed, 1 deselected. (e2e is gated behind the marker.)

- [ ] **Step 7: Commit**

```bash
git add server/tests/fixtures server/tests/test_e2e.py server/pyproject.toml
git commit -m "test(server): add end-to-end test with real tiny whisper model"
```

---

## Task 16: Dev startup script

**Files:**
- Create: `scripts/dev-server.sh`
- Modify: `.gitignore` (already excludes `data/`)

- [ ] **Step 1: Write the script**

Create `/Users/kailee/otter-clone/scripts/dev-server.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../server"
exec uv run uvicorn otter.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
chmod +x /Users/kailee/otter-clone/scripts/dev-server.sh
```

- [ ] **Step 2: Smoke-test the script**

```bash
/Users/kailee/otter-clone/scripts/dev-server.sh &
SERVER_PID=$!
sleep 3
curl -s http://127.0.0.1:8000/api/health
kill $SERVER_PID
```

Expected: `{"status":"ok"}`.

- [ ] **Step 3: Commit**

```bash
git add scripts/dev-server.sh
git commit -m "chore: add dev server startup script"
```

---

## Task 17: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `/Users/kailee/otter-clone/README.md`:

```markdown
# Otter Clone

Local lecture transcription web app. Records browser-tab audio, transcribes locally with `faster-whisper`, and generates structured AI summaries via the Anthropic API.

This branch contains **Plan 1: Backend foundation** only. The frontend is delivered by Plan 2.

## Requirements

- Python ≥ 3.12
- [`uv`](https://github.com/astral-sh/uv)
- macOS Apple Silicon recommended (CTranslate2 / faster-whisper run great on Metal)
- ~5 GB free disk for the default `large-v3` Whisper model (downloaded on first transcription)

## Getting started

```bash
# Sync deps
cd server && uv sync --extra dev

# Run tests
uv run pytest -v

# Run the dev server (port 8000, bound to 127.0.0.1)
../scripts/dev-server.sh
```

## Configure Anthropic key

```bash
curl -X PATCH http://127.0.0.1:8000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"anthropic_api_key": "sk-ant-..."}'
```

The key is stored at `~/.otter-clone/config.json` and never returned by the API.

## Smoke test the full pipeline

```bash
# Create a lecture
LECTURE_ID=$(curl -s -X POST http://127.0.0.1:8000/api/lectures \
  -H 'Content-Type: application/json' -d '{}' | jq -r .id)

# Upload audio (any webm/mp3/wav/m4a)
curl -X PUT "http://127.0.0.1:8000/api/lectures/$LECTURE_ID/audio" \
  -F "audio=@/path/to/clip.wav;type=audio/wav"

# Poll status
watch -n 1 "curl -s http://127.0.0.1:8000/api/lectures/$LECTURE_ID/status"

# Fetch transcript + summaries
curl -s "http://127.0.0.1:8000/api/lectures/$LECTURE_ID" | jq .
```

## Layout

See [`docs/superpowers/specs/2026-05-09-otter-clone-design.md`](docs/superpowers/specs/2026-05-09-otter-clone-design.md) §11.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and curl smoke-test"
```

---

## Self-review checklist (already applied)

- ✅ **Spec coverage:** All v1 in-scope sections of the spec are implemented (project layout, config, DB, lectures CRUD, audio upload+stream, transcription, status, settings, templates CRUD, summaries CRUD + auto-trigger). The frontend (§7 layout, §6 capture in browser) is intentionally deferred to Plan 2.
- ✅ **No placeholders:** No "TBD", "implement appropriate", or "fill in" lines. Every code step is concrete.
- ✅ **Type/name consistency:** `run_transcription_job`, `Segment`, `generate_summary`, `Config`, `SummaryTemplate`, `Lecture` names are stable across all tasks where they appear.
- ✅ **TDD throughout:** every task is test-first, commit-per-task.

---

## What's NOT in this plan (and why)

- **Frontend** — separate plan (Plan 2). This backend is fully usable via curl as documented in the README.
- **Live/streaming transcription** — out of scope per spec §1.
- **Speaker diarization** — out of scope per spec §1; the `speaker` column is reserved.
- **Cross-lecture search** — out of scope per spec §1.
- **Long-transcript virtualization** — frontend concern; deferred.
- **Production deployment / Tailscale / auth** — single-user local app; spec §1 explicitly local-only.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-09-otter-clone-backend.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
