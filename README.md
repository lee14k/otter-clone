# Otter Clone

Local lecture transcription web app. Records browser-tab audio, transcribes locally with `faster-whisper`, and generates structured AI summaries via the Anthropic API.

This branch contains **Plan 1: Backend foundation**. The frontend will be delivered by Plan 2.

## Requirements

- Python ≥ 3.12
- [`uv`](https://github.com/astral-sh/uv)
- macOS Apple Silicon recommended (CTranslate2 / faster-whisper run great on Metal)
- ~5 GB free disk for the default `large-v3` Whisper model (downloaded on first transcription)
- `ffmpeg` (only required to regenerate the e2e audio fixture)

## Getting started

```bash
cd server && uv sync --extra dev

# Run tests
uv run pytest -v

# Run the e2e test (downloads ~75MB tiny Whisper model on first run)
uv run pytest -m e2e -v

# Start the dev server (port 8000, bound to 127.0.0.1)
../scripts/dev-server.sh
```

## Configure the Anthropic key

```bash
curl -X PATCH http://127.0.0.1:8000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"anthropic_api_key": "sk-ant-..."}'
```

The key is stored at `~/.otter-clone/config.json` and never returned by the API.

## Smoke-test the full pipeline

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
