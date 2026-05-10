import { Link } from "react-router-dom";
import { api } from "@/api";
import { useApi } from "@/hooks/useApi";
import { formatDate, formatDuration } from "@/format";

export default function LectureListPage() {
  const { data, loading, error } = useApi(() => api.listLectures(), []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="text-red-700">Failed to load lectures.</p>;
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-600">
        <p>No lectures yet. Hit Record to start your first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Lectures</h2>
      <ul className="divide-y divide-slate-200 border border-slate-200 rounded bg-white">
        {data.map((l) => (
          <li key={l.id} className="p-3">
            <Link
              to={`/lectures/${l.id}`}
              className="flex items-center justify-between hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{l.title}</div>
                <div className="text-sm text-slate-600">
                  {formatDate(l.created_at)} · {formatDuration(l.duration_sec)} ·{" "}
                  <span
                    className={
                      l.status === "ready"
                        ? "text-emerald-700"
                        : l.status === "failed"
                          ? "text-red-700"
                          : "text-amber-700"
                    }
                  >
                    {l.status}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
