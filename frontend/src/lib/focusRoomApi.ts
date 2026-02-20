// lib/focusRoomApi.ts
// FocusRoom API client — all calls go through pumiInvoke

import { pumiInvoke } from "./pumiInvoke";
import type {
  CreateRoomPayload,
  CreateRoomResp,
  StartDayPayload,
  StartDayResp,
  EvaluatePayload,
  EvaluateResp,
  TtsPayload,
  TtsResp,
  ClosePayload,
  CloseResp,
} from "@/types/focusRoom";

export const focusRoomApi = {
  createRoom: (payload: CreateRoomPayload) =>
    pumiInvoke<CreateRoomResp>("/focusroom/create", payload),

  startDay: (payload: StartDayPayload) =>
    pumiInvoke<StartDayResp>("/focusroom/day/start", payload),

  evaluate: (payload: EvaluatePayload) =>
    pumiInvoke<EvaluateResp>("/focusroom/evaluate", payload),

  tts: (payload: TtsPayload) =>
    pumiInvoke<TtsResp>("/focusroom/tts", payload),

  close: (payload: ClosePayload) =>
    pumiInvoke<CloseResp>("/focusroom/close", payload),
};
