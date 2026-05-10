import type {
  Lecture,
  LectureDetail,
  SettingsPatch,
  SettingsView,
  StatusOut,
  Summary,
  Template,
} from "@/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`HTTP ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  // Lectures
  createLecture: (payload: { title?: string } = {}) =>
    request<Lecture>("/api/lectures", json("POST", payload)),
  listLectures: () => request<Lecture[]>("/api/lectures"),
  getLecture: (id: string) => request<LectureDetail>(`/api/lectures/${id}`),
  patchLecture: (id: string, payload: { title: string }) =>
    request<Lecture>(`/api/lectures/${id}`, json("PATCH", payload)),
  deleteLecture: (id: string) =>
    request<void>(`/api/lectures/${id}`, { method: "DELETE" }),
  getStatus: (id: string) => request<StatusOut>(`/api/lectures/${id}/status`),

  uploadAudio: (id: string, blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, `lecture.${blob.type.includes("webm") ? "webm" : "bin"}`);
    return request<{ id: string; status: string }>(
      `/api/lectures/${id}/audio`,
      { method: "PUT", body: form },
    );
  },

  audioUrl: (id: string) => `/api/lectures/${id}/audio`,

  // Summaries
  createSummary: (lectureId: string, templateId: string) =>
    request<Summary>(
      `/api/lectures/${lectureId}/summaries`,
      json("POST", { template_id: templateId }),
    ),
  deleteSummary: (id: string) =>
    request<void>(`/api/summaries/${id}`, { method: "DELETE" }),

  // Templates
  listTemplates: () => request<Template[]>("/api/templates"),
  createTemplate: (payload: { name: string; prompt: string; is_default?: boolean }) =>
    request<Template>("/api/templates", json("POST", payload)),
  patchTemplate: (
    id: string,
    payload: { name?: string; prompt?: string; is_default?: boolean },
  ) => request<Template>(`/api/templates/${id}`, json("PATCH", payload)),
  deleteTemplate: (id: string) =>
    request<void>(`/api/templates/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<SettingsView>("/api/settings"),
  patchSettings: (payload: SettingsPatch) =>
    request<SettingsView>("/api/settings", json("PATCH", payload)),
};
