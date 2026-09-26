// src/utils/directoryTree.ts
/**
 * Nested directory tree for the explorer's "Group by directory" mode.
 *
 * Projects are placed by their working directory (`actual_path`) under a root:
 * the user's home (`~`), a Windows drive (`C:`), a UNC share
 * (`\\server\share`) or the POSIX root (`/`).
 *
 * - A folder row exists only when its subtree holds at least two projects; a
 *   lone project is lifted to the nearest folder row and keeps the skipped
 *   folders as a relative-path subtitle.
 * - Chains of single-child folders without a project of their own collapse
 *   into one row labelled like `crawl/reports`.
 * - A folder that is itself a project carries it in `self`; the UI renders it
 *   as the folder's first child row.
 * - Temporary and unavailable locations are returned as separate buckets.
 *
 * One project per working directory: several providers recording the same
 * folder form one `DirectoryLocation`, so counts are folders, not store paths.
 */
import type { ClaudeProject } from "../types";
import {
  detectHomeDir,
  isProjectPathUnavailable,
  isProjectTemporary,
  splitPathParts,
} from "./pathUtils";

/** One working directory and every provider project recorded for it. */
export interface DirectoryLocation {
  /** Working directory (the first project's `actual_path`, trailing separator dropped). */
  path: string;
  /** Projects for this folder, in input order. */
  projects: ClaudeProject[];
}

export interface DirectoryFolderNode {
  kind: "folder";
  /** Expansion key (`dir:<path>`). Roots use their base path so compaction does not change it. */
  key: string;
  /** Absolute path of the deepest folder in a compacted chain. */
  path: string;
  /**
   * Row label: `~`, `/`, `C:`, a folder name or a compacted chain
   * (`crawl/reports`; Windows paths join with `\`).
   */
  label: string;
  isRoot: boolean;
  /** Number of projects (working directories) in the subtree, `self` included. */
  projectCount: number;
  /** The folder is itself a project. */
  self: DirectoryLocation | null;
  /** Folders first, then projects; each group sorted by name. */
  children: DirectoryTreeNode[];
}

export interface DirectoryProjectNode {
  kind: "project";
  /** Row key (`loc:<path>`). */
  key: string;
  path: string;
  location: DirectoryLocation;
  /** Folders between the parent folder row and the project (`a/b`); empty for a direct child. */
  relativeParent: string;
}

export type DirectoryTreeNode = DirectoryFolderNode | DirectoryProjectNode;

export interface DirectoryTree {
  roots: DirectoryFolderNode[];
  temporary: ClaudeProject[];
  unavailable: ClaudeProject[];
}

export const TEMPORARY_BUCKET_KEY = "group:temporary-projects";
export const UNAVAILABLE_BUCKET_KEY = "group:unavailable-projects";

export function getFolderKey(path: string): string {
  return `dir:${path}`;
}

export function getLocationKey(path: string): string {
  return `loc:${path}`;
}

// ---------------------------------------------------------------------------
// Path identity
// ---------------------------------------------------------------------------

function isWindowsStyle(path: string): boolean {
  return /^[\\/]?[A-Za-z]:(?:[\\/]|$)/.test(path) || path.includes("\\");
}

/** `\\server\share\…` (or `//server/share/…`). */
function isUncPath(path: string): boolean {
  return /^[\\/]{2}[^\\/]/.test(path);
}

/** Comparable form of a path: `/`-joined parts, lower-cased for Windows paths. */
export function getPathIdentity(path: string): string {
  const joined = splitPathParts(path).join("/");
  return isWindowsStyle(path) ? joined.toLowerCase() : joined;
}

function isSameOrInside(childIdentity: string, parentIdentity: string): boolean {
  return (
    parentIdentity === "" ||
    childIdentity === parentIdentity ||
    childIdentity.startsWith(`${parentIdentity}/`)
  );
}

function locationPathOf(project: ClaudeProject): string {
  return project.actual_path || project.path;
}

