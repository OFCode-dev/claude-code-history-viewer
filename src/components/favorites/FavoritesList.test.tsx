import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FavoriteSessionEntry } from "@/types";
import { FavoritesList } from "./FavoritesList";
import type { FavoriteSessionItem } from "./useFavoriteSessions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

function makeItem(id: string, overrides: Partial<FavoriteSessionItem> = {}): FavoriteSessionItem {
  const entry: FavoriteSessionEntry = {
    sessionId: `/home/me/.claude/projects/-home-me-work-api/${id}.jsonl`,
    starredAt: "2026-09-27T10:00:00.000Z",
    favorite: { projectPath: "/home/me/.claude/projects/-home-me-work-api", title: `Title ${id}` },
  };
  return {
    entry,
    title: `Title ${id}`,
    projectName: "api",
    tooltip: "/home/me/work/api\nLast message 3 hours ago",
    isSelected: false,
    ...overrides,
  };
}

function renderList(items: FavoriteSessionItem[], canRemove = true) {
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  const utils = render(<FavoritesList items={items} onOpen={onOpen} onRemove={onRemove} canRemove={canRemove} />);
  return { ...utils, onOpen, onRemove };
}

describe("FavoritesList", () => {
  it("renders nothing without favourites", () => {
    const { container } = renderList([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one line per favourite with title, project and a tooltip", () => {
    renderList([makeItem("a"), makeItem("b", { projectName: "web" })]);

    const list = screen.getByRole("list", { name: "Favorites" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass("h-7");

    const open = within(rows[1]!).getByRole("button", { name: /Title b/ });
    expect(open).toHaveTextContent("Title b");
    expect(open).toHaveTextContent("web");
    expect(open).toHaveAttribute("title", "/home/me/work/api\nLast message 3 hours ago");
  });

  it("opens a favourite when its row is clicked", () => {
    const item = makeItem("a");
    const { onOpen, onRemove } = renderList([item]);

    fireEvent.click(screen.getByRole("button", { name: /Title a/ }));

    expect(onOpen).toHaveBeenCalledWith(item.entry);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("unstars from the star without opening", () => {
    const item = makeItem("a");
    const { onOpen, onRemove } = renderList([item]);

    fireEvent.click(screen.getByRole("button", { name: "Remove from favorites" }));

    expect(onRemove).toHaveBeenCalledWith(item.entry);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("highlights the favourite that is open", () => {
    renderList([makeItem("a"), makeItem("b", { isSelected: true })]);

    const [plain, open] = screen.getAllByRole("listitem");
    expect(open).toHaveClass("bg-accent/10");
    expect(open?.className).toContain("shadow-[inset_2px_0_0_var(--color-accent)]");
    expect(within(open!).getByRole("button", { name: /Title b/ })).toHaveAttribute("aria-current", "true");
    expect(plain).not.toHaveClass("bg-accent/10");
    expect(within(plain!).getByRole("button", { name: /Title a/ })).not.toHaveAttribute("aria-current");
  });

  it("only marks favourites when they cannot be removed", () => {
    renderList([makeItem("a")], false);

    expect(screen.getByRole("img", { name: "Favorite" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove from favorites" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Title a/ })).toBeInTheDocument();
  });
});
