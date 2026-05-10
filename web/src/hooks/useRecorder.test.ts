import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRecorder } from "@/hooks/useRecorder";

class FakeRecorder {
  start = () => {
    queueMicrotask(() => this.onstart?.());
  };
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

describe("useRecorder", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useRecorder());
    expect(result.current.state).toBe("idle");
    expect(result.current.blob).toBeNull();
  });

  it("transitions through requesting → recording → stopped with a blob", async () => {
    const fakeStream = { getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream;
    const fakeRecorder = new FakeRecorder();
    const { result } = renderHook(() =>
      useRecorder({
        getStream: async () => fakeStream,
        makeRecorder: () => fakeRecorder as unknown as MediaRecorder,
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.state).toBe("stopped");
    expect(result.current.blob).toBeInstanceOf(Blob);
  });

  it("goes to error when getStream rejects", async () => {
    const { result } = renderHook(() =>
      useRecorder({
        getStream: async () => {
          throw new Error("user denied");
        },
        makeRecorder: () => ({}) as MediaRecorder,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toContain("user denied");
  });
});
