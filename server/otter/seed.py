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
