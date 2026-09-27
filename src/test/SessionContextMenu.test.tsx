/**
 * @fileoverview Integration tests for SessionContextMenu listener wiring.
 * Verifies scroll-close, resize-close, rAF arm guard, and cleanup symmetry.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { SessionContextMenu } from "../components/SessionItem/components/SessionContextMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function makeProps(overrides: Partial<React.ComponentProps<typeof SessionContextMenu>> = {}) {
  return {
    position: { x: 100, y: 100 },
    hasCustomName: false,
    readOnly: false,
    supportsNativeRename: false,
    supportsResumeCommand: true,
    supportsSessionDeletion: true,
    supportsRevealInFinder: true,
    providerId: "claude",
    onClose: vi.fn(),
    onRenameClick: vi.fn(),
    onResetCustomName: vi.fn(),
    onNativeRenameClick: vi.fn(),
    onCopySessionId: vi.fn(),
    onCopyResumeCommand: vi.fn(),
    onCopyFilePath: vi.fn(),
    onRevealInFinder: vi.fn(),
    onDeleteSession: vi.fn(),
    ...overrides,
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("SessionContextMenu listener wiring", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("closes on document scroll after the rAF arm", async () => {
    const onClose = vi.fn();
    render(<SessionContextMenu {...makeProps({ onClose })} />);
    await nextFrame();
    document.dispatchEvent(new Event("scroll"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on window resize after the rAF arm", async () => {
    const onClose = vi.fn();
    render(<SessionContextMenu {...makeProps({ onClose })} />);
    await nextFrame();
    window.dispatchEvent(new Event("resize"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores scroll fired before the rAF arm (synchronous scroll burst on mount)", () => {
    const onClose = vi.fn();
    render(<SessionContextMenu {...makeProps({ onClose })} />);
    document.dispatchEvent(new Event("scroll"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes both listeners on unmount (cleanup symmetric with capture flag)", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<SessionContextMenu {...makeProps({ onClose })} />);
    await nextFrame();
    unmount();
    document.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SessionContextMenu favourite item", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers to add a session that is not a favourite, then closes", () => {
    const onToggleFavorite = vi.fn();
    const onClose = vi.fn();
    render(<SessionContextMenu {...makeProps({ onToggleFavorite, onClose })} />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Add to favorites" }));

    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers to remove a favourite", () => {
    render(<SessionContextMenu {...makeProps({ isFavorite: true, onToggleFavorite: vi.fn() })} />);

    expect(screen.getByRole("menuitem", { name: "Remove from favorites" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add to favorites" })).not.toBeInTheDocument();
  });

  it("leaves the item out when the session cannot be starred here", () => {
    render(<SessionContextMenu {...makeProps({ readOnly: true })} />);

    expect(screen.queryByRole("menuitem", { name: /favorites/ })).not.toBeInTheDocument();
  });
});
