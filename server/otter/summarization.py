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
