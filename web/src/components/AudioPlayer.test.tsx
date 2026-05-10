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
