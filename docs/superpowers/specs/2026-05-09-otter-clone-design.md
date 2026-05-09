# Otter Clone — Design Spec

**Date:** 2026-05-09
**Status:** Draft, awaiting user review

## 1. Purpose & scope

A personal lecture-transcription web app for online (web-based) college lectures. The user starts a recording, the app captures the lecture's tab/system audio, transcribes it locally, and generates structured AI summaries. The user can then replay the audio while the matching transcript segment is highlighted, and click any segment to seek the audio.

**Single user. Local-only. No auth.**

### In scope (v1)

- Browser-based audio capture via `getDisplayMedia` (Chrome tab/system audio share)
- Local transcription with `faster-whisper` (open Whisper variant; model swappable)
- Audio playback synced with transcript (click-to-seek, auto-highlight current segment)
- Auto-generated AI summaries via the Anthropic API using user-defined templates (default: "Study Guide" + "Outline")
- Lecture list, per-lecture view, settings page
- Audio kept indefinitely (user-deletable)

### Out of scope (v1)

- Live/streaming transcription (batch only — transcribe after recording stops)
- Speaker diarization (who said what)
- Cross-lecture full-text search
- Manual transcript editing
- Multi-user / auth / cloud deployment
- Mobile recording (recording requires desktop Chrome with tab-capture; mobile can view)
- Custom Whisper fine-tuning
- Long-lecture virtualized transcript rendering (handle this if/when needed)

## 2. Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Browser (Chrome/Edge)  │         │   FastAPI backend        │
│  ─────────────────────  │  HTTP   │   ────────────────────   │
│  - Record UI            │ ◄─────► │  - REST API              │
│  - getDisplayMedia      │         │  - Audio storage (FS)    │
│  - MediaRecorder        │         │  - SQLite (metadata)     │
│  - Transcript player    │         │  - faster-whisper worker │
│  - Audio <audio> tag    │         │  - Anthropic SDK client  │
└─────────────────────────┘         └──────────────────────────┘
```

Two processes in development (FastAPI on `:8000`, Vite on `:5173` proxying `/api`). One process in production (FastAPI serves both the API and the built static SPA on `:8000`). Backend binds to `127.0.0.1` only.

faster-whisper runs in a background thread pool inside the FastAPI process — no external queue/broker needed for a single user.

## 3. Components

### Frontend (`web/`, React + Vite + TypeScript)

- **Recorder** — tab-capture flow, MediaRecorder, upload-on-stop
- **LectureList** — all lectures, sortable by date, in-list search by title
- **LectureView** — audio player, scrolling transcript with synced highlight, summaries panel, per-lecture actions (regenerate summary, edit title, delete)
- **Settings** — Whisper model size, Anthropic API key, summary templates (CRUD)

### Backend (`server/`, Python + FastAPI)

- **`api/`** — REST endpoints (see §5)
- **`transcription.py`** — faster-whisper wrapper, runs in a background thread pool, writes segments to DB on completion
- **`summarization.py`** — Anthropic SDK calls, applies a template + transcript, stores result
- **`storage`** — SQLite via SQLAlchemy, audio files on disk under `data/audio/`
- **`models.py`** — Lecture, TranscriptSegment, Summary, SummaryTemplate
- **`config.py`** — settings file at `~/.otter-clone/config.json` (Anthropic key, Whisper model choice)

## 4. Data model (SQLite)

```
Lecture
  id              uuid (pk)
  title           text          -- user-editable, default "Lecture YYYY-MM-DD HH:MM"
  created_at      datetime
  duration_sec    integer
  audio_path      text          -- relative path under data/audio/
  audio_mime      text          -- e.g. "audio/webm;codecs=opus"
  status          text          -- "recording" | "transcribing" | "ready" | "failed"
  error           text nullable

TranscriptSegment
  id              integer (pk)
  lecture_id      uuid (fk → Lecture)
  start_sec       float
  end_sec         float
  text            text
  speaker         text nullable -- reserved; not used in v1

SummaryTemplate
  id              uuid (pk)
  name            text          -- "Study Guide", "Outline", ...
  prompt          text          -- format-string with {transcript} placeholder
  is_default      bool          -- runs automatically on every lecture
  created_at      datetime

Summary
  id              uuid (pk)
  lecture_id      uuid (fk → Lecture)
  template_id     uuid (fk → SummaryTemplate)
  content         text          -- markdown
  model           text          -- e.g. "claude-opus-4-7"
  created_at      datetime
