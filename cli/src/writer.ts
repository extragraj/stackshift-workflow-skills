import { writeFileSync, renameSync, readdirSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import fsExtra from 'fs-extra';
const { copySync, ensureDirSync, readJsonSync, writeJsonSync, pathExistsSync, readFileSync, removeSync } = fsExtra;
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { InstallChoices, ProtocolTier, Platform } from './prompts.js';
import type { ProtocolEntry, SkillEntry, SeedEntry, StepMap } from './registry.js';
import { loadStepMap, loadSeedRegistry } from './registry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const skillsDir = resolve(__dirname, '../../skills');
const protocolsDir = resolve(__dirname, '../../skills/stackshift/protocols');
const skillVersionPath = resolve(__dirname, '../../skill.version');

const LOCK_FILE = 'skills-lock.json';

const PLATFORM_PROJECT_DIR: Record<Platform, string> = {
  claude: '.claude',
  agents: '.agents',
  copilot: '.github',
  gemini: '.agents',
  cursor: '.cursor',
};

const PLATFORM_GLOBAL_DIR: Record<Platform, string> = {
  claude: '.claude',
  agents: '.agents',
  copilot: '.copilot',
  gemini: join('.gemini', 'antigravity'),
  cursor: '.cursor',
};

const ALL_PLATFORMS: Platform[] = ['agents', 'claude', 'copilot', 'gemini', 'cursor'];

/**
 * Atomic JSON write: write to a `.tmp` file, then rename.
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeJsonSync(tmpPath, data, { spaces: 2 });
  renameSync(tmpPath, filePath);
}

interface LockEntry {
  name: string;
  installedAt: string;
  scope: 'project' | 'global';
}

interface LockFile {
  skills: LockEntry[];
}

function resolveTargetDir(scope: 'project' | 'global', platform: Platform): string {
  const baseDir = scope === 'global'
    ? PLATFORM_GLOBAL_DIR[platform]
    : PLATFORM_PROJECT_DIR[platform];
  if (scope === 'global') return join(homedir(), baseDir, 'skills');
  return join(process.cwd(), baseDir, 'skills');
}

function resolveLockPath(scope: 'project' | 'global', platform: Platform): string {
  const baseDir = scope === 'global'
    ? PLATFORM_GLOBAL_DIR[platform]
    : PLATFORM_PROJECT_DIR[platform];
  if (scope === 'global') return join(homedir(), baseDir, LOCK_FILE);
  return join(process.cwd(), baseDir, LOCK_FILE);
}

function appendLock(lockPath: string, entry: LockEntry): void {
  let lock: LockFile = { skills: [] };
  if (pathExistsSync(lockPath)) {
    lock = readJsonSync(lockPath) as LockFile;
  }
  lock.skills = lock.skills.filter((s) => s.name !== entry.name);
  lock.skills.push(entry);
  writeJsonAtomic(lockPath, lock);
}

function copySkillFolder(folderPath: string, targetDir: string): void {
  const folderName = basename(folderPath);
  const dest = join(targetDir, folderName);
  copySync(folderPath, dest, { overwrite: true });
}

function getInstalledPlatforms(scope: 'project' | 'global'): Platform[] {
  const platforms: Platform[] = [];
  const seenDirs = new Set<string>();

  for (const platform of ALL_PLATFORMS) {
    const targetDir = resolveTargetDir(scope, platform);
    if (seenDirs.has(targetDir)) continue;
    // Detect any existing StackShift install — current `stackshift/` or legacy `stackshift-core/`.
    const stackshiftDir = join(targetDir, 'stackshift');
    const legacyCoreDir = join(targetDir, 'stackshift-core');
    if (pathExistsSync(stackshiftDir) || pathExistsSync(legacyCoreDir)) {
      platforms.push(platform);
      seenDirs.add(targetDir);
    }
  }

  return platforms;
}

// ---------------------------------------------------------------------------
// Legacy artifact cleanup
//
// 0.3.0 removed the tier-bundle skill folders (stackshift-protocols-{required,
// recommended,full,custom}) and the `materializationDone` / `bootstrapRequired`
// marker flags. 0.5.1 removed the seed-stub folder (stackshift-seed-*); the
// canonical seed content lives in stackshift/seeds/ and seed identity is
// recorded in .stackshift/installed.json. 0.6.0 renamed the skill folder from
// `stackshift-core` to `stackshift`; the legacy folder is removed on first
// install / repair after upgrade. Existing installs may still have any of
// these on disk; the CLI cleans them up on every install.
// ---------------------------------------------------------------------------

const LEGACY_BUNDLE_NAMES = [
  'stackshift-protocols-required',
  'stackshift-protocols-recommended',
  'stackshift-protocols-full',
  'stackshift-protocols-custom',
  'stackshift-core',
];

function removeLegacyBundleFolders(scope: 'project' | 'global'): string[] {
  const removed: string[] = [];
  const seenDirs = new Set<string>();

  for (const platform of ALL_PLATFORMS) {
    const targetDir = resolveTargetDir(scope, platform);
    if (seenDirs.has(targetDir)) continue;
    seenDirs.add(targetDir);
    for (const name of LEGACY_BUNDLE_NAMES) {
      const path = join(targetDir, name);
      if (pathExistsSync(path)) {
        try {
          removeSync(path);
          removed.push(`${targetDir}/${name}`);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`Warning: could not remove ${path}: ${message}`);
        }
      }
    }
    // Any stackshift-seed-* folder is legacy as of 0.5.1.
    try {
      const entries = readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('stackshift-seed-')) {
          const path = join(targetDir, entry.name);
          try {
            removeSync(path);
            removed.push(`${targetDir}/${entry.name}`);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Warning: could not remove ${path}: ${message}`);
          }
        }
      }
    } catch { /* targetDir may not exist yet */ }
  }

  return removed;
}

