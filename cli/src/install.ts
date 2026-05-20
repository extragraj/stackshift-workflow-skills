/**
 * Install flow.
 *
 * Lock-file architecture (post-0.3.0):
 *
 * - .stackshift/installed.json — source of truth for protocol tier + materialization state.
 *   Recorded fields: skillVersion, installedAt, mode, protocols[], seed?, a11yRequired?,
 *   uiForgeIntegration?. The legacy bootstrapRequired / materializationDone flags are no longer
 *   written and are stripped on every install.
 *
 * - <platform>/skills-lock.json — per-platform record of installed skill folders.
 *   The CLI installs only `stackshift`. Seed identity lives in `installed.json` `seed`;
 *   the canonical seed content lives in `stackshift/seeds/`. Any pre-0.3.0
 *   `stackshift-protocols-*` entries, pre-0.5.1 `stackshift-seed-*` stub folders, and
 *   pre-0.6.0 `stackshift-core` entries are removed on first install.
 */

import { intro, outro, spinner, note } from '@clack/prompts';
import { join } from 'path';
import { homedir } from 'os';
import fsExtra from 'fs-extra';
const { pathExistsSync, readJsonSync } = fsExtra;
import { loadSkills, loadProtocolRegistry } from './registry.js';
import { runPrompts } from './prompts.js';
import { writeSelection, runBootstrapMaterialization } from './writer.js';
import type { BootstrapResult } from './writer.js';
import { parseFlags, validateFlags, isNonInteractive, showHelp } from './flags.js';
import type { Platform, InstallChoices } from './prompts.js';

const PLATFORM_PROJECT_DIR: Record<Platform, string> = {
  claude: '.claude',
  agents: '.agents',
  copilot: '.github',
  gemini: '.agents',
  cursor: '.cursor',
};

function resolveTargetDir(scope: 'project' | 'global', platform: Platform): string {
  const baseDir = PLATFORM_PROJECT_DIR[platform];
  if (scope === 'global') return join(homedir(), baseDir, 'skills');
  return join(process.cwd(), baseDir, 'skills');
}

function validateWriteResults(
  choices: InstallChoices,
  results: Array<{ platform: Platform; skills: string[] }>,
): void {
  const seenDirs = new Set<string>();
  for (const result of results) {
    const targetDir = resolveTargetDir(choices.scope, result.platform);
    if (seenDirs.has(targetDir)) continue;
    seenDirs.add(targetDir);
    const stackshiftDir = join(targetDir, 'stackshift');
    if (!pathExistsSync(stackshiftDir)) {
      console.error(
        `Error: Skills not found at ${targetDir} after installation.\n` +
        `Check filesystem permissions and try again.`,
      );
      process.exit(1);
    }
  }
}

function reportCrossPlatformSync(
  choices: InstallChoices,
  results: Array<{ platform: Platform; skills: string[] }>,
): void {
  const extraPlatforms = results
    .filter((r) => !choices.platforms.includes(r.platform))
    .map((r) => r.platform);

  if (extraPlatforms.length === 0) return;

  const dirMap: Record<Platform, string> = {
    claude: '.claude/', agents: '.agents/', copilot: '.github/',
    gemini: '.agents/ (gemini)', cursor: '.cursor/',
  };
  const labels = extraPlatforms.map((p) => dirMap[p]).join(', ');

  note(
    `Also synced: ${labels}\n` +
    `(Existing installation detected — kept in sync)`,
    'Cross-platform sync',
  );
}

function readExistingSeed(): string | undefined {
  const markerPath = join(process.cwd(), '.stackshift', 'installed.json');
  if (!pathExistsSync(markerPath)) return undefined;
  try {
    const data = readJsonSync(markerPath) as { seed?: string };
    return data.seed ?? undefined;
  } catch {
    return undefined;
  }
}

function readExistingTier(): 'required' | 'recommended' | 'full' | 'custom' | undefined {
  const markerPath = join(process.cwd(), '.stackshift', 'installed.json');
  if (!pathExistsSync(markerPath)) return undefined;
  try {
    const data = readJsonSync(markerPath) as { mode?: string };
    if (!data.mode) return undefined;
    const map: Record<string, 'required' | 'recommended' | 'full' | 'custom'> = {
      required: 'required',
      recommended: 'recommended',
      all: 'full',
      interactive: 'custom',
    };
    return map[data.mode];
  } catch {
    return undefined;
  }
}

