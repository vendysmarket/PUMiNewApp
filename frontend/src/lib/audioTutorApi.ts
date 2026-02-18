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

export const audioTutorApi = {
  generateLesson: (payload: { track: string; level?: string }) =>
    pumiInvoke<AudioLessonResp>("/focus/audio-lesson", payload),

  generateTts: (payload: { text: string; voice_id?: string; model_id?: string }) =>
    pumiInvoke<TtsResp>("/focus/tts", payload),
};
