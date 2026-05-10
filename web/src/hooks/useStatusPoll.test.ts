import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStatusPoll } from "@/hooks/useStatusPoll";

describe("useStatusPoll", () => {
  it("fetches status repeatedly until ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 0;
    const fetchStatus = vi.fn(async () => {
      n += 1;
      return { status: n < 3 ? ("transcribing" as const) : ("ready" as const), error: null };
    });

    const { result } = renderHook(() =>
      useStatusPoll({ fetcher: fetchStatus, intervalMs: 100, enabled: true }),
    );

    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Should stop polling once ready
    const callsAtReady = fetchStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchStatus.mock.calls.length).toBe(callsAtReady);
    vi.useRealTimers();
  });

  it("does not poll when disabled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchStatus = vi.fn();
    renderHook(() =>
      useStatusPoll({ fetcher: fetchStatus, intervalMs: 100, enabled: false }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchStatus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
