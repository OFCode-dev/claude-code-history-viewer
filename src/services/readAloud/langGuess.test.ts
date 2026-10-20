import { describe, expect, it } from "vitest";
import { guessLang, pickVoice, type VoiceLike } from "./langGuess";

describe("guessLang", () => {
  it("detects CJK scripts, Kana before Han", () => {
    expect(guessLang("안녕하세요, 테스트가 통과했습니다")).toBe("ko");
    expect(guessLang("テストは成功しました")).toBe("ja");
    expect(guessLang("测试已通过")).toBe("zh");
  });

  it("detects Turkish from specific letters", () => {
    expect(guessLang("Değişiklikleri kaydettim.")).toBe("tr");
    expect(guessLang("Şimdi bakıyorum.")).toBe("tr");
  });

  it("detects Turkish from a common letter plus one stopword", () => {
    expect(guessLang("Testler geçti ve derleme temiz")).toBe("tr");
  });

  it("detects Turkish from two stopwords without special letters", () => {
    expect(guessLang("Bu dosya ile devam edelim")).toBe("tr");
  });

  it("does not treat a lone common letter as Turkish", () => {
    expect(guessLang("Ich würde gern helfen")).toBe("en");
    expect(guessLang("Testler geçti")).toBe("en");
  });

  it("matches stopwords as whole words only", () => {
    // "bu" inside "build", "de" inside "decide", "ve" inside "very".
    expect(guessLang("We decide to build a very good release")).toBe("en");
  });

  it("uses Turkish casing for stopwords", () => {
    expect(guessLang("BU DOSYA İÇİN")).toBe("tr");
  });

  it("defaults Latin text to English", () => {
    expect(guessLang("The tests pass and the build is clean.")).toBe("en");
  });

  it("returns null when there are no letters", () => {
    expect(guessLang("")).toBeNull();
    expect(guessLang("123 — 456")).toBeNull();
  });
});

const voice = (voiceURI: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService: true,
  default: false,
  ...extra,
});

describe("pickVoice", () => {
  const voices = [
    voice("samantha", "en-US", { default: true }),
    voice("daniel", "en-GB"),
    voice("yelda", "tr-TR"),
    voice("kyoko", "ja-JP"),
    voice("google-tr", "tr-TR", { localService: false }),
  ];

  it("returns an explicit local voice", () => {
    expect(pickVoice(voices, "daniel", "tr", [])?.voiceURI).toBe("daniel");
  });

  it("falls back to auto when the explicit voice is gone or remote", () => {
    expect(pickVoice(voices, "missing", "tr", [])?.voiceURI).toBe("yelda");
    expect(pickVoice(voices, "google-tr", "tr", [])?.voiceURI).toBe("yelda");
  });

  it("auto picks a local voice by language prefix", () => {
    expect(pickVoice(voices, "auto", "ja", [])?.voiceURI).toBe("kyoko");
  });

  it("prefers the navigator.languages region match", () => {
    expect(pickVoice(voices, "auto", "en", ["en-GB", "en"])?.voiceURI).toBe("daniel");
    expect(pickVoice(voices, "auto", "en", ["en-US"])?.voiceURI).toBe("samantha");
  });

  it("prefers the default voice among same-language candidates", () => {
    expect(pickVoice(voices, "auto", "en", [])?.voiceURI).toBe("samantha");
  });

  it("handles underscore language tags", () => {
    expect(pickVoice([voice("x", "tr_TR"), voice("y", "en_US")], "auto", "tr", [])?.voiceURI).toBe("x");
  });

  it("falls back to the default local voice, then the first local voice", () => {
    expect(pickVoice(voices, "auto", "zh", [])?.voiceURI).toBe("samantha");
    expect(pickVoice([voice("a", "de-DE"), voice("b", "fr-FR")], "auto", null, [])?.voiceURI).toBe("a");
  });

  it("never returns a remote voice", () => {
    expect(pickVoice([voice("r", "tr-TR", { localService: false })], "auto", "tr", [])).toBeNull();
  });
});
