/**
 * Renderer Components Module
 *
 * Shared infrastructure for renderer components:
 * - types.ts: TypeScript interfaces and type definitions
 * - styles.ts: Variant-based styling using design tokens
 * - utils.ts: Common utility functions
 */

// Types
export type {
  BaseRendererProps,
  IndexedRendererProps,
  RendererVariant,
  ProgrammingLanguage,
} from "./types";

export { TOOL_VARIANTS } from "./types";

// Styles
export type { VariantStyles } from "./styles";
export { getVariantStyles, codeTheme, layout } from "./styles";

// Utils
export {
  getLanguageFromPath,
  detectLanguageFromContent,
  hasNumberedLines,
  extractCodeFromNumberedLines,
  parseSystemReminders,
  isFileSearchResult,
  parseFilePath,
  safeStringify,
} from "./utils";
