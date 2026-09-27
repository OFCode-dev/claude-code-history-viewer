import { describe, expect, it } from "vitest";
import type { ClaudeProject } from "../types";
import {
  buildExplorerModel,
  filterExplorerModel,
  findRowForProject,
  getLocationCount,
  locateInExplorer,
  OTHER_LOCATIONS_GROUP_KEY,
  TEMPORARY_BUCKET_KEY,
  UNAVAILABLE_BUCKET_KEY,
  type ExplorerGroup,
  type ExplorerModel,
  type ExplorerRow,
} from "./explorerModel";

const H = "/home/fx";

function project(actualPath: string, overrides: Partial<ClaudeProject> = {}): ClaudeProject {
  return {
    name: actualPath.split(/[\\/]/).filter(Boolean).pop() ?? actualPath,
    path: `/store/${overrides.provider ?? "claude"}${actualPath.replace(/\\/g, "/")}`,
    actual_path: actualPath,
    session_count: 1,
    message_count: 1,
    last_modified: "2026-09-10T00:00:00Z",
    provider: "claude",
    ...overrides,
  };
}

/** `[prefix]label` for locations, `label/` for pure folders, `{children}` when nested. */
function outline(rows: ExplorerRow[]): string {
  return rows
    .map((row) => {
      const prefix = row.prefix ? `[${row.prefix}]` : "";
      const self = `${prefix}${row.label}${row.location ? "" : "/"}`;
      return row.children.length > 0 ? `${self}{${outline(row.children)}}` : self;
    })
    .join(",");
}

const group = (model: ExplorerModel, id: ExplorerGroup["id"]) =>
  model.groups.find((candidate) => candidate.id === id);

function findRow(rows: ExplorerRow[], label: string): ExplorerRow | undefined {
  for (const row of rows) {
    if (row.label === label) return row;
    const nested = findRow(row.children, label);
    if (nested) return nested;
  }
  return undefined;
}

