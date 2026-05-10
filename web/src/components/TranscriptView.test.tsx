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
