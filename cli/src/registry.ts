import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const skillsDir = resolve(__dirname, '../../skills');
const protocolsRegistryPath = resolve(__dirname, '../../skills/stackshift/protocols/_registry.json');
const seedsRegistryPath = resolve(__dirname, '../../skills/stackshift/seeds/_registry.json');
const stepMapPath = resolve(__dirname, '../../skills/stackshift/protocols/_step-map.json');
const skillVersionPath = resolve(__dirname, '../../skill.version');

export type SkillTier = 'required' | 'recommended' | 'optional' | 'core';
export type SkillType = 'core';

export interface SkillEntry {
  name: string;
  description: string;
  recommended: boolean;
  tier: SkillTier;
  type: SkillType;
  folderPath: string;
}

export interface ProtocolAction {
  title: string;
  body: string;
}

export interface ProtocolEntry {
  id: string;
  tier: 'required' | 'recommended' | 'optional';
  file?: string;
  dir?: string;
  title: string;
  summary: string;
  keywords?: string[];
  /** Optional per-step content injected by the CLI into the workflow file's CLI:PROTOCOLS marker. */
  action?: ProtocolAction;
  /** Optional done-when checklist items appended into the workflow file's CLI:PROTOCOLS marker. */
  doneWhen?: string[];
  /**
   * Reference files in `skills/stackshift/references/` that are conceptually
   * tied to this protocol. When the protocol is NOT installed, the CLI prunes
   * these files from the install destination. References without any
   * `references` mapping anywhere remain universal and are always shipped.
   */
  references?: string[];
}

export interface SeedEntry {
  id: string;
  tier: 'required' | 'recommended' | 'optional';
  file?: string;
  dir?: string;
  title: string;
  summary: string;
}

export interface ProtocolRegistry {
  protocols: ProtocolEntry[];
  seeds: SeedEntry[];
}

export interface StepMap {
  steps: Record<string, string[]>;
  crossCutting: string[];
}

function inferType(_name: string, frontmatter: Record<string, unknown>): SkillType {
  if (frontmatter['type']) return frontmatter['type'] as SkillType;
  return 'core';
}

function inferTier(_name: string, frontmatter: Record<string, unknown>): SkillTier {
  if (frontmatter['tier']) return frontmatter['tier'] as SkillTier;
  return 'core';
}

export function loadSkills(): SkillEntry[] {
  const entries: SkillEntry[] = [];

  let folders: string[];
  try {
    folders = readdirSync(skillsDir);
  } catch {
    throw new Error(
      `Could not read skills directory at ${skillsDir}. ` +
      `Ensure the package is installed correctly.`
    );
  }

  for (const folder of folders) {
    const folderPath = join(skillsDir, folder);
    const skillFile = join(folderPath, 'SKILL.md');

    let raw: string;
    try {
      raw = readFileSync(skillFile, 'utf8');
    } catch {
      continue;
    }

    const { data } = matter(raw);
    const name = (data['name'] as string) ?? folder;

    entries.push({
      name,
      description: (data['description'] as string) ?? '',
      recommended: Boolean(data['recommended']),
      tier: inferTier(name, data),
      type: inferType(name, data),
      folderPath,
    });
  }

  return entries;
}

export function loadProtocolRegistry(): ProtocolRegistry {
  let parsed: { protocols?: ProtocolEntry[] };
  try {
    const raw = readFileSync(protocolsRegistryPath, 'utf8');
    parsed = JSON.parse(raw) as { protocols?: ProtocolEntry[] };
  } catch {
    throw new Error(
      `Could not load protocol registry at ${protocolsRegistryPath}. ` +
      `The skills directory may be corrupted or missing.`
    );
  }

  return {
    protocols: parsed.protocols ?? [],
    seeds: loadSeedRegistry(),
  };
}

export function loadStepMap(): StepMap {
  try {
    const raw = readFileSync(stepMapPath, 'utf8');
    const parsed = JSON.parse(raw) as { steps?: Record<string, string[]>; crossCutting?: string[] };
    return {
      steps: parsed.steps ?? {},
      crossCutting: parsed.crossCutting ?? [],
    };
  } catch {
    return { steps: {}, crossCutting: [] };
  }
}

export function loadSeedRegistry(): SeedEntry[] {
  try {
    const raw = readFileSync(seedsRegistryPath, 'utf8');
    const parsed = JSON.parse(raw) as { seeds?: SeedEntry[] };
    return parsed.seeds ?? [];
  } catch {
    return [];
  }
}

export function readSkillVersion(): string {
  try {
    return readFileSync(skillVersionPath, 'utf8').trim();
  } catch {
    return '0.1.0';
  }
}

export function getProtocolsByTier(
  protocols: ProtocolEntry[],
  tiers: Array<'required' | 'recommended' | 'optional'>,
): ProtocolEntry[] {
  return protocols.filter((p) => tiers.includes(p.tier));
}
