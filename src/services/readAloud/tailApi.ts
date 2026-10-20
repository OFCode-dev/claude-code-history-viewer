import { api } from "@/services/api";
import type { SessionTail } from "./types";

/**
 * Read the complete lines appended to a session file since `fromOffset`.
 * `null` asks for a baseline at EOF (no blocks): history is never returned.
 */
export function fetchSessionTail(
  sessionPath: string,
  fromOffset: number | null,
  signal?: AbortSignal,
): Promise<SessionTail> {
  return api<SessionTail>("read_session_tail", { sessionPath, fromOffset }, { signal });
}
