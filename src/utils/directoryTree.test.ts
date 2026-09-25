import { describe, expect, it } from "vitest";
import type { ClaudeProject } from "../types";
import {
  buildDirectoryTree,
  getAllFolderKeys,
  getFolderKey,
  getLocationKey,
  getProjectExpansionKeys,
  locateInDirectoryTree,
  TEMPORARY_BUCKET_KEY,
  UNAVAILABLE_BUCKET_KEY,
  type DirectoryFolderNode,
  type DirectoryProjectNode,
  type DirectoryTreeNode,
} from "./directoryTree";

function project(
  actualPath: string,
  overrides: Partial<ClaudeProject> = {}
): ClaudeProject {
  return {
    name: actualPath.split(/[\\/]/).pop() ?? actualPath,
    path: overrides.path ?? `/store${actualPath.replace(/\\/g, "/")}`,
    actual_path: actualPath,
    session_count: 1,
    message_count: 1,
    last_modified: "2026-09-25T00:00:00Z",
    provider: "claude",
    ...overrides,
  };
}

/** Compact, readable outline of a node: `label[count]{children}` / `project(rel)`. */
function outline(node: DirectoryTreeNode): string {
  if (node.kind === "project") {
    const leaf = node.path.split(/[\\/]/).pop();
    return node.relativeParent ? `${leaf}(${node.relativeParent})` : `${leaf}`;
  }
  const self = node.self ? ["=self"] : [];
  const children = [...self, ...node.children.map(outline)];
  return `${node.label}[${node.projectCount}]{${children.join(",")}}`;
}

const folder = (node: DirectoryTreeNode | undefined) => node as DirectoryFolderNode;

