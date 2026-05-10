import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/api";

describe("api", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createLecture posts and returns id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "abc", title: "T", status: "transcribing" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const out = await api.createLecture({ title: "T" });
    expect(out.id).toBe("abc");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lectures",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError on 4xx with detail", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "lecture not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(api.getLecture("missing")).rejects.toThrow(ApiError);
  });

  it("uploadAudio sends multipart with the audio file", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "x", status: "transcribing" }), { status: 202 }),
    );
    const blob = new Blob(["hello"], { type: "audio/webm" });
    await api.uploadAudio("abc", blob);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
  });
});
