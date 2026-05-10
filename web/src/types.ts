export type LectureStatus = "transcribing" | "ready" | "failed";

export interface Segment {
  start_sec: number;
  end_sec: number;
  text: string;
}

export interface Summary {
  id: string;
  template_id: string;
  content: string;
  model: string;
  created_at: string;
}

export interface Lecture {
  id: string;
  title: string;
  created_at: string;
  duration_sec: number;
  audio_mime: string;
  status: LectureStatus;
  error: string | null;
}

export interface LectureDetail extends Lecture {
  segments: Segment[];
  summaries: Summary[];
}

export interface Template {
  id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
}

export interface SettingsView {
  whisper_model: string;
  summary_model: string;
  anthropic_key_set: boolean;
}

export interface SettingsPatch {
  whisper_model?: string;
  summary_model?: string;
  anthropic_api_key?: string;
}

export interface StatusOut {
  status: LectureStatus;
  error: string | null;
}
