import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { EngineSnapshot } from "@/services/readAloud";

const { fake } = vi.hoisted(() => ({
  fake: {
    engine: { availability: "ok", voices: [] } as EngineSnapshot,
  },
}));

vi.mock("@/services/readAloud", () => ({
  readAloudHandle: {
    subscribeAvailability: () => () => {},
    getAvailability: () => fake.engine,
  },
}));

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t, i18n: { language: "en" } }),
}));

// Plain DOM stand-ins for the Radix primitives (as in ViewMenuGroup.test.tsx),
// with a small context so radio items report and change their group's value.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  type Children = { children?: React.ReactNode };
  const Radio = React.createContext<{ value?: string; onValueChange?: (value: string) => void }>({});
  return {
    DropdownMenuSub: ({ children }: Children) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({ children }: Children) => <div data-testid="sub-trigger">{children}</div>,
    DropdownMenuSubContent: ({ children, "aria-describedby": describedBy }: Children & { "aria-describedby"?: string }) => (
      <div data-testid="sub-content" aria-describedby={describedBy}>
        {children}
      </div>
    ),
    DropdownMenuGroup: ({ children, "aria-label": label }: Children & { "aria-label"?: string }) => (
      <div role="group" aria-label={label}>
        {children}
      </div>
    ),
    DropdownMenuLabel: ({ children }: Children) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onSelect,
      role,
      "aria-checked": ariaChecked,
    }: Children & {
      onSelect?: (e: { preventDefault: () => void }) => void;
      role?: string;
      "aria-checked"?: boolean;
    }) => (
      <div role={role} aria-checked={ariaChecked} onClick={() => onSelect?.({ preventDefault: () => {} })}>
        {children}
      </div>
    ),
    DropdownMenuRadioGroup: ({
      children,
      value,
      onValueChange,
      "aria-label": label,
    }: Children & { value?: string; onValueChange?: (value: string) => void; "aria-label"?: string }) => (
      <Radio.Provider value={{ value, onValueChange }}>
        <div role="group" aria-label={label}>
          {children}
        </div>
      </Radio.Provider>
    ),
    DropdownMenuRadioItem: ({
      children,
      value,
      disabled,
      "aria-describedby": describedBy,
    }: Children & { value: string; disabled?: boolean; "aria-describedby"?: string }) => {
      const radio = React.useContext(Radio);
      return (
        <div
          role="menuitemradio"
          aria-checked={radio.value === value}
          aria-disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => !disabled && radio.onValueChange?.(value)}
        >
          {children}
        </div>
      );
    },
  };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked }: { checked: boolean }) => <span data-testid="switch" data-checked={checked} />,
}));

import { ReadAloudMenuGroup } from "./ReadAloudMenuGroup";
import { useAppStore } from "@/store/useAppStore";

const voice = (voiceURI: string, name: string, lang: string) => ({ voiceURI, name, lang, isDefault: false });

const group = (name: string) => screen.getByRole("group", { name });
const radio = (scope: HTMLElement, name: RegExp | string) => within(scope).getByRole("menuitemradio", { name });

beforeEach(() => {
  localStorage.clear();
  fake.engine = {
    availability: "ok",
    voices: [voice("v-en-1", "Samantha", "en-US"), voice("v-en-2", "Daniel", "en-GB"), voice("v-tr", "Yelda", "tr-TR")],
  };
  useAppStore.setState({
    readAloudIncludeThinking: true,
    readAloudVoiceURI: "auto",
    readAloudBaseRate: 1,
    readAloudPolicy: "speedUp",
    readAloudMaxRate: 1.6,
    readAloudCatchUpThresholdSec: 20,
  });
});

afterEach(() => {
  cleanup();
});