describe("buildDirectoryTree", () => {
  it("returns no roots for no projects", () => {
    expect(buildDirectoryTree([])).toEqual({ roots: [], temporary: [], unavailable: [] });
  });

  it("nests projects under the home root and counts every subtree", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/work/app"),
      project("/home/jack/work/api"),
      project("/home/jack/work/tools/cli"),
      project("/home/jack/work/tools/lint"),
      project("/home/jack/notes"),
    ]);

    expect(tree.roots).toHaveLength(1);
    expect(outline(tree.roots[0]!)).toBe("~[5]{work[4]{tools[2]{cli,lint},api,app},notes}");
    expect(tree.roots[0]).toMatchObject({
      isRoot: true,
      key: getFolderKey("/home/jack"),
      path: "/home/jack",
    });
    const work = folder(tree.roots[0]!.children[0]);
    expect(work).toMatchObject({ path: "/home/jack/work", key: "dir:/home/jack/work" });
    expect(folder(work.children[0]).path).toBe("/home/jack/work/tools");
  });

  it("lifts a single project to the nearest folder with a relative-path subtitle", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/work/app"),
      project("/home/jack/work/clients/acme/site"),
    ]);

    const work = folder(tree.roots[0]);
    expect(outline(work)).toBe("~/work[2]{app,site(clients/acme)}");
    const site = work.children.find((c) => c.kind === "project" && c.path.endsWith("site"));
    expect(site).toMatchObject({
      kind: "project",
      key: getLocationKey("/home/jack/work/clients/acme/site"),
      relativeParent: "clients/acme",
    });
  });

  it("compacts chains of single-child folders without their own project", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/app"),
      project("/home/jack/crawl/reports/daily"),
      project("/home/jack/crawl/reports/weekly"),
    ]);

    expect(outline(tree.roots[0]!)).toBe("~[3]{crawl/reports[2]{daily,weekly},app}");
    const chain = folder(tree.roots[0]!.children[0]);
    expect(chain).toMatchObject({
      label: "crawl/reports",
      path: "/home/jack/crawl/reports",
      key: "dir:/home/jack/crawl",
      isRoot: false,
    });
  });

  it("compacts a root into its only folder but keeps the root key stable", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/work/a"),
      project("/home/jack/work/b"),
    ]);

    expect(outline(tree.roots[0]!)).toBe("~/work[2]{a,b}");
    expect(tree.roots[0]).toMatchObject({
      key: "dir:/home/jack",
      path: "/home/jack/work",
      isRoot: true,
    });
  });

  it("does not compact through a folder that is itself a project", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/repo"),
      project("/home/jack/repo/packages/core"),
      project("/home/jack/repo/packages/ui"),
    ]);

    // `repo` holds its own project, so it stays a folder row with `self`.
    expect(outline(tree.roots[0]!)).toBe("~/repo[3]{=self,packages[2]{core,ui}}");
    const repo = folder(tree.roots[0]);
    expect(repo.self?.path).toBe("/home/jack/repo");
  });

  it("shows a folder-that-is-a-project with one nested project as a folder of two", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/site"),
      project("/home/jack/site/docs"),
      project("/home/jack/other"),
    ]);

    expect(outline(tree.roots[0]!)).toBe("~[3]{site[2]{=self,docs},other}");
  });

  it("puts paths outside home under the / root, home first", () => {
    const tree = buildDirectoryTree([
      project("/opt/services/a"),
      project("/home/jack/app"),
      project("/opt/services/b"),
    ]);

    expect(tree.roots.map((root) => root.label)).toEqual(["~", "/opt/services"]);
    expect(tree.roots[1]).toMatchObject({ key: "dir:/", path: "/opt/services" });
    expect(outline(tree.roots[0]!)).toBe("~[1]{app}");
  });

  it("keeps a lone project under / with its parent folders as subtitle", () => {
    const tree = buildDirectoryTree([project("/work/project-a")]);

    expect(outline(tree.roots[0]!)).toBe("/[1]{project-a(work)}");
  });

  it("uses the most common home when several users' homes appear", () => {
    const tree = buildDirectoryTree([
      project("/home/other/x"),
      project("/home/jack/a"),
      project("/home/jack/b"),
    ]);

    expect(tree.roots.map((root) => root.label)).toEqual(["~", "/"]);
    expect(tree.roots[0]!.path).toBe("/home/jack");
    expect(outline(tree.roots[1]!)).toBe("/[1]{x(home/other)}");
  });

  it("handles Windows paths: home, drive roots, case-insensitive merging", () => {
    const tree = buildDirectoryTree([
      project("C:\\Users\\Jack\\src\\app"),
      project("C:\\Users\\Jack\\src\\api"),
      project("c:\\users\\jack\\src\\API", { path: "/store/codex-api", provider: "codex" }),
      project("D:\\work\\tool"),
      project("D:\\work\\lib"),
    ]);

    expect(tree.roots.map((root) => root.label)).toEqual(["~\\src", "D:\\work"]);
    expect(tree.roots[0]).toMatchObject({ key: "dir:C:\\Users\\Jack", path: "C:\\Users\\Jack\\src" });
    expect(tree.roots[1]).toMatchObject({ key: "dir:D:\\", path: "D:\\work" });
    const api = tree.roots[0]!.children.find(
      (c): c is DirectoryProjectNode => c.kind === "project" && /api$/i.test(c.path)
    );
    expect(api?.location.projects).toHaveLength(2);
    expect(tree.roots[0]!.projectCount).toBe(2);
  });

  it("gives UNC shares their own root with Windows separators", () => {
    const tree = buildDirectoryTree([
      project("\\\\nas\\team\\repos\\a"),
      project("\\\\nas\\team\\repos\\deep\\b"),
      project("/srv/x"),
    ]);

    expect(tree.roots.map((root) => root.label)).toEqual(["\\\\nas\\team\\repos", "/"]);
    expect(tree.roots[0]).toMatchObject({
      key: "dir:\\\\nas\\team",
      path: "\\\\nas\\team\\repos",
    });
    expect(outline(tree.roots[0]!)).toBe("\\\\nas\\team\\repos[2]{a,b(deep)}");
    expect(outline(tree.roots[1]!)).toBe("/[1]{x(srv)}");
  });

  it("treats /root as the home directory", () => {
    const tree = buildDirectoryTree([project("/root/a"), project("/root/b"), project("/opt/c")]);

    expect(tree.roots.map((root) => root.label)).toEqual(["~", "/"]);
    expect(tree.roots[0]!.path).toBe("/root");
  });

  it("merges providers recording the same folder into one location", () => {
    const claude = project("/home/jack/app");
    const codex = project("/home/jack/app", { path: "/store/codex/app", provider: "codex" });
    const tree = buildDirectoryTree([claude, codex, project("/home/jack/api")]);

    expect(tree.roots[0]!.projectCount).toBe(2);
    const app = tree.roots[0]!.children.find(
      (c): c is DirectoryProjectNode => c.kind === "project" && c.path.endsWith("/app")
    );
    expect(app?.location.projects).toEqual([claude, codex]);
  });

  it("moves temporary and unavailable projects into their buckets", () => {
    const temp = project("/tmp/scratch");
    const cache = project("/home/jack/.cache/job");
    const gone = project("/home/jack/deleted", { path_status: "unavailable" });
    const kept = project("/home/jack/app");
    const tree = buildDirectoryTree([temp, gone, kept, cache]);

    expect(tree.temporary).toEqual([temp, cache]);
    expect(tree.unavailable).toEqual([gone]);
    expect(outline(tree.roots[0]!)).toBe("~[1]{app}");
  });

  it("sorts folders before projects and names naturally", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/z-app"),
      project("/home/jack/a-app"),
      project("/home/jack/dir10/x"),
      project("/home/jack/dir10/y"),
      project("/home/jack/dir2/x"),
      project("/home/jack/dir2/y"),
    ]);

    expect(
      tree.roots[0]!.children.map((c) => (c.kind === "folder" ? c.label : c.path.split("/").pop()))
    ).toEqual(["dir2", "dir10", "a-app", "z-app"]);
  });
});

