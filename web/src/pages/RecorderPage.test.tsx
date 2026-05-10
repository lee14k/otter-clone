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
