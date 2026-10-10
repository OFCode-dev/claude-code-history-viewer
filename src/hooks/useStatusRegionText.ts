import { useEffect, useRef, useState } from "react";
import type { LayoutAnnouncement } from "@/store/slices/layoutSlice";

/** Gap before re-inserting identical words, so screen readers speak them again. */
const REPEAT_GAP_MS = 60;

/**
 * Text for the app's polite status region, shared by loading states and
 * layout announcements (reading mode, pins). Whichever changed last owns
 * the region. A cleared announcement leaves the region empty instead of
 * bringing back an older loading message, and an announcement whose words
 * equal the current text is emptied first so it is announced again.
 */
export function useStatusRegionText(
  status: string,
  announcement: LayoutAnnouncement | null
): string {
  const [text, setText] = useState(announcement?.text || status);
  const lastStatus = useRef(status);
  const lastAnnouncementId = useRef<number | null>(announcement?.id ?? null);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    if (status === lastStatus.current) return;
    lastStatus.current = status;
    setText(status);
  }, [status]);

  useEffect(() => {
    const id = announcement?.id ?? null;
    if (id === lastAnnouncementId.current) return;
    lastAnnouncementId.current = id;
    if (!announcement) {
      setText("");
      return;
    }
    if (textRef.current !== announcement.text) {
      setText(announcement.text);
      return;
    }
    setText("");
    const timer = window.setTimeout(() => setText(announcement.text), REPEAT_GAP_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  return text;
}
