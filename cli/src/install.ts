import { intro, outro, spinner } from '@clack/prompts';
import { join } from 'path';
import { homedir } from 'os';
import fsExtra from 'fs-extra';
const { pathExistsSync, readJsonSync } = fsExtra;
import { loadSkills, loadProtocolRegistry } from './registry.js';
import { runPrompts } from './prompts.js';
import { writeSelection } from './writer.js';

interface LockEntry {
  name: string;
  installedAt: string;
  scope: 'project' | 'global';
}

interface LockFile {
  skills: LockEntry[];
}

function readLockFile(scope: 'project' | 'global', platform: 'agents' | 'claude'): LockFile | null {
  const baseDir = platform === 'agents' ? '.agents' : '.claude';
  const lockPath = scope === 'global'
    ? join(homedir(), baseDir, 'skills-lock.json')
    : join(process.cwd(), baseDir, 'skills-lock.json');

  if (!pathExistsSync(lockPath)) return null;
  try {
    return readJsonSync(lockPath) as LockFile;
  } catch {
    return null;
  }
}

export async function install(): Promise<void> {
  intro('stackshift init — install StackShift skills');

  const s = spinner();
  s.start('Loading skill registry');
  const skills = loadSkills();
  const protocolRegistry = loadProtocolRegistry();
  s.stop('Registry loaded');

  // Check for existing protocol bundle (try both platforms)
  const agentsLock = readLockFile('project', 'agents');
  const claudeLock = readLockFile('project', 'claude');
  const existingLock = agentsLock || claudeLock;

  const existingProtocolBundle = existingLock?.skills.find(s =>
    s.name.startsWith('stackshift-protocols-')
  );

  const choices = await runPrompts(
    protocolRegistry.protocols,
    skills,
    protocolRegistry.seeds.length,
    existingProtocolBundle,
  );

  const results = writeSelection(choices, skills, protocolRegistry.protocols);

  if (results.length === 0) {
    outro('Nothing was installed.');
    return;
  }

  // Group results by platform for cleaner output
  const platformLabels = choices.platforms.map(p => {
    const baseDir = p === 'agents' ? '.agents' : '.claude';
    return choices.scope === 'global' ? `~/${baseDir}/skills/` : `${baseDir}/skills/`;
  });

  const skillNames = results[0].skills; // All platforms get same skills
  const summary = platformLabels.length === 1
    ? `Installed ${skillNames.length} skill(s) to ${platformLabels[0]}`
    : `Installed ${skillNames.length} skill(s) to ${platformLabels.length} platforms:\n` +
      platformLabels.map(label => `  → ${label}`).join('\n');

  outro(
    summary + '\n' +
      skillNames.map((name) => `  ✓ ${name}`).join('\n'),
  );
}
