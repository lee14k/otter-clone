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
