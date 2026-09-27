import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { englishT } from "@/test/utils/englishTranslator";
import type { UseFavoriteSessionsResult } from "@/components/favorites/useFavoriteSessions";
import { ExplorerFavorites } from "../ExplorerFavorites";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const favorites: UseFavoriteSessionsResult = {
  items: [],
  onOpen: vi.fn(),
  onRemove: vi.fn(),
  canRemove: true,
};

vi.mock("@/components/favorites/useFavoriteSessions", () => ({
  useFavoriteSessions: () => favorites,
}));

const item = {
  entry: {
    sessionId: "/p/a.jsonl",
    starredAt: "2026-09-27T10:00:00Z",
    favorite: { projectPath: "/home/u/.claude/projects/-a", title: "Fix login redirect" },
  },
  title: "Fix login redirect",
  projectName: "web",
  tooltip: "/home/u/web",
  isSelected: false,
} as UseFavoriteSessionsResult["items"][number];

describe("ExplorerFavorites", () => {
  beforeEach(() => {
    favorites.items = [];
    localStorage.clear();
  });

  it("renders nothing until a session is starred", () => {
    const { container } = render(<ExplorerFavorites />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists favourites under a collapsible header that remembers its state", () => {
    favorites.items = [item];
    const { unmount } = render(<ExplorerFavorites />);

    const header = screen.getByRole("button", { name: /Favorites/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list", { name: "Favorites" })).toHaveTextContent("Fix login redirect");

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Favorites" })).toBeNull();

    unmount();
    render(<ExplorerFavorites />);
    expect(screen.getByRole("button", { name: /Favorites/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a favourite from its row", () => {
    favorites.items = [item];
    render(<ExplorerFavorites />);
    fireEvent.click(screen.getByRole("button", { name: /Fix login redirect/ }));
    expect(favorites.onOpen).toHaveBeenCalledWith(item.entry);
  });
});
