import { describe, expect, it } from "vitest";
import {
  elideProjectRoot,
  getClaudeFolderHome,
  getPathIdentity,
  getPathLeaf,
  homeDirOf,
  isProjectPathUnavailable,
  isTemporaryPath,
  pickHomeDir,
  resolveHomeDir,
} from "../utils/pathUtils";

describe("temporary path detection", () => {
  it.each([
    "/tmp/translate-en-abc",
    "/private/tmp/x",
    "/var/folders/w8/00lvq9d54kgfsglphmf91l_h0000gn/T/translate-en-r3irmeu9",
    "/private/var/folders/w8/xx/T/job",
    "/Users/jack/Library/Caches/foo",
    "/home/jack/.cache/agent",
    "C:\\Users\\jack\\AppData\\Local\\Temp\\job",
    "/home/jack/.claude/jobs/ab12cd34/tmp",
    "/Users/jack/.claude/jobs/ab12cd34",
    "/root/.claude/jobs/ab12cd34/tmp",
    "C:\\Users\\jack\\.claude\\jobs\\ab12cd34\\tmp",
  ])("flags %s as temporary", (path) => {
    expect(isTemporaryPath(path)).toBe(true);
  });

  it.each([
    "/Users/jack/client/claude-code-history-viewer",
    "/home/jack/tmp-notes",
    "/work/tmp",
    "/var/www/site",
    "/home/jack/.claude/automation",
    "/home/jack/projects/jobs/.claude/jobs-board",
    "",
  ])("keeps %s as a regular project", (path) => {
    expect(isTemporaryPath(path)).toBe(false);
  });
});

describe("path identity and home detection", () => {
  it("compares paths by their parts, ignoring separators, trailing slashes and Windows case", () => {
    expect(getPathIdentity("/home/jack/app/")).toBe(getPathIdentity("/home/jack/app"));
    expect(getPathIdentity("C:\\Users\\Jack\\App")).toBe(getPathIdentity("c:/users/jack/app"));
    // POSIX paths stay case-sensitive.
    expect(getPathIdentity("/home/jack/App")).not.toBe(getPathIdentity("/home/jack/app"));
  });

  it("finds the home of a path, the superuser's included", () => {
    expect(homeDirOf("/home/jack/projects/app")).toBe("/home/jack");
    expect(homeDirOf("/Users/jack/app")).toBe("/Users/jack");
    expect(homeDirOf("/root/app")).toBe("/root");
    expect(homeDirOf("/srv/app")).toBeNull();
  });

  it("picks the home most paths share", () => {
    expect(pickHomeDir(["/home/other/x", "/home/jack/a", "/home/jack/b"])).toBe("/home/jack");
    expect(pickHomeDir(["C:\\Users\\Jack\\src\\app\\"])).toBe("C:\\Users\\Jack");
    expect(pickHomeDir(["/srv/app"])).toBeNull();
  });

  it("derives the home from the default Claude data folder only", () => {
    expect(getClaudeFolderHome("/home/fx/.claude")).toBe("/home/fx");
    expect(getClaudeFolderHome("C:\\Users\\Jack\\.claude\\")).toBe("C:\\Users\\Jack");
    expect(getClaudeFolderHome("/Volumes/backup/claude-data")).toBeNull();
    expect(getClaudeFolderHome("")).toBeNull();
    expect(getClaudeFolderHome(undefined)).toBeNull();
  });

  it("prefers the backend's home when it holds every path the detected home holds", () => {
    const paths = [
      "/home/dev/fixture-home/projects/app",
      "/home/dev/fixture-home/notes",
      "/tmp/scratch",
    ];
    // Detected from the paths: /home/dev. The backend's HOME is deeper.
    expect(resolveHomeDir(paths, "/home/dev/fixture-home")).toBe("/home/dev/fixture-home");
    expect(resolveHomeDir(paths, null)).toBe("/home/dev");
  });

  it("keeps the detected home when the hint is a custom data folder elsewhere", () => {
    const paths = ["/Users/jack/app", "/Users/jack/api", "/Volumes/backup/one-off"];
    expect(resolveHomeDir(paths, "/Volumes/backup")).toBe("/Users/jack");
    expect(resolveHomeDir(paths, "/nowhere")).toBe("/Users/jack");
    expect(resolveHomeDir(["/srv/a", "/srv/b"], "/srv")).toBe("/srv");
  });

  it("never lets a hint above the detected home widen `~`", () => {
    const windows = ["C:\\Users\\Me\\a", "C:\\Users\\Me\\b"];
    expect(resolveHomeDir(windows, getClaudeFolderHome("C:\\.claude"))).toBe("C:\\Users\\Me");
    expect(resolveHomeDir(["/home/jack/a"], getClaudeFolderHome("/home/.claude"))).toBe(
      "/home/jack"
    );
  });
});

describe("path display utilities", () => {
  it("returns the leaf segment for a deep Unix path", () => {
    expect(getPathLeaf("/Users/alex/Projects/GitHub/acme/my-repo")).toBe(
      "my-repo"
    );
  });

  it("returns the leaf segment for a Windows path", () => {
    expect(getPathLeaf("C:\\Users\\alex\\Projects\\acme\\my-repo")).toBe(
      "my-repo"
    );
  });

  it("recognizes an unavailable project location without changing path formatting", () => {
    expect(isProjectPathUnavailable({ path_status: "unavailable" })).toBe(true);
    expect(isProjectPathUnavailable({})).toBe(false);
    expect(isProjectPathUnavailable(null)).toBe(false);
  });
});

