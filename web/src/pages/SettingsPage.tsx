import { useState } from "react";
import { api, ApiError } from "@/api";
import { useApi } from "@/hooks/useApi";

const WHISPER_MODELS = [
  "large-v3",
  "medium",
  "small",
  "distil-large-v3",
  "tiny",
];

const SUMMARY_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export default function SettingsPage() {
  const settings = useApi(() => api.getSettings(), []);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function patchAndRefresh(payload: Parameters<typeof api.patchSettings>[0]) {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patchSettings(payload);
      await settings.refresh();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (settings.loading) return <p>Loading…</p>;
  if (settings.error || !settings.data) {
    return <p className="text-red-700">Failed to load settings.</p>;
  }

  const cfg = settings.data;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      <section className="space-y-2">
        <h3 className="font-medium">Anthropic API key</h3>
        <p className="text-sm text-slate-600">
          {cfg.anthropic_key_set ? "Key is configured." : "No key configured."}
        </p>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!keyInput) return;
            await patchAndRefresh({ anthropic_api_key: keyInput });
            setKeyInput("");
          }}
        >
          <label className="sr-only" htmlFor="api-key">
            Anthropic API key
          </label>
          <input
            id="api-key"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-…"
            className="flex-1 px-3 py-2 border rounded"
          />
          <button
            type="submit"
            disabled={saving || !keyInput}
            className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Models</h3>
        <label className="block">
          <span className="text-sm">Whisper model</span>
          <select
            aria-label="Whisper model"
            value={cfg.whisper_model}
            onChange={(e) => patchAndRefresh({ whisper_model: e.target.value })}
            disabled={saving}
            className="mt-1 block w-64 px-3 py-2 border rounded"
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm">Summary model (Claude)</span>
          <select
            aria-label="Summary model"
            value={cfg.summary_model}
            onChange={(e) => patchAndRefresh({ summary_model: e.target.value })}
            disabled={saving}
            className="mt-1 block w-64 px-3 py-2 border rounded"
          >
            {SUMMARY_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </section>

      {saveError && <p className="text-red-700 text-sm">{saveError}</p>}
    </div>
  );
}
