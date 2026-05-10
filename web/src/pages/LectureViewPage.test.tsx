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
      expect(screen.getAllByText(/transcribing/i).length).toBeGreaterThan(0),
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
    expect(screen.getAllByText("Study Guide").length).toBeGreaterThan(0);
    expect(screen.getByText(/# notes/)).toBeInTheDocument();
  });
});
