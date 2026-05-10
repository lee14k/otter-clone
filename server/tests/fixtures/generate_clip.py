"""Generate a deterministic ~10s spoken WAV fixture using macOS `say` + ffmpeg."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).parent / "short_clip.wav"
TEXT = (
    "Today we are going to talk about Newton's laws of motion. "
    "The first law states that an object in motion stays in motion."
)


def main() -> None:
    if shutil.which("say") is None or shutil.which("ffmpeg") is None:
        print("Requires macOS `say` and `ffmpeg` to regenerate.", file=sys.stderr)
        sys.exit(1)

    aiff = OUT.with_suffix(".aiff")
    subprocess.run(["say", "-o", str(aiff), TEXT], check=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(aiff), "-ar", "16000", "-ac", "1", str(OUT)],
        check=True,
    )
    aiff.unlink()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
