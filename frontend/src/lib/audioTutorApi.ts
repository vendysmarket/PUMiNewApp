// src/lib/audioTutorApi.ts
// API calls for Audio Tutor feature

import { pumiInvoke } from "./pumiInvoke";
import type { AudioLesson } from "@/types/audioTutor";

interface AudioLessonResp {
  ok: boolean;
  title: string;
  steps: AudioLesson["steps"];
  closing: string;
  error?: string;
}

interface TtsResp {
  ok: boolean;
  audio_base64: string;
  content_type: string;
  error?: string;
}

interface AudioChatResp {
  ok: boolean;
  reply: string;
  error?: string;
}

export interface AudioChatPayload {
  session_id: string;
  step_id: string;
  user_text: string;
  lesson_md: string;
  mode: "intro" | "practice";
  target_language?: string;
  level?: string;
  user_name?: string;
}

export const audioTutorApi = {
  generateLesson: (payload: { track: string; level?: string }) =>
    pumiInvoke<AudioLessonResp>("/focus/audio-lesson", payload),

  generateTts: (payload: { text: string; voice_id?: string; model_id?: string }) =>
    pumiInvoke<TtsResp>("/focus/tts", payload),

  chat: (payload: AudioChatPayload) =>
    pumiInvoke<AudioChatResp>("/focus/audio-chat", payload),
};
