import { useState } from "react";
import { Link } from "react-router-dom";
import type { Summary, Template } from "@/types";

interface Props {
  summaries: Summary[];
  templates: Template[];
  anthropicKeySet: boolean;
  onGenerate: (templateId: string) => Promise<void> | void;
  onDelete: (summaryId: string) => Promise<void> | void;
}

export default function SummariesPanel({
  summaries,
  templates,
  anthropicKeySet,
  onGenerate,
  onDelete,
}: Props) {
  const [selected, setSelected] = useState<string>(templates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  if (!anthropicKeySet) {
    return (
      <div className="border border-slate-200 rounded p-4 bg-slate-50 text-sm">
        Add an Anthropic API key in{" "}
        <Link to="/settings" className="underline">
          Settings
        </Link>{" "}
        to generate summaries.
      </div>
    );
  }

  const tplById = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      {summaries.map((s) => (
        <article key={s.id} className="border border-slate-200 rounded">
          <header className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
            <h3 className="font-medium">{tplById.get(s.template_id)?.name ?? "Summary"}</h3>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onGenerate(s.template_id);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="text-sm px-2 py-1 border rounded"
              >
                Regenerate
              </button>
              <button
                onClick={() => onDelete(s.id)}
                className="text-sm px-2 py-1 border rounded text-red-700"
              >
                Delete
              </button>
            </div>
          </header>
          <pre className="whitespace-pre-wrap p-3 text-sm">{s.content}</pre>
        </article>
      ))}

      <div className="border border-dashed border-slate-300 rounded p-3 flex items-end gap-2">
        <label className="flex-1">
          <span className="text-sm">Generate from template</span>
          <select
            aria-label="Generate from template"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={async () => {
            if (!selected) return;
            setBusy(true);
            try {
              await onGenerate(selected);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !selected}
          className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50"
        >
          Generate
        </button>
      </div>
    </div>
  );
}
