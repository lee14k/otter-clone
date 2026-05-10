# Otter Clone

Local lecture transcription web app. Records browser-tab audio, transcribes locally with `faster-whisper`, and generates structured AI summaries via the Anthropic API.

## Requirements

- Python ≥ 3.12
- [`uv`](https://github.com/astral-sh/uv)
- Node ≥ 20, npm
- macOS Apple Silicon recommended (CTranslate2 / faster-whisper run great on Metal)
- ~5 GB free disk for the default `large-v3` Whisper model (downloaded on first transcription)
- `ffmpeg` (only required to regenerate the e2e audio fixture)

## Dev

Two terminals:

```bash
# Terminal 1 — backend on :8000
./scripts/dev-server.sh

# Terminal 2 — frontend on :5173, proxies /api to :8000
cd web && npm install && npm run dev
```

Open <http://127.0.0.1:5173>.

## Production (still local)

```bash
./scripts/start.sh
```

Builds the SPA, then starts FastAPI on `:8000` serving both the API and the SPA. Open <http://127.0.0.1:8000>.

## Tests

```bash
# Backend
cd server && uv run pytest -v          # fast unit + integration tests
cd server && uv run pytest -m e2e -v   # real `tiny` Whisper end-to-end

# Frontend
cd web && npm test
```

## Configure the Anthropic key

Either via the Settings page (after starting the app) or via curl:

```bash
curl -X PATCH http://127.0.0.1:8000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"anthropic_api_key": "sk-ant-..."}'
```

The key is stored at `~/.otter-clone/config.json` and never returned by the API.

## Layout

See [`docs/superpowers/specs/2026-05-09-otter-clone-design.md`](docs/superpowers/specs/2026-05-09-otter-clone-design.md) §11.
