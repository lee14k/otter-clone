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
