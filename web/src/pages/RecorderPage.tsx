import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api";
import { useRecorder } from "@/hooks/useRecorder";

export default function RecorderPage() {
  const recorder = useRecorder();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Track which blob we've already attempted, so the effect doesn't re-fire
  // on every state transition (and especially not after a failed upload's
  // setUploading(false), which would otherwise retry forever).
  const attemptedBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (
      recorder.state !== "stopped" ||
      !recorder.blob ||
      uploading ||
      attemptedBlobRef.current === recorder.blob
    ) {
      return;
    }
    attemptedBlobRef.current = recorder.blob;
    const blob = recorder.blob;
    setUploading(true);
    setUploadError(null);
    void (async () => {
      try {
        const lecture = await api.createLecture({});
        await api.uploadAudio(lecture.id, blob);
        navigate(`/lectures/${lecture.id}`);
      } catch (err) {
        setUploadError(err instanceof ApiError ? err.detail : String(err));
      } finally {
        setUploading(false);
      }
    })();
  }, [recorder.state, recorder.blob, uploading, navigate]);

  async function retryUpload() {
    if (!recorder.blob) return;
    // Clear the attempt marker so the effect can run again with the same blob.
    attemptedBlobRef.current = null;
    // Also clear the error so we don't show stale text.
    setUploadError(null);
    // Force the effect to re-evaluate by toggling uploading; simpler is to
    // call the upload inline here.
    setUploading(true);
    try {
      const lecture = await api.createLecture({});
      await api.uploadAudio(lecture.id, recorder.blob);
      navigate(`/lectures/${lecture.id}`);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setUploading(false);
    }
  }

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
        <div className="text-red-700 text-sm space-y-2">
          <p>Upload error: {uploadError}</p>
          {recorder.blob && !uploading && (
            <button
              onClick={retryUpload}
              className="px-3 py-1.5 border rounded text-slate-900"
            >
              Retry upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}
