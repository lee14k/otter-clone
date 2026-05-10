import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api";
import { useRecorder } from "@/hooks/useRecorder";

export default function RecorderPage() {
  const recorder = useRecorder();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (recorder.state !== "stopped" || !recorder.blob || uploading) return;
    setUploading(true);
    setUploadError(null);
    void (async () => {
      try {
        const lecture = await api.createLecture({});
        await api.uploadAudio(lecture.id, recorder.blob!);
        navigate(`/lectures/${lecture.id}`);
      } catch (err) {
        setUploadError(err instanceof ApiError ? err.detail : String(err));
      } finally {
        setUploading(false);
      }
    })();
  }, [recorder.state, recorder.blob, uploading, navigate]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Record a lecture</h2>
      <p className="text-sm text-slate-600">
        Click <strong>Record</strong>, then choose the browser tab playing your lecture
        (and check &ldquo;Share tab audio&rdquo;).
      </p>

      <div className="flex items-center gap-3">
        {recorder.state === "idle" || recorder.state === "error" ? (
          <button
            onClick={recorder.start}
            className="px-5 py-3 bg-red-600 text-white rounded-full font-semibold"
          >
            Record
          </button>
        ) : null}

        {recorder.state === "requesting" && <p>Waiting for tab share…</p>}

        {recorder.state === "recording" && (
          <button
            onClick={recorder.stop}
            className="px-5 py-3 bg-slate-900 text-white rounded-full font-semibold"
          >
            Stop
          </button>
        )}

        {(recorder.state === "stopping" || uploading) && <p>Uploading…</p>}
      </div>

      {recorder.error && (
        <p className="text-red-700 text-sm">Recording error: {recorder.error}</p>
      )}
      {uploadError && (
        <p className="text-red-700 text-sm">Upload error: {uploadError}</p>
      )}
    </div>
  );
}