const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}T10:00:00Z`;

// The fixture HOME's layout (scratch/fixtures/make_fixture_home.py), home = /home/fx.
function fixtureProjects(): ClaudeProject[] {
  const claude = (rel: string, sessions: number, d: number, extra: Partial<ClaudeProject> = {}) =>
    project(`${H}/${rel}`, { session_count: sessions, last_modified: day(d), ...extra });
  const codex = (rel: string, sessions: number, d: number, extra: Partial<ClaudeProject> = {}) =>
    project(rel.startsWith("/") ? rel : `${H}/${rel}`, {
      session_count: sessions,
      last_modified: day(d),
      provider: "codex",
      name: rel.split("/").pop(),
      ...extra,
    });
  return [
    claude("projects", 2, 24),
    claude("projects/atlas-ai-ecosystem", 5, 24),
    claude("projects/crawl-atlas", 6, 23),
    claude("projects/lab-management", 5, 20),
    claude("projects/lab-management/relay-vcn", 3, 20),
    claude("projects/lab-management/buzz-relay", 1, 10),
    claude("projects/lab-management/ducs", 1, 10),
    claude("projects/lab-management/loop-eng", 1, 9),
    claude("projects/lab-management/uptimekuma", 1, 9),
    claude("projects/lab-management/sessions", 2, 19),
    claude("projects/lab-management/skills-skills", 2, 18),
    claude("projects/telegram-hub", 5, 22),
    claude("projects/meta-connector", 3, 15),
    claude("projects/odoo", 2, 5),
    claude("projects/gateway", 2, 5),
    claude("projects/control-center", 1, 6),
    claude("projects/teams", 2, 6),
    claude("projects/tmux", 1, 7),
    claude("projects/cc-yank", 2, 7),
    claude("projects/pages", 1, 8),
    claude("projects/market-language-review-20260906", 2, 6),
    claude("projects/private-review-pilot", 1, 12),
    claude("projects/Bakbi", 2, 3),
    claude("projects/Hermes-n8n", 1, 2),
    claude(".claude/automation", 4, 24),
    claude(".claude-mem/observer-sessions", 30, 21),
    claude("projects/old-prototype", 2, 1, { path_status: "unavailable" }),
    claude("projects/lab-management/retired-bot", 2, 2, { path_status: "unavailable" }),
    claude("work/acme", 3, 11),
    claude("work/acme/api", 4, 12),
    claude("work/acme/web", 2, 12),
    claude("work/acme/services/billing", 2, 13),
    claude("work/tools/cli", 3, 14),
    claude("work/tools/cli/plugins/lint", 3, 14),
    claude("research/2026-09-10-evidence", 1, 10),
    claude("research/2026-09-12-language", 1, 12),
    claude("notes", 1, 9),
    codex("projects/atlas-ai-ecosystem", 3, 24),
    codex("projects/atlas-ai-ecosystem/tmp/debate2", 2, 16),
    codex("projects/crawl-atlas/research/2026-09-09-market-check", 2, 9),
    codex("projects/crawl-atlas/research/2026-09-10-evidence-round", 2, 10),
    codex("projects/crawl-atlas/crawl/reports/blog-classify", 1, 11),
    codex("projects/telegram-hub", 2, 22),
    codex("projects/lab-management/sessions/scratch/review", 1, 19),
    codex(".claude/automation", 1, 24),
    codex(".claude/jobs/ab12cd34/tmp", 1, 24),
    codex("transfer-video", 2, 14),
    codex("projects/gone-experiment", 1, 1, { path_status: "unavailable" }),
    codex(
      "/tmp/claude-60999/-home-fx-projects-crawl-atlas/0f3c9a12-7b1d-4c2e-9a8f-1b2c3d4e5f60/scratchpad",
      2,
      12
    ),
    codex(
      "/tmp/claude-60999/-home-fx-projects-atlas-ai-ecosystem/5d1e2f3a-0000-4000-8000-000000000000/scratchpad/debate",
      1,
      17
    ),
    codex("/tmp/cchv-fixture-tmp.AbCdEf12", 1, 8),
  ];
}

describe("buildExplorerModel — locations", () => {
  it("merges every provider project recorded for one folder", () => {
    const claude = project(`${H}/projects/app`, { session_count: 3, last_modified: day(20) });
    const codex = project(`${H}/projects/app/`, {
      provider: "codex",
      session_count: 5,
      last_modified: day(12),
    });
    const model = buildExplorerModel([claude, codex, project(`${H}/notes`)]);

    const rows = [...model.main, ...(group(model, "other")?.rows ?? [])];
    const app = findRow(rows, "app")!;
    expect(app.location).toMatchObject({
      primary: codex,
      sessionCount: 8,
      lastActivity: Date.parse(day(20)),
      providers: ["codex", "claude"],
    });
    expect(app.location!.projects).toEqual([claude, codex]);
    expect(app.key).toBe(`loc:home/fx/projects/app`);
  });

  it("breaks a session-count tie by the latest activity", () => {
    const older = project(`${H}/a`, { session_count: 2, last_modified: day(1) });
    const newer = project(`${H}/a`, { provider: "codex", session_count: 2, last_modified: day(9) });
    const model = buildExplorerModel([older, newer]);

    expect(model.main[0]!.location!.primary).toBe(newer);
  });

  it("merges Windows case and separator variants", () => {
    const model = buildExplorerModel([
      project("C:\\Users\\Jack\\src\\api"),
      project("c:/users/jack/src/API", { provider: "codex" }),
      project("C:\\Users\\Jack\\src\\app"),
      project("C:\\Users\\Jack\\deep\\er\\tool"),
    ]);

    expect(getLocationCount(model)).toBe(3);
    expect(outline(model.main)).toBe("src/{api,app},[deep\\er\\]tool");
    expect(findRow(model.main, "api")!.location!.projects).toHaveLength(2);
  });
});

describe("buildExplorerModel — workspace root", () => {
  it("detects the folder holding most projects, like ~/projects on real data", () => {
    const model = buildExplorerModel(fixtureProjects());

    expect(model.homeDir).toBe(H);
    expect(model.root).toEqual({ path: `${H}/projects`, displayPath: "~/projects" });
  });

  it("does not pick a deeper folder that holds less than half of the projects", () => {
    // ~/projects/lab-management holds 8 of 41 locations; ~/projects holds 28.
    const model = buildExplorerModel(fixtureProjects());

    expect(model.root?.path).not.toBe(`${H}/projects/lab-management`);
  });

  it("uses the deepest qualifying folder", () => {
    const model = buildExplorerModel([
      project(`${H}/code/repos/a`),
      project(`${H}/code/repos/b`),
      project(`${H}/code/repos/c`),
      project(`${H}/notes`),
    ]);

    expect(model.root?.displayPath).toBe("~/code/repos");
    expect(outline(model.main)).toBe("a,b,c");
    expect(outline(group(model, "other")!.rows)).toBe("notes");
  });

  it("finds no root below three projects and shows the home-relative tree instead", () => {
    const model = buildExplorerModel([
      project(`${H}/a/x`),
      project(`${H}/a/y`),
      project(`${H}/notes`),
    ]);

    expect(model.root).toBeNull();
    expect(outline(model.main)).toBe("a/{x,y},notes");
    expect(group(model, "other")).toBeUndefined();
  });

  it("finds no root when two folders tie at exactly half", () => {
    const model = buildExplorerModel([
      project(`${H}/a/1`),
      project(`${H}/a/2`),
      project(`${H}/a/3`),
      project(`${H}/b/1`),
      project(`${H}/b/2`),
      project(`${H}/b/3`),
    ]);

    expect(model.root).toBeNull();
    expect(outline(model.main)).toBe("a/{1,2,3},b/{1,2,3}");
  });

  it("never treats home itself as the root", () => {
    const model = buildExplorerModel([project(`${H}/a`), project(`${H}/b`), project(`${H}/c`)]);

    expect(model.root).toBeNull();
  });

  it("uses the home hint, so a custom HOME shows as ~", () => {
    const paths = ["projects/a", "projects/b", "projects/c", "notes"].map((rel) =>
      project(`/home/warden/fixture-home/${rel}`)
    );
    const model = buildExplorerModel(paths, { homeHint: "/home/warden/fixture-home" });

    expect(model.homeDir).toBe("/home/warden/fixture-home");
    expect(model.root?.displayPath).toBe("~/projects");
  });
});

describe("buildExplorerModel — main section", () => {
  it("matches the expected fixture layout (name sort)", () => {
    const model = buildExplorerModel(fixtureProjects());

    expect(model.main.map((row) => row.label)).toEqual([
      "atlas-ai-ecosystem",
      "Bakbi",
      "cc-yank",
      "control-center",
      "crawl-atlas",
      "gateway",
      "Hermes-n8n",
      "lab-management",
      "market-language-review-20260906",
      "meta-connector",
      "odoo",
      "pages",
      "private-review-pilot",
      "teams",
      "telegram-hub",
      "tmux",
    ]);
    expect(outline([findRow(model.main, "atlas-ai-ecosystem")!])).toBe(
      "atlas-ai-ecosystem{[tmp/]debate2}"
    );
    expect(outline([findRow(model.main, "crawl-atlas")!])).toBe(
      "crawl-atlas{[crawl/reports/]blog-classify,research/{2026-09-09-market-check,2026-09-10-evidence-round}}"
    );
    expect(outline([findRow(model.main, "lab-management")!])).toBe(
      "lab-management{buzz-relay,ducs,loop-eng,relay-vcn,sessions{[scratch/]review},skills-skills,uptimekuma}"
    );
  });

  it("carries provider chips and the total on a merged row", () => {
    const model = buildExplorerModel(fixtureProjects());
    const atlas = findRow(model.main, "atlas-ai-ecosystem")!;

    expect(atlas.location!.providers).toEqual(["claude", "codex"]);
    expect(atlas.location!.sessionCount).toBe(8);
  });

  it("renders a folder that is itself a project as one row (no duplicate child)", () => {
    const model = buildExplorerModel(fixtureProjects());
    const lab = findRow(model.main, "lab-management")!;

    expect(lab.location?.path).toBe(`${H}/projects/lab-management`);
    expect(lab.key).toBe("dir:home/fx/projects/lab-management");
    expect(lab.children.some((child) => child.label === "lab-management")).toBe(false);
    const all = JSON.stringify(outline(model.main));
    expect(all.match(/lab-management/g)).toHaveLength(1);
  });

  it("compacts single-child folder chains and lifts lone projects with a dim prefix", () => {
    const model = buildExplorerModel([
      project(`${H}/repos/x/tools/cli/a`),
      project(`${H}/repos/x/tools/cli/b`),
      project(`${H}/repos/y`),
      project(`${H}/repos/z/deep/er/leaf`),
    ]);

    expect(model.root?.displayPath).toBe("~/repos");
    // Sorted by name, not by the dim prefix.
    expect(outline(model.main)).toBe("[x/tools/]cli/{a,b},[z/deep/er/]leaf,y");
    const cli = model.main[0]!;
    expect(cli.path).toBe(`${H}/repos/x/tools/cli`);
    expect(cli.key).toBe("dir:home/fx/repos/x/tools/cli");
  });

  it("does not compact through a folder that is itself a project", () => {
    const model = buildExplorerModel([
      project(`${H}/repos/tools`),
      project(`${H}/repos/tools/cli/plugins/lint`),
      project(`${H}/repos/tools/cli/plugins/fmt`),
      project(`${H}/repos/other`),
    ]);

    expect(outline(model.main)).toBe("other,tools{[cli/]plugins/{fmt,lint}}");
  });

  it("nests linked worktrees under their main location", () => {
    const main = project(`${H}/projects/app`, { git_info: { worktree_type: "main" } });
    const inside = project(`${H}/projects/app/.claude/worktrees/agent-1`, {
      git_info: { worktree_type: "linked", main_project_path: `${H}/projects/app` },
    });
    const elsewhere = project(`${H}/wt/app-feature`, {
      git_info: { worktree_type: "linked", main_project_path: `${H}/projects/app/` },
    });
    const model = buildExplorerModel([
      main,
      inside,
      elsewhere,
      project(`${H}/projects/b`),
      project(`${H}/projects/c`),
    ]);

    const app = findRow(model.main, "app")!;
    expect(app.key).toBe("dir:home/fx/projects/app");
    expect(
      app.children.map((row) => ({ label: row.label, prefix: row.prefix, variant: row.variant }))
    ).toEqual([
      { label: "agent-1", prefix: ".claude/worktrees/", variant: "worktree" },
      { label: "app-feature", prefix: "~/wt/", variant: "worktree" },
    ]);
    // Moved, not copied: nothing is left at the worktree's own folder.
    expect(group(model, "other")).toBeUndefined();
  });

  it("leaves a linked worktree in place when its main project is not listed", () => {
    const model = buildExplorerModel([
      project(`${H}/projects/a`),
      project(`${H}/projects/b`),
      project(`${H}/projects/wt`, {
        git_info: { worktree_type: "linked", main_project_path: "/elsewhere/repo" },
      }),
    ]);

    expect(outline(model.main)).toBe("a,b,wt");
    expect(findRow(model.main, "wt")!.variant).toBe("default");
  });
});

describe("buildExplorerModel — other locations and buckets", () => {
  it("lists the root's own folder, other home folders and outside paths, home first", () => {
    const model = buildExplorerModel([
      ...fixtureProjects(),
      project(H, { session_count: 2 }),
      project("/opt/services/a"),
      project("/opt/services/b"),
      project("unknown", { name: "Antigravity CLI", provider: "antigravity" }),
    ]);
    const other = group(model, "other")!;

    expect(other.key).toBe(OTHER_LOCATIONS_GROUP_KEY);
    expect(outline(other.rows)).toBe(
      [
        "~",
        "[.claude/]automation",
        "notes",
        "[.claude-mem/]observer-sessions",
        "projects",
        "research/{2026-09-10-evidence,2026-09-12-language}",
        "[/opt/]services/{a,b}",
        "transfer-video",
        "work/{acme{api,[services/]billing,web},[tools/]cli{[plugins/]lint}}",
        "Antigravity CLI",
      ].join(",")
    );
    expect(other.rows[0]).toMatchObject({ variant: "home", path: H });
    expect(other.rows.at(-1)).toMatchObject({ variant: "unknown", path: "" });
    expect(other.locationCount).toBe(17);
  });

  it("buckets unavailable, temporary and job folders (recent first)", () => {
    const model = buildExplorerModel(fixtureProjects());

    expect(model.groups.map((candidate) => candidate.key)).toEqual([
      OTHER_LOCATIONS_GROUP_KEY,
      TEMPORARY_BUCKET_KEY,
      UNAVAILABLE_BUCKET_KEY,
    ]);
    const temporary = group(model, "temporary")!;
    expect(temporary.rows.map((row) => [row.label, row.hint])).toEqual([
      ["job ab12cd34", "~/.claude/jobs"],
      ["atlas-ai-ecosystem scratchpad/debate", "5d1e2f"],
      ["crawl-atlas scratchpad", "0f3c9a"],
      ["cchv-fixture-tmp.AbCdEf12", "/tmp"],
    ]);
    const unavailable = group(model, "unavailable")!;
    // Same activity: by name.
    expect(unavailable.rows.map((row) => [row.label, row.hint])).toEqual([
      ["retired-bot", "~/projects/lab-management"],
      ["gone-experiment", "~/projects"],
      ["old-prototype", "~/projects"],
    ]);
    expect(unavailable.rows.every((row) => row.children.length === 0)).toBe(true);
  });

  it("treats <home>/.claude/jobs as temporary even under a custom HOME", () => {
    const model = buildExplorerModel(
      [
        project("/home/warden/fx/.claude/jobs/0123456789/tmp"),
        project("/home/warden/fx/notes"),
      ],
      { homeHint: "/home/warden/fx" }
    );

    expect(group(model, "temporary")!.rows.map((row) => [row.label, row.hint])).toEqual([
      ["job 01234567", "~/.claude/jobs"],
    ]);
  });

  it("names scratchpads by the last token when no project owns them", () => {
    const model = buildExplorerModel([
      project("/private/tmp/claude-501/-Users-jack-src-lonely-tool/abcdef12-3456/scratchpad"),
      project("/tmp", { last_modified: day(5) }),
      project("/Users/jack/src/app"),
    ]);

    expect(group(model, "temporary")!.rows.map((row) => [row.label, row.hint])).toEqual([
      ["tool scratchpad", "abcdef"],
      ["/tmp", ""],
    ]);
  });

  it("uses translated label formats when given", () => {
    const model = buildExplorerModel(fixtureProjects(), {
      text: { scratchpad: (owner) => `${owner} · notes`, job: (id) => `task ${id}` },
    });

    expect(group(model, "temporary")!.rows.map((row) => row.label)).toContain("task ab12cd34");
    expect(group(model, "temporary")!.rows.map((row) => row.label)).toContain(
      "crawl-atlas · notes"
    );
  });

  it("sends projects without a usable path to Other locations, last, labelled by name", () => {
    const model = buildExplorerModel([
      project("/home/fx/a/one"),
      project("/home/fx/a/two"),
      project("/home/fx/a/three"),
      project("unknown", { name: "Antigravity CLI", provider: "antigravity" }),
      project("", { name: "Mystery", provider: "cline" }),
      project("relative/dir", { name: "Relative", provider: "aider" }),
    ]);
    const rows = group(model, "other")!.rows;

    expect(rows.map((row) => [row.label, row.variant])).toEqual([
      ["Antigravity CLI", "unknown"],
      ["Mystery", "unknown"],
      ["Relative", "unknown"],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
  });
});

describe("buildExplorerModel — sorting", () => {
  it("sorts by name case-insensitively and numerically, folders interleaved", () => {
    const model = buildExplorerModel([
      project(`${H}/p/item10`),
      project(`${H}/p/Item9`),
      project(`${H}/p/beta/x`),
      project(`${H}/p/beta/y`),
      project(`${H}/p/alpha`),
    ]);

    expect(outline(model.main)).toBe("alpha,beta/{x,y},Item9,item10");
  });

  it("sorts by the latest activity in each subtree for recent", () => {
    const model = buildExplorerModel(
      [
        project(`${H}/p/old`, { last_modified: day(1) }),
        project(`${H}/p/folder/quiet`, { last_modified: day(2) }),
        project(`${H}/p/folder/busy`, { last_modified: day(20) }),
        project(`${H}/p/mid`, { last_modified: day(10) }),
      ],
      { sort: "recent" }
    );

    expect(outline(model.main)).toBe("folder/{busy,quiet},mid,old");
  });

  it("keeps home first and path-less projects last in Other locations for both sorts", () => {
    const projects = [
      ...["a", "b", "c"].map((name) => project(`${H}/projects/${name}`)),
      project(H, { last_modified: day(1) }),
      project(`${H}/zeta`, { last_modified: day(28) }),
      project(`${H}/alpha`, { last_modified: day(2) }),
      project("unknown", { name: "AAA", provider: "antigravity", last_modified: day(29) }),
    ];

    expect(outline(group(buildExplorerModel(projects), "other")!.rows)).toBe("~,alpha,zeta,AAA");
    expect(
      outline(group(buildExplorerModel(projects, { sort: "recent" }), "other")!.rows)
    ).toBe("~,zeta,alpha,AAA");
  });

  it("keeps buckets recent-first whatever the sort", () => {
    const projects = [
      project("/tmp/a-old", { last_modified: day(1) }),
      project("/tmp/b-new", { last_modified: day(9) }),
    ];

    for (const sort of ["name", "recent"] as const) {
      expect(outline(group(buildExplorerModel(projects, { sort }), "temporary")!.rows)).toBe(
        "b-new,a-old"
      );
    }
  });
});

describe("buildExplorerModel — keys", () => {
  function keysOf(rows: ExplorerRow[]): string[] {
    return rows.flatMap((row) => [row.key, ...keysOf(row.children)]);
  }

  it("uses dir: for rows with children, loc: for leaves and fixed group keys", () => {
    const model = buildExplorerModel(fixtureProjects());
    const all = [...model.main, ...model.groups.flatMap((candidate) => candidate.rows)];

    const walk = (rows: ExplorerRow[]) => {
      for (const row of rows) {
        expect(row.key.startsWith(row.children.length > 0 ? "dir:" : "loc:")).toBe(true);
        walk(row.children);
      }
    };
    walk(all);
    expect(new Set(keysOf(all)).size).toBe(keysOf(all).length);
  });

  it("keeps every key stable across sorts and filters", () => {
    const byName = buildExplorerModel(fixtureProjects());
    const byRecent = buildExplorerModel(fixtureProjects(), { sort: "recent" });
    const allKeys = (model: ExplorerModel) =>
      new Set(keysOf([...model.main, ...model.groups.flatMap((candidate) => candidate.rows)]));

    expect(allKeys(byRecent)).toEqual(allKeys(byName));
    const filtered = filterExplorerModel(byName, "lab").model;
    for (const key of allKeys(filtered)) expect(allKeys(byName).has(key)).toBe(true);
  });

  it("keeps the dir: key of a row whose children the filter hides", () => {
    const model = buildExplorerModel([
      project(`${H}/projects/app`, { name: "Payments", provider: "codex" }),
      project(`${H}/projects/app/sub`),
      project(`${H}/projects/b`),
      project(`${H}/projects/c`),
    ]);
    const { model: filtered } = filterExplorerModel(model, "payments");

    expect(filtered.main).toHaveLength(1);
    expect(filtered.main[0]).toMatchObject({ key: "dir:home/fx/projects/app", children: [] });
  });
});

describe("filterExplorerModel", () => {
  it("returns the model untouched for an empty query", () => {
    const model = buildExplorerModel(fixtureProjects());
    const result = filterExplorerModel(model, "   ");

    expect(result.model).toBe(model);
    expect(result.revealKeys).toEqual([]);
    expect(result.matches.size).toBe(0);
  });

  it("keeps the ancestors of nested matches and drops everything else", () => {
    const model = buildExplorerModel(fixtureProjects());
    const { model: filtered, revealKeys } = filterExplorerModel(model, "review");

    // "review" matches `sessions/scratch/review` and market-language-review; the
    // private-review-pilot folder too.
    expect(outline(filtered.main)).toBe(
      "lab-management{sessions{[scratch/]review}},market-language-review-20260906,private-review-pilot"
    );
    expect(revealKeys).toEqual(
      expect.arrayContaining([
        "dir:home/fx/projects/lab-management",
        "dir:home/fx/projects/lab-management/sessions",
      ])
    );
    expect(filtered.groups).toEqual([]);
  });

  it("matches the display path and provider project names, case-insensitively", () => {
    const model = buildExplorerModel([
      project(`${H}/projects/app`, { name: "Payments Service", provider: "codex" }),
      project(`${H}/projects/b`),
      project(`${H}/projects/c`),
      project(`${H}/notes`),
    ]);

    expect(outline(filterExplorerModel(model, "PAYMENTS").model.main)).toBe("app");
    expect(outline(filterExplorerModel(model, "~/proj").model.main)).toBe("app,b,c");
  });

  it("reports highlight ranges for the label, prefix and hint", () => {
    const model = buildExplorerModel(fixtureProjects());
    const { model: filtered, matches, revealKeys } = filterExplorerModel(model, "scratch");

    const review = findRow(filtered.main, "review")!;
    expect(matches.get(review.key)).toEqual({
      prefix: [{ start: 0, end: 7 }],
      label: [],
      hint: [],
    });
    const temporary = group(filtered, "temporary")!;
    const crawl = temporary.rows.find((row) => row.label === "crawl-atlas scratchpad")!;
    expect(matches.get(crawl.key)?.label).toEqual([{ start: 12, end: 19 }]);
    expect(revealKeys).toContain(TEMPORARY_BUCKET_KEY);
    // Ancestors kept only for a descendant's match are not highlighted.
    expect(matches.has("dir:home/fx/projects/lab-management")).toBe(false);
  });

  it("drops empty groups and recounts the rest", () => {
    const model = buildExplorerModel(fixtureProjects());
    const { model: filtered } = filterExplorerModel(model, "gone");

    expect(filtered.main).toEqual([]);
    expect(filtered.groups.map((candidate) => [candidate.id, candidate.locationCount])).toEqual([
      ["unavailable", 1],
    ]);
  });
});

describe("locateInExplorer", () => {
  const model = buildExplorerModel([
    ...fixtureProjects(),
    project("/opt/services/a"),
    project("/opt/services/b"),
  ]);

  it("finds a location row and the rows above it", () => {
    expect(locateInExplorer(model, `${H}/projects/lab-management/sessions/scratch/review`)).toEqual(
      {
        key: "loc:home/fx/projects/lab-management/sessions/scratch/review",
        ancestorKeys: [
          "dir:home/fx/projects/lab-management",
          "dir:home/fx/projects/lab-management/sessions",
        ],
        match: "exact",
      }
    );
  });

  it("finds a folder-project row by its own path", () => {
    expect(locateInExplorer(model, `${H}/projects/lab-management/`)).toEqual({
      key: "dir:home/fx/projects/lab-management",
      ancestorKeys: [],
      match: "exact",
    });
  });

  it("resolves rows in groups with the group key first", () => {
    expect(locateInExplorer(model, `${H}/work/tools/cli/plugins/lint`)).toEqual({
      key: "loc:home/fx/work/tools/cli/plugins/lint",
      ancestorKeys: [
        OTHER_LOCATIONS_GROUP_KEY,
        "dir:home/fx/work",
        "dir:home/fx/work/tools/cli",
      ],
      match: "exact",
    });
    expect(locateInExplorer(model, `${H}/projects/old-prototype`)).toMatchObject({
      ancestorKeys: [UNAVAILABLE_BUCKET_KEY],
      match: "exact",
    });
  });

  it("reveals the shallowest row inside a folder with no row of its own", () => {
    // The workspace root is a location here (it sits in Other locations)…
    expect(locateInExplorer(model, `${H}/projects`)).toMatchObject({
      key: "loc:home/fx/projects",
      match: "exact",
    });
    // …while a skipped folder resolves to the lifted row below it.
    expect(locateInExplorer(model, `${H}/projects/atlas-ai-ecosystem/tmp`)).toEqual({
      key: "loc:home/fx/projects/atlas-ai-ecosystem/tmp/debate2",
      ancestorKeys: ["dir:home/fx/projects/atlas-ai-ecosystem"],
      match: "descendant",
    });
    expect(locateInExplorer(model, "/opt")).toMatchObject({
      key: "dir:opt/services",
      match: "descendant",
    });
  });

  it("falls back to the deepest folder containing an unknown path", () => {
    expect(locateInExplorer(model, `${H}/projects/lab-management/ducs/src/deep`)).toEqual({
      key: "loc:home/fx/projects/lab-management/ducs",
      ancestorKeys: ["dir:home/fx/projects/lab-management"],
      match: "ancestor",
    });
  });

  it("returns null for an empty or unrelated path", () => {
    expect(locateInExplorer(model, "")).toBeNull();
    expect(locateInExplorer(buildExplorerModel([]), "/srv/x")).toBeNull();
  });

  it("ignores Windows case", () => {
    const windows = buildExplorerModel([
      project("C:\\Users\\Jack\\src\\api"),
      project("C:\\Users\\Jack\\src\\app"),
    ]);

    expect(locateInExplorer(windows, "c:/users/jack/SRC/API")).toMatchObject({
      match: "exact",
    });
  });
});

describe("findRowForProject", () => {
  it("finds the row holding a provider project, secondary providers included", () => {
    const projects = fixtureProjects();
    const model = buildExplorerModel(projects);
    const codexReview = projects.find((candidate) =>
      candidate.actual_path.endsWith("sessions/scratch/review")
    )!;
    const codexAtlas = projects.find(
      (candidate) =>
        candidate.provider === "codex" && candidate.actual_path.endsWith("atlas-ai-ecosystem")
    )!;

    expect(findRowForProject(model, codexReview.path)).toMatchObject({
      row: { key: "loc:home/fx/projects/lab-management/sessions/scratch/review" },
      ancestorKeys: [
        "dir:home/fx/projects/lab-management",
        "dir:home/fx/projects/lab-management/sessions",
      ],
    });
    expect(findRowForProject(model, codexAtlas.path)?.row.label).toBe("atlas-ai-ecosystem");
    expect(findRowForProject(model, "/store/none")).toBeNull();
  });
});
