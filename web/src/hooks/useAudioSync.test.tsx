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
