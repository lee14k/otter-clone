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
