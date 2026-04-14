import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const skillsDir = resolve(__dirname, '../../skills');
const protocolsRegistryPath = resolve(__dirname, '../../skills/stackshift-core/protocols/_registry.json');
const seedsRegistryPath = resolve(__dirname, '../../skills/stackshift-core/seeds/_registry.json');
const skillVersionPath = resolve(__dirname, '../../skill.version');

export type SkillTier = 'required' | 'recommended' | 'optional' | 'core';
export type SkillType = 'protocols-bundle' | 'seed' | 'core';

export interface SkillEntry {
  name: string;
  description: string;
  recommended: boolean;
  tier: SkillTier;
  type: SkillType;
  folderPath: string;
}

export interface ProtocolEntry {
  id: string;
  tier: 'required' | 'recommended' | 'optional';
  file?: string;
  dir?: string;
  title: string;
  summary: string;
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

function inferType(name: string, frontmatter: Record<string, unknown>): SkillType {
  if (frontmatter['type']) return frontmatter['type'] as SkillType;
  if (name.startsWith('stackshift-protocols-')) return 'protocols-bundle';
  if (name.startsWith('stackshift-seed-')) return 'seed';
  return 'core';
}

function inferTier(name: string, frontmatter: Record<string, unknown>): SkillTier {
  if (frontmatter['tier']) return frontmatter['tier'] as SkillTier;
  if (name === 'stackshift-protocols-required') return 'required';
  if (name === 'stackshift-protocols-recommended') return 'recommended';
  if (name === 'stackshift-protocols-full') return 'optional';
  if (name.startsWith('stackshift-seed-')) return 'optional';
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
