# Otter Clone — Frontend Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React + Vite + TypeScript SPA that records browser-tab audio, uploads it to the backend, and renders the transcript synced with audio playback alongside auto-generated AI summaries.

**Architecture:** Single-page app under `web/`. In dev, Vite serves on `:5173` and proxies `/api` to FastAPI on `:8000`. In production, `vite build` outputs to `web/dist/` and FastAPI serves both the API and the SPA on `:8000`. A small set of pages (Recorder, LectureList, LectureView, Settings) backed by typed `fetch` API client + a few stateful hooks. No global state library — local state + a tiny in-house `useApi` pattern is enough for a single-user app.

**Tech Stack:** Node 20+, npm, Vite 6, React 19, TypeScript 5.6+, React Router 7, Tailwind CSS 4, Vitest + React Testing Library + @testing-library/user-event.

**Spec reference:** [`docs/superpowers/specs/2026-05-09-otter-clone-design.md`](../specs/2026-05-09-otter-clone-design.md). This plan implements §§ 3 (frontend components), 6 (capture flow), 7 (transcript+audio UI), 8 (summary UI), 9 (frontend error handling), 11 (web/ layout).

**Backend dependency:** Plan 1 must be complete and the dev server runnable via `./scripts/dev-server.sh`. This plan also adds one small backend change at Task 14 (serve the built SPA from FastAPI in prod).

---

## File structure produced by this plan

```
web/
├── package.json
├── vite.config.ts                    # proxies /api → :8000
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── vitest.setup.ts
└── src/
    ├── main.tsx                      # Vite entry; mounts <App />
    ├── App.tsx                       # <BrowserRouter> + <Layout>
    ├── api.ts                        # typed fetch wrapper
    ├── types.ts                      # mirrors backend Pydantic schemas
    ├── format.ts                     # mm:ss helpers, date helpers
    ├── styles.css                    # Tailwind base
    ├── components/
    │   ├── Layout.tsx                # nav + outlet
    │   ├── ErrorBanner.tsx
    │   ├── RecordButton.tsx
    │   ├── AudioPlayer.tsx
    │   ├── TranscriptView.tsx
    │   ├── SummariesPanel.tsx
    │   └── TemplateEditor.tsx
    ├── hooks/
    │   ├── useApi.ts                 # generic GET hook with loading/error
    │   ├── useRecorder.ts            # state machine + getDisplayMedia
    │   ├── useStatusPoll.ts          # poll /status until ready/failed
    │   └── useAudioSync.ts           # active segment + click-to-seek
    └── pages/
        ├── RecorderPage.tsx
        ├── LectureListPage.tsx
        ├── LectureViewPage.tsx
        └── SettingsPage.tsx

server/otter/main.py                  # add static-file mounting (Task 14)
scripts/start.sh                      # build web/ + run prod (Task 15)
README.md                             # update with frontend setup (Task 16)
```

Each component does one thing. Hooks live separately from components so they're testable without rendering a full DOM. The API client is the single source of HTTP truth — no `fetch` calls in components.

---

## Conventions

- All commands use `cd /Users/kailee/otter-clone/web` for npm work, `cd /Users/kailee/otter-clone` for git.
- Tests run with `npm test` (vitest in run mode) or `npm run test:watch`.
- Conventional Commits: `feat(web):`, `chore(web):`, `test(web):`, `fix(web):`.
- All imports use the absolute alias `@/...` mapped to `src/`.
- Tests live next to source as `Foo.test.tsx` / `useFoo.test.ts`.

---

## Task 0: Bootstrap web/ project (Vite + React + TS)

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.node.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles.css`

- [ ] **Step 1: Scaffold the project with Vite**

```bash
cd /Users/kailee/otter-clone
npm create vite@latest web -- --template react-ts -y
cd web
npm install
```

This creates a stock Vite + React + TS project. We'll replace several files in the next steps.

- [ ] **Step 2: Replace `web/package.json`**

```json
{
  "name": "otter-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.8"
  }
}
```

Then:

```bash
cd /Users/kailee/otter-clone/web
rm -rf node_modules package-lock.json
npm install
```

- [ ] **Step 3: Replace `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});
```

- [ ] **Step 4: Replace `web/tsconfig.json` and `web/tsconfig.node.json`**

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vitest.setup.ts"]
}
```

`web/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Replace entry files**

Replace `web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Otter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Replace `web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Replace `web/src/App.tsx`:

```tsx
export default function App() {
  return <h1>Otter</h1>;
}
```

Create `web/src/styles.css` with one line for now:

```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

Create `web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom";
```

Delete `web/src/App.css`, `web/src/index.css`, `web/src/assets/`, and any other Vite template leftovers — only `main.tsx`, `App.tsx`, and `styles.css` remain.

- [ ] **Step 6: Smoke-test the dev server**

```bash
cd /Users/kailee/otter-clone/web
npm run dev &
sleep 3
curl -s http://127.0.0.1:5173 | head -5
kill %1
wait %1 2>/dev/null
```

Expected: HTML containing `<title>Otter</title>` and `<div id="root"></div>`.

- [ ] **Step 7: Verify build works**

```bash
cd /Users/kailee/otter-clone/web
npm run build
ls -la dist/
```

Expected: `dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`.

- [ ] **Step 8: Update `.gitignore` (root)**

Add lines if not already present (Plan 1 already set most of these, but verify):

```bash
cd /Users/kailee/otter-clone
grep -q 'web/dist/' .gitignore || echo 'web/dist/' >> .gitignore
grep -q 'web/node_modules/' .gitignore || echo 'web/node_modules/' >> .gitignore
```

- [ ] **Step 9: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/package.json web/package-lock.json web/vite.config.ts web/tsconfig.json web/tsconfig.node.json web/index.html web/src web/vitest.setup.ts .gitignore
git commit -m "feat(web): bootstrap React + Vite + TypeScript scaffold"
```

---

## Task 1: Tailwind CSS

**Files:**
- Create: `web/postcss.config.js`
- Create: `web/tailwind.config.ts`
- Modify: `web/src/styles.css`
- Modify: `web/package.json` (deps)

- [ ] **Step 1: Install Tailwind**

```bash
cd /Users/kailee/otter-clone/web
npm install -D tailwindcss@^4 @tailwindcss/postcss@^4 postcss@^8.4 autoprefixer@^10.4
```

- [ ] **Step 2: Write `web/postcss.config.js`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Write `web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Replace `web/src/styles.css`**

```css
@import "tailwindcss";

body {
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 5: Quick visual check via build**

```bash
npm run build
grep -c '\.bg-' dist/assets/index-*.css
```

Expected: positive integer (Tailwind utilities compiled in).

- [ ] **Step 6: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/package.json web/package-lock.json web/postcss.config.js web/tailwind.config.ts web/src/styles.css
git commit -m "feat(web): add Tailwind CSS"
```

---

## Task 2: Typed API client + backend types

**Files:**
- Create: `web/src/types.ts`
- Create: `web/src/api.ts`
- Create: `web/src/api.test.ts`