```

**Seed data:** on first run, two `SummaryTemplate` rows are inserted — `Study Guide` and `Outline`, both `is_default=true`. After a lecture finishes transcribing, the backend automatically generates one `Summary` per default template.

## 5. REST API

```
POST   /api/lectures                  -> create lecture, returns {id}
PUT    /api/lectures/:id/audio        -> upload audio blob (multipart),
                                         triggers transcription job
GET    /api/lectures                  -> list lectures
GET    /api/lectures/:id              -> lecture + segments + summaries
PATCH  /api/lectures/:id              -> update title
DELETE /api/lectures/:id              -> delete lecture + audio file
GET    /api/lectures/:id/audio        -> stream audio file (HTTP Range supported)
GET    /api/lectures/:id/status       -> poll status during transcription

POST   /api/lectures/:id/summaries    -> {template_id} -> generate summary
GET    /api/summaries/:id             -> fetch summary
DELETE /api/summaries/:id             -> remove a summary

GET    /api/templates                 -> list summary templates
POST   /api/templates                 -> create
PATCH  /api/templates/:id             -> edit prompt / default flag / name
DELETE /api/templates/:id             -> delete

GET    /api/settings                  -> { whisper_model, anthropic_key_set }
PATCH  /api/settings                  -> update settings
```

The Anthropic API key is stored in the local config file and never returned by the API — only `anthropic_key_set: bool` is exposed.

**Status transitions:** `transcribing` → `ready` (success) or `failed` (error message in `error`). The frontend polls `GET /api/lectures/:id/status` every 2 seconds while a lecture is `transcribing`.

## 6. Audio capture & upload flow

1. User clicks **Record**. Frontend calls `getDisplayMedia({ video: true, audio: true })`. Chrome shows the tab/window picker; the user selects the lecture tab and checks "Share tab audio".
2. Frontend stops/discards the video track and feeds the audio track into `MediaRecorder` with `audio/webm;codecs=opus`.
3. Frontend buffers chunks in memory. On **Stop**, it:
   1. `POST /api/lectures` → returns `{id}`
   2. `PUT /api/lectures/:id/audio` with the full Blob
4. Backend writes `data/audio/<lecture_id>.webm`, sets `status=transcribing`, queues a background transcription job, returns `202`.
5. Background job: load model (cached in process memory across calls), run `faster-whisper` with `vad_filter=True`, write segments, set `status=ready`, then trigger summary generation for each `is_default=true` template.

**Accepted limitation:** if the browser crashes mid-recording, the in-memory buffer is lost. Chunked uploads during recording are out of scope for v1.

## 7. Transcript + audio playback UI

`LectureView` page layout:

```
┌────────────────────────────────────────────────────────────┐
│  Title (inline-editable)                          [⋯ menu] │
│  May 9, 2026  ·  47:21  ·  Ready                           │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐  ┌────────────────────┐ │
│  │ Transcript                   │  │ Summaries          │ │
│  │ [00:00] Today we'll cover…   │  │ [Study Guide ▼]    │ │
│  │ [00:14] The first concept…   │  │ # Key takeaways …  │ │
│  │ [00:32] ▸ For example, if…   │  │                    │ │
│  │ [00:51] This leads us to…    │  │ [+ Generate]       │ │
│  └──────────────────────────────┘  │ [Outline ▼]        │ │
│  ┌──────────────────────────────┐  └────────────────────┘ │
│  │ ▶  ━━━●━━━━━━━━━  12:34/47:21 │                         │
│  └──────────────────────────────┘                          │
└────────────────────────────────────────────────────────────┘
```

**Sync behavior:**
- A single `<audio>` element holds the source.
- The frontend listens to `timeupdate` (~4 Hz) and finds the segment where `start_sec ≤ currentTime < end_sec`. It applies a "playing" highlight class and auto-scrolls if the segment is off-screen.
- Clicking any segment sets `audio.currentTime = segment.start_sec` and starts playback.
- Each segment shows its `[mm:ss]` timestamp in a left gutter for quick scanning.

**Search:** in-memory filter over the loaded lecture's transcript. Cross-lecture search is out of scope for v1.

**Editing:** transcripts are read-only in v1.

## 8. Summary generation flow

When transcription completes:

1. Backend loads all `SummaryTemplate` where `is_default=true`.
2. For each, it builds the prompt by substituting `{transcript}` with the joined segment text (no timestamps in the prompt — saves tokens).
3. It calls the Anthropic API with **prompt caching** on the system prompt and the template prompt (the transcript varies per call, but the template text is reused → cache hits across lectures using the same template).
4. Stores the response markdown as a `Summary` row tied to that lecture and template.

**On the lecture view**, the user can:
- Read existing summaries (one per default template, generated automatically)
- **Regenerate** any existing summary (replaces it)
- **+ Generate** a new summary using any other (non-default) template

**Default seed templates**

`Study Guide`:
```
You are creating a study guide from a lecture transcript. Output markdown with:
- # Key takeaways (3-7 bullets)
- # Terminology (term — definition pairs)
- # Likely exam questions (5-10)
- # Topics to review further (where the lecture was thin or you sense gaps)

