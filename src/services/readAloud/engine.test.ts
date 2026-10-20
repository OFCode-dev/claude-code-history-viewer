import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSpeechEngine, type EngineDeps } from "./engine";
import type { SpeakOutcome, SpeakRequest } from "./types";

interface FakeVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

class FakeUtterance {
  voice: FakeVoice | null = null;
  lang = "";
  rate = 1;
  onstart: ((ev: unknown) => void) | null = null;
  onend: ((ev: unknown) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  constructor(public text: string) {}
  start() {
    this.onstart?.({});
  }
  end() {
    this.onend?.({});
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
}

class FakeSynth {
  voices: FakeVoice[] = [];
  spoken: FakeUtterance[] = [];
  paused = false;
  private listeners: Array<() => void> = [];
  getVoices = vi.fn(() => this.voices);
  speak = vi.fn((u: FakeUtterance) => {
    this.spoken.push(u);
  });
  cancel = vi.fn();
  resume = vi.fn(() => {
    this.paused = false;
  });
  addEventListener(type: string, fn: () => void) {
    if (type === "voiceschanged") this.listeners.push(fn);
  }
  setVoices(voices: FakeVoice[], fire = true) {
    this.voices = voices;
    if (fire) this.listeners.forEach((fn) => fn());
  }
  get last(): FakeUtterance {
    const u = this.spoken[this.spoken.length - 1];
    if (!u) throw new Error("nothing spoken");
    return u;
  }
}

const voice = (voiceURI: string, lang: string, extra: Partial<FakeVoice> = {}): FakeVoice => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService: true,
  default: false,
  ...extra,
});

const LOCAL_VOICES = [
  voice("samantha", "en-US", { default: true }),
  voice("daniel", "en-GB"),
  voice("yelda", "tr-TR"),
  voice("online-tr", "tr-TR", { localService: false }),
];

let synth: FakeSynth | null;
let languages: string[];

const makeEngine = () => {
  const deps: EngineDeps = {
    synth: () => synth as unknown as ReturnType<EngineDeps["synth"]>,
    createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    languages: () => languages,
  };
  return new WebSpeechEngine(deps);
};

