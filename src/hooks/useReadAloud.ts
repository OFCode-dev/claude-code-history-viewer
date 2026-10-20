import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { readAloudHandle, type ReadAloudSource, type SpeechCues } from "@/services/readAloud";
import { useAppStore, type AppStore } from "@/store/useAppStore";
import { sessionLabel } from "@/layouts/Header/breadcrumbModel";

/**
 * A subagent transcript lives at `<project>/<session>/subagents/agent-*.jsonl`
 * (workflow agents one level deeper, under `subagents/workflows/<run>/`); its
 * main session file is `<project>/<session>.jsonl`. Anchored at the file name,
 * so a `subagents` directory higher up the path is left alone.
 */
const SUBAGENT_FILE = /^(.*)[\\/]subagents[\\/](?:workflows[\\/][^\\/]+[\\/])?[^\\/]+\.jsonl$/;

export function mainSessionPath(filePath: string): string {
  const match = SUBAGENT_FILE.exec(filePath);
  return match ? `${match[1]}.jsonl` : filePath;
}

type SourceState = Pick<
  AppStore,
  "selectedProject" | "selectedSession" | "parentSessionStack" | "sessions"
> & { userMetadata: { sessions: Record<string, { customName?: string } | undefined> } };

/**
 * The main session read-aloud follows (decision B): inside a subagent view it
 * is the root of the subagent stack, so a subagent never becomes the source.
 * The subagent path is also mapped to its parent, which covers the moment
 * `navigateBackToParent` has popped the stack but not yet re-selected the parent.
 */
export function selectReadAloudSource(
  state: SourceState,
  untitledSession: (shortId: string) => string,
): ReadAloudSource | null {
  const candidate = state.parentSessionStack[0] ?? state.selectedSession;
  if (!candidate) return null;

  const path = mainSessionPath(candidate.file_path);
  const main = path === candidate.file_path
    ? candidate
    : state.sessions.find((s) => s.file_path === path);
  const title = main
    ? sessionLabel(main, untitledSession, (s) => state.userMetadata.sessions[s.session_id]?.customName)
    : untitledSession((path.split(/[\\/]/).pop() ?? "").replace(/\.jsonl$/, "").slice(-8));

  return { path, title, provider: candidate.provider ?? state.selectedProject?.provider ?? "claude" };
}

/** The open main session as a read-aloud source; stable while its path, title and provider stay the same. */
export function useReadAloudSource(): ReadAloudSource | null {
  const { t } = useTranslation();
  return useAppStore(
    useShallow((s) =>
      selectReadAloudSource(s, (id) => t("header.breadcrumb.untitledSession", { id })),
    ),
  );
}

/**
 * Headless glue between the app and `readAloudHandle` (mounted once in App):
 * - probes the speech engine and mirrors its availability into the store;
 * - pushes the persisted preferences and the translated spoken cues;
 * - follows the open main session by file path (never by object identity);
 * - fetches at once when the tab becomes visible;
 * - one toast per engine error episode, and screen-reader announcements for
 *   state changes nobody hears (reconnecting, recovered, paused). Spoken text
 *   never goes into a live region.
 */
export function useReadAloud(): void {
  const { t } = useTranslation();

  const setAvailability = useAppStore((s) => s.setReadAloudAvailability);
  const announceLayout = useAppStore((s) => s.announceLayout);
  const includeThinking = useAppStore((s) => s.readAloudIncludeThinking);
  const baseRate = useAppStore((s) => s.readAloudBaseRate);
  const voiceURI = useAppStore((s) => s.readAloudVoiceURI);
  const policy = useAppStore((s) => s.readAloudPolicy);
  const maxRate = useAppStore((s) => s.readAloudMaxRate);
  const catchUpThresholdSec = useAppStore((s) => s.readAloudCatchUpThresholdSec);

  const source = useReadAloudSource();
  const path = source?.path ?? null;
  const title = source?.title ?? "";
  const provider = source?.provider;

  useEffect(() => {
    readAloudHandle.probe();
    const sync = () => setAvailability(readAloudHandle.getAvailability().availability);
    sync();
    return readAloudHandle.subscribeAvailability(sync);
  }, [setAvailability]);

  // react-i18next hands out a new `t` when the UI language changes.
  const cues = useMemo<SpeechCues>(
    () => ({
      code: t("readAloud.cue.code"),
      table: t("readAloud.cue.table"),
      thinking: t("readAloud.cue.thinking"),
      restSkipped: t("readAloud.cue.restSkipped"),
      skipped: (count: number) => t("readAloud.cue.skipped", { count }),
    }),
    [t],
  );

  useEffect(() => {
    readAloudHandle.setPrefs({
      includeThinking,
      baseRate,
      voiceURI,
      policy,
      maxRate,
      catchUpThresholdSec,
      cues,
    });
  }, [includeThinking, baseRate, voiceURI, policy, maxRate, catchUpThresholdSec, cues]);

  // The controller ignores this while the mode is off, and a same-path call only refreshes the title.
  useEffect(() => {
    readAloudHandle.setSource(path ? { path, title, provider } : null);
  }, [path, title, provider]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") readAloudHandle.onVisible();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Subscribed by hand so status changes do not re-render App.
  useEffect(() => {
    let previous = readAloudHandle.getSnapshot();
    return readAloudHandle.subscribe(() => {
      const next = readAloudHandle.getSnapshot();
      if (next.engineError && !previous.engineError) toast.error(t("readAloud.engineError"));

      if (next.status === "reconnecting" && previous.status !== "reconnecting") {
        announceLayout(t("readAloud.status.reconnecting"));
      } else if (previous.status === "reconnecting" && next.status !== "off" && next.status !== "idle") {
        announceLayout(t("readAloud.announce.recovered"));
      }
      if (next.status === "idle" && next.idleReason && next.idleReason !== previous.idleReason) {
        announceLayout(t(`readAloud.status.idle.${next.idleReason}`));
      }
      previous = next;
    });
  }, [t, announceLayout]);

  useEffect(() => () => readAloudHandle.stop(), []);
}
