// src/types/audioTutor.ts
// Types for the Audio Tutor one-way TTS feature

export interface AudioStep {
  id: string;
  kind: "explain" | "prompt" | "recap";
  text: string;
}

export interface AudioLesson {
  title: string;
  steps: AudioStep[];
  closing: string;
}

export interface AudioTutorProgress {
  track: string;
  stepIndex: number;
  date: string;
  lesson: AudioLesson;
}
