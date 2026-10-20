import { useId, useMemo, useSyncExternalStore } from "react";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/useAppStore";
import {
  READ_ALOUD_BASE_RATES,
  READ_ALOUD_MAX_RATES,
  READ_ALOUD_POLICIES,
  READ_ALOUD_THRESHOLDS_SEC,
} from "@/store/slices/readAloudSlice";
import { readAloudHandle, type BacklogPolicy, type LocalVoiceInfo } from "@/services/readAloud";
import { useTranslation } from "react-i18next";
import { Volume2 } from "lucide-react";

const radioItemClass =
  "pl-2 [&>span:first-child]:hidden data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground";
const headingClass = "text-xs font-medium text-muted-foreground";
const hintClass = "px-2 pb-1.5 text-xs text-muted-foreground";
const scrollClass = "max-h-[min(70vh,32rem)] overflow-y-auto";

/** Local voices grouped by their BCP 47 tag, keeping the engine's language-then-name order. */
function groupByLanguage(voices: readonly LocalVoiceInfo[]): { lang: string; voices: LocalVoiceInfo[] }[] {
  const groups = new Map<string, LocalVoiceInfo[]>();
  for (const voice of voices) {
    const group = groups.get(voice.lang);
    if (group) group.push(voice);
    else groups.set(voice.lang, [voice]);
  }
  return [...groups].map(([lang, list]) => ({ lang, voices: list }));
}

/** "Turkish (Türkiye)" for "tr-TR" in the UI language; the raw tag when the browser cannot name it. */
function languageName(tag: string, uiLanguage: string | undefined): string {
  try {
    const name = new Intl.DisplayNames(uiLanguage ? [uiLanguage] : undefined, { type: "language", languageDisplay: "standard" }).of(tag);
    return name || tag;
  } catch {
    return tag;
  }
}

/**
 * Read-aloud preferences. Only local voices are listed (all of them, grouped
 * by language); session text is never sent to an online voice. The catch-up
 * rate and threshold only apply to the "speed up" backlog policy; under the
 * other policies they stay selectable (kept for later) and are described as
 * inactive, since disabled menu items are skipped by keyboard navigation.
 * Hints are tied to menus and items with `aria-describedby`, because a plain
 * paragraph inside a menu is never reached by arrow keys.
 */
