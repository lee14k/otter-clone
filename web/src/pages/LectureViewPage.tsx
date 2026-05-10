import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "@/api";
import { useApi } from "@/hooks/useApi";
import { useStatusPoll } from "@/hooks/useStatusPoll";
import { useAudioSync } from "@/hooks/useAudioSync";
import AudioPlayer from "@/components/AudioPlayer";
import TranscriptView from "@/components/TranscriptView";
import SummariesPanel from "@/components/SummariesPanel";
import { formatDate, formatDuration } from "@/format";

export default function LectureViewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const lecture = useApi(() => api.getLecture(id), [id]);
  const templates = useApi(() => api.listTemplates(), []);
  const settings = useApi(() => api.getSettings(), []);

  const isTranscribing = lecture.data?.status === "transcribing";
  const poll = useStatusPoll({
    fetcher: () => api.getStatus(id),
    intervalMs: 2000,
    enabled: isTranscribing,
  });

  // When polling flips to ready or failed, refetch the lecture detail
  // Only re-run when poll.status flips. Depending on the whole `lecture`
  // object would refire on every render (useApi returns a new object each
  // time) and cause an infinite refetch loop. `lecture.refresh` is stable.
  useEffect(() => {
    if (poll.status === "ready" || poll.status === "failed") {
      void lecture.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.status, lecture.refresh]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const segments = lecture.data?.segments ?? [];
  const sync = useAudioSync(audioRef, segments);

  if (lecture.loading) return <p>Loading…</p>;
  if (lecture.error || !lecture.data) {
    const detail = lecture.error instanceof ApiError ? lecture.error.detail : "";
    return <p className="text-red-700">Failed to load lecture. {detail}</p>;
  }

  const l = lecture.data;
  const status = poll.status === "transcribing" && !isTranscribing ? l.status : poll.status;

  async function regenerateOrCreate(templateId: string) {
    await api.createSummary(id, templateId);
    await lecture.refresh();
  }

  async function deleteSummary(summaryId: string) {
    await api.deleteSummary(summaryId);
    await lecture.refresh();
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{l.title}</h2>
        <p className="text-sm text-slate-600">
          {formatDate(l.created_at)} · {formatDuration(l.duration_sec)} ·{" "}
          <span
            className={
              status === "ready"
                ? "text-emerald-700"
                : status === "failed"
                  ? "text-red-700"
                  : "text-amber-700"
            }
          >
            {status}
          </span>
        </p>
        {status === "failed" && l.error && (
          <p className="text-red-700 text-sm">Error: {l.error}</p>
        )}
      </header>

      {status === "transcribing" ? (
        <div className="border border-slate-200 rounded p-6 text-center text-slate-600">
          Transcribing… this may take a minute or two.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section>
            <TranscriptView
              segments={segments}
              activeIndex={sync.activeIndex}
              onSeek={sync.seek}
            />
            <div className="mt-2">
              <AudioPlayer src={api.audioUrl(id)} audioRef={audioRef} />
            </div>
          </section>
          <section>
            <SummariesPanel
              summaries={l.summaries}
              templates={templates.data ?? []}
              anthropicKeySet={settings.data?.anthropic_key_set ?? false}
              onGenerate={regenerateOrCreate}
              onDelete={deleteSummary}
            />
          </section>
        </div>
      )}
    </div>
  );
}
