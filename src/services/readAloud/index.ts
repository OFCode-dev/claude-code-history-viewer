/**
 * Read-aloud mode: speaks new assistant text of the open Claude session.
 * UI code imports from here; the modules behind it are pure and unit-tested.
 */

export {
  BACKOFF_MS,
  DEFAULT_READ_ALOUD_PREFS,
  POLL_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  createReadAloudController,
  readAloudHandle,
  type ReadAloudControllerDeps,
  type ReadAloudHandle,
} from "./controller";
export { WebSpeechEngine, type EngineDeps } from "./engine";
export { guessLang, pickVoice } from "./langGuess";
export { toSpeechChunks } from "./speechText";
export { fetchSessionTail } from "./tailApi";
export type * from "./types";