The `types.ts` mirrors the Pydantic schemas in `server/otter/schemas.py`. The `api.ts` is a thin typed `fetch` wrapper.

- [ ] **Step 1: Write `web/src/types.ts`**

```ts
export type LectureStatus = "transcribing" | "ready" | "failed";

export interface Segment {
  start_sec: number;
  end_sec: number;
  text: string;
}

export interface Summary {
  id: string;
  template_id: string;
  content: string;
  model: string;
  created_at: string;
}

export interface Lecture {
  id: string;
  title: string;
  created_at: string;
  duration_sec: number;
  audio_mime: string;
  status: LectureStatus;
  error: string | null;
}

export interface LectureDetail extends Lecture {
  segments: Segment[];
  summaries: Summary[];
}

export interface Template {
  id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
}

export interface SettingsView {
  whisper_model: string;
  summary_model: string;
  anthropic_key_set: boolean;
}

export interface SettingsPatch {
  whisper_model?: string;
  summary_model?: string;
  anthropic_api_key?: string;
}

export interface StatusOut {
  status: LectureStatus;
  error: string | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `web/src/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/api";

describe("api", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createLecture posts and returns id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "abc", title: "T", status: "transcribing" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const out = await api.createLecture({ title: "T" });
    expect(out.id).toBe("abc");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lectures",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError on 4xx with detail", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "lecture not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(api.getLecture("missing")).rejects.toThrow(ApiError);
  });

  it("uploadAudio sends multipart with the audio file", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "x", status: "transcribing" }), { status: 202 }),
    );
    const blob = new Blob(["hello"], { type: "audio/webm" });
    await api.uploadAudio("abc", blob);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
