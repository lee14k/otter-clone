import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import SettingsPage from "@/pages/SettingsPage";

describe("SettingsPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  const defaultSettings = {
    whisper_model: "large-v3",
    summary_model: "claude-opus-4-7",
    anthropic_key_set: true,
  };

  function mockFetchByUrl(overrides: Record<string, unknown> = {}) {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/api/templates")) return Promise.resolve(jsonResponse([]));
      if (url.endsWith("/api/settings")) return Promise.resolve(jsonResponse({ ...defaultSettings, ...overrides }));
      return Promise.resolve(jsonResponse(null, 404));
    });
  }

  it("loads current settings on mount", async () => {
    mockFetchByUrl();
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/key is configured/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/whisper model/i)).toHaveValue("large-v3");
  });

  it("submits a new key and shows confirmation", async () => {
    const user = userEvent.setup();
    let settingsCallCount = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/templates")) return Promise.resolve(jsonResponse([]));
      if (url.endsWith("/api/settings")) {
        if (init?.method === "PATCH") {
          return Promise.resolve(jsonResponse({ ...defaultSettings, anthropic_key_set: true }));
        }
        // GET
        settingsCallCount++;
        const keySet = settingsCallCount > 1;
        return Promise.resolve(
          jsonResponse({ ...defaultSettings, anthropic_key_set: keySet }),
        );
      }
      return Promise.resolve(jsonResponse(null, 404));
    });

    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no key configured/i)).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-x");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText(/key is configured/i)).toBeInTheDocument(),
    );
    const patchCall = fetchMock.mock.calls.find(
      (c: [string, RequestInit?]) => c[1]?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(patchCall[1]).toMatchObject({ method: "PATCH" });
  });
});