const request = (text: string, extra: Partial<SpeakRequest> = {}): SpeakRequest => ({
  text,
  lang: "en",
  voiceURI: "auto",
  rate: 1,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  synth = new FakeSynth();
  languages = ["en-US"];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("availability", () => {
  it("is noApi without speechSynthesis", () => {
    synth = null;
    const engine = makeEngine();
    engine.probe();
    expect(engine.getSnapshot().availability).toBe("noApi");
  });

  it("is ok immediately when local voices exist, listing local voices only", () => {
    synth!.setVoices(LOCAL_VOICES, false);
    const engine = makeEngine();
    engine.probe();
    const snap = engine.getSnapshot();
    expect(snap.availability).toBe("ok");
    expect(snap.voices.map((v) => v.voiceURI)).toEqual(["daniel", "samantha", "yelda"]);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("counts voices arriving via voiceschanged within 2 s", () => {
    const engine = makeEngine();
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.probe();
    expect(engine.getSnapshot().availability).toBe("unknown");
    vi.advanceTimersByTime(500);
    synth!.setVoices(LOCAL_VOICES);
    expect(engine.getSnapshot().availability).toBe("ok");
    expect(listener).toHaveBeenCalled();
  });

  it("finds voices by polling when voiceschanged never fires", () => {
    const engine = makeEngine();
    engine.probe();
    vi.advanceTimersByTime(300);
    synth!.setVoices(LOCAL_VOICES, false);
    vi.advanceTimersByTime(100);
    expect(engine.getSnapshot().availability).toBe("ok");
  });

  it("reports noLocalVoice after 2 s and recovers on a later voiceschanged", () => {
    const engine = makeEngine();
    engine.probe();
    vi.advanceTimersByTime(2000);
    expect(engine.getSnapshot().availability).toBe("noLocalVoice");
    synth!.setVoices(LOCAL_VOICES);
    expect(engine.getSnapshot().availability).toBe("ok");
  });

  it("reports noLocalVoice when only remote voices exist", () => {
    synth!.setVoices([voice("online", "en-US", { localService: false })], false);
    const engine = makeEngine();
    engine.probe();
    expect(engine.getSnapshot().availability).toBe("noLocalVoice");
  });

  it("keeps the same snapshot reference when nothing changed", () => {
    synth!.setVoices(LOCAL_VOICES, false);
    const engine = makeEngine();
    engine.probe();
    const snap = engine.getSnapshot();
    synth!.setVoices([...LOCAL_VOICES]);
    expect(engine.getSnapshot()).toBe(snap);
  });
});

describe("prime", () => {
  it("speaks synchronously with a local voice", () => {
    synth!.setVoices(LOCAL_VOICES, false);
    const engine = makeEngine();
    engine.prime("Read aloud is on", "auto");
    expect(synth!.speak).toHaveBeenCalledTimes(1);
    expect(synth!.last.voice?.voiceURI).toBe("samantha");
    expect(synth!.last.lang).toBe("en-US");
  });

  it("never falls back to the browser default voice", () => {
    synth!.setVoices([voice("online", "en-US", { localService: false })], false);
    const engine = makeEngine();
    engine.prime("Read aloud is on", "auto");
    expect(synth!.speak).not.toHaveBeenCalled();
  });

  it("holds the first speak until the confirmation has finished", () => {
    synth!.setVoices(LOCAL_VOICES, false);
    const engine = makeEngine();
    engine.prime("Read aloud is on", "auto");
    const primed = synth!.last;
    engine.speak(request("Hello."), vi.fn());
    expect(synth!.speak).toHaveBeenCalledTimes(1);
    primed.end();
    expect(synth!.speak).toHaveBeenCalledTimes(2);
    expect(synth!.last.text).toBe("Hello.");
  });
});

describe("speak", () => {
  let engine: WebSpeechEngine;
  let done: ReturnType<typeof vi.fn<(o: SpeakOutcome) => void>>;

  beforeEach(() => {
    synth!.setVoices(LOCAL_VOICES, false);
    engine = makeEngine();
    engine.probe();
    done = vi.fn<(o: SpeakOutcome) => void>();
  });

  it("sets a local voice, its lang and the rate, and reports end once", () => {
    engine.speak(request("Merhaba.", { lang: "tr", rate: 1.25 }), done);
    const u = synth!.last;
    expect(u.voice?.voiceURI).toBe("yelda");
    expect(u.lang).toBe("tr-TR");
    expect(u.rate).toBe(1.25);
    u.start();
    u.end();
    u.end();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith({ type: "end" });
  });

  it("uses an explicit voice and the navigator region match", () => {
    engine.speak(request("Hi.", { voiceURI: "daniel", lang: "tr" }), done);
    expect(synth!.last.voice?.voiceURI).toBe("daniel");
    languages = ["en-GB"];
    engine.speak(request("Hi."), done);
    vi.advanceTimersByTime(50);
    expect(synth!.last.voice?.voiceURI).toBe("daniel");
  });

  it("re-resolves the voice from a fresh getVoices() before each speak", () => {
    synth!.voices = [voice("other-en", "en-AU")];
    engine.speak(request("Hi."), done);
    expect(synth!.last.voice?.voiceURI).toBe("other-en");
  });

  it("resumes a paused synth before speaking", () => {
    synth!.paused = true;
    engine.speak(request("Hi."), done);
    expect(synth!.resume).toHaveBeenCalled();
    expect(synth!.resume.mock.invocationCallOrder[0]).toBeLessThan(synth!.speak.mock.invocationCallOrder[0]!);
  });

  it("retries once when onstart never fires, then skips", () => {
    engine.speak(request("Hi."), done);
    vi.advanceTimersByTime(3000);
    expect(synth!.cancel).toHaveBeenCalledTimes(1);
    expect(synth!.speak).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(synth!.speak).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3000);
    expect(done).toHaveBeenCalledWith({ type: "skipped" });
    expect(synth!.speak).toHaveBeenCalledTimes(2);
  });

  it("cancels a wedged utterance after est*2+5 s and the next chunk still starts", () => {
    engine.speak(request("x".repeat(150)), done); // est 10 s at 1x → watchdog 25 s
    const wedged = synth!.last;
    wedged.start();
    vi.advanceTimersByTime(24_999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(synth!.cancel).toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ type: "skipped" });
    wedged.fail("interrupted"); // late event from our cancel
    expect(done).toHaveBeenCalledTimes(1);

    const next = vi.fn();
    engine.speak(request("Next."), next);
    expect(synth!.speak).toHaveBeenCalledTimes(1); // waits 50 ms after cancel()
    vi.advanceTimersByTime(50);
    expect(synth!.speak).toHaveBeenCalledTimes(2);
    synth!.last.start();
    synth!.last.end();
    expect(next).toHaveBeenCalledWith({ type: "end" });
  });

  it("sizes the watchdog for the language: a full Han chunk is still speaking at 32 s", () => {
    // Mandarin runs at ~4 chars/s: 200 chars ≈ 50 s at 1x → watchdog 105 s.
    engine.speak(request("汉".repeat(200), { lang: "zh" }), done);
    synth!.last.start();
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    expect(synth!.cancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(45_000);
    expect(done).toHaveBeenCalledWith({ type: "skipped" });
  });

  it("treats interrupted after our own cancel() as normal", () => {
    engine.speak(request("Hi."), done);
    const u = synth!.last;
    u.start();
    engine.cancel();
    u.fail("interrupted");
    u.fail("canceled");
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
  });

  it("reports a real synthesis error", () => {
    engine.speak(request("Hi."), done);
    synth!.last.fail("synthesis-failed");
    expect(done).toHaveBeenCalledWith({ type: "error", code: "synthesis-failed" });
  });

  it("reports an error when no local voice exists", () => {
    synth!.voices = [];
    engine.speak(request("Hi."), done);
    expect(done).toHaveBeenCalledWith({ type: "error", code: "no-local-voice" });
    expect(synth!.speak).not.toHaveBeenCalled();
  });

  it("drops a deferred speak when cancel() comes during the 50 ms gap", () => {
    engine.cancel();
    engine.speak(request("Hi."), done);
    engine.cancel();
    vi.advanceTimersByTime(100);
    expect(synth!.speak).not.toHaveBeenCalled();
  });
});
