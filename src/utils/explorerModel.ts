// src/utils/explorerModel.ts
/**
 * The explorer tree, built from the visible provider projects.
 *
 * - One row per working directory (a "location"): every provider that
 *   recorded sessions there is a chip on that row, never a second row.
 * - Unavailable, temporary and path-less projects are set aside first.
 * - The folder holding most projects (`~/projects` on a typical machine) is
 *   the workspace root. The main section is its content, relative to it, so
 *   the top level is the user's projects rather than `~ › projects`.
 * - Everything else is "Other locations", relative to home.
 * - Temporary and unavailable locations are flat, recent-first buckets.
 *
 * Pure (no React, no i18n): the few label words are injected via `text`.
 */
import type { ClaudeProject, ProviderId } from "../types";
import {
  getPathIdentity,
  isAbsolutePath,
  isSameOrInsideIdentity,
  isTemporaryPath,
  isUncPath,
  looksLikeWindowsPath,
  resolveHomeDir,
  splitPathParts,
} from "./pathUtils";
import { getProviderId } from "./providers";

export type ExplorerSort = "name" | "recent";

export const OTHER_LOCATIONS_GROUP_KEY = "group:other-locations";
export const TEMPORARY_BUCKET_KEY = "group:temporary-projects";
export const UNAVAILABLE_BUCKET_KEY = "group:unavailable-projects";

/** One working directory and every provider project recorded for it. */
export interface ExplorerLocation {
  /** Working directory as first recorded, trailing separator dropped ("" when unknown). */
  path: string;
  /** Comparable form of `path` (see `getPathIdentity`); unique per location. */
  identity: string;
  /** Provider projects for this folder, in input order. */
  projects: ClaudeProject[];
  /** Most sessions; a tie goes to the most recent. Clicking the row selects it. */
  primary: ClaudeProject;
  sessionCount: number;
  /** Latest `last_modified` (epoch ms), `-Infinity` when none parses. */
  lastActivity: number;
  /** Distinct providers, most sessions first. */
  providers: ProviderId[];
}

export type ExplorerRowVariant = "default" | "home" | "worktree" | "unknown";

export interface ExplorerRow {
  /**
   * Stable across rebuilds, sorts and filters: `dir:<identity>` for rows with
   * children (their expansion is persisted), `loc:<identity>` for leaves.
   */
  key: string;
  /** Absolute path the row stands for (a compacted chain's deepest folder); "" when unknown. */
  path: string;
  /** The name: a folder name, `~`, or a bucket label. */
  label: string;
  /** Dim folders skipped by compaction, shown before the name (`tools/`). */
  prefix: string;
  /** Dim context shown after the name (buckets only). */
  hint: string;
  variant: ExplorerRowVariant;
  /** The location this row is; null for a pure folder. */
  location: ExplorerLocation | null;
  children: ExplorerRow[];
  /** Latest activity in the row's subtree, its own location included. */
  lastActivity: number;
  /** `path` with home as `~`; matched by the filter. */
  displayPath: string;
}

export type ExplorerGroupId = "other" | "temporary" | "unavailable";

export interface ExplorerGroup {
  id: ExplorerGroupId;
  key: string;
  rows: ExplorerRow[];
  /** Locations in the group, nested rows included. */
  locationCount: number;
}

export interface ExplorerModel {
  /** Detected workspace root; null when none qualifies (the main section is then home-relative). */
  root: { path: string; displayPath: string } | null;
  main: ExplorerRow[];
  /** Non-empty groups in display order: other locations, temporary, unavailable. */
  groups: ExplorerGroup[];
  homeDir: string | null;
}

/** Label formats for bucket rows; the UI passes translated ones. */
export interface ExplorerLabelText {
  scratchpad: (owner: string) => string;
  job: (shortId: string) => string;
}

export interface BuildExplorerOptions {
  sort?: ExplorerSort;
  /** The backend's home (e.g. from the Claude data folder); see `resolveHomeDir`. */
  homeHint?: string | null;
  text?: Partial<ExplorerLabelText>;
}

const DEFAULT_TEXT: ExplorerLabelText = {
  scratchpad: (owner) => `${owner} scratchpad`,
  job: (shortId) => `job ${shortId}`,
};

