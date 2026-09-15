import { ROLE_DISPLAY_NAMES } from "./document-parser";

export type ListenPlayState = "idle" | "playing" | "paused" | "finished";

export type RehearsalSpeakingState =
  | "setup"
  | "ready"
  | "ai-speaking"
  | "user-turn"
  | "listening"
  | "transcribing"
  | "auto-checking"
  | "checking"
  | "auto-advancing"
  | "complete";

/** Display-only role label; callers retain the original role identifier. */
export function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}

export function isListenLineSpeaking(
  playState: ListenPlayState,
  failedLineIndex?: number | null,
): boolean {
  return playState === "playing" && failedLineIndex == null;
}

export function isRehearsalLineSpeaking(state: RehearsalSpeakingState): boolean {
  return state === "ai-speaking" || state === "listening";
}