function summarizeBootstrap(bsResult: BootstrapResult): void {
  const removedNote = bsResult.removed.length > 0
    ? `\n   • Removed ${bsResult.removed.length} stale protocol(s): ${bsResult.removed.join(', ')}`
    : '';

  note(
    'Bootstrap complete\n' +
    '   • Protocols materialized to .stackshift/protocols/\n' +
    '   • Project registries created\n' +
    '   • design/standards/ initialized\n' +
    '   • .forgeignore written' +
    removedNote,
    'Materialization',
  );

  const uf = bsResult.uiForge;
  if (uf.detected) {
    const lines: string[] = [];
    lines.push(`   • Skill root: ${uf.skillDir}`);
    if (uf.uiForgeVersion) lines.push(`   • Version: ${uf.uiForgeVersion}`);
    if (uf.scanRan) lines.push('   • scan.js: ran');
    if (uf.designArchBridged) lines.push('   • design-arch.json: bridged (designStandards + _paired)');
    if (uf.bundleExported) lines.push('   • Claude Design bundle: exported');
    if (uf.postToolUseHookInstalled) lines.push('   • UI Forge PostToolUse hook (verify.js): installed');
    if (uf.autoValidateHookInstalled) lines.push('   • StackShift PostToolUse hook (validate): installed');
    if (uf.versionWarning) lines.push(`   ⚠ ${uf.versionWarning}`);
    if (uf.scanFallbackBanner) lines.push(`\nScan synthesis fallback:\n${uf.scanFallbackBanner}`);
    note(lines.join('\n'), 'UI Forge integration');
  } else {
    const lines: string[] = [
      'UI Forge not detected.',
      'Install UI Forge separately to enable Step 4 variant generation:',
      '   npx skills add extragraj/ui-forge -a claude-code',
    ];
    if (uf.autoValidateHookInstalled) {
      lines.push('', '   • StackShift PostToolUse hook (validate): installed');
    }
    note(lines.join('\n'), 'UI Forge integration');
  }
}

export async function install(): Promise<void> {
  const args = process.argv.slice(3);
  const flags = parseFlags(args);

  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  const isInteractive = !flags.noInteractive && !isNonInteractive(flags);
  if (isInteractive) {
    intro('StackShift Skills Installation');
  }

  const s = spinner();
  s.start('Loading registry...');
  const skills = loadSkills();
  const protocolRegistry = loadProtocolRegistry();
  s.stop('Registry loaded');

  // Determine install choices
  let choices: InstallChoices;

  if (!isInteractive) {
    const validated = validateFlags(flags);
    if (!validated) {
      process.exit(1);
    }
    choices = validated;
  } else {
    const existingSeed = readExistingSeed();
    const existingTier = readExistingTier();
    choices = await runPrompts(
      protocolRegistry.protocols,
      skills,
      protocolRegistry.seeds,
      existingTier,
      existingSeed,
    );
  }

  // Install skill folders + write marker
  const s2 = spinner();
  s2.start('Installing skills...');
  const results = writeSelection(choices, skills, protocolRegistry.protocols);
  s2.stop('Skills installed');

  if (results.length === 0) {
    outro('Nothing was installed.');
    return;
  }

  validateWriteResults(choices, results);
  reportCrossPlatformSync(choices, results);

  // Bootstrap materialization (Phase 1 filesystem work + Phase 2 UI Forge integration)
  const bs = spinner();
  bs.start('Running bootstrap...');
  const bsResult = runBootstrapMaterialization(choices, protocolRegistry.protocols);
  bs.stop('Bootstrap complete');

  summarizeBootstrap(bsResult);

  const platformLabels = choices.platforms.map((p) => {
    const baseDir = PLATFORM_PROJECT_DIR[p];
    return choices.scope === 'global' ? `~/${baseDir}/skills/` : `${baseDir}/skills/`;
  });

  const skillNames = results[0].skills;
  const summary = platformLabels.length === 1
    ? `Installed ${skillNames.length} skill(s) to ${platformLabels[0]}`
    : `Installed ${skillNames.length} skill(s) to ${platformLabels.length} platforms:\n` +
      platformLabels.map((label) => `  → ${label}`).join('\n');

  outro(
    summary + '\n' +
      skillNames.map((name) => `  ✓ ${name}`).join('\n'),
  );
}
