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
      streamRef.current = stream;

      // Stop video tracks immediately — we only want audio
      if (typeof stream.getVideoTracks === "function") {
        stream.getVideoTracks().forEach((t) => t.stop());
      }

      // Build an audio-only stream when possible; fall back to the original
      let recordingStream: MediaStream = stream;
      if (
        typeof stream.getAudioTracks === "function" &&
        typeof MediaStream !== "undefined"
      ) {
        try {
          recordingStream = new MediaStream(stream.getAudioTracks());
        } catch {
          // jsdom or environment doesn't support MediaStream constructor — use original
          recordingStream = stream;
        }
      }

      const recorder = deps.makeRecorder(recordingStream);
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