export const ReadAloudMenuGroup = () => {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n?.language;
  const privacyId = useId();
  const speedUpOnlyId = useId();
  const { voices } = useSyncExternalStore(
    readAloudHandle.subscribeAvailability,
    readAloudHandle.getAvailability,
  );

  const includeThinking = useAppStore((s) => s.readAloudIncludeThinking);
  const setIncludeThinking = useAppStore((s) => s.setReadAloudIncludeThinking);
  const voiceURI = useAppStore((s) => s.readAloudVoiceURI);
  const setVoiceURI = useAppStore((s) => s.setReadAloudVoiceURI);
  const baseRate = useAppStore((s) => s.readAloudBaseRate);
  const setBaseRate = useAppStore((s) => s.setReadAloudBaseRate);
  const policy = useAppStore((s) => s.readAloudPolicy);
  const setPolicy = useAppStore((s) => s.setReadAloudPolicy);
  const maxRate = useAppStore((s) => s.readAloudMaxRate);
  const setMaxRate = useAppStore((s) => s.setReadAloudMaxRate);
  const thresholdSec = useAppStore((s) => s.readAloudCatchUpThresholdSec);
  const setThresholdSec = useAppStore((s) => s.setReadAloudCatchUpThresholdSec);

  const groups = useMemo(
    () => groupByLanguage(voices).map((g) => ({ ...g, label: languageName(g.lang, uiLanguage) })),
    [voices, uiLanguage],
  );
  const selectedVoice = voices.find((v) => v.voiceURI === voiceURI);
  // A chosen voice that is no longer installed stays listed so the choice is visible and changeable.
  const missingVoice = voiceURI !== "auto" && !selectedVoice;
  const missingLabel = t("readAloud.settings.voiceMissing", { name: voiceURI });
  const voiceLabel =
    voiceURI === "auto" ? t("readAloud.settings.voiceAuto") : selectedVoice?.name ?? missingLabel;
  const isSpeedUp = policy === "speedUp";
  const catchUpHint = isSpeedUp ? undefined : speedUpOnlyId;
  const catchUpItemClass = isSpeedUp ? radioItemClass : `${radioItemClass} text-muted-foreground`;
  const rateLabel = (rate: number) =>
    t("readAloud.settings.rateValue", {
      rate: new Intl.NumberFormat(uiLanguage, { maximumFractionDigits: 2 }).format(rate),
    });

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Volume2 className="mr-2 h-4 w-4 text-foreground" />
        <span>{t("readAloud.settings.title")}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={`w-64 ${scrollClass}`} aria-describedby={privacyId}>
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={includeThinking}
          onSelect={(e) => {
            e.preventDefault();
            setIncludeThinking(!includeThinking);
          }}
        >
          <span className="flex-1">{t("readAloud.settings.includeThinking")}</span>
          <Switch checked={includeThinking} aria-hidden="true" tabIndex={-1} className="ml-2" />
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="min-w-0 truncate">
              {t("readAloud.settings.voiceWithName", { label: t("readAloud.settings.voice"), name: voiceLabel })}
            </span>
            {voices.length === 0 && <span className="sr-only">{t("readAloud.settings.noVoices")}</span>}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={`max-w-80 ${scrollClass}`}>
            <DropdownMenuRadioGroup
              value={voiceURI}
              onValueChange={setVoiceURI}
              aria-label={t("readAloud.settings.voice")}
            >
              <DropdownMenuRadioItem value="auto" className={radioItemClass}>
                <span>{t("readAloud.settings.voiceAuto")}</span>
              </DropdownMenuRadioItem>
              {missingVoice && (
                <DropdownMenuRadioItem value={voiceURI} className={radioItemClass}>
                  <span className="truncate">{missingLabel}</span>
                </DropdownMenuRadioItem>
              )}
              {groups.map((group) => (
                <DropdownMenuGroup key={group.lang} aria-label={group.label}>
                  <DropdownMenuLabel className={headingClass}>{group.label}</DropdownMenuLabel>
                  {group.voices.map((voice) => (
                    <DropdownMenuRadioItem key={voice.voiceURI} value={voice.voiceURI} className={radioItemClass}>
                      <span className="truncate">{voice.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuRadioGroup>
            {voices.length === 0 && <p className={hintClass}>{t("readAloud.settings.noVoices")}</p>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className={headingClass}>{t("readAloud.settings.speed")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(baseRate)}
          onValueChange={(value) => setBaseRate(Number(value))}
          aria-label={t("readAloud.settings.speed")}
        >
          {READ_ALOUD_BASE_RATES.map((rate) => (
            <DropdownMenuRadioItem key={rate} value={String(rate)} className={radioItemClass}>
              <span>{rateLabel(rate)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className={headingClass}>{t("readAloud.settings.policyTitle")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={policy}
          onValueChange={(value) => setPolicy(value as BacklogPolicy)}
          aria-label={t("readAloud.settings.policyTitle")}
        >
          {READ_ALOUD_POLICIES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} className={radioItemClass}>
              <span>{t(`readAloud.settings.policy.${option}`)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className={headingClass}>{t("readAloud.settings.maxRate")}</DropdownMenuLabel>
        {!isSpeedUp && (
          <p id={speedUpOnlyId} className={hintClass}>
            {t("readAloud.settings.speedUpOnly")}
          </p>
        )}
        <DropdownMenuRadioGroup
          value={String(maxRate)}
          onValueChange={(value) => setMaxRate(Number(value))}
          aria-label={t("readAloud.settings.maxRate")}
        >
          {READ_ALOUD_MAX_RATES.map((rate) => (
            <DropdownMenuRadioItem
              key={rate}
              value={String(rate)}
              aria-describedby={catchUpHint}
              className={catchUpItemClass}
            >
              <span>{rateLabel(rate)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuLabel className={headingClass}>{t("readAloud.settings.threshold")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(thresholdSec)}
          onValueChange={(value) => setThresholdSec(Number(value))}
          aria-label={t("readAloud.settings.threshold")}
        >
          {READ_ALOUD_THRESHOLDS_SEC.map((seconds) => (
            <DropdownMenuRadioItem
              key={seconds}
              value={String(seconds)}
              aria-describedby={catchUpHint}
              className={catchUpItemClass}
            >
              <span>{t("readAloud.settings.thresholdValue", { seconds })}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <p id={privacyId} className={`${hintClass} pt-1`}>
          {t("readAloud.settings.privacy")}
        </p>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
