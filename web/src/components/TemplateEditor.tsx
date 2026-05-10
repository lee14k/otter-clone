import { useState } from "react";
import { api, ApiError } from "@/api";
import type { Template } from "@/types";

interface Props {
  templates: Template[];
  onChanged: () => Promise<void> | void;
}

export default function TemplateEditor({ templates, onChanged }: Props) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withErrorBoundary(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Summary templates</h3>

      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="border border-slate-200 rounded p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <strong>{t.name}</strong>
              <div className="flex gap-2">
                <label className="text-sm flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={t.is_default}
                    onChange={(e) =>
                      withErrorBoundary(async () => {
                        await api.patchTemplate(t.id, { is_default: e.target.checked });
                        await onChanged();
                      })
                    }
                  />
                  default
                </label>
                <button
                  onClick={() =>
                    withErrorBoundary(async () => {
                      await api.deleteTemplate(t.id);
                      await onChanged();
                    })
                  }
                  className="text-sm px-2 py-1 border rounded text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
            <textarea
              defaultValue={t.prompt}
              rows={4}
              className="w-full text-xs font-mono p-2 border rounded"
              onBlur={(e) =>
                e.target.value !== t.prompt &&
                withErrorBoundary(async () => {
                  await api.patchTemplate(t.id, { prompt: e.target.value });
                  await onChanged();
                })
              }
            />
          </li>
        ))}
      </ul>

      <form
        className="border border-dashed border-slate-300 rounded p-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name || !prompt) return;
          void withErrorBoundary(async () => {
            await api.createTemplate({ name, prompt, is_default: isDefault });
            setName("");
            setPrompt("");
            setIsDefault(false);
            await onChanged();
          });
        }}
      >
        <h4 className="font-medium text-sm">New template</h4>
        <input
          aria-label="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anki cards"
          className="w-full px-3 py-2 border rounded"
        />
        <textarea
          aria-label="Template prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Make Anki flashcards from {transcript}"
          className="w-full text-xs font-mono p-2 border rounded"
        />
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          run automatically on every lecture
        </label>
        <button
          type="submit"
          className="px-4 py-2 bg-slate-900 text-white rounded"
          disabled={!name || !prompt}
        >
          Create
        </button>
      </form>

      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