describe("elideProjectRoot", () => {
  it("strips the project root from a Unix path", () => {
    expect(
      elideProjectRoot(
        "/Users/alex/Projects/my-app/skills/deliver-prd/TEMPLATE.md",
        "/Users/alex/Projects/my-app"
      )
    ).toBe("skills/deliver-prd/TEMPLATE.md");
  });

  it("strips the project root from a Windows path and normalizes separators", () => {
    expect(
      elideProjectRoot(
        "E:\\Projects\\my-app\\skills\\deliver-prd\\TEMPLATE.md",
        "E:\\Projects\\my-app"
      )
    ).toBe("skills/deliver-prd/TEMPLATE.md");
  });

  it("ignores case on Windows paths, including the drive letter", () => {
    // Measured on real data: scan_projects can report `e:\Projects\...` while the
    // session logs record `E:\Projects\...` for the same project.
    expect(
      elideProjectRoot(
        "E:\\Projects\\My-App\\src\\main.ts",
        "e:\\projects\\my-app"
      )
    ).toBe("src/main.ts");
  });

  it("keeps case significant on Unix paths", () => {
    expect(
      elideProjectRoot("/Users/alex/Projects/My-App/src/main.ts", "/users/alex/projects/my-app")
    ).toBe("/Users/alex/Projects/My-App/src/main.ts");
  });

  it("returns the path unchanged when it is not under the root", () => {
    expect(
      elideProjectRoot("/Users/alex/elsewhere/notes.md", "/Users/alex/Projects/my-app")
    ).toBe("/Users/alex/elsewhere/notes.md");
  });

  it("does not treat a name-prefixed sibling directory as a child", () => {
    expect(
      elideProjectRoot("/Users/alex/Projects/my-app-docs/README.md", "/Users/alex/Projects/my-app")
    ).toBe("/Users/alex/Projects/my-app-docs/README.md");
  });

  it("returns the path unchanged when there is no root", () => {
    const path = "/Users/alex/Projects/my-app/src/main.ts";
    expect(elideProjectRoot(path, undefined)).toBe(path);
    expect(elideProjectRoot(path, "")).toBe(path);
  });

  it("returns an empty string when the path is the root itself", () => {
    expect(
      elideProjectRoot("/Users/alex/Projects/my-app", "/Users/alex/Projects/my-app")
    ).toBe("");
  });

  it("does not treat a relative path as living under a UNC root (P2-12)", () => {
    // Splitting on separators alone threw away what kind of root each path had,
    // so these two unrelated paths looked like parent and child.
    expect(
      elideProjectRoot(
        "server/share/repo/src/a.ts",
        "\\\\server\\share\\repo"
      )
    ).toBe("server/share/repo/src/a.ts");
  });

  it("matches an extended-length path against its plain drive root (P2-12)", () => {
    // `\\?\C:` and `C:` name the same volume; the prefix is a Win32 escape.
    expect(
      elideProjectRoot("\\\\?\\C:\\repo\\src\\a.ts", "C:\\repo")
    ).toBe("src/a.ts");
  });

  it("matches an extended UNC path against its plain UNC root (P3-B6)", () => {
    // Stripping the generic extended-length prefix alone left `UNC\\server...`,
    // which no longer reads as a UNC path, so the roots never matched.
    expect(
      elideProjectRoot(
        "\\\\?\\UNC\\server\\share\\repo\\src\\a.ts",
        "\\\\server\\share\\repo"
      )
    ).toBe("src/a.ts");
  });

  it("treats / as a valid POSIX project root (P3-B7)", () => {
    // `splitPathParts("/")` is empty, which the guard read as "no root" rather
    // than "the root", so a project rooted at / could never elide.
    expect(elideProjectRoot("/tmp/a.ts", "/")).toBe("tmp/a.ts");
  });

  it("tolerates a trailing separator on the root", () => {
    expect(
      elideProjectRoot("/Users/alex/Projects/my-app/src/main.ts", "/Users/alex/Projects/my-app/")
    ).toBe("src/main.ts");
  });
  // A UNC path is absolute however it is spelled, but `isAbsolutePath` only
  // recognises the forward-slash spelling, so the "compare like with like"
  // bail fired on any separator-style mismatch between path and root. Three of
  // the six spellings failed, not just the extended-length one.
  it("matches an extended UNC path against a forward-slash UNC root (R4-4)", () => {
    expect(
      elideProjectRoot(
        "\\\\?\\UNC\\server\\share\\repo\\src\\a.ts",
        "//server/share/repo"
      )
    ).toBe("src/a.ts");
  });

  it("matches a backslash UNC path against a forward-slash UNC root (R4-4)", () => {
    expect(
      elideProjectRoot(
        "\\\\server\\share\\repo\\src\\a.ts",
        "//server/share/repo"
      )
    ).toBe("src/a.ts");
  });

  it("matches a forward-slash UNC path against a backslash UNC root (R4-4)", () => {
    expect(
      elideProjectRoot(
        "//server/share/repo/src/a.ts",
        "\\\\server\\share\\repo"
      )
    ).toBe("src/a.ts");
  });
});
