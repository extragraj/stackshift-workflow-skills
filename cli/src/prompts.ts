import { select, multiselect, confirm, isCancel, cancel, note } from '@clack/prompts';
import type { ProtocolEntry, SkillEntry, SeedEntry } from './registry.js';

export type ProtocolTier = 'required' | 'recommended' | 'full' | 'custom';
export type SeedChoice = 'none' | string;
export type ScopeChoice = 'project' | 'global';
export type Platform = 'agents' | 'claude' | 'copilot' | 'gemini' | 'cursor';

export interface InstallChoices {
  protocolTier: ProtocolTier;
  customProtocols: string[];
  seed: SeedChoice;
  scope: ScopeChoice;
  platforms: Platform[];
  /** When true, keep the previously-recorded tier and protocol selection instead of overwriting. */
  keepProtocol?: boolean;
}

function assertNotCancelled(value: unknown): asserts value is NonNullable<typeof value> {
  if (isCancel(value)) {
    cancel('Installation cancelled.');
    process.exit(0);
  }
}

function shortenSummary(summary: string, maxLen = 72): string {
  if (summary.length <= maxLen) return summary;
  return summary.slice(0, maxLen - 1) + '…';
}

export async function runPrompts(
  allProtocols: ProtocolEntry[],
  _skills: SkillEntry[],
  seeds: SeedEntry[],
  existingTier?: ProtocolTier,
  existingSeed?: string,
): Promise<InstallChoices> {
  let protocolTier: ProtocolTier = 'recommended';
  let customProtocols: string[] = [];
  let keepProtocol = false;

  if (existingTier) {
    const tierLabel = existingTier === 'custom' ? 'custom selection' : existingTier;
    const shouldReplace = await confirm({
      message: `Protocol tier "${tierLabel}" is already recorded in .stackshift/installed.json.\nReplace with a different tier?`,
      initialValue: false,
    });

    assertNotCancelled(shouldReplace);

    if (!shouldReplace) {
      keepProtocol = true;
      protocolTier = existingTier;
      note(
        'Protocol tier kept as-is. Only seed and platform settings will be updated.',
        'Protocol Tier'
      );
    }
  }

  if (!keepProtocol) {
    note(
      'StackShift Core (Workflow, Protocols & References)',
      'Always Included'
    );

    const tierChoice = await select<ProtocolTier>({
      message: 'Select a protocol tier:',
      options: [
        { value: 'required', label: 'Required Only' },
        { value: 'recommended', label: 'Required + Recommended', hint: 'recommended' },
        { value: 'full', label: 'All Protocols (Required + Recommended + Optional)' },
        { value: 'custom', label: 'Custom Selection' },
      ],
      initialValue: 'recommended',
    });

    assertNotCancelled(tierChoice);
    protocolTier = tierChoice as ProtocolTier;

    if (tierChoice === 'custom') {
      const selectableProtocols = allProtocols.filter(
        (p) => p.tier === 'recommended' || p.tier === 'optional',
      );

      const chosen = await multiselect<string>({
        message: 'Select additional protocols (required always included):',
        options: selectableProtocols.map((p) => ({
          value: p.id,
          label: p.title,
          hint: `[${p.tier}] ${shortenSummary(p.summary)}`,
        })),
        required: false,
      });

      assertNotCancelled(chosen);
      customProtocols = chosen as string[];
    }
  }

  // Seed step — always shown; selecting none is always valid
  if (existingSeed) {
    const existingTitle = seeds.find((s) => s.id === existingSeed)?.title ?? existingSeed;
    note(
      `Currently active: ${existingTitle}\n` +
      'Selecting a different seed replaces the recorded strategy.\n' +
      'Only one seed strategy should be active at a time.',
      'Seed Strategy'
    );
  } else {
    note(
      'Seed strategies pre-fill initialValue/ with realistic placeholder content.\n' +
      'Only one seed strategy should be active at a time.',
      'Seed Strategy'
    );
  }

  const seedOptions = [
    { value: 'none', label: 'None (skip)' },
    ...seeds.map((s) => ({
      value: s.id,
      label: s.title,
      hint: s.summary,
    })),
  ];

  const seedChoice = await select<string>({
    message: 'Select a seed strategy:',
    options: seedOptions,
    initialValue: existingSeed ?? 'none',
  });
  assertNotCancelled(seedChoice);
  const seed: SeedChoice = seedChoice as SeedChoice;

  const scopeChoice = await select<ScopeChoice>({
    message: 'Select install location:',
    options: [
      { value: 'project', label: 'Project (current directory)', hint: 'recommended' },
      { value: 'global', label: 'Global (home directory)' },
    ],
    initialValue: 'project',
  });

  assertNotCancelled(scopeChoice);

  const platformChoices = await multiselect<Platform>({
    message: 'Select agentic platform(s) to install to:',
    options: [
      { value: 'claude', label: 'Claude Code', hint: '.claude/skills/' },
      { value: 'copilot', label: 'GitHub Copilot (Agent Mode)', hint: '.github/skills/' },
      { value: 'agents', label: 'OpenAI Codex / Universal Agents', hint: '.agents/skills/' },
      { value: 'gemini', label: 'Google Gemini (Antigravity)', hint: '.agents/skills/ · ~/.gemini/antigravity/skills/ (global)' },
      { value: 'cursor', label: 'Cursor IDE', hint: '.cursor/skills/' },
    ],
    initialValues: ['agents'],
    required: true,
  });

  assertNotCancelled(platformChoices);

  return {
    protocolTier,
    customProtocols,
    seed,
    scope: scopeChoice as ScopeChoice,
    platforms: platformChoices as Platform[],
    keepProtocol,
  };
}