const dirKey = (identity: string) => `dir:${identity}`;
const locKey = (identity: string) => `loc:${identity}`;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** `/a/b/` → `/a/b`; `/` and `C:\` stay whole. */
function withoutTrailingSeparator(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed === "" || trimmed.endsWith(":") ? path : trimmed;
}

function hasUsablePath(path: string): boolean {
  return isAbsolutePath(path) || isUncPath(path);
}

const separatorOf = (path: string) => (looksLikeWindowsPath(path) ? "\\" : "/");

function joinPath(base: string, parts: string[]): string {
  if (parts.length === 0) return base;
  const separator = separatorOf(base);
  return `${base.replace(/[\\/]+$/, "")}${separator}${parts.join(separator)}`;
}

/** Parts of `path` below `base`, or null when it is not inside it. */
function relativeParts(path: string, base: string): string[] | null {
  const parts = splitPathParts(path);
  const baseParts = splitPathParts(base);
  if (parts.length < baseParts.length || isUncPath(path) !== isUncPath(base)) return null;
  const ignoreCase = looksLikeWindowsPath(path) || looksLikeWindowsPath(base);
  const same = (a: string, b: string) => (ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b);
  return baseParts.every((part, index) => same(parts[index] ?? "", part))
    ? parts.slice(baseParts.length)
    : null;
}

function toDisplayPath(path: string, homeDir: string | null): string {
  const rel = homeDir ? relativeParts(path, homeDir) : null;
  if (!homeDir || !rel) return path;
  const separator = separatorOf(homeDir);
  return rel.length > 0 ? `~${separator}${rel.join(separator)}` : "~";
}

/** `tools/` for skipped folders `["tools"]`, "" for none. */
function prefixOf(parts: string[], path: string): string {
  if (parts.length === 0) return "";
  const separator = separatorOf(path);
  return `${parts.join(separator)}${separator}`;
}

/** Claude Code names per-project folders after the cwd with every non-alphanumeric as `-`. */
const claudeEncodedPath = (path: string) => path.replace(/[^A-Za-z0-9]/g, "-");

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

function activityTime(project: ClaudeProject): number {
  const time = Date.parse(project.last_modified);
  return Number.isNaN(time) ? -Infinity : time;
}

function toLocation(path: string, identity: string, projects: ClaudeProject[]): ExplorerLocation {
  let primary = projects[0]!;
  let sessionCount = 0;
  let lastActivity = -Infinity;
  const perProvider = new Map<ProviderId, number>();
  for (const project of projects) {
    sessionCount += project.session_count;
    lastActivity = Math.max(lastActivity, activityTime(project));
    const providerId = getProviderId(project.provider);
    perProvider.set(providerId, (perProvider.get(providerId) ?? 0) + project.session_count);
    const moreSessions = project.session_count > primary.session_count;
    const sameButNewer =
      project.session_count === primary.session_count &&
      activityTime(project) > activityTime(primary);
    if (moreSessions || sameButNewer) primary = project;
  }
  const providers = Array.from(perProvider.entries())
    .sort(([idA, countA], [idB, countB]) => countB - countA || (idA < idB ? -1 : 1))
    .map(([providerId]) => providerId);
  return { path, identity, projects, primary, sessionCount, lastActivity, providers };
}

/** Sessions recorded by one provider for a location. */
export function getProviderSessionCount(location: ExplorerLocation, providerId: ProviderId): number {
  return location.projects
    .filter((project) => getProviderId(project.provider) === providerId)
    .reduce((sum, project) => sum + project.session_count, 0);
}

/** The provider's project with the most sessions (what its chip selects). */
export function getProviderProject(
  location: ExplorerLocation,
  providerId: ProviderId
): ClaudeProject | undefined {
  return location.projects
    .filter((project) => getProviderId(project.provider) === providerId)
    .reduce<ClaudeProject | undefined>(
      (best, project) =>
        best === undefined || project.session_count > best.session_count ? project : best,
      undefined
    );
}

interface CollectedLocations {
  /** Locations with a usable absolute path, merged by path identity. */
  located: ExplorerLocation[];
  /** One location per project whose path is empty, `unknown` or relative. */
  pathless: ExplorerLocation[];
}

function collectLocations(projects: ClaudeProject[]): CollectedLocations {
  const byIdentity = new Map<string, { path: string; projects: ClaudeProject[] }>();
  const pathless: ExplorerLocation[] = [];
  for (const project of projects) {
    const raw = (project.actual_path ?? "").trim();
    if (!hasUsablePath(raw)) {
      const identity = `unknown:${getProviderId(project.provider)}:${project.path || project.name}`;
      pathless.push(toLocation("", identity, [project]));
      continue;
    }
    const path = withoutTrailingSeparator(raw);
    const identity = getPathIdentity(path);
    const entry = byIdentity.get(identity);
    if (entry) entry.projects.push(project);
    else byIdentity.set(identity, { path, projects: [project] });
  }
  const located = Array.from(byIdentity, ([identity, entry]) =>
    toLocation(entry.path, identity, entry.projects)
  );
  return { located, pathless };
}

const isUnavailable = (location: ExplorerLocation) =>
  location.projects.some((project) => project.path_status === "unavailable");

/** OS scratch folders, plus `<home>/.claude/jobs` for a home outside `/home/<user>`. */
function isTemporaryLocation(location: ExplorerLocation, homeDir: string | null): boolean {
  if (isTemporaryPath(location.path)) return true;
  if (!homeDir) return false;
  const jobsIdentity = getPathIdentity(`${homeDir}/.claude/jobs`);
  return location.identity.startsWith(`${jobsIdentity}/`);
}

// ---------------------------------------------------------------------------
// Workspace root
// ---------------------------------------------------------------------------

/**
 * The deepest folder strictly below home holding at least three locations and
 * at least half of them; null when none does, or two tie at the deepest level.
 */
function detectWorkspaceRoot(locations: ExplorerLocation[], homeDir: string | null): string | null {
  if (!homeDir) return null;
  const counts = new Map<string, { parts: string[]; count: number }>();
  for (const location of locations) {
    const rel = relativeParts(location.path, homeDir);
    if (!rel) continue;
    // Every folder strictly between home and the location holds it.
    for (let depth = 1; depth < rel.length; depth += 1) {
      const parts = rel.slice(0, depth);
      const identity = getPathIdentity(joinPath(homeDir, parts));
      const entry = counts.get(identity);
      if (entry) entry.count += 1;
      else counts.set(identity, { parts, count: 1 });
    }
  }

  const minimum = Math.max(3, locations.length / 2);
  let best: { parts: string[]; count: number } | null = null;
  let tied = false;
  for (const entry of counts.values()) {
    if (entry.count < minimum) continue;
    if (!best || entry.parts.length > best.parts.length) {
      best = entry;
      tied = false;
    } else if (entry.parts.length === best.parts.length) {
      tied = true;
    }
  }
  return best && !tied ? joinPath(homeDir, best.parts) : null;
}

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

/**
 * Linked git worktrees whose main repository is another listed location:
 * main location identity → its worktree locations. A worktree of a worktree
 * stays where it is.
 */
function findWorktrees(locations: ExplorerLocation[]): Map<string, ExplorerLocation[]> {
  const listed = new Set(locations.map((location) => location.identity));
  const parentOf = new Map<ExplorerLocation, string>();
  for (const location of locations) {
    const candidates = [location.primary, ...location.projects.filter((p) => p !== location.primary)];
    for (const project of candidates) {
      const info = project.git_info;
      if (info?.worktree_type !== "linked" || !info.main_project_path) continue;
      const parentIdentity = getPathIdentity(withoutTrailingSeparator(info.main_project_path));
      if (parentIdentity !== location.identity && listed.has(parentIdentity)) {
        parentOf.set(location, parentIdentity);
        break;
      }
    }
  }

  const moved = new Set(Array.from(parentOf.keys(), (location) => location.identity));
  const worktrees = new Map<string, ExplorerLocation[]>();
  for (const [location, parentIdentity] of parentOf) {
    if (moved.has(parentIdentity)) continue;
    const list = worktrees.get(parentIdentity);
    if (list) list.push(location);
    else worktrees.set(parentIdentity, [location]);
  }
  return worktrees;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface RowContext {
  homeDir: string | null;
  worktrees: Map<string, ExplorerLocation[]>;
}

interface TrieNode {
  name: string;
  children: Map<string, TrieNode>;
  location: ExplorerLocation | null;
  /** Locations in this subtree, its own included. */
  count: number;
}

const createNode = (name: string): TrieNode => ({
  name,
  children: new Map(),
  location: null,
  count: 0,
});

const firstChild = (node: TrieNode): TrieNode | undefined => node.children.values().next().value;

function insertLocation(root: TrieNode, parts: string[], location: ExplorerLocation) {
  const ignoreCase = looksLikeWindowsPath(location.path);
  let node = root;
  node.count += 1;
  for (const part of parts) {
    const id = ignoreCase ? part.toLowerCase() : part;
    let child = node.children.get(id);
    if (!child) {
      child = createNode(part);
      node.children.set(id, child);
    }
    child.count += 1;
    node = child;
  }
  node.location = location;
}

function makeRow(row: Omit<ExplorerRow, "lastActivity">): ExplorerRow {
  const lastActivity = row.children.reduce(
    (latest, child) => Math.max(latest, child.lastActivity),
    row.location?.lastActivity ?? -Infinity
  );
  return { ...row, lastActivity };
}

function worktreeRow(
  worktree: ExplorerLocation,
  main: ExplorerLocation,
  ctx: RowContext
): ExplorerRow {
  const parts = splitPathParts(worktree.path);
  const label = parts.at(-1) ?? worktree.path;
  const rel = relativeParts(worktree.path, main.path);
  let prefix: string;
  if (rel && rel.length > 0) {
    prefix = prefixOf(rel.slice(0, -1), worktree.path);
  } else {
    const parent = worktree.path.slice(0, worktree.path.length - label.length);
    const parentDisplay = toDisplayPath(withoutTrailingSeparator(parent), ctx.homeDir);
    prefix = parentDisplay.endsWith(separatorOf(worktree.path))
      ? parentDisplay
      : `${parentDisplay}${separatorOf(worktree.path)}`;
  }
  return makeRow({
    key: locKey(worktree.identity),
    path: worktree.path,
    label,
    prefix,
    hint: "",
    variant: "worktree",
    location: worktree,
    children: [],
    displayPath: toDisplayPath(worktree.path, ctx.homeDir),
  });
}

function locationRow(
  location: ExplorerLocation,
  parts: { label: string; prefix: string; children: ExplorerRow[]; variant?: ExplorerRowVariant },
  ctx: RowContext
): ExplorerRow {
  const worktrees = (ctx.worktrees.get(location.identity) ?? []).map((worktree) =>
    worktreeRow(worktree, location, ctx)
  );
  const children = [...parts.children, ...worktrees];
  return makeRow({
    key: children.length > 0 ? dirKey(location.identity) : locKey(location.identity),
    path: location.path,
    label: parts.label,
    prefix: parts.prefix,
    hint: "",
    variant: parts.variant ?? "default",
    location,
    children,
    displayPath: toDisplayPath(location.path, ctx.homeDir),
  });
}

/** A subtree holding one location: lift it, keeping the skipped folders as its prefix. */
function liftedRow(node: TrieNode, path: string, ctx: RowContext): ExplorerRow {
  const skipped: string[] = [];
  let current = node;
  while (!current.location) {
    const next = firstChild(current);
    if (!next) break;
    skipped.push(current.name);
    current = next;
  }
  return locationRow(
    current.location!,
    { label: current.name, prefix: prefixOf(skipped, path), children: [] },
    ctx
  );
}

/**
 * A subtree holding two or more locations. Single-child folders without a
 * location of their own collapse into one row (`tools/` + `cli`); a folder
 * that is a location is that location's row (never a child of itself).
 */
function folderRow(node: TrieNode, path: string, ctx: RowContext): ExplorerRow {
  const chain = [node.name];
  let current = node;
  let currentPath = path;
  while (!current.location && current.children.size === 1) {
    const only = firstChild(current)!;
    chain.push(only.name);
    current = only;
    currentPath = joinPath(currentPath, [only.name]);
  }
  const label = chain[chain.length - 1]!;
  const prefix = prefixOf(chain.slice(0, -1), path);
  const children = buildRows(current, currentPath, ctx);
  if (current.location) return locationRow(current.location, { label, prefix, children }, ctx);
  return makeRow({
    key: dirKey(getPathIdentity(currentPath)),
    path: currentPath,
    label,
    prefix,
    hint: "",
    variant: "default",
    location: null,
    children,
    displayPath: toDisplayPath(currentPath, ctx.homeDir),
  });
}

function buildRows(node: TrieNode, nodePath: string, ctx: RowContext): ExplorerRow[] {
  return Array.from(node.children.values(), (child) => {
    const childPath = joinPath(nodePath, [child.name]);
    return child.count === 1 ? liftedRow(child, childPath, ctx) : folderRow(child, childPath, ctx);
  });
}

/** The filesystem root a path outside home hangs from: `/`, a drive or a UNC share. */
function resolveBase(path: string): { id: string; path: string; label: string; rest: string[] } {
  const parts = splitPathParts(path);
  if (isUncPath(path) && parts.length >= 2) {
    const share = `\\\\${parts[0]}\\${parts[1]}`;
    return { id: `unc:${share.toLowerCase()}`, path: share, label: `${share}\\`, rest: parts.slice(2) };
  }
  const drive = parts[0];
  if (drive && /^[A-Za-z]:$/.test(drive)) {
    const label = `${drive.toUpperCase()}\\`;
    return { id: `drive:${label}`, path: label, label, rest: parts.slice(1) };
  }
  return { id: "posix", path: "/", label: "/", rest: parts };
}

function unknownRow(location: ExplorerLocation): ExplorerRow {
  return makeRow({
    key: locKey(location.identity),
    path: "",
    label: location.primary.name || location.primary.path,
    prefix: "",
    hint: "",
    variant: "unknown",
    location,
    children: [],
    displayPath: "",
  });
}

/**
 * Locations outside the main section as one home-relative list: home (`~`)
 * first, then folders under home and outside it, path-less projects last.
 */
function otherRows(
  locations: ExplorerLocation[],
  pathless: ExplorerLocation[],
  ctx: RowContext,
  compare: RowComparator
): ExplorerRow[] {
  const { homeDir } = ctx;
  const homeIdentity = homeDir ? getPathIdentity(homeDir) : null;
  let homeRow: ExplorerRow | null = null;
  const homeTrie = createNode("~");
  const bases = new Map<string, { base: ReturnType<typeof resolveBase>; trie: TrieNode }>();

  for (const location of locations) {
    if (location.identity === homeIdentity) {
      homeRow = locationRow(location, { label: "~", prefix: "", children: [], variant: "home" }, ctx);
      continue;
    }
    const rel = homeDir ? relativeParts(location.path, homeDir) : null;
    if (rel) {
      insertLocation(homeTrie, rel, location);
      continue;
    }
    const base = resolveBase(location.path);
    let entry = bases.get(base.id);
    if (!entry) {
      entry = { base, trie: createNode(base.label) };
      bases.set(base.id, entry);
    }
    insertLocation(entry.trie, base.rest, location);
  }

  const rows = homeDir ? buildRows(homeTrie, homeDir, ctx) : [];
  for (const { base, trie } of bases.values()) {
    for (const row of buildRows(trie, base.path, ctx)) {
      rows.push({ ...row, prefix: `${base.label}${row.prefix}` });
    }
    if (trie.location) {
      rows.push(locationRow(trie.location, { label: base.label, prefix: "", children: [] }, ctx));
    }
  }

  return [
    ...(homeRow ? sortTree([homeRow], compare) : []),
    ...sortTree(rows, compare),
    ...sortTree(pathless.map(unknownRow), compare),
  ];
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

const SCRATCHPAD_PATTERN = /^\/(?:private\/)?tmp\/claude-\d+\/([^/]+)\/([^/]+)\/scratchpad(?:\/(.+))?$/;
const CLAUDE_JOB_PATTERN = /[\\/]\.claude[\\/]jobs[\\/]([^\\/]+)/;

interface BucketContext {
  homeDir: string | null;
  text: ExplorerLabelText;
  /** Claude-encoded path → leaf name of the (non-temporary) location it encodes. */
  scratchpadOwners: Map<string, string>;
}

function bucketLabel(location: ExplorerLocation, ctx: BucketContext): { label: string; hint: string } {
  if (!location.path) return { label: location.primary.name || location.primary.path, hint: "" };

  const scratchpad = SCRATCHPAD_PATTERN.exec(location.path);
  if (scratchpad) {
    const [, encoded = "", sessionId = "", rest] = scratchpad;
    const owner =
      ctx.scratchpadOwners.get(encoded) ?? encoded.split("-").filter(Boolean).at(-1) ?? encoded;
    return {
      label: `${ctx.text.scratchpad(owner)}${rest ? `/${rest}` : ""}`,
      hint: sessionId.slice(0, 6),
    };
  }

  const job = CLAUDE_JOB_PATTERN.exec(location.path);
  if (job) {
    const jobId = job[1] ?? "";
    const jobsDir = location.path.slice(0, job.index + job[0].length - jobId.length - 1);
    return { label: ctx.text.job(jobId.slice(0, 8)), hint: toDisplayPath(jobsDir, ctx.homeDir) };
  }

  const parts = splitPathParts(location.path);
  const base = resolveBase(location.path);
  // Directly under a filesystem root (`/tmp`): the whole path is the name.
  if (base.rest.length <= 1) return { label: location.path, hint: "" };
  const leaf = parts[parts.length - 1]!;
  const parent = withoutTrailingSeparator(location.path.slice(0, location.path.length - leaf.length));
  return { label: leaf, hint: toDisplayPath(parent, ctx.homeDir) };
}

function bucketRows(locations: ExplorerLocation[], ctx: BucketContext): ExplorerRow[] {
  const rows = locations.map((location) => {
    const { label, hint } = bucketLabel(location, ctx);
    return makeRow({
      key: locKey(location.identity),
      path: location.path,
      label,
      prefix: "",
      hint,
      variant: "default",
      location,
      children: [],
      displayPath: location.path ? toDisplayPath(location.path, ctx.homeDir) : "",
    });
  });
  return sortTree(rows, compareRecent);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type RowComparator = (a: ExplorerRow, b: ExplorerRow) => number;

// One shared collator: `localeCompare` with options builds a new one per call.
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const compareByName: RowComparator = (a, b) =>
  nameCollator.compare(a.label, b.label) ||
  nameCollator.compare(a.prefix, b.prefix) ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Latest activity first; `-Infinity` (unknown) last. */
const compareRecent: RowComparator = (a, b) =>
  (a.lastActivity === b.lastActivity ? 0 : a.lastActivity > b.lastActivity ? -1 : 1) ||
  compareByName(a, b);

function sortTree(rows: ExplorerRow[], compare: RowComparator): ExplorerRow[] {
  return [...rows]
    .sort(compare)
    .map((row) =>
      row.children.length > 0 ? { ...row, children: sortTree(row.children, compare) } : row
    );
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function countLocations(rows: ExplorerRow[]): number {
  return rows.reduce((sum, row) => sum + (row.location ? 1 : 0) + countLocations(row.children), 0);
}

function makeGroup(id: ExplorerGroupId, key: string, rows: ExplorerRow[]): ExplorerGroup {
  return { id, key, rows, locationCount: countLocations(rows) };
}

export function buildExplorerModel(
  projects: ClaudeProject[],
  options: BuildExplorerOptions = {}
): ExplorerModel {
  const compare = options.sort === "recent" ? compareRecent : compareByName;
  const text = { ...DEFAULT_TEXT, ...options.text };
  const { located, pathless } = collectLocations(projects);
  const homeDir = resolveHomeDir(
    located.map((location) => location.path),
    options.homeHint
  );

  const unavailable: ExplorerLocation[] = [];
  const temporary: ExplorerLocation[] = [];
  const normal: ExplorerLocation[] = [];
  for (const location of located) {
    if (isUnavailable(location)) unavailable.push(location);
    else if (isTemporaryLocation(location, homeDir)) temporary.push(location);
    else normal.push(location);
  }
  const unknown = pathless.filter((location) => !isUnavailable(location));
  unavailable.push(...pathless.filter(isUnavailable));

  const worktrees = findWorktrees(normal);
  const moved = new Set(
    Array.from(worktrees.values()).flatMap((list) => list.map((location) => location.identity))
  );
  const ctx: RowContext = { homeDir, worktrees };
  const placed = normal.filter((location) => !moved.has(location.identity));

  const rootPath = detectWorkspaceRoot(normal, homeDir);
  let main: ExplorerRow[];
  let other: ExplorerRow[] = [];
  if (rootPath) {
    const rootIdentity = getPathIdentity(rootPath);
    const isInsideRoot = (location: ExplorerLocation) =>
      location.identity !== rootIdentity && isSameOrInsideIdentity(location.identity, rootIdentity);
    const rootTrie = createNode("");
    for (const location of placed.filter(isInsideRoot)) {
      insertLocation(rootTrie, relativeParts(location.path, rootPath) ?? [], location);
    }
    main = sortTree(buildRows(rootTrie, rootPath, ctx), compare);
    other = otherRows(
      placed.filter((location) => !isInsideRoot(location)),
      unknown,
      ctx,
      compare
    );
  } else {
    main = otherRows(placed, unknown, ctx, compare);
  }

  const scratchpadOwners = new Map<string, string>();
  for (const location of [...normal, ...unavailable]) {
    if (!location.path) continue;
    const encoded = claudeEncodedPath(location.path);
    if (!scratchpadOwners.has(encoded)) {
      scratchpadOwners.set(encoded, splitPathParts(location.path).at(-1) ?? location.path);
    }
  }
  const bucketCtx: BucketContext = { homeDir, text, scratchpadOwners };

  const groups = [
    makeGroup("other", OTHER_LOCATIONS_GROUP_KEY, other),
    makeGroup("temporary", TEMPORARY_BUCKET_KEY, bucketRows(temporary, bucketCtx)),
    makeGroup("unavailable", UNAVAILABLE_BUCKET_KEY, bucketRows(unavailable, bucketCtx)),
  ].filter((group) => group.rows.length > 0);

  return {
    root: rootPath ? { path: rootPath, displayPath: toDisplayPath(rootPath, homeDir) } : null,
    main,
    groups,
    homeDir,
  };
}

/** Locations shown in the model, groups included. */
export function getLocationCount(model: ExplorerModel): number {
  return (
    countLocations(model.main) +
    model.groups.reduce((sum, group) => sum + group.locationCount, 0)
  );
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export interface TextRange {
  start: number;
  end: number;
}

/** Highlight ranges in the visible parts of a row. */
export interface ExplorerRowMatch {
  label: TextRange[];
  prefix: TextRange[];
  hint: TextRange[];
}

export interface ExplorerFilterResult {
  model: ExplorerModel;
  /** Folder and group keys above a match: opened while the filter is active. */
  revealKeys: string[];
  /** Rows that match themselves (not only through a descendant), by key. */
  matches: Map<string, ExplorerRowMatch>;
}

function findRanges(text: string, needle: string): TextRange[] {
  const ranges: TextRange[] = [];
  const haystack = text.toLowerCase();
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return ranges;
    ranges.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
}

/**
 * Case-insensitive substring filter over the row label, its display path
 * (home as `~`) and the names of its provider projects. A row stays when it
 * or a descendant matches; empty folders and groups go.
 */
export function filterExplorerModel(model: ExplorerModel, query: string): ExplorerFilterResult {
  const needle = query.trim().toLowerCase();
  if (!needle) return { model, revealKeys: [], matches: new Map() };

  const revealKeys = new Set<string>();
  const matches = new Map<string, ExplorerRowMatch>();

  const visit = (rows: ExplorerRow[], ancestors: string[]): ExplorerRow[] => {
    const kept: ExplorerRow[] = [];
    for (const row of rows) {
      const children = visit(row.children, [...ancestors, row.key]);
      const match: ExplorerRowMatch = {
        label: findRanges(row.label, needle),
        prefix: findRanges(row.prefix, needle),
        hint: findRanges(row.hint, needle),
      };
      const matchesItself =
        match.label.length > 0 ||
        match.prefix.length > 0 ||
        match.hint.length > 0 ||
        row.displayPath.toLowerCase().includes(needle) ||
        (row.location?.projects.some((project) =>
          (project.name ?? "").toLowerCase().includes(needle)
        ) ??
          false);
      if (!matchesItself && children.length === 0) continue;
      if (matchesItself) {
        matches.set(row.key, match);
        for (const key of ancestors) revealKeys.add(key);
      }
      kept.push({ ...row, children });
    }
    return kept;
  };

  const main = visit(model.main, []);
  const groups = model.groups
    .map((group) => makeGroup(group.id, group.key, visit(group.rows, [group.key])))
    .filter((group) => group.rows.length > 0);

  return { model: { ...model, main, groups }, revealKeys: Array.from(revealKeys), matches };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export interface ExplorerLocateResult {
  key: string;
  /** Row and group keys that must be open for the row to show, outermost first. */
  ancestorKeys: string[];
  /**
   * `exact`: the row stands for the path. `descendant`: the shallowest row
   * inside the path (it sits above the rows). `ancestor`: the deepest row
   * containing it.
   */
  match: "exact" | "descendant" | "ancestor";
}

type RowVisitor<T> = (row: ExplorerRow, ancestorKeys: string[]) => T | null;

/** Depth-first over the main section, then each group; stops at the first non-null result. */
function visitRows<T>(model: ExplorerModel, visitor: RowVisitor<T>): T | null {
  const walk = (rows: ExplorerRow[], ancestors: string[]): T | null => {
    for (const row of rows) {
      const found = visitor(row, ancestors) ?? walk(row.children, [...ancestors, row.key]);
      if (found !== null) return found;
    }
    return null;
  };
  const inMain = walk(model.main, []);
  if (inMain !== null) return inMain;
  for (const group of model.groups) {
    const found = walk(group.rows, [group.key]);
    if (found !== null) return found;
  }
  return null;
}

/** The row that best represents `path` (the header breadcrumb reveals it). */
export function locateInExplorer(model: ExplorerModel, path: string): ExplorerLocateResult | null {
  if (!path) return null;
  const identity = getPathIdentity(withoutTrailingSeparator(path));
  const best: {
    descendant: { result: ExplorerLocateResult; depth: number } | null;
    ancestor: { result: ExplorerLocateResult; depth: number } | null;
  } = { descendant: null, ancestor: null };

  const exact = visitRows<ExplorerLocateResult>(model, (row, ancestorKeys) => {
    if (!row.path) return null;
    const rowIdentity = getPathIdentity(row.path);
    const depth = ancestorKeys.length;
    if (rowIdentity === identity) return { key: row.key, ancestorKeys, match: "exact" };
    if (isSameOrInsideIdentity(rowIdentity, identity)) {
      if (!best.descendant || depth < best.descendant.depth) {
        best.descendant = { result: { key: row.key, ancestorKeys, match: "descendant" }, depth };
      }
    } else if (
      isSameOrInsideIdentity(identity, rowIdentity) &&
      (!best.ancestor || depth > best.ancestor.depth)
    ) {
      best.ancestor = { result: { key: row.key, ancestorKeys, match: "ancestor" }, depth };
    }
    return null;
  });
  return exact ?? best.descendant?.result ?? best.ancestor?.result ?? null;
}

export interface ExplorerRowLookup {
  row: ExplorerRow;
  ancestorKeys: string[];
}

/** The row whose location holds the provider project stored at `projectPath`. */
export function findRowForProject(model: ExplorerModel, projectPath: string): ExplorerRowLookup | null {
  return visitRows<ExplorerRowLookup>(model, (row, ancestorKeys) =>
    row.location?.projects.some((project) => project.path === projectPath)
      ? { row, ancestorKeys }
      : null
  );
}
