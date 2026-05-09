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
