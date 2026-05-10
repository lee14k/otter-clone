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
    const link = await screen.findByRole("link", { name: /Calc 101/i });
    expect(link).toHaveAttribute("href", "/lectures/abc");
    expect(link.textContent).toContain("2:05");
  });
});
