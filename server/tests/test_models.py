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
