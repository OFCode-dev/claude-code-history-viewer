/**
 * Cheap per-chunk language guess and local voice choice for "auto" voice mode.
 * No library: script ranges for CJK, a small Turkish heuristic for Latin text.
 */

import type { SpeechLang } from "./types";

const HANGUL = /\p{Script=Hangul}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
const LETTERS = /\p{L}+/gu;

/** Letters shared by Turkish and a few other languages (ü, ö, ç also occur in German/French). */
const TURKISH_COMMON = /[çÇğĞıİöÖşŞüÜ]/;
/** Letters that are close to Turkish-only. */
const TURKISH_STRONG = /[ğĞıİşŞ]/;
const TURKISH_STOPWORDS = new Set([
  "ve", "bir", "bu", "için", "ile", "değil", "olarak", "da", "de", "çok", "ama", "şu", "gibi", "daha",
]);

/**
 * Guess the language of a chunk. Returns null when the text has no letters,
 * so the caller can reuse the surrounding block's voice.
 */
export function guessLang(text: string): SpeechLang | null {
  if (HANGUL.test(text)) return "ko";
  if (KANA.test(text)) return "ja";
  if (HAN.test(text)) return "zh";
  if (!LATIN.test(text)) return null;

  let stopwordHits = 0;
  for (const word of text.match(LETTERS) ?? []) {
    if (TURKISH_STOPWORDS.has(word.toLocaleLowerCase("tr"))) stopwordHits++;
  }
  const turkish =
    (TURKISH_COMMON.test(text) && (TURKISH_STRONG.test(text) || stopwordHits >= 1)) || stopwordHits >= 2;
  return turkish ? "tr" : "en";
}

/** The subset of `SpeechSynthesisVoice` the picker needs. */
export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

const normalizeTag = (tag: string) => tag.replace(/_/g, "-").toLowerCase();

/**
 * Choose the voice for one utterance, LOCAL voices only.
 * An explicit `voiceURI` wins while it still exists; otherwise ("auto") the
 * best local voice for `lang`, preferring a `navigator.languages` region match,
 * then the default voice. Falls back to the default local voice, then the first.
 */
export function pickVoice<V extends VoiceLike>(
  voices: readonly V[],
  voiceURI: string,
  lang: SpeechLang | null,
  preferredLanguages: readonly string[],
): V | null {
  const local = voices.filter((v) => v.localService);
  if (local.length === 0) return null;

  if (voiceURI !== "auto") {
    const explicit = local.find((v) => v.voiceURI === voiceURI);
    if (explicit) return explicit;
  }

  if (lang) {
    const candidates = local.filter((v) => {
      const tag = normalizeTag(v.lang);
      return tag === lang || tag.startsWith(`${lang}-`);
    });
    for (const preferred of preferredLanguages) {
      const match = candidates.find((v) => normalizeTag(v.lang) === normalizeTag(preferred));
      if (match) return match;
    }
    const best = candidates.find((v) => v.default) ?? candidates[0];
    if (best) return best;
  }

  return local.find((v) => v.default) ?? local[0] ?? null;
}