function stripLegacyBundleEntries(scope: 'project' | 'global'): void {
  const seenLocks = new Set<string>();
  for (const platform of ALL_PLATFORMS) {
    const lockPath = resolveLockPath(scope, platform);
    if (seenLocks.has(lockPath)) continue;
    seenLocks.add(lockPath);
    if (!pathExistsSync(lockPath)) continue;
    try {
      const lock = readJsonSync(lockPath) as LockFile;
      const before = lock.skills.length;
      lock.skills = lock.skills.filter(
        (s) =>
          !s.name.startsWith('stackshift-protocols-') &&
          !s.name.startsWith('stackshift-seed-') &&
          s.name !== 'stackshift-core',
      );
      if (lock.skills.length !== before) {
        writeJsonAtomic(lockPath, lock);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: could not clean ${lockPath}: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Marker file
// ---------------------------------------------------------------------------

function writeStackshiftMarker(
  choices: InstallChoices,
  allProtocols: ProtocolEntry[],
): void {
  if (choices.scope !== 'project') return;

  const markerPath = join(process.cwd(), '.stackshift', 'installed.json');

  let existing: Record<string, unknown> = {};
  if (pathExistsSync(markerPath)) {
    try {
      existing = readJsonSync(markerPath) as Record<string, unknown>;
    } catch { /* overwrite on parse failure */ }
  }

  let skillVersion = '0.1.0';
  try {
    skillVersion = readFileSync(skillVersionPath, 'utf8').trim();
  } catch { /* use default */ }

  const tierTiersMap: Record<ProtocolTier, Array<'required' | 'recommended' | 'optional'>> = {
    required: ['required'],
    recommended: ['required', 'recommended'],
    full: ['required', 'recommended', 'optional'],
    custom: ['required'],
  };

  let protocols = allProtocols.filter((p) => tierTiersMap[choices.protocolTier].includes(p.tier));
  if (choices.protocolTier === 'custom') {
    const extras = allProtocols.filter((p) => choices.customProtocols.includes(p.id));
    protocols = [...protocols, ...extras];
  }

  const modeMap: Record<ProtocolTier, string> = {
    required: 'required',
    recommended: 'recommended',
    full: 'all',
    custom: 'interactive',
  };

  ensureDirSync(join(process.cwd(), '.stackshift'));

  // Strip fields that need controlled re-emission AND legacy flags removed in 0.3.0.
  const {
    seed: _prevSeed,
    bootstrapRequired: _legacyBootstrapRequired,
    materializationDone: _legacyMaterializationDone,
    ...restExisting
  } = existing as Record<string, unknown> & {
    seed?: string;
    bootstrapRequired?: boolean;
    materializationDone?: boolean;
  };

  const mode = choices.keepProtocol && existing.mode
    ? String(existing.mode)
    : modeMap[choices.protocolTier];

  const protocolList = choices.keepProtocol && existing.protocols
    ? existing.protocols as Array<{ id: string; tier: string; file?: string; dir?: string }>
    : protocols.map(({ id, tier, file, dir }) => {
        const entry: { id: string; tier: string; file?: string; dir?: string } = { id, tier };
        if (file) entry.file = file;
        if (dir) entry.dir = dir;
        return entry;
      });

  writeJsonAtomic(markerPath, {
    ...restExisting,
    skillVersion,
    installedAt: new Date().toISOString(),
    mode,
    protocols: protocolList,
    ...(choices.seed && choices.seed !== 'none' ? { seed: choices.seed } : {}),
  });
}

// ---------------------------------------------------------------------------
// Skill folder protocol pruning — 0.6.0
//
// `copySkillFolder` writes the full `skills/stackshift/` tree to every install
// destination. That tree ships every registered protocol so the source repo
// stays the authoritative catalog. The CLI then prunes the destination copy
// down to the set actually recorded in `.stackshift/installed.json` so the
// agent never reads files for protocols the user did not install. Required
// protocols are part of every install — the writer always seeds them.
//
// The prune is non-destructive for non-protocol entries: `_registry.json`,
// `_step-map.json`, `_template/`, and any custom additions the CLI doesn't
// know about are untouched. After the prune, `_registry.json.protocols` is
// rewritten to reflect only the installed set; `seeds/_registry.json.seeds`
// is rewritten the same way against `installed.json.seed`.
// ---------------------------------------------------------------------------

function pruneSkillFolderProtocols(
  installRoot: string,
  installed: { protocols?: Array<{ id: string }>; seed?: string },
  allProtocols: ProtocolEntry[],
  seeds: SeedEntry[],
): { removedProtocols: string[]; removedSeeds: string[] } {
  const removedProtocols: string[] = [];
  const removedSeeds: string[] = [];
  const skillRoot = join(installRoot, 'stackshift');
  if (!pathExistsSync(skillRoot)) return { removedProtocols, removedSeeds };

  const installedIds = new Set<string>((installed.protocols ?? []).map((p) => p.id));

  // Protocols
  const protocolsTarget = join(skillRoot, 'protocols');
  if (pathExistsSync(protocolsTarget)) {
    for (const p of allProtocols) {
      if (installedIds.has(p.id)) continue;
      const entry = p.file ? join(protocolsTarget, p.file) : (p.dir ? join(protocolsTarget, p.dir) : undefined);
      if (entry && pathExistsSync(entry)) {
        try {
          removeSync(entry);
          removedProtocols.push(p.id);
        } catch { /* skip — surfaced upstream */ }
      }
    }

    // Rewrite the in-skill protocol registry so it matches the trimmed folder.
    const registryPath = join(protocolsTarget, '_registry.json');
    if (pathExistsSync(registryPath)) {
      try {
        const raw = readJsonSync(registryPath) as Record<string, unknown> & { protocols?: ProtocolEntry[] };
        const installedProtocolEntries = allProtocols.filter((p) => installedIds.has(p.id));
        writeJsonAtomic(registryPath, { ...raw, protocols: installedProtocolEntries });
      } catch { /* skip */ }
    }

    // Prune the in-skill step map to the installed subset so it matches the
    // injected workflow markers. Steps with no installed protocols become
    // empty arrays — kept rather than deleted so the agent can see the shape
    // (and so re-running init with new selections can repopulate them).
    const stepMapPath = join(protocolsTarget, '_step-map.json');
    if (pathExistsSync(stepMapPath)) {
      try {
        const raw = readJsonSync(stepMapPath) as Record<string, unknown> & {
          steps?: Record<string, string[]>;
          crossCutting?: string[];
        };
        const trimmedSteps: Record<string, string[]> = {};
        for (const [step, ids] of Object.entries(raw.steps ?? {})) {
          trimmedSteps[step] = ids.filter((id) => installedIds.has(id));
        }
        const trimmedCrossCutting = (raw.crossCutting ?? []).filter((id) => installedIds.has(id));
        writeJsonAtomic(stepMapPath, {
          ...raw,
          steps: trimmedSteps,
          crossCutting: trimmedCrossCutting,
        });
      } catch { /* skip */ }
    }
  }

  // Seeds — only the active strategy is kept; "none" wipes the folder contents but leaves the registry.
  const activeSeedId = installed.seed;
  const seedsTarget = join(skillRoot, 'seeds');
  if (pathExistsSync(seedsTarget)) {
    for (const s of seeds) {
      if (s.id === activeSeedId) continue;
      const entry = s.file ? join(seedsTarget, s.file) : (s.dir ? join(seedsTarget, s.dir) : undefined);
      if (entry && pathExistsSync(entry)) {
        try {
          removeSync(entry);
          removedSeeds.push(s.id);
        } catch { /* skip */ }
      }
    }

    const seedsRegistryPath = join(seedsTarget, '_registry.json');
    if (pathExistsSync(seedsRegistryPath)) {
      try {
        const sourceSeedsRegistryPath = join(skillsDir, 'stackshift', 'seeds', '_registry.json');
        const base = pathExistsSync(sourceSeedsRegistryPath)
          ? readJsonSync(sourceSeedsRegistryPath) as Record<string, unknown>
          : readJsonSync(seedsRegistryPath) as Record<string, unknown>;
        const { seeds: _seeds, ...baseRest } = base as Record<string, unknown> & { seeds?: unknown };
        const activeSeedEntries = activeSeedId ? seeds.filter((s) => s.id === activeSeedId) : [];
        writeJsonAtomic(seedsRegistryPath, { ...baseRest, seeds: activeSeedEntries });
      } catch { /* skip */ }
    }
  }

  return { removedProtocols, removedSeeds };
}

export function pruneSkillFolderProtocolsAllPlatforms(
  scope: 'project' | 'global',
  installed: { protocols?: Array<{ id: string }>; seed?: string },
  allProtocols: ProtocolEntry[],
): void {
  const seeds = loadSeedRegistry();
  const seenDirs = new Set<string>();
  for (const platform of ALL_PLATFORMS) {
    const targetDir = resolveTargetDir(scope, platform);
    if (seenDirs.has(targetDir)) continue;
    seenDirs.add(targetDir);
    if (!pathExistsSync(join(targetDir, 'stackshift'))) continue;
    pruneSkillFolderProtocols(targetDir, installed, allProtocols, seeds);
  }
}

/**
 * Prune reference files tied to uninstalled protocols.
 *
 * Each protocol entry may declare a `references` array listing reference files
 * in `skills/stackshift/references/` that are conceptually tied to it. When
 * the protocol is NOT installed, those reference files are removed from the
 * install destination. References that are not listed under any protocol
 * remain universal and are never pruned. Returns the list of removed
 * reference filenames per install root for surfacing in the summary.
 */
function pruneSkillFolderReferences(
  installRoot: string,
  installedIds: Set<string>,
  allProtocols: ProtocolEntry[],
): string[] {
  const removed: string[] = [];
  const referencesTarget = join(installRoot, 'stackshift', 'references');
  if (!pathExistsSync(referencesTarget)) return removed;

  for (const p of allProtocols) {
    if (!Array.isArray(p.references) || p.references.length === 0) continue;
    if (installedIds.has(p.id)) continue;
    for (const refFile of p.references) {
      const refPath = join(referencesTarget, refFile);
      if (pathExistsSync(refPath)) {
        try {
          removeSync(refPath);
          removed.push(refFile);
        } catch { /* skip — surfaced upstream */ }
      }
    }
  }

  return removed;
}

export function pruneSkillFolderReferencesAllPlatforms(
  scope: 'project' | 'global',
  installed: { protocols?: Array<{ id: string }> },
  allProtocols: ProtocolEntry[],
): void {
  const installedIds = new Set<string>((installed.protocols ?? []).map((p) => p.id));
  const seenDirs = new Set<string>();
  for (const platform of ALL_PLATFORMS) {
    const targetDir = resolveTargetDir(scope, platform);
    if (seenDirs.has(targetDir)) continue;
    seenDirs.add(targetDir);
    if (!pathExistsSync(join(targetDir, 'stackshift'))) continue;
    pruneSkillFolderReferences(targetDir, installedIds, allProtocols);
  }
}

// ---------------------------------------------------------------------------
// Workflow protocol injection — 0.6.0
//
// The CLI rewrites marker regions in the materialized SKILL.md and each
// workflow/<n>-*.md file with a pre-resolved list of protocols for that step.
// The agent never reads `.stackshift/installed.json` to decide what is active;
// it just reads the injected block. Re-running `init` or `repair` rewrites the
// regions idempotently. The function is intentionally agentic-agnostic — it
// only mutates files inside the materialized skill folder, which is owned by
// the CLI on every platform we target.
// ---------------------------------------------------------------------------

interface InjectionContext {
  installRoot: string;       // .../<platform>/skills
  skillFolderName: string;   // 'stackshift'
  installedProtocolIds: Set<string>;
  protocolsById: Map<string, ProtocolEntry>;
  stepMap: StepMap;
  activeSeedId?: string | undefined;
  seedsById: Map<string, SeedEntry>;
}

function buildProtocolsBlock(stepKey: string, ctx: InjectionContext): string {
  const stepProtocolIds = ctx.stepMap.steps[stepKey] ?? [];
  const installedForStep = stepProtocolIds
    .filter((id) => ctx.installedProtocolIds.has(id))
    .map((id) => ctx.protocolsById.get(id))
    .filter((p): p is ProtocolEntry => Boolean(p));

  if (stepProtocolIds.length === 0) {
    return '_No protocols are mapped to this step in `_step-map.json`._';
  }

  if (installedForStep.length === 0) {
    return '_No protocols active for this step in the current install._';
  }

  const byTier = (tier: 'required' | 'recommended' | 'optional') =>
    installedForStep.filter((p) => p.tier === tier);

  const required = byTier('required');
  const recommended = byTier('recommended');
  const optional = byTier('optional');

  const fileRef = (p: ProtocolEntry): string =>
    p.dir ? `.stackshift/protocols/${p.dir}/` : `.stackshift/protocols/${p.file ?? `${p.id}.md`}`;

  const lines: string[] = [];

  // --- Protocol list ---
  if (required.length > 0) {
    lines.push('**Required protocols:**');
    for (const p of required) {
      lines.push(`- \`${p.id}\` — ${p.title}. See \`${fileRef(p)}\`.`);
    }
  }
  if (recommended.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('**Recommended protocols:**');
    for (const p of recommended) {
      lines.push(`- \`${p.id}\` — ${p.title}. See \`${fileRef(p)}\`.`);
    }
  }
  if (optional.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('**Optional protocols:**');
    for (const p of optional) {
      lines.push(`- \`${p.id}\` — ${p.title}. See \`${fileRef(p)}\`.`);
    }
  }

  // --- Actions (only protocols that declare one) ---
  const ordered: ProtocolEntry[] = [...required, ...recommended, ...optional];
  const withAction = ordered.filter((p) => p.action && p.action.title && p.action.body);
  if (withAction.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Actions');
    for (const p of withAction) {
      lines.push('');
      lines.push(`### ${p.action!.title}`);
      lines.push(`*${tierLabel(p.tier)} — \`${p.id}\`*`);
      lines.push('');
      lines.push(p.action!.body);
    }
  }

  // --- Done-when (only protocols that declare items) ---
  const withDone = ordered.filter((p) => Array.isArray(p.doneWhen) && p.doneWhen!.length > 0);
  if (withDone.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Done-when');
    lines.push('');
    for (const p of withDone) {
      const tag = p.tier === 'required' ? `\`${p.id}\`` : `\`${p.id}\` — ${tierLabel(p.tier).toLowerCase()}`;
      for (const item of p.doneWhen!) {
        lines.push(`- [ ] ${item} *(${tag})*`);
      }
    }
  }

  return lines.join('\n');
}

function tierLabel(tier: 'required' | 'recommended' | 'optional'): string {
  switch (tier) {
    case 'required': return 'Required';
    case 'recommended': return 'Recommended';
    case 'optional': return 'Optional';
  }
}

function buildSeedBlock(ctx: InjectionContext): string {
  if (!ctx.activeSeedId) {
    return [
      '**No seed strategy is installed for this project.**',
      '',
      'Do NOT write any `initialValue/` files. To enable seeded initial values,',
      'run `npx @extragraj/stackshift-skills init --seed <strategy-id>`.',
    ].join('\n');
  }

  const seed = ctx.seedsById.get(ctx.activeSeedId);
  if (!seed) {
    return [
      `**Active seed id \`${ctx.activeSeedId}\` is not present in the skill seed registry.**`,
      'Re-run `npx @extragraj/stackshift-skills init` to repair.',
    ].join('\n');
  }

  const seedFileRef = seed.dir ? `seeds/${seed.dir}/` : `seeds/${seed.file ?? `${seed.id}.md`}`;
  return [
    `## Active seed strategy: \`${seed.id}\``,
    '',
    `Before writing any \`initialValue/\` file, load \`${seedFileRef}\` and follow its rules.`,
    'This is mandatory — no `initialValue/` file may be written without first loading the strategy doc.',
  ].join('\n');
}

function buildChecklistBlock(ctx: InjectionContext): string {
  // Aggregate every installed protocol that declares doneWhen items, grouped
  // by tier. Renders nothing if no installed protocol contributes items.
  const installed = Array.from(ctx.installedProtocolIds)
    .map((id) => ctx.protocolsById.get(id))
    .filter((p): p is ProtocolEntry => Boolean(p))
    .filter((p) => Array.isArray(p.doneWhen) && p.doneWhen!.length > 0);

  if (installed.length === 0) {
    return '_No protocol-driven checklist items in the current install._';
  }

  const byTier = (tier: 'required' | 'recommended' | 'optional') =>
    installed.filter((p) => p.tier === tier);

  const lines: string[] = ['## Protocol-driven checks', ''];
  const sections: Array<{ heading: string; entries: ProtocolEntry[] }> = [
    { heading: 'Required', entries: byTier('required') },
    { heading: 'Recommended', entries: byTier('recommended') },
    { heading: 'Optional', entries: byTier('optional') },
  ];

  for (const section of sections) {
    if (section.entries.length === 0) continue;
    lines.push(`### ${section.heading}`);
    for (const p of section.entries) {
      for (const item of p.doneWhen!) {
        lines.push(`- [ ] ${item} *(\`${p.id}\`)*`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function buildCrossCutBlock(ctx: InjectionContext): string {
  const rows = ctx.stepMap.crossCutting
    .filter((id) => ctx.installedProtocolIds.has(id))
    .map((id) => ctx.protocolsById.get(id))
    .filter((p): p is ProtocolEntry & { keywords?: string[] } => Boolean(p));

  if (rows.length === 0) {
    return '_No cross-cutting optional protocols are installed in this project._';
  }

  const lines = ['| Protocol | ID | Keywords |', '|---|---|---|'];
  for (const p of rows) {
    const kws = Array.isArray((p as { keywords?: string[] }).keywords)
      ? (p as { keywords?: string[] }).keywords!
          .map((k) => `"${k}"`)
          .join(', ')
      : '_(none registered)_';
    lines.push(`| ${p.title} | \`${p.id}\` | ${kws} |`);
  }
  return lines.join('\n');
}

function replaceMarkerRegion(
  source: string,
  markerName: string,
  attrSuffix: string,
  body: string,
): string {
  // Matches: <!-- MARKER:BEGIN[ attrs] -->\n...\n<!-- MARKER:END -->
  // attrSuffix lets us scope to a specific step (e.g. step=1) and skip others.
  const escaped = markerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attrPattern = attrSuffix
    ? `\\s+${attrSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
    : '\\s*';
  const re = new RegExp(
    `<!--\\s*${escaped}:BEGIN${attrPattern}[^>]*-->[\\s\\S]*?<!--\\s*${escaped}:END\\s*-->`,
    'g',
  );

  const replacement = attrSuffix
    ? `<!-- ${markerName}:BEGIN ${attrSuffix} -->\n${body}\n<!-- ${markerName}:END -->`
    : `<!-- ${markerName}:BEGIN -->\n${body}\n<!-- ${markerName}:END -->`;

  return source.replace(re, () => replacement);
}

function injectIntoFile(
  filePath: string,
  transform: (source: string) => string,
): void {
  if (!pathExistsSync(filePath)) return;
  try {
    const src = readFileSync(filePath, 'utf8') as string;
    const next = transform(src);
    if (next !== src) {
      writeFileSync(filePath, next, 'utf8');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: could not inject markers into ${filePath}: ${message}`);
  }
}

export function injectWorkflowProtocols(opts: {
  installRoot: string;
  skillFolderName?: string;
  installed: { protocols?: Array<{ id: string }>; seed?: string };
  allProtocols: ProtocolEntry[];
  seeds: SeedEntry[];
  stepMap: StepMap;
}): void {
  const skillFolderName = opts.skillFolderName ?? 'stackshift';
  const skillDir = join(opts.installRoot, skillFolderName);
  if (!pathExistsSync(skillDir)) return;

  const installedProtocolIds = new Set<string>(
    (opts.installed.protocols ?? []).map((p) => p.id),
  );
  const protocolsById = new Map<string, ProtocolEntry>(
    opts.allProtocols.map((p) => [p.id, p]),
  );
  const seedsById = new Map<string, SeedEntry>(opts.seeds.map((s) => [s.id, s]));

  const ctx: InjectionContext = {
    installRoot: opts.installRoot,
    skillFolderName,
    installedProtocolIds,
    protocolsById,
    stepMap: opts.stepMap,
    activeSeedId: opts.installed.seed,
    seedsById,
  };

  const workflowDir = join(skillDir, 'workflow');
  const workflowFiles: Array<{ step: string; name: string }> = [
    { step: '1', name: '1-schema-fields.md' },
    { step: '2', name: '2-section-schema.md' },
    { step: '3', name: '3-types.md' },
    { step: '4', name: '4-variants.md' },
    { step: '5', name: '5-groq.md' },
  ];

  for (const { step, name } of workflowFiles) {
    const filePath = join(workflowDir, name);
    injectIntoFile(filePath, (src) =>
      replaceMarkerRegion(src, 'CLI:PROTOCOLS', `step=${step}`, buildProtocolsBlock(step, ctx)),
    );
  }

  // Step 2 also has a CLI:SEED region.
  const step2Path = join(workflowDir, '2-section-schema.md');
  injectIntoFile(step2Path, (src) =>
    replaceMarkerRegion(src, 'CLI:SEED', '', buildSeedBlock(ctx)),
  );

  // workflow/checklist.md aggregates every installed protocol's doneWhen items.
  const checklistPath = join(workflowDir, 'checklist.md');
  injectIntoFile(checklistPath, (src) =>
    replaceMarkerRegion(src, 'CLI:CHECKLIST', '', buildChecklistBlock(ctx)),
  );

  // SKILL.md cross-cutting table.
  const skillMdPath = join(skillDir, 'SKILL.md');
  injectIntoFile(skillMdPath, (src) =>
    replaceMarkerRegion(src, 'CLI:CROSSCUT', '', buildCrossCutBlock(ctx)),
  );
}

/**
 * Walk every platform's skill install for the given scope and inject the
 * workflow markers. Used by both `init` (after writeSelection) and `repair`.
 */
export function injectWorkflowProtocolsAllPlatforms(
  scope: 'project' | 'global',
  installed: { protocols?: Array<{ id: string }>; seed?: string },
  allProtocols: ProtocolEntry[],
): void {
  const stepMap = loadStepMap();
  const seeds = loadSeedRegistry();
  const seenDirs = new Set<string>();
  for (const platform of ALL_PLATFORMS) {
    const targetDir = resolveTargetDir(scope, platform);
    if (seenDirs.has(targetDir)) continue;
    seenDirs.add(targetDir);
    if (!pathExistsSync(join(targetDir, 'stackshift'))) continue;
    injectWorkflowProtocols({
      installRoot: targetDir,
      installed,
      allProtocols,
      seeds,
      stepMap,
    });
  }
}

// ---------------------------------------------------------------------------
// Injection map — bootstrap-time record of where each installed protocol got
// injected. Mirrors the static `_step-map.json` but trimmed to the installed
// subset, and adds the concrete workflow file path each step's marker lives
// in. Written to `.stackshift/injection-map.json` on every init / repair.
// ---------------------------------------------------------------------------

interface InjectionMapEntry {
  steps: string[];
  locations: string[];
  crossCutting: boolean;
}

const WORKFLOW_FILE_BY_STEP: Record<string, string> = {
  '1': 'workflow/1-schema-fields.md',
  '2': 'workflow/2-section-schema.md',
  '3': 'workflow/3-types.md',
  '4': 'workflow/4-variants.md',
  '5': 'workflow/5-groq.md',
};

const CROSS_CUT_LOCATION = 'SKILL.md';

export function writeInjectionMap(
  installed: { protocols?: Array<{ id: string }> },
  stepMap: StepMap,
): string | undefined {
  const cwd = process.cwd();
  const markerDir = join(cwd, '.stackshift');
  if (!pathExistsSync(markerDir)) return undefined;

  const installedIds = new Set<string>((installed.protocols ?? []).map((p) => p.id));

  // Build entries with an `order` index reflecting the walk order through
  // `_step-map.json.steps` (step 1 → step N, then crossCutting). This keeps
  // the JSON ordered by step rather than by id, so reading top-to-bottom
  // matches the workflow order.
  type IndexedEntry = InjectionMapEntry & { _order: number };
  const indexed: Record<string, IndexedEntry> = {};
  let cursor = 0;

  const stepKeys = Object.keys(stepMap.steps).sort((a, b) => {
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });

  for (const step of stepKeys) {
    const ids = stepMap.steps[step] ?? [];
    for (const id of ids) {
      if (!installedIds.has(id)) continue;
      let entry = indexed[id];
      if (!entry) {
        entry = { steps: [], locations: [], crossCutting: false, _order: cursor++ };
        indexed[id] = entry;
      }
      if (!entry.steps.includes(step)) entry.steps.push(step);
      const loc = WORKFLOW_FILE_BY_STEP[step];
      if (loc && !entry.locations.includes(loc)) entry.locations.push(loc);
    }
  }

  for (const id of stepMap.crossCutting) {
    if (!installedIds.has(id)) continue;
    let entry = indexed[id];
    if (!entry) {
      entry = { steps: [], locations: [], crossCutting: false, _order: cursor++ };
      indexed[id] = entry;
    }
    entry.crossCutting = true;
    if (!entry.locations.includes(CROSS_CUT_LOCATION)) entry.locations.push(CROSS_CUT_LOCATION);
  }

  // Installed protocols that the step-map does not place anywhere come last.
  for (const id of installedIds) {
    if (!indexed[id]) {
      indexed[id] = { steps: [], locations: [], crossCutting: false, _order: cursor++ };
    }
  }

  const ordered = Object.entries(indexed).sort(([, a], [, b]) => a._order - b._order);
  const protocols: Record<string, InjectionMapEntry> = {};
  for (const [id, entry] of ordered) {
    const { _order: _, ...publicEntry } = entry;
    protocols[id] = publicEntry;
  }

  const mapPath = join(markerDir, 'injection-map.json');
  writeJsonAtomic(mapPath, {
    description: 'Per-protocol injection locations resolved at install / repair time. Dynamic — only installed protocols are listed. Mirrors `protocols/_step-map.json` trimmed to the installed subset, with concrete workflow file paths. Entries are ordered by step (1 → 5), then cross-cutting.',
    generatedAt: new Date().toISOString(),
    protocols,
  });

  return mapPath;
}

// ---------------------------------------------------------------------------
// Bootstrap materialization — Phase 1 (filesystem) + Phase 2 (UI Forge integration)
// ---------------------------------------------------------------------------

const STACKSHIFT_SECTION_VARIANTS_MD = `# StackShift Section Variants — Component Standards

These conventions apply to every variant generated in this project.

## Import rules
- Always import the props interface from \`"."\` (the section index file), never from \`@stackshift-ui\`.
- Component library imports come from \`@stackshift-ui/<section>\`.

## Null handling
- Use \`?? undefined\` for every field extracted from \`data?.variants\`.
- Return \`null\` when required props are absent — never render a broken state.
- Use ternary guards (\`{title ? <Heading title={title} /> : null}\`) rather than \`&&\`.

## Function structure
- Default export: the main variant component.
- Named export: re-export the function (\`export { MySection_X }\`).
- Helper functions below all exports, not above.
- Defaults in destructure signature, not inside the function body.

## TypeScript
- All props optional (\`?\`) — Sanity data can always be null/undefined.
- No \`any\` types.
- Prefer composing existing interfaces over defining new ones.
`;

const BRAND_MD = `# Brand Standards

> Replace this starter with your project's actual brand guidelines.

## Voice and tone
[Describe writing register, formality, sentence structure guidelines]

## Color palette
[List named color roles: primary, secondary, neutral, accent — with usage rules]

## Typography
[Map heading levels to font / weight / size; describe body text defaults]

## Imagery
[Describe photography style, illustration tone, icon set restrictions]
`;

const FORGEIGNORE_CONTENT = `# UI Forge — Claude Design integration (regeneratable artifacts)
design/.handoff-cache/
design/claude-design-bundle/
`;

const PROTOCOLS_README = `# Project Protocols

## Materialized from Skill

The following protocols are included in this project. Edit them freely — your changes take precedence over the skill's defaults.

Each protocol file is listed below with its purpose. To customize:

1. Open the protocol file (e.g., \`variant-router.md\`)
2. Make your edits
3. Your copy is automatically used; skill defaults are ignored

### How to Customize a Protocol

Edit the corresponding markdown file in this directory. Your changes will take precedence over the skill's bundled defaults.

## Add Custom Protocols

To add a custom protocol:

1. Create a new markdown file in this directory
2. Add an entry to \`_registry.json\`:

\`\`\`json
{
  "custom": [
    {
      "id": "my-custom-protocol",
      "title": "My Custom Protocol",
      "file": "my-custom-protocol.md",
      "source": "project"
    }
  ]
}
\`\`\`

## Structure

- \`_registry.json\` — Registry of materialized and custom protocols
- \`_template/\` — Starting point for creating complex multi-file protocols
- Protocol files — Conventions and standards (edit freely)
`;

const REFERENCES_README = `# Custom References

Add custom reference lookups here for project-specific protocols.

These augment the skill's standard references without modifying them.

## Example

Create files like:
- \`custom-lookups.md\` - Custom data tables
- \`project-types.md\` - Project-specific type definitions
- \`field-patterns.md\` - Project field patterns
`;

export interface BootstrapResult {
  materialized: string[];
  created: string[];
  skipped: string[];
  removed: string[];
  updated: string[];
  uiForge: UiForgeIntegrationResult;
}

export interface UiForgeIntegrationResult {
  detected: boolean;
  skillDir?: string;
  uiForgeVersion?: string;
  scanRan: boolean;
  scanFallbackBanner?: string;
  designArchBridged: boolean;
  pairedBlockWritten: boolean;
  bundleExported?: boolean;
  postToolUseHookInstalled?: boolean;
  autoValidateHookInstalled?: boolean;
  versionWarning?: string;
}

// ---------------------------------------------------------------------------
// UI Forge integration helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the UI Forge skill root by walking the same 7-path lookup the agent
 * previously walked from bootstrap/install.md Step 6c.
 */
function resolveUiForgeSkillDir(): string | undefined {
  const candidates = [
    process.env['UI_FORGE_SKILL_DIR'],
    join(process.cwd(), '.claude', 'skills', 'ui-forge'),
    join(process.cwd(), '.agents', 'skills', 'ui-forge'),
    join(process.cwd(), '.codex', 'skills', 'ui-forge'),
    join(homedir(), '.claude', 'skills', 'ui-forge'),
    join(homedir(), '.agents', 'skills', 'ui-forge'),
    join(homedir(), '.codex', 'skills', 'ui-forge'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const candidate of candidates) {
    const detectScript = join(candidate, 'scripts', 'detect.sh');
    if (pathExistsSync(detectScript)) {
      try {
        const out = execFileSync('sh', [detectScript], { encoding: 'utf8' }).trim();
        if (out && pathExistsSync(out)) return out;
      } catch { /* fall through to existence check */ }
    }
    const skillFile = join(candidate, 'SKILL.md');
    if (pathExistsSync(skillFile)) return candidate;
  }

  return undefined;
}

function readUiForgeVersion(skillDir: string): string | undefined {
  const versionPath = join(skillDir, 'skill.version');
  if (!pathExistsSync(versionPath)) return undefined;
  try {
    return readFileSync(versionPath, 'utf8').trim();
  } catch {
    return undefined;
  }
}

/**
 * Build the designStandards payload from the materialized protocol set.
 */
function buildDesignStandardsPayload(
  selectedProtocols: ProtocolEntry[],
  designStandardsExists: boolean,
): Record<string, string> {
  const variantsStdPath = './design/standards/stackshift-section-variants.md';
  const variantRouterPath = './.stackshift/protocols/variant-router.md';

  const payload: Record<string, string> = {
    stackshiftVariantRouter: variantRouterPath,
    stackshiftComponentStandard: designStandardsExists ? variantsStdPath : variantRouterPath,
  };

  if (selectedProtocols.some((p) => p.id === 'brand')) {
    payload['brand'] = './design/standards/brand.md';
  }

  return payload;
}

function mergeIntoDesignArch(
  designArchPath: string,
  payload: Record<string, unknown>,
): void {
  let arch: Record<string, unknown> = {};
  if (pathExistsSync(designArchPath)) {
    try {
      arch = readJsonSync(designArchPath) as Record<string, unknown>;
    } catch {
      console.warn(`Warning: could not parse ${designArchPath}; leaving untouched.`);
      return;
    }
  }
  const existingStandards = (arch['designStandards'] as Record<string, unknown> | undefined) ?? {};
  const incomingStandards = (payload['designStandards'] as Record<string, unknown> | undefined) ?? {};
  arch['designStandards'] = { ...existingStandards, ...incomingStandards };
  if (payload['_paired']) arch['_paired'] = payload['_paired'];
  writeJsonAtomic(designArchPath, arch);
}

function tryRunUiForgeScan(skillDir: string): { ran: boolean; banner?: string } {
  const scanScript = join(skillDir, 'scripts', 'scan.js');
  if (!pathExistsSync(scanScript)) return { ran: false };
  try {
    const result = execSync(`node "${scanScript}"`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const banner = extractFallbackBanner(result);
    return { ran: true, banner };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: Buffer | string }).stderr;
    const banner = typeof stderr === 'string' ? extractFallbackBanner(stderr) : undefined;
    return { ran: false, banner };
  }
}

function extractFallbackBanner(output: string): string | undefined {
  const match = output.match(/═{3,}[\s\S]*?═{3,}/);
  return match ? match[0] : undefined;
}

function checkUiForgeCompatibility(uiForgeVersion: string): string | undefined {
  // Minimum compatible UI Forge version is 0.1.8 (paired-mode-contract baseline).
  // See references/versions.md.
  const parts = uiForgeVersion.split('.').map((n) => parseInt(n, 10));
  const [major = 0, minor = 0] = parts;
  if (major === 0 && minor < 1) {
    return `UI Forge ${uiForgeVersion} is below the supported minimum (0.1.8). ` +
      `Step 4 handoff may produce unexpected results — see references/versions.md.`;
  }
  return undefined;
}

function tryExportDesignBundle(skillDir: string): boolean {
  const exportScript = join(skillDir, 'scripts', 'export-design.js');
  if (!pathExistsSync(exportScript)) return false;
  try {
    execSync(`node "${exportScript}"`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: design bundle export failed: ${message}`);
    return false;
  }
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * Build the UI Forge verify hook command. Claude Code PostToolUse hooks
 * receive a JSON payload on stdin (`{ tool_input: { file_path } }`); the
 * previous implementation referenced a `$CLAUDE_FILE_PATH` env var that does
 * not exist in the documented hook contract. We wrap UI Forge's `verify.js`
 * in a small node stdin-reader so the file path is extracted from stdin and
 * passed as argv to verify.js — identical behavior, correct plumbing.
 */
function buildVerifyHookCommand(skillDir: string): string {
  // Forward slashes work on every platform inside node argv strings.
  const verifyJsPath = join(skillDir, 'scripts', 'verify.js').replace(/\\/g, '/');
  // Single-quoted JS string + embedded path literal. Settings.json escapes
  // the surrounding double quotes; the inline `'...'` doesn't need escaping.
  return (
    `node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{` +
    `try{const p=(JSON.parse(d||'{}').tool_input||{}).file_path;` +
    `if(p)require('child_process').execFileSync('node',['${verifyJsPath}',p],{stdio:'inherit'})}` +
    `catch(e){process.exit(0)}})"`
  );
}

function tryInstallPostToolUseHook(skillDir: string): boolean {
  // Only meaningful on Claude Code, signalled by a project-side .claude/ directory.
  const claudeDir = join(process.cwd(), '.claude');
  if (!pathExistsSync(claudeDir)) return false;

  const settingsPath = join(claudeDir, 'settings.json');
  let settings: ClaudeSettings = {};
  if (pathExistsSync(settingsPath)) {
    try {
      settings = readJsonSync(settingsPath) as ClaudeSettings;
    } catch { /* overwrite */ }
  }

  const command = buildVerifyHookCommand(skillDir);
  const hookEntry = {
    matcher: 'Write|Edit',
    hooks: [{ type: 'command', command }],
  };

  const hooks = settings.hooks ?? {};
  const existing = hooks.PostToolUse ?? [];

  // Idempotency — replace any existing entry that runs UI Forge's verify.js
  // (whether directly or via the new stdin wrapper). Match on the absolute
  // verify.js path so we don't clobber unrelated user `verify.js` hooks.
  const verifyJsMarker = join(skillDir, 'scripts', 'verify.js')
    .replace(/\\/g, '/')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const verifyJsRegex = new RegExp(verifyJsMarker);
  const filtered = existing.filter((entry) => {
    return !entry.hooks?.some((h) => verifyJsRegex.test(h.command.replace(/\\/g, '/')));
  });
  filtered.push(hookEntry);

  settings.hooks = { ...hooks, PostToolUse: filtered };
  writeJsonAtomic(settingsPath, settings);
  return true;
}

/**
 * auto-validate-hook protocol — installs a PostToolUse hook that runs
 * `stackshift-skills validate --file <path>` on every Write/Edit. The validator
 * short-circuits silently for files outside its known scopes, so the hook is
 * safe to apply project-wide. Replaces any existing StackShift validate entry
 * (idempotent); leaves UI Forge's verify.js entry and unrelated hooks alone.
 */
function tryInstallAutoValidateHook(): boolean {
  const claudeDir = join(process.cwd(), '.claude');
  if (!pathExistsSync(claudeDir)) return false;

  const settingsPath = join(claudeDir, 'settings.json');
  let settings: ClaudeSettings = {};
  if (pathExistsSync(settingsPath)) {
    try {
      settings = readJsonSync(settingsPath) as ClaudeSettings;
    } catch { /* overwrite */ }
  }

  // `--hook` reads the Claude Code PostToolUse JSON payload from stdin and
  // extracts `tool_input.file_path`. The previous `--file "$CLAUDE_FILE_PATH"`
  // form relied on an env var that does not exist in the documented hook
  // contract — empty path fell through to a project-wide walk on every write.
  const command = `npx -y @extragraj/stackshift-skills validate --hook`;
  const hookEntry = {
    matcher: 'Write|Edit',
    hooks: [{ type: 'command', command }],
  };

  const hooks = settings.hooks ?? {};
  const existing = hooks.PostToolUse ?? [];

  const filtered = existing.filter((entry) => {
    return !entry.hooks?.some((h) => /stackshift-skills\s+validate/.test(h.command));
  });
  filtered.push(hookEntry);

  settings.hooks = { ...hooks, PostToolUse: filtered };
  writeJsonAtomic(settingsPath, settings);
  return true;
}

/**
 * Run UI Forge integration steps that previously lived in bootstrap/install.md
 * Steps 6a–6h and 7b. Each step is best-effort — failures are recorded in the
 * result and surfaced in the CLI summary, never thrown.
 */
function runUiForgeIntegration(
  selectedProtocols: ProtocolEntry[],
  designStandardsExists: boolean,
): UiForgeIntegrationResult {
  const result: UiForgeIntegrationResult = {
    detected: false,
    scanRan: false,
    designArchBridged: false,
    pairedBlockWritten: false,
  };

  // auto-validate-hook is StackShift-internal and runs even if UI Forge is absent.
  if (selectedProtocols.some((p) => p.id === 'auto-validate-hook')) {
    result.autoValidateHookInstalled = tryInstallAutoValidateHook();
  }

  const skillDir = resolveUiForgeSkillDir();
  if (!skillDir) return result;

  result.detected = true;
  result.skillDir = skillDir;
  result.uiForgeVersion = readUiForgeVersion(skillDir);

  if (result.uiForgeVersion) {
    result.versionWarning = checkUiForgeCompatibility(result.uiForgeVersion);
  }

  const designArchPath = join(process.cwd(), 'design', 'design-arch.json');

  // 6c — scan if design-arch.json is missing
  if (!pathExistsSync(designArchPath)) {
    const { ran, banner } = tryRunUiForgeScan(skillDir);
    result.scanRan = ran;
    if (banner) result.scanFallbackBanner = banner;
  }

  // 6a/b + 6h — designStandards + _paired mirror
  if (pathExistsSync(designArchPath)) {
    let stackshiftVersion = '0.1.0';
    try { stackshiftVersion = readFileSync(skillVersionPath, 'utf8').trim(); } catch { /* default */ }

    const designStandards = buildDesignStandardsPayload(selectedProtocols, designStandardsExists);
    const a11yRequired = selectedProtocols.some((p) => p.id === 'accessibility');
    const pairedBlock: Record<string, unknown> = {
      stackshiftVersion,
      contractVersion: '1.0.0',
      protocols: selectedProtocols.map((p) => p.id),
    };
    if (a11yRequired) pairedBlock['a11yRequired'] = true;

    mergeIntoDesignArch(designArchPath, {
      designStandards,
      _paired: pairedBlock,
    });
    result.designArchBridged = true;
    result.pairedBlockWritten = true;
  }

  // 6g — optional design bundle export
  if (selectedProtocols.some((p) => p.id === 'claude-design-handoff') && pathExistsSync(designArchPath)) {
    result.bundleExported = tryExportDesignBundle(skillDir);
  }

  // 7b — optional PostToolUse hook
  if (selectedProtocols.some((p) => p.id === 'auto-verify-hook')) {
    result.postToolUseHookInstalled = tryInstallPostToolUseHook(skillDir);
  }

  return result;
}

/**
 * Run full bootstrap: materialize protocols, create project infrastructure,
 * seed design/standards/, write .forgeignore, and integrate UI Forge.
 *
 * Replaces the agent-side bootstrap/install.md flow entirely. The CLI is now
 * the single source of truth for bootstrap behavior; the agent only consumes
 * `.stackshift/installed.json`.
 */
export function runBootstrapMaterialization(
  choices: InstallChoices,
  allProtocols: ProtocolEntry[],
): BootstrapResult {
  const result: BootstrapResult = {
    materialized: [],
    created: [],
    skipped: [],
    removed: [],
    updated: [],
    uiForge: {
      detected: false,
      scanRan: false,
      designArchBridged: false,
      pairedBlockWritten: false,
    },
  };
  const cwd = process.cwd();

  // Resolve selected protocol set
  const tierTiersMap: Record<ProtocolTier, Array<'required' | 'recommended' | 'optional'>> = {
    required: ['required'],
    recommended: ['required', 'recommended'],
    full: ['required', 'recommended', 'optional'],
    custom: ['required'],
  };
  let selectedProtocols = allProtocols.filter((p) =>
    tierTiersMap[choices.protocolTier].includes(p.tier),
  );
  if (choices.protocolTier === 'custom') {
    const extras = allProtocols.filter((p) => choices.customProtocols.includes(p.id));
    selectedProtocols = [...selectedProtocols, ...extras];
  }

  const protocolTargetDir = join(cwd, '.stackshift', 'protocols');
  const referencesTargetDir = join(cwd, '.stackshift', 'references');
  ensureDirSync(protocolTargetDir);

  const markerPath = join(cwd, '.stackshift', 'installed.json');
  const isReinstall = pathExistsSync(markerPath);

  // Map protocol ID → design/standards/ files seeded conditionally for that protocol.
  const PROTOCOL_DESIGN_STANDARDS: Record<string, string[]> = {
    brand: ['brand.md'],
  };

  // On reinstall: remove stale protocols not in new selection
  if (isReinstall) {
    const selectedIds = new Set(selectedProtocols.map(p => p.id));
    const staleProtocols = allProtocols.filter(p => !selectedIds.has(p.id));
    const designStandardsDir = join(cwd, 'design', 'standards');

    for (const protocol of staleProtocols) {
      if (protocol.file) {
        const dest = join(protocolTargetDir, protocol.file);
        if (pathExistsSync(dest)) {
          try {
            removeSync(dest);
            result.removed.push(protocol.file);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Warning: Could not remove stale protocol ${protocol.file}: ${message}`);
          }
        }
      } else if (protocol.dir) {
        const dest = join(protocolTargetDir, protocol.dir);
        if (pathExistsSync(dest)) {
          try {
            removeSync(dest);
            result.removed.push(protocol.dir + '/');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Warning: Could not remove stale protocol dir ${protocol.dir}: ${message}`);
          }
        }
      }

      const stdFiles = PROTOCOL_DESIGN_STANDARDS[protocol.id];
      if (stdFiles) {
        for (const stdFile of stdFiles) {
          const dest = join(designStandardsDir, stdFile);
          if (pathExistsSync(dest)) {
            try {
              removeSync(dest);
              result.removed.push(`design/standards/${stdFile}`);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`Warning: Could not remove stale design standard ${stdFile}: ${message}`);
            }
          }
        }
      }
    }
  }

  // Materialize selected protocols
  for (const protocol of selectedProtocols) {
    if (protocol.file) {
      const src = join(protocolsDir, protocol.file);
      const dest = join(protocolTargetDir, protocol.file);
      if (pathExistsSync(dest)) {
        result.skipped.push(protocol.file);
      } else if (pathExistsSync(src)) {
        copySync(src, dest);
        result.materialized.push(protocol.file);
      }
    } else if (protocol.dir) {
      const src = join(protocolsDir, protocol.dir);
      const dest = join(protocolTargetDir, protocol.dir);
      if (pathExistsSync(dest)) {
        result.skipped.push(protocol.dir + '/');
      } else if (pathExistsSync(src)) {
        copySync(src, dest, { overwrite: true });
        result.materialized.push(protocol.dir + '/');
      }
    }
  }

  // Project protocol registry
  const registryPath = join(protocolTargetDir, '_registry.json');
  const materializedList = selectedProtocols.map(p => ({
    id: p.id,
    title: p.title,
    tier: p.tier,
    ...(p.file ? { file: p.file } : {}),
    ...(p.dir ? { dir: p.dir } : {}),
    source: 'skill',
    customizable: true,
  }));

  if (!pathExistsSync(registryPath)) {
    writeJsonAtomic(registryPath, {
      materialized: materializedList,
      custom: [],
      note: 'Edit materialized protocols in this directory. Your edits take precedence over skill defaults.',
    });
    result.created.push('.stackshift/protocols/_registry.json');
  } else if (isReinstall) {
    try {
      const existingRegistry = readJsonSync(registryPath) as {
        materialized?: unknown[];
        custom?: unknown[];
        note?: string;
      };
      writeJsonAtomic(registryPath, {
        ...existingRegistry,
        materialized: materializedList,
      });
    } catch {
      writeJsonAtomic(registryPath, {
        materialized: materializedList,
        custom: [],
        note: 'Edit materialized protocols in this directory. Your edits take precedence over skill defaults.',
      });
    }
    result.updated.push('.stackshift/protocols/_registry.json');
  } else {
    result.skipped.push('.stackshift/protocols/_registry.json');
  }

  // Protocols README
  const protocolsReadmePath = join(protocolTargetDir, 'README.md');
  if (!pathExistsSync(protocolsReadmePath)) {
    writeFileSync(protocolsReadmePath, PROTOCOLS_README, 'utf8');
    result.created.push('.stackshift/protocols/README.md');
  } else {
    result.skipped.push('.stackshift/protocols/README.md');
  }

  // Protocol template
  const templateSrc = join(protocolsDir, '_template');
  const templateDest = join(protocolTargetDir, '_template');
  if (!pathExistsSync(templateDest) && pathExistsSync(templateSrc)) {
    copySync(templateSrc, templateDest);
    result.created.push('.stackshift/protocols/_template/');
  } else if (pathExistsSync(templateDest)) {
    result.skipped.push('.stackshift/protocols/_template/');
  }

  // References directory
  ensureDirSync(referencesTargetDir);
  const referencesReadme = join(referencesTargetDir, 'README.md');
  if (!pathExistsSync(referencesReadme)) {
    writeFileSync(referencesReadme, REFERENCES_README, 'utf8');
    result.created.push('.stackshift/references/README.md');
  } else {
    result.skipped.push('.stackshift/references/README.md');
  }

  // design/standards/
  const designStandardsDir = join(cwd, 'design', 'standards');
  ensureDirSync(designStandardsDir);

  const stackshiftSectionVariantsPath = join(designStandardsDir, 'stackshift-section-variants.md');
  if (!pathExistsSync(stackshiftSectionVariantsPath)) {
    writeFileSync(stackshiftSectionVariantsPath, STACKSHIFT_SECTION_VARIANTS_MD, 'utf8');
    result.created.push('design/standards/stackshift-section-variants.md');
  } else {
    result.skipped.push('design/standards/stackshift-section-variants.md');
  }

  const hasBrandProtocol = selectedProtocols.some((p) => p.id === 'brand');
  if (hasBrandProtocol) {
    const brandPath = join(designStandardsDir, 'brand.md');
    if (!pathExistsSync(brandPath)) {
      writeFileSync(brandPath, BRAND_MD, 'utf8');
      result.created.push('design/standards/brand.md');
    } else {
      result.skipped.push('design/standards/brand.md');
    }
  }

  // .forgeignore — seed only the UI Forge integration entries. Any
  // project-level build/output ignores belong in the user's .gitignore, not
  // here, so we no longer write studio/.sanity/.next/etc.
  const forgeignorePath = join(cwd, '.forgeignore');
  if (!pathExistsSync(forgeignorePath)) {
    writeFileSync(forgeignorePath, FORGEIGNORE_CONTENT, 'utf8');
    result.created.push('.forgeignore');
  } else {
    try {
      const existing = readFileSync(forgeignorePath, 'utf8');
      const hasForgeIntegration = existing.split('\n').some((line) => {
        const trimmed = line.trim();
        return (
          trimmed.includes('UI Forge') ||
          trimmed.includes('.handoff-cache/') ||
          trimmed.includes('claude-design-bundle/')
        );
      });

      if (!hasForgeIntegration) {
        const needsNewline = existing.length > 0 && !existing.endsWith('\n');
        writeFileSync(
          forgeignorePath,
          (needsNewline ? '\n' : '') + FORGEIGNORE_CONTENT,
          { flag: 'a', encoding: 'utf8' },
        );
        result.created.push('.forgeignore');
      } else {
        result.skipped.push('.forgeignore');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Could not update .forgeignore: ${message}`);
      result.skipped.push('.forgeignore');
    }
  }

  // UI Forge integration (formerly bootstrap/install.md Steps 6a-6h and 7b)
  result.uiForge = runUiForgeIntegration(
    selectedProtocols,
    pathExistsSync(stackshiftSectionVariantsPath) || result.created.includes('design/standards/stackshift-section-variants.md'),
  );

  return result;
}

// ---------------------------------------------------------------------------

interface InstallResult {
  platform: Platform;
  skills: string[];
}

export function writeSelection(
  choices: InstallChoices,
  skills: SkillEntry[],
  allProtocols: ProtocolEntry[],
): InstallResult[] {
  const results: InstallResult[] = [];
  const now = new Date().toISOString();

  // Clean up legacy tier-bundle folders and lock entries from pre-0.3.0 installs.
  removeLegacyBundleFolders(choices.scope);
  stripLegacyBundleEntries(choices.scope);

  const installedPlatforms = getInstalledPlatforms(choices.scope);
  const seenTargetDirs = new Set<string>();
  const allPlatformsToUpdate = new Set<Platform>([...choices.platforms, ...installedPlatforms]);

  for (const platform of allPlatformsToUpdate) {
    const targetDir = resolveTargetDir(choices.scope, platform);
    if (seenTargetDirs.has(targetDir)) continue;
    seenTargetDirs.add(targetDir);

    const lockPath = resolveLockPath(choices.scope, platform);
    ensureDirSync(targetDir);

    const installed: string[] = [];

    // Always install core
    const coreSkill = skills.find((s) => s.type === 'core');
    if (coreSkill) {
      copySkillFolder(coreSkill.folderPath, targetDir);
      appendLock(lockPath, { name: coreSkill.name, installedAt: now, scope: choices.scope });
      installed.push(coreSkill.name);
    }

    results.push({ platform, skills: installed });
  }

  // Write .stackshift/installed.json (no legacy flags)
  writeStackshiftMarker(choices, allProtocols);

  // Prune the materialized skill folder so its `protocols/`, `seeds/`, and
  // `references/` contain only the entries actually recorded in
  // installed.json. The shipped skill source is the full catalog; the install
  // destination is the installed subset. Reference files tied to a protocol
  // (via the protocol's `references` field) are pruned when the protocol is
  // not installed; universal references are never pruned.
  const installed = readInstalledForInjection();
  if (installed) {
    pruneSkillFolderProtocolsAllPlatforms(choices.scope, installed, allProtocols);
    pruneSkillFolderReferencesAllPlatforms(choices.scope, installed, allProtocols);
  }

  // Inject the per-step protocol lists, seed block, and cross-cutting table
  // into every materialized SKILL.md / workflow/*.md across all platforms we
  // just wrote to. The agent never re-derives this at runtime in 0.6.0+.
  if (installed) {
    injectWorkflowProtocolsAllPlatforms(choices.scope, installed, allProtocols);
  }

  // Write .stackshift/injection-map.json — a bootstrap-time record of every
  // installed protocol's injection locations (workflow file paths + SKILL.md
  // for cross-cutting). Dynamic — only installed protocols appear. Project
  // scope only.
  if (installed && choices.scope === 'project') {
    writeInjectionMap(installed, loadStepMap());
  }

  return results;
}

function readInstalledForInjection(): { protocols?: Array<{ id: string }>; seed?: string } | null {
  const markerPath = join(process.cwd(), '.stackshift', 'installed.json');
  if (!pathExistsSync(markerPath)) {
    // Global-scope installs without a project marker fall back to an empty set —
    // the agent in that environment still gets an explicit "no protocols active"
    // block instead of stale legacy prose.
    return { protocols: [], seed: undefined };
  }
  try {
    const data = readJsonSync(markerPath) as { protocols?: Array<{ id: string }>; seed?: string };
    return { protocols: data.protocols ?? [], seed: data.seed };
  } catch {
    return null;
  }
}

// Re-export so install.ts can keep its existing import shape.
export { skillsDir };
