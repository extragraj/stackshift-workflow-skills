import { intro, outro, spinner, note } from '@clack/prompts';
import fsExtra from 'fs-extra';
const { readdirSync, pathExistsSync, removeSync, readJsonSync, writeJsonSync, readFileSync, copySync, ensureDirSync } = fsExtra;
import { renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { loadSeedRegistry, loadProtocolRegistry, loadStepMap } from './registry.js';
import {
  injectWorkflowProtocolsAllPlatforms,
  pruneSkillFolderProtocolsAllPlatforms,
  pruneSkillFolderReferencesAllPlatforms,
  writeInjectionMap,
} from './writer.js';

/**
 * Atomic JSON write.
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeJsonSync(tmpPath, data, { spaces: 2 });
  renameSync(tmpPath, filePath);
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const skillProtocolsDir = resolve(__dirname, '../../skills/stackshift/protocols');
const skillSourceDir = resolve(__dirname, '../../skills/stackshift');

interface LockEntry {
  name: string;
  installedAt: string;
  scope: 'project' | 'global';
}

interface LockFile {
  skills: LockEntry[];
}

interface InstalledJson {
  skillVersion?: string;
  mode?: string;
  protocols?: Array<{ id: string; tier: string; file?: string; dir?: string }>;
  seed?: string;
  bootstrapRequired?: boolean;
  materializationDone?: boolean;
}

type Platform = 'agents' | 'claude' | 'copilot' | 'gemini' | 'cursor';

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

const LEGACY_BUNDLE_NAMES = [
  'stackshift-protocols-required',
  'stackshift-protocols-recommended',
  'stackshift-protocols-full',
  'stackshift-protocols-custom',
  'stackshift-core',
];

function readInstalledSeed(): string | undefined {
  const markerPath = join(process.cwd(), '.stackshift', 'installed.json');
  if (!pathExistsSync(markerPath)) return undefined;
  try {
    const data = readJsonSync(markerPath) as InstalledJson;
    return data.seed ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Re-copy `skills/stackshift/` from the shipped skill source into every
 * platform skills directory that already has a StackShift install. Used after
 * the legacy `stackshift-core` purge so the new folder layout is present
 * before workflow-marker injection runs.
 */
function ensureStackshiftCopied(): number {
  let copied = 0;
  const seen = new Set<string>();
  for (const platform of ALL_PLATFORMS) {
    for (const [baseDir, root] of [
      [PLATFORM_PROJECT_DIR[platform], process.cwd()],
      [PLATFORM_GLOBAL_DIR[platform], homedir()],
    ] as [string, string][]) {
      const skillsDir = join(root, baseDir, 'skills');
      if (seen.has(skillsDir)) continue;
      seen.add(skillsDir);
      if (!pathExistsSync(skillsDir)) continue;
      const dest = join(skillsDir, 'stackshift');
      if (pathExistsSync(dest)) continue;
      if (!pathExistsSync(skillSourceDir)) continue;
      try {
        copySync(skillSourceDir, dest, { overwrite: true });
        copied++;
      } catch { /* skip — surfaced upstream */ }
    }
  }
  return copied;
}

/**
 * Refresh the static (non-prunable) files in an existing stackshift/ install:
 * SKILL.md and workflow/*.md. These files are CLI-owned and may have stale
 * pre-0.6.0A content from previous installs. Pruning + marker injection runs
 * after this, so the destination ends up with up-to-date scaffolding before
 * the CLI:PROTOCOLS / CLI:SEED / CLI:CROSSCUT blocks are rewritten.
 *
 * Protocol files in protocols/ are intentionally NOT touched here — they go
 * through pruneSkillFolderProtocolsAllPlatforms which handles the installed
 * subset. The skill `.stackshift/protocols/` materialized copies (which the
 * user is allowed to edit) are also untouched.
 */
function refreshSkillScaffold(): number {
  let refreshed = 0;
  const seen = new Set<string>();
  const scaffoldFiles = [
    'SKILL.md',
    join('workflow', '1-schema-fields.md'),
    join('workflow', '2-section-schema.md'),
    join('workflow', '3-types.md'),
    join('workflow', '4-variants.md'),
    join('workflow', '5-groq.md'),
    join('workflow', 'checklist.md'),
  ];
  for (const platform of ALL_PLATFORMS) {
    for (const [baseDir, root] of [
      [PLATFORM_PROJECT_DIR[platform], process.cwd()],
      [PLATFORM_GLOBAL_DIR[platform], homedir()],
    ] as [string, string][]) {
      const skillsDir = join(root, baseDir, 'skills');
      if (seen.has(skillsDir)) continue;
      seen.add(skillsDir);
      const dest = join(skillsDir, 'stackshift');
      if (!pathExistsSync(dest)) continue;
      for (const rel of scaffoldFiles) {
        const src = join(skillSourceDir, rel);
        if (!pathExistsSync(src)) continue;
        try {
          copySync(src, join(dest, rel), { overwrite: true });
          refreshed++;
        } catch { /* skip — surfaced upstream */ }
      }
      // Re-seed the references folder from the skill source before the prune
      // step runs. Without this, references previously pruned for an
      // uninstalled protocol would not reappear when the protocol is
      // re-enabled by a manual `installed.json` edit followed by `repair`.
      const referencesSrc = join(skillSourceDir, 'references');
      const referencesDest = join(dest, 'references');
      if (pathExistsSync(referencesSrc)) {
        try {
          copySync(referencesSrc, referencesDest, { overwrite: true });
          refreshed++;
        } catch { /* skip */ }
      }
    }
  }
  return refreshed;
}

/**
 * Remove pre-0.3.0 `stackshift-protocols-*` folders, pre-0.5.1
 * `stackshift-seed-*` stub folders, the pre-0.6.0 `stackshift-core` folder,
 * and any matching lock entries.
 */
function purgeLegacyBundles(): { folders: number; lockEntries: number } {
  const seenDirs = new Set<string>();
  const seenLocks = new Set<string>();
  let folders = 0;
  let lockEntries = 0;

  for (const platform of ALL_PLATFORMS) {
    for (const [baseDir, root] of [
      [PLATFORM_PROJECT_DIR[platform], process.cwd()],
      [PLATFORM_GLOBAL_DIR[platform], homedir()],
    ] as [string, string][]) {
      const skillsDir = join(root, baseDir, 'skills');
      if (!seenDirs.has(skillsDir)) {
        seenDirs.add(skillsDir);
        for (const name of LEGACY_BUNDLE_NAMES) {
          const path = join(skillsDir, name);
          if (pathExistsSync(path)) {
            try {
              removeSync(path);
              folders++;
            } catch { /* warning already noisy */ }
          }
        }
        if (pathExistsSync(skillsDir)) {
          try {
            const entries = readdirSync(skillsDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && entry.name.startsWith('stackshift-seed-')) {
                const path = join(skillsDir, entry.name);
                try {
                  removeSync(path);
                  folders++;
                } catch { /* skip */ }
              }
            }
          } catch { /* skip */ }
        }
      }

      const lockPath = join(root, baseDir, 'skills-lock.json');
      if (!seenLocks.has(lockPath)) {
        seenLocks.add(lockPath);
        if (pathExistsSync(lockPath)) {
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
              lockEntries += before - lock.skills.length;
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  return { folders, lockEntries };
}

/**
 * Strip pre-0.3.0 bootstrapRequired / materializationDone flags from the marker.
 */
function purgeLegacyMarkerFlags(): boolean {
  const markerPath = join(process.cwd(), '.stackshift', 'installed.json');
  if (!pathExistsSync(markerPath)) return false;
  try {
    const data = readJsonSync(markerPath) as InstalledJson;
    if (data.bootstrapRequired === undefined && data.materializationDone === undefined) {
      return false;
    }
    const { bootstrapRequired: _br, materializationDone: _md, ...rest } = data;
    writeJsonAtomic(markerPath, rest);
    return true;
  } catch {
    return false;
  }
}

export async function repair(): Promise<void> {
  intro('StackShift Skills Repair');

  const outroLines: string[] = [];

  // ── Legacy artifact purge ────────────────────────────────────────────────────

  const s0 = spinner();
  s0.start('Purging legacy tier-bundle artifacts');
  const { folders: legacyFolders, lockEntries: legacyLockEntries } = purgeLegacyBundles();
  const flagsStripped = purgeLegacyMarkerFlags();
  const reCopied = ensureStackshiftCopied();
  s0.stop('Legacy purge complete');

  if (legacyFolders > 0 || legacyLockEntries > 0 || flagsStripped || reCopied > 0) {
    const parts: string[] = [];
    if (legacyFolders > 0) parts.push(`${legacyFolders} folder(s) removed`);
    if (legacyLockEntries > 0) parts.push(`${legacyLockEntries} lock entry(ies) removed`);
    if (flagsStripped) parts.push('legacy marker flags stripped');
    if (reCopied > 0) parts.push(`migrated stackshift-core → stackshift in ${reCopied} location(s)`);
    outroLines.push(`✓ Legacy artifacts cleaned: ${parts.join(', ')}`);
  } else {
    outroLines.push('✓ No legacy artifacts found');
  }

  // ── Seed validation ─────────────────────────────────────────────────────────
  //
  // Seed identity lives solely in .stackshift/installed.json `seed` (as of 0.5.1).
  // Stub folders no longer ship; any encountered are removed by purgeLegacyBundles
  // above. The only remaining check is that the recorded seed id is still a known
  // strategy in the registry.

  const seedRegistry = loadSeedRegistry();
  const recordedSeed = readInstalledSeed();

  if (!recordedSeed) {
    outroLines.push('✓ No seeding strategy active (none selected)');
  } else if (seedRegistry.some((s) => s.id === recordedSeed)) {
    outroLines.push(`✓ Seed: ${recordedSeed} (valid)`);
  } else {
    note(
      `Active seed "${recordedSeed}" in .stackshift/installed.json is not in the skill registry.\n` +
      `Run: npx @extragraj/stackshift-skills init to select a valid seed.`,
      'Seed validation warning'
    );
    outroLines.push(`⚠ Seed "${recordedSeed}" — not found in registry`);
  }

  // ── Materialized protocol reconciliation ─────────────────────────────────────

  const stackshiftProtocolsDir = join(process.cwd(), '.stackshift', 'protocols');
  const installedMarker = join(process.cwd(), '.stackshift', 'installed.json');

  // Maps protocol ID → design/standards/ files seeded conditionally for that protocol.
  // Must stay in sync with the same map in writer.ts.
  const PROTOCOL_DESIGN_STANDARDS: Record<string, string[]> = {
    brand: ['brand.md'],
  };

  if (pathExistsSync(stackshiftProtocolsDir) && pathExistsSync(installedMarker)) {
    const s4 = spinner();
    s4.start('Reconciling materialized protocols with installed.json');

    try {
      const installedData = readJsonSync(installedMarker) as InstalledJson;
      const recordedProtocols = installedData.protocols ?? [];
      const allProtocols = loadProtocolRegistry().protocols;

      if (recordedProtocols.length === 0) {
        s4.stop('Protocol reconciliation skipped');
        outroLines.push('✓ No protocols recorded in installed.json — skipping reconciliation');
      } else {
        const recordedIdSet = new Set<string>(recordedProtocols.map(p => p.id));
        const recordedFileSet = new Set<string>();
        const recordedDirSet = new Set<string>();
        for (const p of recordedProtocols) {
          if (p.file) recordedFileSet.add(p.file);
          if (p.dir) recordedDirSet.add(p.dir);
        }

        const orphans: Array<{ name: string; path: string }> = [];
        for (const protocol of allProtocols) {
          if (protocol.file && !recordedFileSet.has(protocol.file)) {
            const destPath = join(stackshiftProtocolsDir, protocol.file);
            if (pathExistsSync(destPath)) {
              orphans.push({ name: protocol.file, path: destPath });
            }
          } else if (protocol.dir && !recordedDirSet.has(protocol.dir)) {
            const destPath = join(stackshiftProtocolsDir, protocol.dir);
            if (pathExistsSync(destPath)) {
              orphans.push({ name: protocol.dir + '/', path: destPath });
            }
          }

          if (!recordedIdSet.has(protocol.id)) {
            const stdFiles = PROTOCOL_DESIGN_STANDARDS[protocol.id];
            if (stdFiles) {
              const designStandardsDir = join(process.cwd(), 'design', 'standards');
              for (const stdFile of stdFiles) {
                const destPath = join(designStandardsDir, stdFile);
                if (pathExistsSync(destPath)) {
                  orphans.push({ name: `design/standards/${stdFile}`, path: destPath });
                }
              }
            }
          }
        }

        const missing: Array<{ name: string; srcPath: string; destPath: string; isDir: boolean }> = [];
        for (const p of recordedProtocols) {
          if (p.file) {
            const destPath = join(stackshiftProtocolsDir, p.file);
            const srcPath = join(skillProtocolsDir, p.file);
            if (!pathExistsSync(destPath) && pathExistsSync(srcPath)) {
              missing.push({ name: p.file, srcPath, destPath, isDir: false });
            }
          } else if (p.dir) {
            const destPath = join(stackshiftProtocolsDir, p.dir);
            const srcPath = join(skillProtocolsDir, p.dir);
            if (!pathExistsSync(destPath) && pathExistsSync(srcPath)) {
              missing.push({ name: p.dir + '/', srcPath, destPath, isDir: true });
            }
          }
        }

        s4.stop('Protocol scan complete');

        if (orphans.length === 0 && missing.length === 0) {
          outroLines.push('✓ Materialized protocols in sync with installed.json');
        } else {
          const s5 = spinner();
          s5.start('Reconciling protocol files');

          let removedCount = 0;
          for (const orphan of orphans) {
            try {
              removeSync(orphan.path);
              removedCount++;
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`Warning: Could not remove ${orphan.name}: ${message}`);
            }
          }

          let restoredCount = 0;
          for (const entry of missing) {
            try {
              if (entry.isDir) {
                ensureDirSync(entry.destPath);
                copySync(entry.srcPath, entry.destPath, { overwrite: true });
              } else {
                copySync(entry.srcPath, entry.destPath);
              }
              restoredCount++;
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`Warning: Could not restore ${entry.name}: ${message}`);
            }
          }

          s5.stop('Protocol reconciliation complete');

          const parts: string[] = [];
          if (orphans.length > 0) {
            parts.push(
              `${removedCount} orphan(s) removed (${orphans.map(o => o.name).join(', ')})`
            );
          }
          if (missing.length > 0) {
            parts.push(
              `${restoredCount} missing protocol(s) restored (${missing.map(m => m.name).join(', ')})`
            );
          }
          outroLines.push(`✓ Protocol reconciliation: ${parts.join('; ')}`);
        }
      }
    } catch (err: unknown) {
      s4.stop('Protocol reconciliation skipped');
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Protocol reconciliation failed — ${message}`);
      outroLines.push('⚠ Protocol reconciliation could not complete — check .stackshift/installed.json');
    }
  }

  // ── Workflow marker injection (0.6.0) ──────────────────────────────────────
  //
  // Every repair rewrites the CLI:PROTOCOLS / CLI:SEED / CLI:CROSSCUT marker
  // regions in the materialized SKILL.md and workflow/*.md files. This is the
  // mechanism by which user-side workflow files reflect their installed.json
  // protocol set — there is no agent-side discovery anymore.

  const s6 = spinner();
  s6.start('Injecting workflow protocol markers');
  try {
    const allProtocols = loadProtocolRegistry().protocols;
    const projectMarkerPath = join(process.cwd(), '.stackshift', 'installed.json');
    let installed: { protocols?: Array<{ id: string }>; seed?: string } = { protocols: [] };
    if (pathExistsSync(projectMarkerPath)) {
      try {
        const data = readJsonSync(projectMarkerPath) as InstalledJson;
        installed = { protocols: data.protocols ?? [], seed: data.seed };
      } catch { /* fall back to empty */ }
    }
    // Refresh CLI-owned scaffold files so stale pre-upgrade content outside
    // the marker regions is replaced before injection rewrites the markers.
    refreshSkillScaffold();
    pruneSkillFolderProtocolsAllPlatforms('project', installed, allProtocols);
    pruneSkillFolderProtocolsAllPlatforms('global', installed, allProtocols);
    pruneSkillFolderReferencesAllPlatforms('project', installed, allProtocols);
    pruneSkillFolderReferencesAllPlatforms('global', installed, allProtocols);
    injectWorkflowProtocolsAllPlatforms('project', installed, allProtocols);
    injectWorkflowProtocolsAllPlatforms('global', installed, allProtocols);
    if (pathExistsSync(projectMarkerPath)) {
      writeInjectionMap(installed, loadStepMap());
    }
    s6.stop('Workflow markers rewritten');
    outroLines.push('✓ Skill protocol/seed files pruned to installed.json set; workflow markers rewritten; injection map updated');
  } catch (err: unknown) {
    s6.stop('Workflow marker injection skipped');
    const message = err instanceof Error ? err.message : String(err);
    outroLines.push(`⚠ Workflow marker injection failed — ${message}`);
  }

  // Silence the unused-import lint warning for readFileSync without removing it.
  void readFileSync;

  outro(outroLines.join('\n'));
}