Transcript:
{transcript}
```

`Outline`:
```
You are creating a hierarchical outline of a lecture transcript. Preserve the lecture's structure. Output markdown with:
- # Main topic headings
- ## Subtopics under each
- Bulleted detail under each subtopic

Keep it faithful to what was actually said — do not invent content.

Transcript:
{transcript}
```

**Model:** `claude-opus-4-7` by default, configurable in Settings. For typical 30-90 minute lectures, transcripts are well within the model's context window — no chunking needed in v1.

## 9. Error handling & edge cases

**Errors:**
- **Upload fails** — frontend retries once; on second failure, the lecture row stays without audio and the UI exposes a "retry upload" button (audio still in browser memory until the tab closes).
- **Transcription crashes** (OOM, model load fail) — `status=failed`, `error` populated; UI shows the error and a "retry" button that re-runs the same audio file.
- **Anthropic API fails** — the summary simply isn't created; the UI shows "Generation failed — retry" inline. Transcription is unaffected.
- **Missing Anthropic API key** — the summaries panel says "Add an Anthropic API key in Settings to generate summaries." Transcripts work fully without it.

**Edge cases:**
- **Very long lecture (>2 hr)** — faster-whisper handles it. Transcript list is not virtualized in v1; tested up to 90 min. Add virtualization if performance degrades.
- **Browser refreshed mid-transcription** — backend job continues; the frontend re-fetches state on reload via polling.
- **Disk fill** — backend checks free space before accepting an upload; returns `507 Insufficient Storage` with a clear message if < 500 MB free.

## 10. Testing strategy

- **Backend (pytest)**
  - Unit tests for the transcription wrapper (mock faster-whisper)
  - Unit tests for the summarization client (mock Anthropic SDK)
  - API tests via FastAPI `TestClient` against a temp SQLite DB
  - One integration test using a small known-good audio clip (~30 s) that runs faster-whisper for real with the `tiny` model
- **Frontend (Vitest + React Testing Library)**
  - Component logic: transcript-segment sync, click-to-seek, recorder state machine, status polling
  - No end-to-end tests in v1 — manual smoke test of the record→transcribe→view flow before each major change
- **Rule:** every PR shows a passing test for the changed code path

## 11. Project layout

```
otter-clone/
├── server/
│   ├── pyproject.toml        # uv-managed; deps: fastapi, faster-whisper,
│   │                         # anthropic, sqlalchemy, uvicorn, pytest
│   ├── otter/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI app
│   │   ├── api/              # routers
│   │   ├── transcription.py
│   │   ├── summarization.py
│   │   ├── models.py         # SQLAlchemy
│   │   ├── db.py
│   │   └── config.py
│   └── tests/
├── web/
│   ├── package.json          # vite + react + ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/            # Recorder, LectureList, LectureView, Settings
│   │   ├── components/       # TranscriptView, AudioPlayer, ...
│   │   ├── api.ts            # typed API client
│   │   └── hooks/
│   └── tests/
├── data/                      # gitignored: audio files + SQLite db
├── docs/superpowers/specs/
├── README.md
└── scripts/
    ├── dev.sh                # runs both server + web in parallel
    └── start.sh              # production: build web, serve via FastAPI
```

**Dev:** `./scripts/dev.sh` runs `uvicorn` on `:8000` and `vite` on `:5173` (Vite proxies `/api` to `:8000`).
**Prod (still local):** `./scripts/start.sh` runs `vite build` and starts FastAPI serving both `/api` and the built SPA on `:8000`.

**Whisper model storage:** faster-whisper downloads to `~/.cache/huggingface/` on first transcription. Default model: `large-v3`. Configurable down to `medium` / `small` / `distil-large-v3` via Settings for slower hardware.

## 12. Open questions / future work

- Cross-lecture full-text search (likely SQLite FTS5)
- Manual transcript editing
- Chunked / live transcription (would need a streaming protocol and overlap handling)
- Speaker diarization (`pyannote.audio` integration)
- Remote access (Tailscale or Cloudflare Tunnel) — addressed by promoting "fully local" to "self-hosted always-on" later
- Anki/flashcard export template
- Long-transcript virtualization
