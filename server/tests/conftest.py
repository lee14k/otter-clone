from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from otter.db import Base, get_session
from otter.jobs import reset_runner
from otter.main import create_app


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture
def engine(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    from otter.seed import seed_templates

    with SessionLocal() as s:
        seed_templates(s)
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
        reset_runner()
        _db._engine = _orig_engine
        _db._SessionLocal = _orig_session_local