cd /Users/kailee/otter-clone/web
npm test -- src/api.test.ts
```

Expected: FAIL — `Cannot find module '@/api'`.

- [ ] **Step 4: Implement `web/src/api.ts`**

```ts
import type {
  Lecture,
  LectureDetail,
  SettingsPatch,
  SettingsView,
  StatusOut,
  Summary,
  Template,
} from "@/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`HTTP ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  // Lectures
  createLecture: (payload: { title?: string } = {}) =>
    request<Lecture>("/api/lectures", json("POST", payload)),
  listLectures: () => request<Lecture[]>("/api/lectures"),
  getLecture: (id: string) => request<LectureDetail>(`/api/lectures/${id}`),
  patchLecture: (id: string, payload: { title: string }) =>
    request<Lecture>(`/api/lectures/${id}`, json("PATCH", payload)),
  deleteLecture: (id: string) =>
    request<void>(`/api/lectures/${id}`, { method: "DELETE" }),
  getStatus: (id: string) => request<StatusOut>(`/api/lectures/${id}/status`),

  uploadAudio: (id: string, blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, `lecture.${blob.type.includes("webm") ? "webm" : "bin"}`);
    return request<{ id: string; status: string }>(
      `/api/lectures/${id}/audio`,
      { method: "PUT", body: form },
    );
  },

  audioUrl: (id: string) => `/api/lectures/${id}/audio`,

  // Summaries
  createSummary: (lectureId: string, templateId: string) =>
    request<Summary>(
      `/api/lectures/${lectureId}/summaries`,
      json("POST", { template_id: templateId }),
    ),
  deleteSummary: (id: string) =>
    request<void>(`/api/summaries/${id}`, { method: "DELETE" }),

  // Templates
  listTemplates: () => request<Template[]>("/api/templates"),
  createTemplate: (payload: { name: string; prompt: string; is_default?: boolean }) =>
    request<Template>("/api/templates", json("POST", payload)),
  patchTemplate: (
    id: string,
    payload: { name?: string; prompt?: string; is_default?: boolean },
  ) => request<Template>(`/api/templates/${id}`, json("PATCH", payload)),
  deleteTemplate: (id: string) =>
    request<void>(`/api/templates/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<SettingsView>("/api/settings"),
  patchSettings: (payload: SettingsPatch) =>
    request<SettingsView>("/api/settings", json("PATCH", payload)),
};
```

- [ ] **Step 5: Run to verify pass**

```bash
npm test -- src/api.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/types.ts web/src/api.ts web/src/api.test.ts
git commit -m "feat(web): add typed API client matching backend schemas"
```

---

## Task 3: Format helpers + useApi hook

**Files:**
- Create: `web/src/format.ts`
- Create: `web/src/format.test.ts`
- Create: `web/src/hooks/useApi.ts`
- Create: `web/src/hooks/useApi.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web/src/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDuration, formatTimestamp, formatDate } from "@/format";

describe("formatDuration", () => {
  it("formats seconds as H:MM:SS or MM:SS", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(125)).toBe("2:05");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("formatTimestamp", () => {
  it("formats float seconds as MM:SS", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(72.4)).toBe("01:12");
    expect(formatTimestamp(3725)).toBe("62:05");
  });
});

describe("formatDate", () => {
  it("returns a localized date string", () => {
    const out = formatDate("2026-05-09T14:00:00Z");
    expect(out).toContain("2026");
  });
});
```

Create `web/src/hooks/useApi.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useApi } from "@/hooks/useApi";

describe("useApi", () => {
  it("starts loading then resolves data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 42 });
    const { result } = renderHook(() => useApi(fetcher));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 42 });
    expect(result.current.error).toBeNull();
  });

  it("captures errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
  });

  it("refetches when refresh is called", async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    fetcher.mockResolvedValue({ n: 2 });
    await result.current.refresh();
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/format.test.ts src/hooks/useApi.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `web/src/format.ts`**

```ts
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.floor(Math.max(0, seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad(m)}:${pad(sec)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
```

- [ ] **Step 4: Implement `web/src/hooks/useApi.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ...deps]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 5: Run to verify pass**

```bash
npm test
```

Expected: all tests pass (api + format + useApi).

- [ ] **Step 6: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/format.ts web/src/format.test.ts web/src/hooks/useApi.ts web/src/hooks/useApi.test.tsx
git commit -m "feat(web): add format helpers and useApi hook"
```

---

## Task 4: Layout, routing, and four empty page shells

**Files:**
- Create: `web/src/components/Layout.tsx`
- Create: `web/src/components/Layout.test.tsx`
- Create: `web/src/pages/RecorderPage.tsx`
- Create: `web/src/pages/LectureListPage.tsx`
- Create: `web/src/pages/LectureViewPage.tsx`
- Create: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/Layout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Layout from "@/components/Layout";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renders nav links", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: /record/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /lectures/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("renders the route's content via outlet", () => {
    renderAt("/anywhere");
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/components/Layout.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/components/Layout.tsx`**

```tsx
import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  const linkBase =
    "px-3 py-2 rounded text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-800";
  const active = "bg-slate-900 text-white hover:bg-slate-900";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="font-semibold mr-4">Otter</span>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}
          >
            Record
          </NavLink>
          <NavLink
            to="/lectures"
            className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}
          >
            Lectures
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}
          >
            Settings
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full p-4">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Create the four page shells**

`web/src/pages/RecorderPage.tsx`:

```tsx
export default function RecorderPage() {
  return <h2 className="text-xl font-semibold">Record a lecture</h2>;
}
```

`web/src/pages/LectureListPage.tsx`:

```tsx
export default function LectureListPage() {
  return <h2 className="text-xl font-semibold">Lectures</h2>;
}
```

`web/src/pages/LectureViewPage.tsx`:

```tsx
import { useParams } from "react-router-dom";

export default function LectureViewPage() {
  const { id } = useParams<{ id: string }>();
  return <h2 className="text-xl font-semibold">Lecture {id}</h2>;
}
```

`web/src/pages/SettingsPage.tsx`:

```tsx
export default function SettingsPage() {
  return <h2 className="text-xl font-semibold">Settings</h2>;
}
```

- [ ] **Step 5: Wire routes in `web/src/App.tsx`**

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import RecorderPage from "@/pages/RecorderPage";
import LectureListPage from "@/pages/LectureListPage";
import LectureViewPage from "@/pages/LectureViewPage";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RecorderPage />} />
          <Route path="lectures" element={<LectureListPage />} />
          <Route path="lectures/:id" element={<LectureViewPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all pass (layout test included).

- [ ] **Step 7: Smoke-test in dev**

Start the backend and frontend in two shells. From the project root:

```bash
./scripts/dev-server.sh &
BACK_PID=$!
cd web && npm run dev &
FRONT_PID=$!
sleep 5
curl -s http://127.0.0.1:5173/ | grep -c '<div id="root">'
curl -s http://127.0.0.1:5173/api/health
kill $BACK_PID $FRONT_PID
```

Expected: index HTML has root, `/api/health` returns `{"status":"ok"}` (proxied).

- [ ] **Step 8: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src
git commit -m "feat(web): add Layout, routing, and page shells"
```

---

## Task 5: Settings page (key + Whisper model)

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`
- Create: `web/src/pages/SettingsPage.test.tsx`

This task implements the settings form for Anthropic API key, Whisper model, and summary model. Templates CRUD goes in Task 12.

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/SettingsPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import SettingsPage from "@/pages/SettingsPage";

describe("SettingsPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("loads current settings on mount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        whisper_model: "large-v3",
        summary_model: "claude-opus-4-7",
        anthropic_key_set: true,
      }),
    );
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/key is configured/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/whisper model/i)).toHaveValue("large-v3");
  });

  it("submits a new key and shows confirmation", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          whisper_model: "large-v3",
          summary_model: "claude-opus-4-7",
          anthropic_key_set: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          whisper_model: "large-v3",
          summary_model: "claude-opus-4-7",
          anthropic_key_set: true,
        }),
      );

    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no key configured/i)).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-x");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText(/key is configured/i)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[1]).toMatchObject({ method: "PATCH" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/pages/SettingsPage.test.tsx
```

Expected: FAIL — current SettingsPage is a stub.

- [ ] **Step 3: Replace `web/src/pages/SettingsPage.tsx`**

```tsx
import { useState } from "react";
import { api, ApiError } from "@/api";
import { useApi } from "@/hooks/useApi";

const WHISPER_MODELS = [
  "large-v3",
  "medium",
  "small",
  "distil-large-v3",
  "tiny",
];

const SUMMARY_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export default function SettingsPage() {
  const settings = useApi(() => api.getSettings(), []);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function patchAndRefresh(payload: Parameters<typeof api.patchSettings>[0]) {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patchSettings(payload);
      await settings.refresh();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (settings.loading) return <p>Loading…</p>;
  if (settings.error || !settings.data) {
    return <p className="text-red-700">Failed to load settings.</p>;
  }

  const cfg = settings.data;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      <section className="space-y-2">
        <h3 className="font-medium">Anthropic API key</h3>
        <p className="text-sm text-slate-600">
          {cfg.anthropic_key_set ? "Key is configured." : "No key configured."}
        </p>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!keyInput) return;
            await patchAndRefresh({ anthropic_api_key: keyInput });
            setKeyInput("");
          }}
        >
          <label className="sr-only" htmlFor="api-key">
            Anthropic API key
          </label>
          <input
            id="api-key"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-…"
            className="flex-1 px-3 py-2 border rounded"
          />
          <button
            type="submit"
            disabled={saving || !keyInput}
            className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Models</h3>
        <label className="block">
          <span className="text-sm">Whisper model</span>
          <select
            aria-label="Whisper model"
            value={cfg.whisper_model}
            onChange={(e) => patchAndRefresh({ whisper_model: e.target.value })}
            disabled={saving}
            className="mt-1 block w-64 px-3 py-2 border rounded"
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm">Summary model (Claude)</span>
          <select
            aria-label="Summary model"
            value={cfg.summary_model}
            onChange={(e) => patchAndRefresh({ summary_model: e.target.value })}
            disabled={saving}
            className="mt-1 block w-64 px-3 py-2 border rounded"
          >
            {SUMMARY_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </section>

      {saveError && <p className="text-red-700 text-sm">{saveError}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/pages/SettingsPage.tsx web/src/pages/SettingsPage.test.tsx
git commit -m "feat(web): settings page with API key and model selectors"
```

---

## Task 6: Lecture list page

**Files:**
- Modify: `web/src/pages/LectureListPage.tsx`
- Create: `web/src/pages/LectureListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/LectureListPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import LectureListPage from "@/pages/LectureListPage";

describe("LectureListPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows an empty state when there are no lectures", async () => {
    fetchMock.mockResolvedValue(
      new Response("[]", { headers: { "content-type": "application/json" } }),
    );
    render(<MemoryRouter><LectureListPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByText(/no lectures yet/i)).toBeInTheDocument(),
    );
  });

  it("renders rows with title, date, duration, and link", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "abc",
            title: "Calc 101",
            created_at: "2026-05-09T12:00:00Z",
            duration_sec: 125,
            audio_mime: "audio/webm",
            status: "ready",
            error: null,
          },
        ]),
        { headers: { "content-type": "application/json" } },
      ),
    );
    render(<MemoryRouter><LectureListPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByText("Calc 101")).toBeInTheDocument(),
    );
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Calc 101/i })).toHaveAttribute(
      "href",
      "/lectures/abc",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/pages/LectureListPage.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Replace `web/src/pages/LectureListPage.tsx`**

```tsx
import { Link } from "react-router-dom";
import { api } from "@/api";
import { useApi } from "@/hooks/useApi";
import { formatDate, formatDuration } from "@/format";

export default function LectureListPage() {
  const { data, loading, error } = useApi(() => api.listLectures(), []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="text-red-700">Failed to load lectures.</p>;
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-600">
        <p>No lectures yet. Hit Record to start your first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Lectures</h2>
      <ul className="divide-y divide-slate-200 border border-slate-200 rounded bg-white">
        {data.map((l) => (
          <li key={l.id} className="p-3">
            <Link
              to={`/lectures/${l.id}`}
              className="flex items-center justify-between hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{l.title}</div>
                <div className="text-sm text-slate-600">
                  {formatDate(l.created_at)} · {formatDuration(l.duration_sec)} ·{" "}
                  <span
                    className={
                      l.status === "ready"
                        ? "text-emerald-700"
                        : l.status === "failed"
                          ? "text-red-700"
                          : "text-amber-700"
                    }
                  >
                    {l.status}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/pages/LectureListPage.tsx web/src/pages/LectureListPage.test.tsx
git commit -m "feat(web): lecture list page with empty state"
```

---

## Task 7: Recorder state machine + button (no real capture yet)

**Files:**
- Create: `web/src/hooks/useRecorder.ts`
- Create: `web/src/hooks/useRecorder.test.ts`

This task implements the state machine **only**. The actual `getDisplayMedia` integration is in Task 8.

States: `idle` → `requesting` → `recording` → `stopping` → `stopped` (with `blob`). On error, transitions to `error` from any state.

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/useRecorder.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRecorder } from "@/hooks/useRecorder";

class FakeRecorder {
  start = () => {
    queueMicrotask(() => this.onstart?.());
  };
  stop = () => {
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
      this.onstop?.();
    });
  };
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  state = "inactive";
}

describe("useRecorder", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useRecorder());
    expect(result.current.state).toBe("idle");
    expect(result.current.blob).toBeNull();
  });

  it("transitions through requesting → recording → stopped with a blob", async () => {
    const fakeStream = { getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream;
    const fakeRecorder = new FakeRecorder();
    const { result } = renderHook(() =>
      useRecorder({
        getStream: async () => fakeStream,
        makeRecorder: () => fakeRecorder as unknown as MediaRecorder,
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.state).toBe("stopped");
    expect(result.current.blob).toBeInstanceOf(Blob);
  });

  it("goes to error when getStream rejects", async () => {
    const { result } = renderHook(() =>
      useRecorder({
        getStream: async () => {
          throw new Error("user denied");
        },
        makeRecorder: () => ({}) as MediaRecorder,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toContain("user denied");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/hooks/useRecorder.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `web/src/hooks/useRecorder.ts`**

```ts
import { useCallback, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "stopped"
  | "error";

interface RecorderDeps {
  getStream: () => Promise<MediaStream>;
  makeRecorder: (stream: MediaStream) => MediaRecorder;
}

const defaultDeps: RecorderDeps = {
  getStream: () =>
    navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }),
  makeRecorder: (stream) =>
    new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" }),
};

export function useRecorder(deps: RecorderDeps = defaultDeps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setState("requesting");
    setError(null);
    setBlob(null);
    chunksRef.current = [];
    try {
      const stream = await deps.getStream();
      // We only want the audio track
      stream.getVideoTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const recorder = deps.makeRecorder(audioOnly);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstart = () => setState("recording");
      recorder.onstop = () => {
        const merged = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(merged);
        setState("stopped");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorder.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [deps]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    setState("stopping");
    recorderRef.current?.stop();
  }, [state]);

  const reset = useCallback(() => {
    setState("idle");
    setBlob(null);
    setError(null);
  }, []);

  return { state, blob, error, start, stop, reset };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/hooks/useRecorder.ts web/src/hooks/useRecorder.test.ts
git commit -m "feat(web): useRecorder state machine"
```

---

## Task 8: Recorder page UI + upload-on-stop

**Files:**
- Modify: `web/src/pages/RecorderPage.tsx`
- Create: `web/src/pages/RecorderPage.test.tsx`

This task wires the `useRecorder` hook into a page. On stop, the page creates a lecture, uploads the blob, and navigates to the lecture view.

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/RecorderPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import RecorderPage from "@/pages/RecorderPage";

class FakeRecorder {
  start = () => queueMicrotask(() => this.onstart?.());
  stop = () => {
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
      this.onstop?.();
    });
  };
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  state = "inactive";
}

describe("RecorderPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    // Provide a fake getDisplayMedia
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: () => undefined }],
          getAudioTracks: () => [{ stop: () => undefined }],
          getVideoTracks: () => [{ stop: () => undefined }],
        })),
      },
    });
    // Replace MediaRecorder global
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      vi.fn(() => new FakeRecorder());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates a lecture and uploads when stopped", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "lec-1",
            title: "T",
            status: "transcribing",
            created_at: "",
            duration_sec: 0,
            audio_mime: "",
            error: null,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "lec-1", status: "transcribing" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
      );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RecorderPage />} />
          <Route path="/lectures/:id" element={<div>VIEW {/* placeholder */}</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /^record$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lectures",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lectures/lec-1/audio",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/pages/RecorderPage.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Replace `web/src/pages/RecorderPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api";
import { useRecorder } from "@/hooks/useRecorder";

export default function RecorderPage() {
  const recorder = useRecorder();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (recorder.state !== "stopped" || !recorder.blob || uploading) return;
    setUploading(true);
    setUploadError(null);
    void (async () => {
      try {
        const lecture = await api.createLecture({});
        await api.uploadAudio(lecture.id, recorder.blob!);
        navigate(`/lectures/${lecture.id}`);
      } catch (err) {
        setUploadError(err instanceof ApiError ? err.detail : String(err));
      } finally {
        setUploading(false);
      }
    })();
  }, [recorder.state, recorder.blob, uploading, navigate]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Record a lecture</h2>
      <p className="text-sm text-slate-600">
        Click <strong>Record</strong>, then choose the browser tab playing your lecture
        (and check &ldquo;Share tab audio&rdquo;).
      </p>

      <div className="flex items-center gap-3">
        {recorder.state === "idle" || recorder.state === "error" ? (
          <button
            onClick={recorder.start}
            className="px-5 py-3 bg-red-600 text-white rounded-full font-semibold"
          >
            Record
          </button>
        ) : null}

        {recorder.state === "requesting" && <p>Waiting for tab share…</p>}

        {recorder.state === "recording" && (
          <button
            onClick={recorder.stop}
            className="px-5 py-3 bg-slate-900 text-white rounded-full font-semibold"
          >
            Stop
          </button>
        )}

        {(recorder.state === "stopping" || uploading) && <p>Uploading…</p>}
      </div>

      {recorder.error && (
        <p className="text-red-700 text-sm">Recording error: {recorder.error}</p>
      )}
      {uploadError && (
        <p className="text-red-700 text-sm">Upload error: {uploadError}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/pages/RecorderPage.tsx web/src/pages/RecorderPage.test.tsx
git commit -m "feat(web): recorder page with create+upload-on-stop flow"
```

---

## Task 9: Status polling hook

**Files:**
- Create: `web/src/hooks/useStatusPoll.ts`
- Create: `web/src/hooks/useStatusPoll.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/useStatusPoll.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStatusPoll } from "@/hooks/useStatusPoll";

describe("useStatusPoll", () => {
  it("fetches status repeatedly until ready", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchStatus = vi.fn(async () => {
      n += 1;
      return { status: n < 3 ? ("transcribing" as const) : ("ready" as const), error: null };
    });

    const { result } = renderHook(() =>
      useStatusPoll({ fetcher: fetchStatus, intervalMs: 100, enabled: true }),
    );

    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Should stop polling once ready
    const callsAtReady = fetchStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchStatus.mock.calls.length).toBe(callsAtReady);
    vi.useRealTimers();
  });

  it("does not poll when disabled", async () => {
    vi.useFakeTimers();
    const fetchStatus = vi.fn();
    renderHook(() =>
      useStatusPoll({ fetcher: fetchStatus, intervalMs: 100, enabled: false }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchStatus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/hooks/useStatusPoll.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `web/src/hooks/useStatusPoll.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import type { StatusOut } from "@/types";

interface Options {
  fetcher: () => Promise<StatusOut>;
  intervalMs: number;
  enabled: boolean;
}

export function useStatusPoll({ fetcher, intervalMs, enabled }: Options) {
  const [status, setStatus] = useState<StatusOut["status"]>("transcribing");
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const out = await fetcherRef.current();
        if (cancelled) return;
        setStatus(out.status);
        setError(out.error);
        if (out.status === "ready" || out.status === "failed") return;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
      timer = setTimeout(tick, intervalMs);
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs]);

  return { status, error };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/hooks/useStatusPoll.ts web/src/hooks/useStatusPoll.test.ts
git commit -m "feat(web): useStatusPoll hook"
```

---

## Task 10: AudioPlayer + TranscriptView (no sync yet)

**Files:**
- Create: `web/src/components/AudioPlayer.tsx`
- Create: `web/src/components/AudioPlayer.test.tsx`
- Create: `web/src/components/TranscriptView.tsx`
- Create: `web/src/components/TranscriptView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/AudioPlayer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRef } from "react";
import AudioPlayer from "@/components/AudioPlayer";

describe("AudioPlayer", () => {
  it("renders an audio element with the source", () => {
    render(<AudioPlayer src="/api/lectures/abc/audio" />);
    const audio = screen.getByTestId("audio") as HTMLAudioElement;
    expect(audio.src).toContain("/api/lectures/abc/audio");
    expect(audio).toHaveAttribute("controls");
  });

  it("forwards a ref to the underlying audio element", () => {
    const ref = createRef<HTMLAudioElement>();
    render(<AudioPlayer src="/x" audioRef={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLAudioElement);
  });
});
```

Create `web/src/components/TranscriptView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TranscriptView from "@/components/TranscriptView";

const segs = [
  { start_sec: 0, end_sec: 2, text: "Hello." },
  { start_sec: 2, end_sec: 5, text: "World." },
];

describe("TranscriptView", () => {
  it("renders one row per segment with formatted timestamp", () => {
    render(<TranscriptView segments={segs} activeIndex={null} onSeek={vi.fn()} />);
    expect(screen.getByText("Hello.")).toBeInTheDocument();
    expect(screen.getByText("World.")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("00:02")).toBeInTheDocument();
  });

  it("highlights the active segment", () => {
    render(<TranscriptView segments={segs} activeIndex={1} onSeek={vi.fn()} />);
    const active = screen.getByText("World.").closest("[data-active]");
    expect(active).toHaveAttribute("data-active", "true");
  });

  it("calls onSeek with the segment's start when clicked", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    render(<TranscriptView segments={segs} activeIndex={null} onSeek={onSeek} />);
    await user.click(screen.getByText("World."));
    expect(onSeek).toHaveBeenCalledWith(2);
  });

  it("shows empty state when there are no segments", () => {
    render(<TranscriptView segments={[]} activeIndex={null} onSeek={vi.fn()} />);
    expect(screen.getByText(/no transcript yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/components/AudioPlayer.test.tsx src/components/TranscriptView.test.tsx
```

Expected: FAIL — components missing.

- [ ] **Step 3: Implement `web/src/components/AudioPlayer.tsx`**

```tsx
import type { Ref } from "react";

interface Props {
  src: string;
  audioRef?: Ref<HTMLAudioElement>;
}

export default function AudioPlayer({ src, audioRef }: Props) {
  return (
    <audio
      data-testid="audio"
      ref={audioRef}
      src={src}
      controls
      preload="metadata"
      className="w-full"
    />
  );
}
```

- [ ] **Step 4: Implement `web/src/components/TranscriptView.tsx`**

```tsx
import { useEffect, useRef } from "react";
import type { Segment } from "@/types";
import { formatTimestamp } from "@/format";

interface Props {
  segments: Segment[];
  activeIndex: number | null;
  onSeek: (sec: number) => void;
}

export default function TranscriptView({ segments, activeIndex, onSeek }: Props) {
  const containerRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (activeIndex == null) return;
    const el = itemRefs.current[activeIndex];
    if (!el || !containerRef.current) return;
    const c = containerRef.current.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (e.top < c.top || e.bottom > c.bottom) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  if (segments.length === 0) {
    return (
      <div className="text-slate-600 italic p-4">No transcript yet.</div>
    );
  }

  return (
    <ol
      ref={containerRef}
      className="space-y-1 max-h-[60vh] overflow-y-auto pr-2"
    >
      {segments.map((s, i) => {
        const isActive = i === activeIndex;
        return (
          <li
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            data-active={isActive ? "true" : "false"}
            onClick={() => onSeek(s.start_sec)}
            className={`flex gap-3 px-3 py-1.5 rounded cursor-pointer ${
              isActive ? "bg-amber-100" : "hover:bg-slate-100"
            }`}
          >
            <span className="text-xs font-mono text-slate-500 w-12 shrink-0 pt-0.5">
              {formatTimestamp(s.start_sec)}
            </span>
            <span className="text-sm">{s.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/components
git commit -m "feat(web): AudioPlayer and TranscriptView components"
```

---

## Task 11: Audio↔transcript sync hook

**Files:**
- Create: `web/src/hooks/useAudioSync.ts`
- Create: `web/src/hooks/useAudioSync.test.tsx`

This hook takes a ref to an `<audio>` element and a list of segments, returns the index of the currently-playing segment, and exposes a `seek(sec)` function.

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/useAudioSync.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRef } from "react";
import { useAudioSync } from "@/hooks/useAudioSync";
import type { Segment } from "@/types";

const segs: Segment[] = [
  { start_sec: 0, end_sec: 2, text: "a" },
  { start_sec: 2, end_sec: 5, text: "b" },
  { start_sec: 5, end_sec: 8, text: "c" },
];

interface Captured {
  active: number | null;
  seek: (sec: number) => void;
}

function Probe({ onSync }: { onSync: (c: Captured) => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const sync = useAudioSync(ref, segs);
  onSync({ active: sync.activeIndex, seek: sync.seek });
  return <audio ref={ref} data-testid="a" />;
}

describe("useAudioSync", () => {
  it("returns the segment whose [start, end) contains currentTime", () => {
    let captured: Captured = { active: null, seek: () => {} };
    const { container } = render(<Probe onSync={(c) => (captured = c)} />);
    const audio = container.querySelector("audio")!;
    expect(captured.active).toBeNull();

    act(() => {
      Object.defineProperty(audio, "currentTime", { value: 3, configurable: true });
      audio.dispatchEvent(new Event("timeupdate"));
    });
    expect(captured.active).toBe(1);

    act(() => {
      Object.defineProperty(audio, "currentTime", { value: 6, configurable: true });
      audio.dispatchEvent(new Event("timeupdate"));
    });
    expect(captured.active).toBe(2);
  });

  it("seek sets currentTime and starts playback", () => {
    let captured: Captured = { active: null, seek: () => {} };
    const { container } = render(<Probe onSync={(c) => (captured = c)} />);
    const audio = container.querySelector("audio")!;
    let played = false;
    audio.play = () => {
      played = true;
      return Promise.resolve();
    };
    act(() => {
      captured.seek(4);
    });
    expect(audio.currentTime).toBe(4);
    expect(played).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/hooks/useAudioSync.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `web/src/hooks/useAudioSync.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { Segment } from "@/types";

function findSegment(segments: Segment[], t: number): number | null {
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (t >= s.start_sec && t < s.end_sec) return i;
  }
  return null;
}

export function useAudioSync(
  audioRef: RefObject<HTMLAudioElement | null>,
  segments: Segment[],
) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setActiveIndex(findSegment(segments, audio.currentTime));
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [audioRef, segments]);

  const seek = useCallback(
    (sec: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = sec;
      void audio.play();
    },
    [audioRef],
  );

  return { activeIndex, seek };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/hooks/useAudioSync.ts web/src/hooks/useAudioSync.test.tsx
git commit -m "feat(web): useAudioSync hook for transcript-audio synchronization"
```

---

## Task 12: SummariesPanel component

**Files:**
- Create: `web/src/components/SummariesPanel.tsx`
- Create: `web/src/components/SummariesPanel.test.tsx`

The panel shows existing summaries (one per template), lets the user pick a template to regenerate or generate fresh, and renders markdown content as plain pre-formatted text (a real markdown renderer is out of v1 scope).

- [ ] **Step 1: Write the failing test**

Create `web/src/components/SummariesPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SummariesPanel from "@/components/SummariesPanel";
import type { Summary, Template } from "@/types";

const templates: Template[] = [
  { id: "t1", name: "Study Guide", prompt: "{transcript}", is_default: true, created_at: "" },
  { id: "t2", name: "Outline", prompt: "{transcript}", is_default: true, created_at: "" },
  { id: "t3", name: "Anki", prompt: "{transcript}", is_default: false, created_at: "" },
];
const summaries: Summary[] = [
  { id: "s1", template_id: "t1", content: "# notes A", model: "claude-opus-4-7", created_at: "" },
];

describe("SummariesPanel", () => {
  it("renders an existing summary by template name", () => {
    render(
      <SummariesPanel
        summaries={summaries}
        templates={templates}
        anthropicKeySet
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Study Guide")).toBeInTheDocument();
    expect(screen.getByText(/# notes A/)).toBeInTheDocument();
  });

  it("calls onGenerate when a template is selected and Generate is clicked", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <SummariesPanel
        summaries={summaries}
        templates={templates}
        anthropicKeySet
        onGenerate={onGenerate}
        onDelete={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/generate from template/i);
    await user.selectOptions(select, "t3");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));
    expect(onGenerate).toHaveBeenCalledWith("t3");
  });

  it("shows a hint when the Anthropic key is missing", () => {
    render(
      <SummariesPanel
        summaries={[]}
        templates={templates}
        anthropicKeySet={false}
        onGenerate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/add an anthropic api key/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/components/SummariesPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `web/src/components/SummariesPanel.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Summary, Template } from "@/types";

interface Props {
  summaries: Summary[];
  templates: Template[];
  anthropicKeySet: boolean;
  onGenerate: (templateId: string) => Promise<void> | void;
  onDelete: (summaryId: string) => Promise<void> | void;
}

export default function SummariesPanel({
  summaries,
  templates,
  anthropicKeySet,
  onGenerate,
  onDelete,
}: Props) {
  const [selected, setSelected] = useState<string>(templates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  if (!anthropicKeySet) {
    return (
      <div className="border border-slate-200 rounded p-4 bg-slate-50 text-sm">
        Add an Anthropic API key in{" "}
        <Link to="/settings" className="underline">
          Settings
        </Link>{" "}
        to generate summaries.
      </div>
    );
  }

  const tplById = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      {summaries.map((s) => (
        <article key={s.id} className="border border-slate-200 rounded">
          <header className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
            <h3 className="font-medium">{tplById.get(s.template_id)?.name ?? "Summary"}</h3>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onGenerate(s.template_id);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="text-sm px-2 py-1 border rounded"
              >
                Regenerate
              </button>
              <button
                onClick={() => onDelete(s.id)}
                className="text-sm px-2 py-1 border rounded text-red-700"
              >
                Delete
              </button>
            </div>
          </header>
          <pre className="whitespace-pre-wrap p-3 text-sm">{s.content}</pre>
        </article>
      ))}

      <div className="border border-dashed border-slate-300 rounded p-3 flex items-end gap-2">
        <label className="flex-1">
          <span className="text-sm">Generate from template</span>
          <select
            aria-label="Generate from template"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={async () => {
            if (!selected) return;
            setBusy(true);
            try {
              await onGenerate(selected);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !selected}
          className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50"
        >
          Generate
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/components/SummariesPanel.tsx web/src/components/SummariesPanel.test.tsx
git commit -m "feat(web): SummariesPanel component"
```

---

## Task 13: Lecture view page (compose audio + transcript + summaries)

**Files:**
- Modify: `web/src/pages/LectureViewPage.tsx`
- Create: `web/src/pages/LectureViewPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/LectureViewPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import LectureViewPage from "@/pages/LectureViewPage";

describe("LectureViewPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  }

  it("shows transcribing state while not ready", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/status")) {
        return jsonResponse({ status: "transcribing", error: null });
      }
      if (url.endsWith("/api/templates")) return jsonResponse([]);
      if (url.endsWith("/api/settings"))
        return jsonResponse({
          whisper_model: "x",
          summary_model: "y",
          anthropic_key_set: false,
        });
      return jsonResponse({
        id: "abc",
        title: "T",
        created_at: "2026-05-09T12:00:00Z",
        duration_sec: 0,
        audio_mime: "audio/webm",
        status: "transcribing",
        error: null,
        segments: [],
        summaries: [],
      });
    });

    render(
      <MemoryRouter initialEntries={["/lectures/abc"]}>
        <Routes>
          <Route path="/lectures/:id" element={<LectureViewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/transcribing/i)).toBeInTheDocument(),
    );
  });

  it("renders transcript and summaries when ready", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/status"))
        return jsonResponse({ status: "ready", error: null });
      if (url.endsWith("/api/templates"))
        return jsonResponse([
          {
            id: "t1",
            name: "Study Guide",
            prompt: "{transcript}",
            is_default: true,
            created_at: "",
          },
        ]);
      if (url.endsWith("/api/settings"))
        return jsonResponse({
          whisper_model: "x",
          summary_model: "y",
          anthropic_key_set: true,
        });
      return jsonResponse({
        id: "abc",
        title: "T",
        created_at: "2026-05-09T12:00:00Z",
        duration_sec: 5,
        audio_mime: "audio/webm",
        status: "ready",
        error: null,
        segments: [{ start_sec: 0, end_sec: 5, text: "Hello world." }],
        summaries: [
          {
            id: "s1",
            template_id: "t1",
            content: "# notes",
            model: "claude-opus-4-7",
            created_at: "",
          },
        ],
      });
    });

    render(
      <MemoryRouter initialEntries={["/lectures/abc"]}>
        <Routes>
          <Route path="/lectures/:id" element={<LectureViewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Hello world.")).toBeInTheDocument());
    expect(screen.getByText("Study Guide")).toBeInTheDocument();
    expect(screen.getByText(/# notes/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/pages/LectureViewPage.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Replace `web/src/pages/LectureViewPage.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "@/api";
import { useApi } from "@/hooks/useApi";
import { useStatusPoll } from "@/hooks/useStatusPoll";
import { useAudioSync } from "@/hooks/useAudioSync";
import AudioPlayer from "@/components/AudioPlayer";
import TranscriptView from "@/components/TranscriptView";
import SummariesPanel from "@/components/SummariesPanel";
import { formatDate, formatDuration } from "@/format";

export default function LectureViewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const lecture = useApi(() => api.getLecture(id), [id]);
  const templates = useApi(() => api.listTemplates(), []);
  const settings = useApi(() => api.getSettings(), []);

  const isTranscribing = lecture.data?.status === "transcribing";
  const poll = useStatusPoll({
    fetcher: () => api.getStatus(id),
    intervalMs: 2000,
    enabled: isTranscribing,
  });

  // When polling flips to ready or failed, refetch the lecture detail
  useEffect(() => {
    if (poll.status === "ready" || poll.status === "failed") {
      void lecture.refresh();
    }
  }, [poll.status, lecture]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const segments = lecture.data?.segments ?? [];
  const sync = useAudioSync(audioRef, segments);

  if (lecture.loading) return <p>Loading…</p>;
  if (lecture.error || !lecture.data) {
    const detail = lecture.error instanceof ApiError ? lecture.error.detail : "";
    return <p className="text-red-700">Failed to load lecture. {detail}</p>;
  }

  const l = lecture.data;
  const status = poll.status === "transcribing" && !isTranscribing ? l.status : poll.status;

  async function regenerateOrCreate(templateId: string) {
    await api.createSummary(id, templateId);
    await lecture.refresh();
  }

  async function deleteSummary(summaryId: string) {
    await api.deleteSummary(summaryId);
    await lecture.refresh();
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{l.title}</h2>
        <p className="text-sm text-slate-600">
          {formatDate(l.created_at)} · {formatDuration(l.duration_sec)} ·{" "}
          <span
            className={
              status === "ready"
                ? "text-emerald-700"
                : status === "failed"
                  ? "text-red-700"
                  : "text-amber-700"
            }
          >
            {status}
          </span>
        </p>
        {status === "failed" && l.error && (
          <p className="text-red-700 text-sm">Error: {l.error}</p>
        )}
      </header>

      {status === "transcribing" ? (
        <div className="border border-slate-200 rounded p-6 text-center text-slate-600">
          Transcribing… this may take a minute or two.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section>
            <TranscriptView
              segments={segments}
              activeIndex={sync.activeIndex}
              onSeek={sync.seek}
            />
            <div className="mt-2">
              <AudioPlayer src={api.audioUrl(id)} audioRef={audioRef} />
            </div>
          </section>
          <section>
            <SummariesPanel
              summaries={l.summaries}
              templates={templates.data ?? []}
              anthropicKeySet={settings.data?.anthropic_key_set ?? false}
              onGenerate={regenerateOrCreate}
              onDelete={deleteSummary}
            />
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/pages/LectureViewPage.tsx web/src/pages/LectureViewPage.test.tsx
git commit -m "feat(web): lecture view page composing audio, transcript, summaries"
```

---

## Task 14: Templates editor in Settings + serve SPA from FastAPI

**Files:**
- Create: `web/src/components/TemplateEditor.tsx`
- Modify: `web/src/pages/SettingsPage.tsx`
- Modify: `server/otter/main.py`
- Modify: `server/tests/test_health.py` (or new test file)

This task adds:
1. A simple templates editor (list, create, edit prompt + is_default, delete) in the Settings page.
2. A small backend change so FastAPI serves the built SPA from `web/dist/` in production.

- [ ] **Step 1: Add the TemplateEditor component**

Create `web/src/components/TemplateEditor.tsx`:

```tsx
import { useState } from "react";
import { api, ApiError } from "@/api";
import type { Template } from "@/types";

interface Props {
  templates: Template[];
  onChanged: () => Promise<void> | void;
}

export default function TemplateEditor({ templates, onChanged }: Props) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withErrorBoundary(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Summary templates</h3>

      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="border border-slate-200 rounded p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <strong>{t.name}</strong>
              <div className="flex gap-2">
                <label className="text-sm flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={t.is_default}
                    onChange={(e) =>
                      withErrorBoundary(async () => {
                        await api.patchTemplate(t.id, { is_default: e.target.checked });
                        await onChanged();
                      })
                    }
                  />
                  default
                </label>
                <button
                  onClick={() =>
                    withErrorBoundary(async () => {
                      await api.deleteTemplate(t.id);
                      await onChanged();
                    })
                  }
                  className="text-sm px-2 py-1 border rounded text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
            <textarea
              defaultValue={t.prompt}
              rows={4}
              className="w-full text-xs font-mono p-2 border rounded"
              onBlur={(e) =>
                e.target.value !== t.prompt &&
                withErrorBoundary(async () => {
                  await api.patchTemplate(t.id, { prompt: e.target.value });
                  await onChanged();
                })
              }
            />
          </li>
        ))}
      </ul>

      <form
        className="border border-dashed border-slate-300 rounded p-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name || !prompt) return;
          void withErrorBoundary(async () => {
            await api.createTemplate({ name, prompt, is_default: isDefault });
            setName("");
            setPrompt("");
            setIsDefault(false);
            await onChanged();
          });
        }}
      >
        <h4 className="font-medium text-sm">New template</h4>
        <input
          aria-label="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anki cards"
          className="w-full px-3 py-2 border rounded"
        />
        <textarea
          aria-label="Template prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Make Anki flashcards from {transcript}"
          className="w-full text-xs font-mono p-2 border rounded"
        />
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          run automatically on every lecture
        </label>
        <button
          type="submit"
          className="px-4 py-2 bg-slate-900 text-white rounded"
          disabled={!name || !prompt}
        >
          Create
        </button>
      </form>

      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add the editor to SettingsPage**

Edit `web/src/pages/SettingsPage.tsx` — add the import and a new section at the bottom of the JSX (before `{saveError &&`):

```tsx
import TemplateEditor from "@/components/TemplateEditor";
// ... existing imports ...
```

Inside the component (above the early-return for loading), add:

```tsx
const templates = useApi(() => api.listTemplates(), []);
```

Then in the JSX, insert this block after the `<section>` with model selectors and before the `{saveError && …}` line:

```tsx
<section className="space-y-2">
  {templates.data && (
    <TemplateEditor
      templates={templates.data}
      onChanged={async () => {
        await templates.refresh();
      }}
    />
  )}
</section>
```

- [ ] **Step 3: Backend — serve SPA from FastAPI**

Edit `server/otter/main.py` — replace `create_app` with this version that mounts the built SPA when `web/dist/` exists. The code remains a no-op in dev (Vite serves the SPA on its own port).

```python
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from otter.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"


def create_app() -> FastAPI:
    from otter.api import (
        audio,
        lectures,
        settings,
        status as status_router,
        summaries,
        templates,
    )

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)
    app.include_router(status_router.router)
    app.include_router(settings.router)
    app.include_router(templates.router)
    app.include_router(summaries.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    if WEB_DIST.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=WEB_DIST / "assets"),
            name="assets",
        )

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str) -> FileResponse:
            del full_path  # path captured for catch-all; index.html handles client routing
            return FileResponse(WEB_DIST / "index.html")

    return app


app = create_app()
```

- [ ] **Step 4: Verify backend tests still pass**

```bash
cd /Users/kailee/otter-clone/server
uv run pytest -v
```

Expected: 44 passed, 1 deselected (no new tests, but the lifecycle and `/api/health` route are unchanged).

- [ ] **Step 5: Verify frontend tests still pass**

```bash
cd /Users/kailee/otter-clone/web
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/kailee/otter-clone
git add web/src/components/TemplateEditor.tsx web/src/pages/SettingsPage.tsx server/otter/main.py
git commit -m "feat(web): templates editor in Settings; serve SPA from FastAPI in prod"
```

---

## Task 15: Production start script + smoke test

**Files:**
- Create: `scripts/start.sh`
- Modify: `README.md`

- [ ] **Step 1: Write the production start script**

Create `/Users/kailee/otter-clone/scripts/start.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Building web/"
( cd web && npm install --no-fund --no-audit && npm run build )

echo "→ Starting server on http://127.0.0.1:8000"
exec uv --project server run uvicorn otter.main:app --host 127.0.0.1 --port 8000
```

```bash
chmod +x /Users/kailee/otter-clone/scripts/start.sh
```

- [ ] **Step 2: Smoke-test prod mode**

```bash
cd /Users/kailee/otter-clone
./scripts/start.sh &
SERVER_PID=$!
sleep 8
curl -s http://127.0.0.1:8000/api/health
echo
curl -s http://127.0.0.1:8000/ | grep -c '<div id="root">'
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
```

Expected: `/api/health` returns `{"status":"ok"}`; `/` returns the built SPA HTML.

- [ ] **Step 3: Update `README.md`**

Replace the existing README with:

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
cd /Users/kailee/otter-clone
git add scripts/start.sh README.md
git commit -m "chore: add prod start script; update README for frontend"
```

---

## Task 16: Manual end-to-end smoke (no code changes)

**Files:** None — manual verification only.

This task is a manual checklist. Run the dev stack and the prod stack each, exercise the full happy path in the browser, and confirm everything works. No commit needed unless you find a bug to fix.

- [ ] **Step 1: Dev mode smoke**

```bash
# Terminal 1
./scripts/dev-server.sh

# Terminal 2
cd web && npm run dev
```

Open <http://127.0.0.1:5173>. Verify in order:

1. `/` shows the Recorder page with a red **Record** button.
2. `/lectures` shows "No lectures yet."
3. `/settings` loads, shows "No key configured." Paste a real Anthropic API key, click Save, the page reloads to "Key is configured."
4. Open a YouTube video or any browser tab playing audio in another window. Back in the recorder, click **Record**, choose the audio tab, check "Share tab audio", confirm.
5. Wait ~10 seconds, then click **Stop**.
6. The page redirects to `/lectures/<id>` and shows "Transcribing…"
7. Within ~1-2 minutes (longer on first run while `large-v3` downloads), the page flips to ready. The transcript renders on the left, the audio player below it, and the Study Guide + Outline summaries on the right.
8. Click a transcript segment — the audio jumps to that timestamp and starts playing.
9. While playing, the active segment highlights and (if scrolled offscreen) auto-scrolls into view.
10. Click **Regenerate** on a summary — it replaces with a new generation.
11. Go to `/lectures` — the new lecture appears at the top of the list.

- [ ] **Step 2: Prod mode smoke**

Stop the dev processes. From the project root:

```bash
./scripts/start.sh
```

Open <http://127.0.0.1:8000>. Repeat the flow at Step 1 (steps 1-11). The single port serves both the SPA and the API.

- [ ] **Step 3: Confirm tests still pass**

```bash
cd /Users/kailee/otter-clone/server && uv run pytest -v
cd /Users/kailee/otter-clone/web && npm test
```

Expected: backend 44 passed, 1 deselected; frontend all green.

If any step in §1 or §2 fails, file a fix as a new commit.

---

## Self-review checklist (already applied)

- ✅ **Spec coverage:** §3 (Recorder, LectureList, LectureView, Settings) → Tasks 4, 5, 6, 8, 13. §6 (capture flow) → Tasks 7, 8. §7 (transcript + audio sync, click-to-seek) → Tasks 10, 11, 13. §8 (summary panel + regenerate + new template) → Tasks 12, 13. §9 frontend errors → handled across pages. §11 layout → matches the file structure produced.
- ✅ **No placeholders:** every step has actual code or commands; no "TBD" or "implement later".
- ✅ **Type/name consistency:** `useApi`, `ApiError`, `Lecture`, `LectureDetail`, `Segment`, `Summary`, `Template`, `SettingsView`, `useRecorder`, `useStatusPoll`, `useAudioSync` are stable across all tasks.
- ✅ **TDD:** every component/hook task is test-first.

---

## What's NOT in this plan

- **Markdown rendering for summaries** — `<pre>` is fine for v1; adding `react-markdown` is trivial later.
- **Cross-lecture search** — out of scope per spec.
- **Manual transcript editing** — out of scope per spec.
- **Mobile recording** — `getDisplayMedia` audio is desktop-Chrome only. Mobile views work for browsing.
- **Authentication** — single-user local app per spec.
- **Optimistic UI updates** — kept simple with `refresh()` after every mutation. Plenty fast for a single user.
- **Long-transcript virtualization** — note in the spec; revisit if a 90+ minute lecture renders slowly.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-09-otter-clone-frontend.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