/** `/a/b/` → `/a/b`, so row keys do not depend on which spelling came first. */
function withoutTrailingSeparator(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed === "" || trimmed.endsWith(":") ? path : trimmed;
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

interface RootSpec {
  id: string;
  label: string;
  /** Absolute base path (`/home/jack`, `C:\`, `\\server\share`, `/`). */
  path: string;
  order: number;
}

/** `detectHomeDir` plus the POSIX superuser's home, which is not under `/home`. */
export function homeDirOf(path: string): string | null {
  if (/^\/root(?:\/|$)/.test(path)) return "/root";
  return detectHomeDir([path]);
}

/** The home directory shared by most projects; other users' homes sit under `/`. */
export function pickHomeDir(paths: string[]): string | null {
  const counts = new Map<string, { home: string; count: number }>();
  for (const path of paths) {
    const home = homeDirOf(path);
    if (!home) continue;
    const id = getPathIdentity(home);
    const entry = counts.get(id);
    if (entry) entry.count += 1;
    else counts.set(id, { home, count: 1 });
  }
  let best: { home: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.home.replace(/^\/(?=[A-Za-z]:)/, "").replace(/[\\/]+$/, "") : null;
}

function resolveRoot(
  path: string,
  homeDir: string | null
): { root: RootSpec; rest: string[] } {
  const parts = splitPathParts(path);
  if (homeDir) {
    const homeParts = splitPathParts(homeDir);
    const ignoreCase = isWindowsStyle(homeDir) || isWindowsStyle(path);
    const same = (a = "", b = "") =>
      ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
    if (
      parts.length >= homeParts.length &&
      homeParts.every((part, index) => same(parts[index], part))
    ) {
      return {
        root: { id: "home", label: "~", path: homeDir, order: 0 },
        rest: parts.slice(homeParts.length),
      };
    }
  }

  if (isUncPath(path) && parts.length >= 2) {
    const label = `\\\\${parts[0]}\\${parts[1]}`;
    return {
      root: { id: `unc:${label.toLowerCase()}`, label, path: label, order: 2 },
      rest: parts.slice(2),
    };
  }

  const drive = parts[0];
  if (drive && /^[A-Za-z]:$/.test(drive)) {
    const label = drive.toUpperCase();
    return {
      root: { id: `drive:${label}`, label, path: `${label}\\`, order: 1 },
      rest: parts.slice(1),
    };
  }

  return { root: { id: "posix", label: "/", path: "/", order: 3 }, rest: parts };
}

function joinPath(base: string, segments: string[]): string {
  if (segments.length === 0) return base;
  const separator = isWindowsStyle(base) ? "\\" : "/";
  const trimmed = base.replace(/[\\/]+$/, "");
  return `${trimmed}${separator}${segments.join(separator)}`;
}

/** Labels follow the root's platform: `C:\Users\me` and `~\src` on Windows. */
function labelSeparator(rootPath: string): string {
  return isWindowsStyle(rootPath) ? "\\" : "/";
}

function joinLabel(base: string, segments: string[], rootPath: string): string {
  if (segments.length === 0) return base;
  const separator = labelSeparator(rootPath);
  return base.endsWith(separator)
    ? `${base}${segments.join(separator)}`
    : [base, ...segments].join(separator);
}

// ---------------------------------------------------------------------------
// Trie → nodes
// ---------------------------------------------------------------------------

interface TrieNode {
  name: string;
  children: Map<string, TrieNode>;
  location: DirectoryLocation | null;
  /** Locations in this subtree, own location included. */
  count: number;
}

function createTrieNode(name: string): TrieNode {
  return { name, children: new Map(), location: null, count: 0 };
}

function firstChild(node: TrieNode): TrieNode | undefined {
  return node.children.values().next().value;
}

// One shared collator: `localeCompare` with options builds a new one per call.
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const compareNames = (a: string, b: string) => nameCollator.compare(a, b);

const leafOf = (path: string) => splitPathParts(path).at(-1) ?? path;

/** A subtree holding one project: walk down to it, remembering the skipped folders. */
function liftSingleProject(node: TrieNode, rootPath: string): DirectoryProjectNode {
  const skipped: string[] = [];
  let current = node;
  // count === 1 without an own location → exactly one child holds the project.
  while (!current.location) {
    const next = firstChild(current);
    if (!next) break;
    skipped.push(current.name);
    current = next;
  }
  const location = current.location!;
  return {
    kind: "project",
    key: getLocationKey(location.path),
    path: location.path,
    location,
    relativeParent: skipped.join(labelSeparator(rootPath)),
  };
}

function buildChildren(
  node: TrieNode,
  folderPath: string,
  rootPath: string
): DirectoryTreeNode[] {
  const folders: DirectoryFolderNode[] = [];
  const projects: DirectoryProjectNode[] = [];
  for (const child of node.children.values()) {
    if (child.count === 1) {
      projects.push(liftSingleProject(child, rootPath));
    } else if (child.count > 1) {
      folders.push(
        buildFolder(child, joinPath(folderPath, [child.name]), child.name, false, rootPath)
      );
    }
  }
  folders.sort((a, b) => compareNames(a.label, b.label));
  projects.sort((a, b) => compareNames(leafOf(a.path), leafOf(b.path)));
  return [...folders, ...projects];
}

/** `ownPath` is the path of `node` itself, before compaction. */
function buildFolder(
  node: TrieNode,
  ownPath: string,
  baseLabel: string,
  isRoot: boolean,
  rootPath: string
): DirectoryFolderNode {
  const chain: string[] = [];
  let current = node;
  // Compact while the folder has no project of its own and its only child is
  // itself a folder row (≥ 2 projects).
  while (!current.location && current.children.size === 1) {
    const only = firstChild(current)!;
    if (only.count < 2) break;
    chain.push(only.name);
    current = only;
  }

  const path = joinPath(ownPath, chain);
  return {
    kind: "folder",
    key: getFolderKey(ownPath),
    path,
    label: joinLabel(baseLabel, chain, rootPath),
    isRoot,
    projectCount: current.count,
    self: current.location,
    children: buildChildren(current, path, rootPath),
  };
}

/** Build the nested directory tree plus the temporary/unavailable buckets. */
export function buildDirectoryTree(projects: ClaudeProject[]): DirectoryTree {
  const temporary: ClaudeProject[] = [];
  const unavailable: ClaudeProject[] = [];
  const locations = new Map<string, DirectoryLocation>();

  for (const project of projects) {
    if (isProjectPathUnavailable(project)) {
      unavailable.push(project);
      continue;
    }
    if (isProjectTemporary(project)) {
      temporary.push(project);
      continue;
    }
    const path = withoutTrailingSeparator(locationPathOf(project));
    const id = getPathIdentity(path);
    const existing = locations.get(id);
    if (existing) existing.projects.push(project);
    else locations.set(id, { path, projects: [project] });
  }

  const homeDir = pickHomeDir(Array.from(locations.values(), (l) => l.path));
  const roots = new Map<string, { spec: RootSpec; trie: TrieNode }>();

  for (const location of locations.values()) {
    const { root, rest } = resolveRoot(location.path, homeDir);
    let entry = roots.get(root.id);
    if (!entry) {
      entry = { spec: root, trie: createTrieNode(root.label) };
      roots.set(root.id, entry);
    }
    const ignoreCase = isWindowsStyle(location.path);
    let node = entry.trie;
    node.count += 1;
    for (const segment of rest) {
      const segmentId = ignoreCase ? segment.toLowerCase() : segment;
      let child = node.children.get(segmentId);
      if (!child) {
        child = createTrieNode(segment);
        node.children.set(segmentId, child);
      }
      child.count += 1;
      node = child;
    }
    node.location = location;
  }

  const rootNodes = Array.from(roots.values())
    .sort((a, b) => a.spec.order - b.spec.order || compareNames(a.spec.label, b.spec.label))
    .map(({ spec, trie }) => buildFolder(trie, spec.path, spec.label, true, spec.path));

  return { roots: rootNodes, temporary, unavailable };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export interface TreeLocateResult {
  /** Row key (`dir:` for folders, `loc:` for projects). */
  key: string;
  kind: "folder" | "project";
  /** Folder / bucket keys that must be expanded for the row to be visible. */
  ancestorKeys: string[];
  /**
   * `exact`: the row stands for `path`. `descendant`: the shallowest row inside
   * `path` (the path sits above it). `ancestor`: the deepest folder containing it.
   */
  match: "exact" | "descendant" | "ancestor";
  /**
   * Exact folder match that is itself a project: the key of that project's
   * row, the folder's first child (visible only while the folder is expanded).
   */
  selfKey?: string;
}

function matchesExactly(node: DirectoryTreeNode, identity: string): boolean {
  if (getPathIdentity(node.path) === identity) return true;
  return (
    node.kind === "folder" &&
    node.self !== null &&
    getPathIdentity(node.self.path) === identity
  );
}

/**
 * Find the row that best represents `path`: the exact row, else the shallowest
 * row inside it (a parent above the projects), else the deepest folder that
 * contains it. Temporary / unavailable projects resolve inside their bucket.
 */
export function locateInDirectoryTree(
  tree: DirectoryTree,
  path: string
): TreeLocateResult | null {
  if (!path) return null;
  const identity = getPathIdentity(path);

  const buckets = [
    [TEMPORARY_BUCKET_KEY, tree.temporary],
    [UNAVAILABLE_BUCKET_KEY, tree.unavailable],
  ] as const;
  for (const [bucketKey, bucket] of buckets) {
    const hit = bucket.find((project) => getPathIdentity(locationPathOf(project)) === identity);
    if (hit) {
      return {
        key: getLocationKey(locationPathOf(hit)),
        kind: "project",
        ancestorKeys: [bucketKey],
        match: "exact",
      };
    }
  }

  const best: {
    descendant: { result: TreeLocateResult; depth: number } | null;
    ancestor: { result: TreeLocateResult; depth: number } | null;
  } = { descendant: null, ancestor: null };

  const visit = (node: DirectoryTreeNode, ancestors: string[]): TreeLocateResult | null => {
    const depth = ancestors.length;
    const base = { key: node.key, kind: node.kind, ancestorKeys: ancestors };
    if (matchesExactly(node, identity)) {
      return node.kind === "folder" && node.self
        ? { ...base, match: "exact", selfKey: getLocationKey(node.self.path) }
        : { ...base, match: "exact" };
    }
    const nodeIdentity = getPathIdentity(node.path);
    if (isSameOrInside(nodeIdentity, identity)) {
      if (!best.descendant || depth < best.descendant.depth) {
        best.descendant = { result: { ...base, match: "descendant" }, depth };
      }
      return null; // everything below is deeper still
    }
    if (node.kind !== "folder") return null;
    if (isSameOrInside(identity, nodeIdentity) && (!best.ancestor || depth > best.ancestor.depth)) {
      best.ancestor = { result: { ...base, match: "ancestor" }, depth };
    }
    const nextAncestors = [...ancestors, node.key];
    for (const child of node.children) {
      const found = visit(child, nextAncestors);
      if (found) return found;
    }
    return null;
  };

  for (const root of tree.roots) {
    const found = visit(root, []);
    if (found) return found;
  }
  return best.descendant?.result ?? best.ancestor?.result ?? null;
}

/** Expansion keys of every folder row in the tree, roots included. */
export function getAllFolderKeys(tree: DirectoryTree): string[] {
  const keys: string[] = [];
  const visit = (node: DirectoryTreeNode) => {
    if (node.kind !== "folder") return;
    keys.push(node.key);
    node.children.forEach(visit);
  };
  tree.roots.forEach(visit);
  return keys;
}

/**
 * Keys to expand so the project row for `projectPath` is visible, or null when
 * that working directory is not in the tree. A folder that is itself a project
 * needs the folder expanded too, because its project row is its first child.
 */
export function getProjectExpansionKeys(
  tree: DirectoryTree,
  projectPath: string
): string[] | null {
  const located = locateInDirectoryTree(tree, projectPath);
  if (!located || located.match !== "exact") return null;
  return located.kind === "folder"
    ? [...located.ancestorKeys, located.key]
    : located.ancestorKeys;
}
