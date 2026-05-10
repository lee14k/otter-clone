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

  it("loads current settings on mount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        whisper_model: "large-v3",
        summary_model: "claude-opus-4-7",
        anthropic_key_set: true,
      }),
    );
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/key is configured/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/whisper model/i)).toHaveValue("large-v3");
  });

  it("submits a new key and shows confirmation", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          whisper_model: "large-v3",
          summary_model: "claude-opus-4-7",
          anthropic_key_set: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          whisper_model: "large-v3",
          summary_model: "claude-opus-4-7",
          anthropic_key_set: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          whisper_model: "large-v3",
          summary_model: "claude-opus-4-7",
          anthropic_key_set: true,
        }),
      );

    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no key configured/i)).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-x");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText(/key is configured/i)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[1]).toMatchObject({ method: "PATCH" });
  });
});