describe("ReadAloudMenuGroup", () => {
  it("lists Auto and every local voice grouped by language", () => {
    render(<ReadAloudMenuGroup />);
    const voices = group("readAloud.settings.voice");

    expect(radio(voices, "readAloud.settings.voiceAuto")).toHaveAttribute("aria-checked", "true");
    expect(within(group("Turkish (Türkiye)")).getByRole("menuitemradio", { name: "Yelda" })).toBeInTheDocument();
    expect(within(group("English (United States)")).getByRole("menuitemradio", { name: "Samantha" })).toBeInTheDocument();
    expect(within(group("English (United Kingdom)")).getByRole("menuitemradio", { name: "Daniel" })).toBeInTheDocument();

    fireEvent.click(radio(voices, "Yelda"));
    expect(useAppStore.getState().readAloudVoiceURI).toBe("v-tr");
  });

  it("names the chosen voice in one translated label", () => {
    useAppStore.setState({ readAloudVoiceURI: "v-tr" });
    render(<ReadAloudMenuGroup />);

    expect(screen.getAllByTestId("sub-trigger")[1]).toHaveTextContent(
      'readAloud.settings.voiceWithName{"label":"readAloud.settings.voice","name":"Yelda"}',
    );
  });

  it("keeps a chosen voice that is no longer installed visible and says Auto is used", () => {
    useAppStore.setState({ readAloudVoiceURI: "v-gone" });
    render(<ReadAloudMenuGroup />);

    const missing = 'readAloud.settings.voiceMissing{"name":"v-gone"}';
    expect(radio(group("readAloud.settings.voice"), missing)).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByTestId("sub-trigger")[1]).toHaveTextContent(
      `readAloud.settings.voiceWithName{"label":"readAloud.settings.voice","name":${JSON.stringify(missing)}}`,
    );
  });

  it("says when there are no local voices, on the voice trigger too", () => {
    fake.engine = { availability: "noLocalVoice", voices: [] };
    render(<ReadAloudMenuGroup />);

    expect(screen.getAllByText("readAloud.settings.noVoices").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("sub-trigger")[1]).toHaveTextContent("readAloud.settings.noVoices");
  });

  it("toggles reading thinking", () => {
    render(<ReadAloudMenuGroup />);
    const item = screen.getByRole("menuitemcheckbox", { name: "readAloud.settings.includeThinking" });

    expect(item).toHaveAttribute("aria-checked", "true");
    fireEvent.click(item);
    expect(useAppStore.getState().readAloudIncludeThinking).toBe(false);
  });

  it("sets the base speed and the backlog policy", () => {
    render(<ReadAloudMenuGroup />);

    fireEvent.click(radio(group("readAloud.settings.speed"), 'readAloud.settings.rateValue{"rate":"1.25"}'));
    expect(useAppStore.getState().readAloudBaseRate).toBe(1.25);

    fireEvent.click(radio(group("readAloud.settings.policyTitle"), "readAloud.settings.policy.skipToLatest"));
    expect(useAppStore.getState().readAloudPolicy).toBe("skipToLatest");
  });

  it("sets the catch-up rate and threshold under speed-up", () => {
    render(<ReadAloudMenuGroup />);

    fireEvent.click(radio(group("readAloud.settings.maxRate"), 'readAloud.settings.rateValue{"rate":"2"}'));
    fireEvent.click(radio(group("readAloud.settings.threshold"), 'readAloud.settings.thresholdValue{"seconds":40}'));

    expect(useAppStore.getState().readAloudMaxRate).toBe(2);
    expect(useAppStore.getState().readAloudCatchUpThresholdSec).toBe(40);
    expect(screen.queryByText("readAloud.settings.speedUpOnly")).toBeNull();
  });

  it("keeps the catch-up options reachable for the other policies and describes why they are inactive", () => {
    useAppStore.setState({ readAloudPolicy: "readAll" });
    render(<ReadAloudMenuGroup />);

    const maxRates = within(group("readAloud.settings.maxRate")).getAllByRole("menuitemradio");
    const thresholds = within(group("readAloud.settings.threshold")).getAllByRole("menuitemradio");
    expect(maxRates).toHaveLength(4);
    expect(thresholds).toHaveLength(3);
    for (const item of [...maxRates, ...thresholds]) {
      expect(item).not.toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAccessibleDescription("readAloud.settings.speedUpOnly");
    }

    fireEvent.click(radio(group("readAloud.settings.maxRate"), 'readAloud.settings.rateValue{"rate":"2"}'));
    expect(useAppStore.getState().readAloudMaxRate).toBe(2);
  });

  it("states that only local voices are used, as the menu's description", () => {
    render(<ReadAloudMenuGroup />);

    expect(screen.getAllByTestId("sub-content")[0]).toHaveAccessibleDescription("readAloud.settings.privacy");
  });
});
