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