describe("locateInDirectoryTree", () => {
  const tree = buildDirectoryTree([
    project("/home/jack/work/app"),
    project("/home/jack/work/crawl/reports/daily"),
    project("/home/jack/work/crawl/reports/weekly"),
    project("/home/jack/work/solo/deep/tool"),
    project("/home/jack/repo"),
    project("/home/jack/repo/pkg"),
    project("/tmp/scratch"),
    project("/home/jack/gone", { path_status: "unavailable" }),
  ]);

  it("finds a project row and the folders above it", () => {
    expect(locateInDirectoryTree(tree, "/home/jack/work/crawl/reports/daily")).toEqual({
      key: "loc:/home/jack/work/crawl/reports/daily",
      kind: "project",
      ancestorKeys: ["dir:/home/jack", "dir:/home/jack/work", "dir:/home/jack/work/crawl"],
      match: "exact",
    });
  });

  it("finds a folder row by its path", () => {
    expect(locateInDirectoryTree(tree, "/home/jack/work")).toMatchObject({
      key: "dir:/home/jack/work",
      kind: "folder",
      ancestorKeys: ["dir:/home/jack"],
      match: "exact",
    });
  });

  it("reveals the compacted row for a folder inside the chain", () => {
    expect(locateInDirectoryTree(tree, "/home/jack/work/crawl")).toMatchObject({
      key: "dir:/home/jack/work/crawl",
      match: "descendant",
    });
  });

  it("reveals the lifted project for a skipped folder", () => {
    expect(locateInDirectoryTree(tree, "/home/jack/work/solo/deep")).toMatchObject({
      key: "loc:/home/jack/work/solo/deep/tool",
      match: "descendant",
    });
  });

  it("reveals the root for a parent above every project", () => {
    expect(locateInDirectoryTree(tree, "/home")).toMatchObject({
      key: "dir:/home/jack",
      ancestorKeys: [],
      match: "descendant",
    });
  });

  it("falls back to the deepest containing folder for an unknown path", () => {
    expect(locateInDirectoryTree(tree, "/home/jack/work/unknown/thing")).toMatchObject({
      key: "dir:/home/jack/work",
      match: "ancestor",
    });
  });

  it("maps a folder-that-is-a-project to its folder row", () => {
    expect(locateInDirectoryTree(tree, "/home/jack/repo")).toMatchObject({
      key: "dir:/home/jack/repo",
      kind: "folder",
      match: "exact",
    });
  });

  it("resolves bucket projects inside their bucket", () => {
    expect(locateInDirectoryTree(tree, "/tmp/scratch")).toEqual({
      key: "loc:/tmp/scratch",
      kind: "project",
      ancestorKeys: [TEMPORARY_BUCKET_KEY],
      match: "exact",
    });
    expect(locateInDirectoryTree(tree, "/home/jack/gone")?.ancestorKeys).toEqual([
      UNAVAILABLE_BUCKET_KEY,
    ]);
  });

  it("returns null for an empty path or tree", () => {
    expect(locateInDirectoryTree(tree, "")).toBeNull();
    expect(locateInDirectoryTree(buildDirectoryTree([]), "/home/jack")).toBeNull();
  });

  it("ignores trailing separators and Windows case", () => {
    const winTree = buildDirectoryTree([
      project("C:\\Users\\Jack\\a\\x"),
      project("C:\\Users\\Jack\\a\\y"),
    ]);
    expect(locateInDirectoryTree(winTree, "c:/users/jack/a/X/")).toMatchObject({
      key: "loc:C:\\Users\\Jack\\a\\x",
      match: "exact",
    });
  });

  it("keys a location without the trailing separator of its first spelling", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/proj/", { path: "/store/codex/proj", provider: "codex" }),
      project("/home/jack/proj"),
      project("/home/jack/other"),
    ]);
    const proj = tree.roots[0]!.children.find(
      (c): c is DirectoryProjectNode => c.kind === "project" && c.path.includes("proj")
    );
    expect(proj).toMatchObject({ key: "loc:/home/jack/proj", path: "/home/jack/proj" });
    expect(proj?.location.projects).toHaveLength(2);
  });
});

describe("getProjectExpansionKeys", () => {
  const tree = buildDirectoryTree([
    project("/home/jack/repo"),
    project("/home/jack/repo/pkg"),
    project("/home/jack/other"),
  ]);

  it("returns the ancestors of a project row", () => {
    expect(getProjectExpansionKeys(tree, "/home/jack/repo/pkg")).toEqual([
      "dir:/home/jack",
      "dir:/home/jack/repo",
    ]);
  });

  it("includes the folder itself when the project is the folder's own row", () => {
    expect(getProjectExpansionKeys(tree, "/home/jack/repo")).toEqual([
      "dir:/home/jack",
      "dir:/home/jack/repo",
    ]);
  });

  it("returns null for paths without an exact row", () => {
    expect(getProjectExpansionKeys(tree, "/home/jack/missing")).toBeNull();
  });
});

describe("getAllFolderKeys", () => {
  it("lists every folder row, nested ones and roots included", () => {
    const tree = buildDirectoryTree([
      project("/home/jack/work/crawl/reports/daily"),
      project("/home/jack/work/crawl/reports/weekly"),
      project("/home/jack/work/app"),
      project("/srv/a"),
    ]);

    expect(getAllFolderKeys(tree)).toEqual([
      "dir:/home/jack",
      "dir:/home/jack/work/crawl",
      "dir:/",
    ]);
  });
});
